import { Loader2, Pencil } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getBrowserOSAdapter } from '@/lib/browseros/adapter'
import { Capabilities, Feature } from '@/lib/browseros/capabilities'
import { BROWSEROS_PREFS } from '@/lib/browseros/prefs'
import { MCP_PROXY_PORT_CHANGED_EVENT } from '@/lib/constants/analyticsEvents'
import { sendServerMessage } from '@/lib/messaging/server/serverMessages'
import { track } from '@/lib/metrics/track'
import { PROXY_PORT_MIN, parseProxyPort } from './ServerPortEditor.helpers'

const HEALTH_CHECK_TIMEOUT_MS = 60_000
const HEALTH_CHECK_INTERVAL_MS = 2_000

interface ServerPortEditorProps {
  onPortChanged?: () => void
}

async function readCurrentPort(): Promise<number> {
  try {
    const pref = await getBrowserOSAdapter().getPref(BROWSEROS_PREFS.PROXY_PORT)
    if (pref?.value && typeof pref.value === 'number') {
      return pref.value
    }
  } catch {
    // BrowserOS API not available — fall back to the default port
  }
  return PROXY_PORT_MIN
}

// Poll the local health endpoint until the server comes back on the new port
// or we give up. checkHealth resolves the URL from the live proxy_port pref,
// so it automatically targets the port we just wrote.
async function waitForServerHealth(): Promise<boolean> {
  const startTime = Date.now()
  return new Promise((resolve) => {
    const check = async () => {
      if (Date.now() - startTime >= HEALTH_CHECK_TIMEOUT_MS) {
        resolve(false)
        return
      }
      try {
        const result = await sendServerMessage('checkHealth', undefined)
        if (result.healthy) {
          resolve(true)
          return
        }
      } catch {
        // keep polling until the timeout
      }
      setTimeout(check, HEALTH_CHECK_INTERVAL_MS)
    }
    setTimeout(check, HEALTH_CHECK_INTERVAL_MS)
  })
}

/**
 * Pencil-triggered popover for editing the MCP proxy port (the port external
 * clients connect to). Writing the proxy_port pref makes BrowserOS rebind the
 * proxy and restart the server, so saving polls health before reporting back.
 * Renders nothing on builds without proxy support, where the URL is driven by
 * a different, non-editable port.
 */
export const ServerPortEditor: FC<ServerPortEditorProps> = ({
  onPortChanged,
}) => {
  const [supported, setSupported] = useState(false)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [currentPort, setCurrentPort] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Capabilities.supports(Feature.PROXY_SUPPORT).then((ok) => {
      if (!cancelled) setSupported(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!supported) {
    return null
  }

  const handleOpenChange = async (next: boolean) => {
    if (!next && isSaving) return
    setOpen(next)
    if (next) {
      setError(null)
      const port = await readCurrentPort()
      setCurrentPort(port)
      setValue(String(port))
    }
  }

  const parsed = parseProxyPort(value)
  const canSave = parsed.ok && !isSaving && parsed.port !== currentPort

  const handleSave = async () => {
    const result = parseProxyPort(value)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const success = await getBrowserOSAdapter().setPref(
        BROWSEROS_PREFS.PROXY_PORT,
        result.port,
      )
      if (!success) {
        throw new Error('Failed to update port')
      }
      const healthy = await waitForServerHealth()
      if (healthy) {
        track(MCP_PROXY_PORT_CHANGED_EVENT)
        setCurrentPort(result.port)
        toast.success('Server port updated', {
          description: `MCP clients now connect on port ${result.port}.`,
        })
        onPortChanged?.()
        setOpen(false)
      } else {
        setError(
          'Server did not respond. Please quit and restart the browser, then try again.',
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update port')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          title="Edit server port"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="font-medium text-sm">Server port</h4>
            <p className="text-muted-foreground text-xs leading-relaxed">
              The port external MCP clients (Claude Code, Gemini CLI, and
              others) use to connect. Saving restarts the server, so any active
              connections will briefly drop.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proxy-port" className="sr-only">
              Server port
            </Label>
            <Input
              id="proxy-port"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={value}
              aria-invalid={!parsed.ok && value.trim() !== ''}
              disabled={isSaving}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) handleSave()
              }}
            />
            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canSave}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Restarting…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
