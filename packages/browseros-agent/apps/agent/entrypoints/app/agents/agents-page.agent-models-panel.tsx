import { Loader2, RotateCcw } from 'lucide-react'
import { type FC, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type RegisteredModel,
  useAgentModels,
  useRegisteredModels,
  useUpdateAgentModels,
} from './useOpenClaw'

const INHERIT_VALUE = '__inherit__'

interface AgentModelsPanelProps {
  agentId: string
  /** Resolved global default text model (e.g. `anthropic/claude-...`). */
  defaultTextRef: string | null
  /** Resolved global default image model. */
  defaultImageRef: string | null
}

/**
 * Per-agent override editor. Two dropdowns — Text + Image — sourced
 * from the registered-models pool that lives at the OpenClaw level.
 * The first option in each is "Use default", followed by every
 * registered entry. The image dropdown filters to vision-capable
 * entries.
 */
export const AgentModelsPanel: FC<AgentModelsPanelProps> = ({
  agentId,
  defaultTextRef,
  defaultImageRef,
}) => {
  const { details, loading, error } = useAgentModels(agentId)
  const { models } = useRegisteredModels()
  const updateModels = useUpdateAgentModels()

  // Form state — derived once from the loaded details, then user-driven.
  const [textValue, setTextValue] = useState<string>(INHERIT_VALUE)
  const [imageValue, setImageValue] = useState<string>(INHERIT_VALUE)
  const [initialised, setInitialised] = useState(false)

  const initialState = useMemo(() => {
    if (!details) return null
    return {
      text:
        details.model.source === 'agent'
          ? (findIdForRef(models, details.model.value) ?? INHERIT_VALUE)
          : INHERIT_VALUE,
      image:
        details.imageModel.source === 'agent'
          ? (findIdForRef(models, details.imageModel.value) ?? INHERIT_VALUE)
          : INHERIT_VALUE,
    }
  }, [details, models])

  useEffect(() => {
    if (!initialState || initialised) return
    setTextValue(initialState.text)
    setImageValue(initialState.image)
    setInitialised(true)
  }, [initialState, initialised])

  const visionCapableModels = useMemo(
    () => models.filter((m) => m.supportsImages),
    [models],
  )

  const dirty =
    initialState !== null &&
    (initialState.text !== textValue || initialState.image !== imageValue)

  const handleSave = async () => {
    if (!initialState) return
    const payload: {
      agentId: string
      model?: 'inherit' | string | null
      imageModel?: 'inherit' | string | null
    } = { agentId }
    if (textValue !== initialState.text) {
      payload.model = textValue === INHERIT_VALUE ? 'inherit' : textValue
    }
    if (imageValue !== initialState.image) {
      payload.imageModel = imageValue === INHERIT_VALUE ? 'inherit' : imageValue
    }

    try {
      await updateModels.mutateAsync(payload)
      // Reset the dirty flag — the next render reads fresh details
      // from the cache via the query invalidation in onSettled.
      setInitialised(false)
      toast.success('Agent models updated')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update agent models',
      )
    }
  }

  const handleReset = () => {
    if (!initialState) return
    setTextValue(initialState.text)
    setImageValue(initialState.image)
  }

  if (loading) {
    return (
      <div className="space-y-3 px-4 pb-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mx-4 mb-4">
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4 border-t bg-muted/20 px-4 py-4">
      <ModelDropdown
        idPrefix={`${agentId}-text`}
        label="Text model"
        value={textValue}
        onChange={setTextValue}
        options={models}
        defaultLabel={describeRef(defaultTextRef, models) ?? 'not set'}
      />

      <ModelDropdown
        idPrefix={`${agentId}-image`}
        label="Image model"
        value={imageValue}
        onChange={setImageValue}
        options={visionCapableModels}
        defaultLabel={describeRef(defaultImageRef, models) ?? 'not set'}
      />

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={!dirty || updateModels.isPending}
        >
          <RotateCcw className="mr-1 size-3.5" />
          Reset
        </Button>
        <Button
          size="sm"
          onClick={() => void handleSave()}
          disabled={!dirty || updateModels.isPending}
        >
          {updateModels.isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </div>
  )
}

interface ModelDropdownProps {
  idPrefix: string
  label: string
  value: string
  onChange: (value: string) => void
  options: RegisteredModel[]
  defaultLabel: string
}

const ModelDropdown: FC<ModelDropdownProps> = ({
  idPrefix,
  label,
  value,
  onChange,
  options,
  defaultLabel,
}) => {
  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-select`}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={`${idPrefix}-select`}>
          <SelectValue placeholder="Use default" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={INHERIT_VALUE}>
            Use default — {defaultLabel}
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {formatLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function formatLabel(entry: RegisteredModel): string {
  const provider = entry.providerName ?? entry.providerType
  const capitalised = provider
    ? provider[0].toUpperCase() + provider.slice(1)
    : entry.providerType
  return `${capitalised} — ${entry.modelId}`
}

function findIdForRef(
  models: RegisteredModel[],
  ref: string | null,
): string | null {
  if (!ref) return null
  const match = models.find((m) => {
    const expected = `${m.providerType}/${m.modelId}`
    return ref === expected || ref.endsWith(`/${m.modelId}`)
  })
  return match?.id ?? null
}

function describeRef(
  ref: string | null,
  models: RegisteredModel[],
): string | null {
  if (!ref) return null
  const matchedId = findIdForRef(models, ref)
  if (matchedId) {
    const match = models.find((m) => m.id === matchedId)
    if (match) return formatLabel(match)
  }
  // Fall back to the bare ref so the user still sees what's bound,
  // even if the registered entry behind it has been removed.
  const slash = ref.indexOf('/')
  return slash === -1 ? ref : ref.slice(slash + 1)
}
