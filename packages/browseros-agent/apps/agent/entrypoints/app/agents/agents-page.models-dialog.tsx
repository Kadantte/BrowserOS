import { ImageIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { LlmProviderConfig, ProviderType } from '@/lib/llm-providers/types'
import { useLlmProviders } from '@/lib/llm-providers/useLlmProviders'
import { isOpenClawSupportedProviderType } from './openclaw-supported-providers'
import {
  type OpenClawStatus,
  type RegisteredModel,
  useAddRegisteredModel,
  useRegisteredModels,
  useRemoveRegisteredModel,
  useSetDefaultModels,
} from './useOpenClaw'

const NONE_VALUE = '__none__'

interface ModelsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: OpenClawStatus | null
}

/**
 * Single dialog covering the three model-management actions surfaced
 * by /agents: switch the global text default, switch the global image
 * default, and add or remove registered models. Each control is live
 * — picking a value triggers the corresponding mutation immediately
 * so the user never has to remember whether they pressed Save.
 */
export const ModelsDialog: FC<ModelsDialogProps> = ({
  open,
  onOpenChange,
  status,
}) => {
  const { models, loading, error } = useRegisteredModels(open)
  const setDefaults = useSetDefaultModels()
  const removeModel = useRemoveRegisteredModel()
  const [addOpen, setAddOpen] = useState(false)

  const visionCapableModels = useMemo(
    () => models.filter((m) => m.supportsImages),
    [models],
  )

  const defaultTextRef = status?.defaultModel ?? null
  const defaultImageRef = status?.defaultImageModel ?? null
  const defaultTextId = findIdForRef(models, defaultTextRef)
  const defaultImageId = findIdForRef(models, defaultImageRef)

  const handleSetText = async (value: string) => {
    const next = value === NONE_VALUE ? null : value
    try {
      await setDefaults.mutateAsync({ textModelId: next })
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to update default text model',
      )
    }
  }
  const handleSetImage = async (value: string) => {
    const next = value === NONE_VALUE ? null : value
    try {
      await setDefaults.mutateAsync({ imageModelId: next })
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to update default image model',
      )
    }
  }

  const handleRemove = async (entry: RegisteredModel) => {
    try {
      await removeModel.mutateAsync(entry.id)
      toast.success(`Removed ${formatLabel(entry)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove model')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Models</DialogTitle>
          <DialogDescription>
            Manage the models OpenClaw can use, and pick the global defaults.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Defaults */}
          <section className="space-y-3">
            <h3 className="font-medium text-sm">Defaults</h3>
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div className="space-y-2">
                <Label htmlFor="default-text-select">Default text model</Label>
                <Select
                  value={defaultTextId ?? NONE_VALUE}
                  onValueChange={handleSetText}
                  disabled={setDefaults.isPending || models.length === 0}
                >
                  <SelectTrigger id="default-text-select">
                    <SelectValue
                      placeholder={
                        models.length === 0
                          ? 'Add a model to pick a default'
                          : 'Select a default text model'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>
                      — None (chat disabled)
                    </SelectItem>
                    {models.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {formatLabel(model)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default-image-select">
                  Default image model
                </Label>
                <Select
                  value={defaultImageId ?? NONE_VALUE}
                  onValueChange={handleSetImage}
                  disabled={setDefaults.isPending}
                >
                  <SelectTrigger id="default-image-select">
                    <SelectValue placeholder="Select a default image model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>
                      — None (image uploads ignored)
                    </SelectItem>
                    {visionCapableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {formatLabel(model)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Only vision-capable models appear here.
                </p>
              </div>
            </div>
          </section>

          {/* Registered models */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Registered models</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="mr-1 size-4" />
                Add model
              </Button>
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ) : null}

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : models.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No models registered yet. Add one to start chatting.
                </AlertDescription>
              </Alert>
            ) : (
              <ul className="divide-y rounded-lg border">
                {models.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-sm">
                        {formatLabel(entry)}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {entry.supportsImages && (
                          <Badge variant="secondary" className="gap-1">
                            <ImageIcon className="size-3" />
                            vision
                          </Badge>
                        )}
                        {defaultTextId === entry.id && (
                          <Badge variant="default">default text</Badge>
                        )}
                        {defaultImageId === entry.id && (
                          <Badge variant="default">default image</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleRemove(entry)}
                      disabled={removeModel.isPending}
                      title="Remove model"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>

      <AddModelDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingIds={new Set(models.map((m) => buildExistingKey(m)))}
      />
    </Dialog>
  )
}

interface AddModelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingIds: Set<string>
}

const AddModelDialog: FC<AddModelDialogProps> = ({
  open,
  onOpenChange,
  existingIds,
}) => {
  const { providers } = useLlmProviders()
  const addModel = useAddRegisteredModel()
  const [selectedId, setSelectedId] = useState<string>('')

  const choices = useMemo(() => {
    return providers
      .filter((p) => isOpenClawSupportedProviderType(p.type))
      .filter((p) => !existingIds.has(buildExistingKey(p)))
  }, [providers, existingIds])

  const handleAdd = async () => {
    const choice = choices.find((c) => c.id === selectedId)
    if (!choice) return
    try {
      await addModel.mutateAsync({
        providerType: choice.type,
        providerName: choice.name,
        baseUrl: choice.baseUrl,
        apiKey: choice.apiKey,
        modelId: choice.modelId,
        supportsImages: choice.supportsImages,
      })
      toast.success(`Added ${formatLabel(choice)}`)
      setSelectedId('')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add model')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a model</DialogTitle>
          <DialogDescription>
            Pick from your AI providers. OpenClaw will use this entry's API key
            and model id.
          </DialogDescription>
        </DialogHeader>

        {choices.length === 0 ? (
          <Alert>
            <AlertDescription className="space-y-2">
              <p>
                No compatible providers available in /settings/ai. OpenClaw
                works with Anthropic, OpenAI, OpenRouter, Moonshot, and
                OpenAI-compatible providers.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.hash = '#/settings/ai'
                  onOpenChange(false)
                }}
              >
                Open /settings/ai
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="add-model-select">
              Pick from your AI providers
            </Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger id="add-model-select">
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {choices.map((choice) => (
                  <SelectItem key={choice.id} value={choice.id}>
                    {formatLabel(choice)}
                    {choice.supportsImages ? ' · vision-capable' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Don't see what you want?{' '}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  window.location.hash = '#/settings/ai'
                  onOpenChange(false)
                }}
              >
                Manage providers in /settings/ai →
              </button>
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleAdd()}
            disabled={!selectedId || addModel.isPending || choices.length === 0}
          >
            {addModel.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface LabelLike {
  type?: ProviderType
  providerType?: string
  name?: string
  providerName?: string
  modelId: string
}

function formatLabel(entry: LabelLike): string {
  const provider =
    entry.name ??
    entry.providerName ??
    entry.type ??
    entry.providerType ??
    'Unknown provider'
  return `${capitalize(provider)} — ${entry.modelId}`
}

function capitalize(value: string): string {
  if (!value) return value
  return value[0].toUpperCase() + value.slice(1)
}

interface KeyableEntry {
  type?: ProviderType
  providerType?: string
  modelId: string
}

function buildExistingKey(entry: KeyableEntry): string {
  const type = entry.type ?? entry.providerType ?? 'unknown'
  return `${type}:${entry.modelId}`
}

/**
 * Match a fully-qualified `agents.defaults.*` ref (e.g. `anthropic/claude-...`)
 * back to a registered-model id so the Select pre-selects the right row.
 * The server-side `buildRegisteredEntryModelRef` mirrors this construction —
 * if upstream changes the prefix scheme, both sides update together.
 */
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

export type { LlmProviderConfig }
