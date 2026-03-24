# models.dev Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded model lists with data sourced from models.dev so new providers/models appear automatically.

**Architecture:** A build-time script fetches `https://models.dev/api.json` (1.6MB, 104 providers, 3876 models), filters to BrowserOS-relevant providers, extracts only the fields we need (model ID, context window, image support, capabilities), and outputs a compact JSON file. The UI and server consume this generated data instead of hardcoded arrays. Factory functions (SDK-specific logic) remain hardcoded since they require custom code per provider.

**Tech Stack:** Bun (build script), models.dev API, Zod (validation), existing Vercel AI SDK infrastructure

---

## Provider Mapping

models.dev provider ID → BrowserOS provider ID:

| models.dev ID     | BrowserOS ID       | npm package                      | Models |
|-------------------|--------------------|----------------------------------|--------|
| `anthropic`       | `anthropic`        | `@ai-sdk/anthropic`             | 23     |
| `openai`          | `openai`           | `@ai-sdk/openai`                | 46     |
| `google`          | `google`           | `@ai-sdk/google`                | 30     |
| `openrouter`      | `openrouter`       | `@openrouter/ai-sdk-provider`   | 164    |
| `azure`           | `azure`            | `@ai-sdk/azure`                 | 103    |
| `amazon-bedrock`  | `bedrock`          | `@ai-sdk/amazon-bedrock`        | 86     |
| `ollama-cloud`    | `ollama`           | `@ai-sdk/openai-compatible`     | 34     |
| `lmstudio`        | `lmstudio`         | `@ai-sdk/openai-compatible`     | 3      |
| `moonshotai`      | `moonshot`         | `@ai-sdk/openai-compatible`     | 6      |
| `github-copilot`  | `github-copilot`   | `@ai-sdk/openai-compatible`     | 25     |

**Not in models.dev** (keep hardcoded): `browseros`, `openai-compatible`, `chatgpt-pro`, `qwen-code`

---

## Task 1: Create the build script that fetches and transforms models.dev data

**Files:**
- Create: `scripts/generate-models.ts`

**Step 1: Write the build script**

This script fetches api.json, maps to BrowserOS provider IDs, filters deprecated models, extracts relevant fields, and writes a compact JSON file.

```typescript
/**
 * Fetches models.dev/api.json and generates a compact models data file
 * for BrowserOS. Run: bun scripts/generate-models.ts
 */

const API_URL = 'https://models.dev/api.json'
const OUTPUT_PATH = new URL(
  '../packages/shared/src/generated/models-dev-data.json',
  import.meta.url,
).pathname

interface ModelsDevModel {
  id: string
  name: string
  family?: string
  attachment: boolean
  reasoning: boolean
  tool_call: boolean
  structured_output?: boolean
  modalities: { input: string[]; output: string[] }
  cost?: { input: number; output: number; cache_read?: number; cache_write?: number }
  limit: { context: number; output: number; input?: number }
  status?: string
  release_date: string
  last_updated: string
}

interface ModelsDevProvider {
  id: string
  name: string
  npm: string
  api?: string
  doc: string
  env: string[]
  models: Record<string, ModelsDevModel>
}

interface OutputModel {
  id: string
  name: string
  contextWindow: number
  maxOutput: number
  supportsImages: boolean
  supportsReasoning: boolean
  supportsToolCall: boolean
  inputCost?: number
  outputCost?: number
}

interface OutputProvider {
  name: string
  api?: string
  doc: string
  models: OutputModel[]
}

// models.dev ID → BrowserOS provider ID
const PROVIDER_MAP: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  openrouter: 'openrouter',
  azure: 'azure',
  'amazon-bedrock': 'bedrock',
  'ollama-cloud': 'ollama',
  lmstudio: 'lmstudio',
  moonshotai: 'moonshot',
  'github-copilot': 'github-copilot',
}

function transformModel(model: ModelsDevModel): OutputModel | null {
  if (model.status === 'deprecated') return null

  const supportsImages =
    model.attachment || model.modalities.input.includes('image')

  return {
    id: model.id,
    name: model.name,
    contextWindow: model.limit.context,
    maxOutput: model.limit.output,
    supportsImages,
    supportsReasoning: model.reasoning,
    supportsToolCall: model.tool_call,
    ...(model.cost && {
      inputCost: model.cost.input,
      outputCost: model.cost.output,
    }),
  }
}

async function main() {
  console.log(`Fetching ${API_URL}...`)
  const response = await fetch(API_URL)
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`)

  const data: Record<string, ModelsDevProvider> = await response.json()
  console.log(`Fetched ${Object.keys(data).length} providers`)

  const output: Record<string, OutputProvider> = {}

  for (const [modelsDevId, browserosId] of Object.entries(PROVIDER_MAP)) {
    const provider = data[modelsDevId]
    if (!provider) {
      console.warn(`Provider not found in models.dev: ${modelsDevId}`)
      continue
    }

    const models = Object.values(provider.models)
      .map(transformModel)
      .filter((m): m is OutputModel => m !== null)
      .sort((a, b) => {
        const dateA = provider.models[a.id]?.last_updated ?? ''
        const dateB = provider.models[b.id]?.last_updated ?? ''
        return dateB.localeCompare(dateA)
      })

    output[browserosId] = {
      name: provider.name,
      ...(provider.api && { api: provider.api }),
      doc: provider.doc,
      models,
    }
  }

  const totalModels = Object.values(output).reduce(
    (sum, p) => sum + p.models.length,
    0,
  )
  console.log(
    `Generated ${Object.keys(output).length} providers with ${totalModels} models`,
  )

  const dir = OUTPUT_PATH.substring(0, OUTPUT_PATH.lastIndexOf('/'))
  await Bun.write(OUTPUT_PATH, JSON.stringify(output, null, 2))
  console.log(`Written to ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

**Step 2: Create the output directory**

```bash
mkdir -p packages/shared/src/generated
```

**Step 3: Run the script and verify output**

Run: `bun scripts/generate-models.ts`
Expected: JSON file at `packages/shared/src/generated/models-dev-data.json` with 10 providers

**Step 4: Add npm script**

In `package.json`, add to scripts:
```json
"generate:models": "bun scripts/generate-models.ts"
```

**Step 5: Commit**

```bash
git add scripts/generate-models.ts packages/shared/src/generated/models-dev-data.json package.json
git commit -m "feat: add build script to fetch models.dev data"
```

---

## Task 2: Create typed accessor module for generated data

**Files:**
- Create: `packages/shared/src/generated/models-dev.ts`
- Modify: `packages/shared/package.json` (add export)

**Step 1: Write the accessor module**

This module imports the generated JSON and provides typed accessors. It re-exports the raw data plus helper functions.

```typescript
import data from './models-dev-data.json'

export interface ModelsDevModel {
  id: string
  name: string
  contextWindow: number
  maxOutput: number
  supportsImages: boolean
  supportsReasoning: boolean
  supportsToolCall: boolean
  inputCost?: number
  outputCost?: number
}

export interface ModelsDevProvider {
  name: string
  api?: string
  doc: string
  models: ModelsDevModel[]
}

export const modelsDevData: Record<string, ModelsDevProvider> =
  data as Record<string, ModelsDevProvider>

export function getModelsDevProvider(
  providerId: string,
): ModelsDevProvider | undefined {
  return modelsDevData[providerId]
}

export function getModelsDevModels(providerId: string): ModelsDevModel[] {
  return modelsDevData[providerId]?.models ?? []
}

export function getModelsDevModel(
  providerId: string,
  modelId: string,
): ModelsDevModel | undefined {
  return modelsDevData[providerId]?.models.find((m) => m.id === modelId)
}
```

**Step 2: Add package.json export**

In `packages/shared/package.json`, add to `"exports"`:
```json
"./generated/models-dev": {
  "types": "./src/generated/models-dev.ts",
  "default": "./src/generated/models-dev.ts"
}
```

**Step 3: Verify import works**

Run: `bun -e "import { modelsDevData } from '@browseros/shared/generated/models-dev'; console.log(Object.keys(modelsDevData))"`
Expected: `['anthropic', 'openai', 'google', 'openrouter', 'azure', 'bedrock', 'ollama', 'lmstudio', 'moonshot', 'github-copilot']`

**Step 4: Commit**

```bash
git add packages/shared/src/generated/models-dev.ts packages/shared/package.json
git commit -m "feat: add typed accessor for models.dev generated data"
```

---

## Task 3: Replace hardcoded MODELS_DATA with models.dev data

**Files:**
- Modify: `apps/agent/entrypoints/app/ai-settings/models.ts`

This is the main payoff: replace the manually-maintained `MODELS_DATA` constant with data from the generated models.dev JSON. Providers not in models.dev (browseros, chatgpt-pro, qwen-code, openai-compatible) keep hardcoded fallbacks.

**Step 1: Rewrite models.ts**

Replace the entire file with:

```typescript
import {
  getModelsDevModels,
  type ModelsDevModel,
} from '@browseros/shared/generated/models-dev'
import type { ProviderType } from '@/lib/llm-providers/types'

export interface ModelInfo {
  modelId: string
  contextLength: number
  supportsImages?: boolean
  supportsReasoning?: boolean
  supportsToolCall?: boolean
}

/**
 * Hardcoded model lists for providers NOT in models.dev
 */
const CUSTOM_PROVIDER_MODELS: Partial<Record<ProviderType, ModelInfo[]>> = {
  browseros: [{ modelId: 'browseros-auto', contextLength: 200000 }],
  'openai-compatible': [],
  'chatgpt-pro': [
    { modelId: 'gpt-5.4', contextLength: 400000 },
    { modelId: 'gpt-5.3-codex', contextLength: 400000 },
    { modelId: 'gpt-5.2-codex', contextLength: 400000 },
    { modelId: 'gpt-5.2', contextLength: 200000 },
    { modelId: 'gpt-5.1-codex', contextLength: 400000 },
    { modelId: 'gpt-5.1-codex-max', contextLength: 400000 },
    { modelId: 'gpt-5.1-codex-mini', contextLength: 400000 },
    { modelId: 'gpt-5.1', contextLength: 200000 },
  ],
  'qwen-code': [
    { modelId: 'coder-model', contextLength: 1000000 },
    { modelId: 'qwen3-coder-plus', contextLength: 1000000 },
    { modelId: 'qwen3-coder-flash', contextLength: 1000000 },
    { modelId: 'qwen3.5-plus', contextLength: 1000000 },
  ],
}

function fromModelsDevModel(m: ModelsDevModel): ModelInfo {
  return {
    modelId: m.id,
    contextLength: m.contextWindow,
    supportsImages: m.supportsImages,
    supportsReasoning: m.supportsReasoning,
    supportsToolCall: m.supportsToolCall,
  }
}

export function getModelsForProvider(providerType: ProviderType): ModelInfo[] {
  const custom = CUSTOM_PROVIDER_MODELS[providerType]
  if (custom !== undefined) return custom

  return getModelsDevModels(providerType).map(fromModelsDevModel)
}

export function getModelOptions(providerType: ProviderType): string[] {
  const models = getModelsForProvider(providerType)
  const modelIds = models.map((m) => m.modelId)
  return modelIds.length > 0 ? [...modelIds, 'custom'] : ['custom']
}

export function getModelContextLength(
  providerType: ProviderType,
  modelId: string,
): number | undefined {
  const models = getModelsForProvider(providerType)
  const model = models.find((m) => m.modelId === modelId)
  return model?.contextLength
}

export function isCustomModel(
  providerType: ProviderType,
  modelId: string,
): boolean {
  const models = getModelsForProvider(providerType)
  return !models.some((m) => m.modelId === modelId)
}
```

**Step 2: Remove the ModelsData interface and MODELS_DATA constant**

The old file had a hardcoded `ModelsData` interface listing every provider as a key. The new version uses dynamic lookup — no need for that interface.

**Step 3: Verify typecheck passes**

Run: `bun run typecheck`
Expected: No errors in models.ts or its consumers

**Step 4: Commit**

```bash
git add apps/agent/entrypoints/app/ai-settings/models.ts
git commit -m "feat: replace hardcoded MODELS_DATA with models.dev data"
```

---

## Task 4: Update providerTemplates.ts to use models.dev metadata

**Files:**
- Modify: `apps/agent/lib/llm-providers/providerTemplates.ts`

Update `providerTemplates` to pull `contextWindow` and `supportsImages` from models.dev for the default model, while keeping BrowserOS-specific fields (setupGuideUrl, apiKeyUrl) hardcoded.

**Step 1: Update providerTemplates.ts**

Add a helper that enriches templates with models.dev data:

```typescript
import { getModelsDevProvider } from '@browseros/shared/generated/models-dev'
import type { ProviderType } from './types'

export interface ProviderTemplate {
  id: ProviderType
  name: string
  defaultBaseUrl: string
  defaultModelId: string
  supportsImages: boolean
  contextWindow: number
  setupGuideUrl?: string
  apiKeyUrl?: string
}

/**
 * Static provider templates with BrowserOS-specific overrides.
 * contextWindow and supportsImages are enriched from models.dev
 * for the defaultModelId at build time.
 */
export const providerTemplates: ProviderTemplate[] = [
  {
    id: 'chatgpt-pro',
    name: 'ChatGPT Plus/Pro',
    defaultBaseUrl: 'https://chatgpt.com/backend-api',
    defaultModelId: 'gpt-5.3-codex',
    supportsImages: true,
    contextWindow: 400000,
    setupGuideUrl: 'https://docs.browseros.com/features/chatgpt-pro-oauth',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    defaultBaseUrl: 'https://api.githubcopilot.com',
    defaultModelId: 'gpt-5-mini',
    supportsImages: true,
    contextWindow: 128000,
    setupGuideUrl: 'https://docs.browseros.com/features/github-copilot-oauth',
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    defaultBaseUrl: 'https://portal.qwen.ai/v1',
    defaultModelId: 'coder-model',
    supportsImages: true,
    contextWindow: 1000000,
    setupGuideUrl: 'https://docs.browseros.com/features/qwen-code-oauth',
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI',
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    defaultModelId: 'kimi-k2.5',
    supportsImages: true,
    contextWindow: 200000,
    apiKeyUrl: 'https://platform.moonshot.ai/console/api-keys',
    setupGuideUrl: 'https://platform.moonshot.ai/console/api-keys',
  },
  enrichTemplate('openai', {
    defaultModelId: 'gpt-5',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    setupGuideUrl:
      'https://docs.browseros.com/features/bring-your-own-llm#openai',
  }),
  {
    id: 'openai-compatible',
    name: 'OpenAI Compatible',
    defaultBaseUrl: '',
    defaultModelId: '',
    supportsImages: true,
    contextWindow: 128000,
  },
  enrichTemplate('anthropic', {
    defaultModelId: 'claude-sonnet-4-6',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    setupGuideUrl:
      'https://docs.browseros.com/features/bring-your-own-llm#claude',
  }),
  enrichTemplate('google', {
    defaultModelId: 'gemini-2.5-flash',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    setupGuideUrl:
      'https://docs.browseros.com/features/bring-your-own-llm#gemini',
  }),
  enrichTemplate('ollama', {
    defaultModelId: 'llama3.2',
    defaultBaseUrl: 'http://localhost:11434/v1',
    setupGuideUrl:
      'https://docs.browseros.com/features/bring-your-own-llm#ollama',
  }),
  enrichTemplate('openrouter', {
    defaultModelId: 'openai/gpt-4-turbo',
    apiKeyUrl: 'https://openrouter.ai/keys',
    setupGuideUrl:
      'https://docs.browseros.com/features/bring-your-own-llm#openrouter',
  }),
  enrichTemplate('lmstudio', {
    defaultModelId: 'local-model',
    defaultBaseUrl: 'http://localhost:1234/v1',
    setupGuideUrl:
      'https://docs.browseros.com/features/bring-your-own-llm#lmstudio',
  }),
  enrichTemplate('azure', {
    defaultModelId: '',
    apiKeyUrl:
      'https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI',
  }),
  enrichTemplate('bedrock', {
    defaultModelId: '',
    setupGuideUrl:
      'https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html',
  }),
]
```

The `enrichTemplate` helper pulls name, api (as defaultBaseUrl), and model metadata from models.dev:

```typescript
function enrichTemplate(
  providerId: ProviderType,
  overrides: {
    defaultModelId: string
    defaultBaseUrl?: string
    apiKeyUrl?: string
    setupGuideUrl?: string
  },
): ProviderTemplate {
  const provider = getModelsDevProvider(providerId)
  const model = provider?.models.find((m) => m.id === overrides.defaultModelId)

  return {
    id: providerId,
    name: provider?.name ?? providerId,
    defaultBaseUrl: overrides.defaultBaseUrl ?? provider?.api ?? '',
    defaultModelId: overrides.defaultModelId,
    supportsImages: model?.supportsImages ?? true,
    contextWindow: model?.contextWindow ?? 128000,
    ...(overrides.apiKeyUrl && { apiKeyUrl: overrides.apiKeyUrl }),
    ...(overrides.setupGuideUrl && { setupGuideUrl: overrides.setupGuideUrl }),
  }
}
```

Keep `providerTypeOptions`, `DEFAULT_BASE_URLS`, `getProviderTemplate`, and `getDefaultBaseUrlForProviders` unchanged. They still use the hardcoded template array.

**Step 2: Verify typecheck passes**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/agent/lib/llm-providers/providerTemplates.ts
git commit -m "feat: enrich provider templates with models.dev metadata"
```

---

## Task 5: Add `generate:models` to CI and document refresh workflow

**Files:**
- Modify: `package.json` (already done in Task 1)
- Create: `scripts/README-models-dev.md` (optional — or just add to CLAUDE.md)

**Step 1: Add pre-build hook**

In `package.json`, modify the build scripts so models data is regenerated before extension builds:

```json
"prebuild": "bun scripts/generate-models.ts",
```

Or alternatively, add it to `dev:ext` and `dist:ext`:
```json
"dev:ext": "bun scripts/generate-models.ts && ...",
"dist:ext": "bun scripts/generate-models.ts && ..."
```

**Step 2: Add refresh instructions to CLAUDE.md**

Add to the `## Common Commands` section:
```markdown
# Refresh models.dev data
bun run generate:models          # Fetches latest from models.dev/api.json
```

**Step 3: Verify end-to-end**

Run: `bun scripts/generate-models.ts && bun run typecheck`
Expected: Script runs, data refreshes, typecheck passes

**Step 4: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "feat: add models.dev refresh to build pipeline"
```

---

## Task 6: Lint, typecheck, and manual verification

**Step 1: Run linter**

Run: `bun run lint`
Expected: No new lint errors

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No type errors

**Step 3: Verify model dropdown has models.dev data**

After building the extension (`bun run dev:ext`), open the AI Settings page and verify:
- Anthropic dropdown shows 20+ models (was 7)
- OpenAI dropdown shows 40+ models (was 11)
- Google dropdown shows 25+ models (was 4)
- OpenRouter dropdown shows 100+ models (was 13)
- Context window auto-fills from models.dev data

**Step 4: Verify hardcoded providers still work**

- ChatGPT Pro dropdown still shows its custom models
- Qwen Code dropdown still shows its custom models
- BrowserOS still shows `browseros-auto`

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: lint and verify models.dev integration"
```

---

## What's NOT changing (by design)

These files remain as-is because they contain SDK-specific logic that can't be auto-generated:

- `packages/shared/src/schemas/llm.ts` — `LLM_PROVIDERS` constant and Zod enum stay hardcoded. Each provider needs a factory function, so we can't add providers without code.
- `apps/server/src/lib/clients/llm/provider.ts` — Factory functions with custom SDK imports stay hardcoded.
- `apps/server/src/agent/provider-factory.ts` — Same, agent-side factory functions.
- `apps/agent/lib/llm-providers/types.ts` — `ProviderType` union stays hardcoded (matches factory functions).

## Future work (not in this PR)

1. **Periodic sync GitHub Action** — Cron job that runs `generate:models` and opens a PR if data changed
2. **Runtime refresh** — Fetch api.json in the extension on startup, cache in localStorage, fall back to build-time data
3. **Auto-detect new providers** — When models.dev adds a provider that uses `@ai-sdk/openai-compatible`, auto-add it to the UI without code changes
