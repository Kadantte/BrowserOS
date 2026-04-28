import { type FC, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ProviderType } from '@/lib/llm-providers/types'
import { getRecommendedVisionModels } from './vision-models'

const NONE_VALUE = '__none__'
const CUSTOM_VALUE = '__custom__'

interface PickedModelHint {
  modelId: string
  supportsImages: boolean
}

interface SetupImageModelFieldProps {
  providerType: ProviderType | undefined
  /**
   * The chat-model the user just picked from `/settings/ai`. When the
   * catalog entry says `supportsImages`, surface its modelId as a
   * recommended option — that's the most reliable signal we have for
   * custom providers (`openai-compatible` and friends), where the
   * static recommended-vision-model registry has no entry.
   */
  pickedModel?: PickedModelHint
  value: string
  onChange: (value: string) => void
}

/**
 * Image model picker for the OpenClaw setup dialog. Surfaces a curated
 * dropdown of vision-capable models for the chosen chat provider, plus
 * a "None" option (uploads ignored) and a "Custom..." escape hatch
 * when the user wants a model id that isn't on the recommended list.
 */
export const SetupImageModelField: FC<SetupImageModelFieldProps> = ({
  providerType,
  pickedModel,
  value,
  onChange,
}) => {
  const options = useMemo(() => {
    const seen = new Set<string>()
    const merged: string[] = []
    // Catalog-derived hint first — for custom providers
    // (openai-compatible, etc.) it's the only signal we have, and
    // for known providers it usually matches the chat model the
    // user already trusts.
    if (pickedModel?.supportsImages && pickedModel.modelId.trim()) {
      seen.add(pickedModel.modelId)
      merged.push(pickedModel.modelId)
    }
    for (const m of getRecommendedVisionModels(providerType)) {
      if (seen.has(m)) continue
      seen.add(m)
      merged.push(m)
    }
    return merged
  }, [providerType, pickedModel?.modelId, pickedModel?.supportsImages])

  const isCustom = value !== '' && !options.includes(value)
  const selectValue = !value ? NONE_VALUE : isCustom ? CUSTOM_VALUE : value

  return (
    <div className="space-y-2">
      <label className="font-medium text-sm" htmlFor="image-model-select">
        Image model
      </label>
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (next === NONE_VALUE) {
            onChange('')
            return
          }
          if (next === CUSTOM_VALUE) {
            // Keep whatever the user already typed; otherwise blank so
            // the input below is empty and ready for typing.
            onChange(isCustom ? value : '')
            return
          }
          onChange(next)
        }}
      >
        <SelectTrigger id="image-model-select">
          <SelectValue placeholder="Select an image model" />
        </SelectTrigger>
        <SelectContent>
          {options.map((model, index) => (
            <SelectItem key={model} value={model}>
              {model}
              {index === 0 ? ' (recommended)' : ''}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_VALUE}>Custom...</SelectItem>
          <SelectItem value={NONE_VALUE}>
            None — disable image uploads
          </SelectItem>
        </SelectContent>
      </Select>

      {selectValue === CUSTOM_VALUE && (
        <Input
          placeholder="provider/model-id (e.g. openai/gpt-4o)"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      <p className="text-muted-foreground text-xs">
        Required for chat image uploads. The selected model must support vision
        input on the chosen provider.
      </p>
    </div>
  )
}
