/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Shared LLM configuration Zod schemas - single source of truth.
 * Use z.infer<> for TypeScript types.
 */

import { z } from 'zod'

/**
 * LLM provider constants for type-safe switch statements
 */
export const LLM_PROVIDERS = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GOOGLE: 'google',
  OPENROUTER: 'openrouter',
  AZURE: 'azure',
  OLLAMA: 'ollama',
  LMSTUDIO: 'lmstudio',
  BEDROCK: 'bedrock',
  BROWSEROS: 'browseros',
  OPENAI_COMPATIBLE: 'openai-compatible',
  MOONSHOT: 'moonshot',
  CHATGPT_PRO: 'chatgpt-pro',
  GITHUB_COPILOT: 'github-copilot',
  QWEN_CODE: 'qwen-code',
  MINIMAX: 'minimax',
  ACP: 'acp',
} as const

/**
 * Supported LLM providers
 */
export const LLMProviderSchema: z.ZodEnum<
  [
    'anthropic',
    'openai',
    'google',
    'openrouter',
    'azure',
    'ollama',
    'lmstudio',
    'bedrock',
    'browseros',
    'openai-compatible',
    'moonshot',
    'chatgpt-pro',
    'github-copilot',
    'qwen-code',
    'minimax',
    'acp',
  ]
> = z.enum([
  LLM_PROVIDERS.ANTHROPIC,
  LLM_PROVIDERS.OPENAI,
  LLM_PROVIDERS.GOOGLE,
  LLM_PROVIDERS.OPENROUTER,
  LLM_PROVIDERS.AZURE,
  LLM_PROVIDERS.OLLAMA,
  LLM_PROVIDERS.LMSTUDIO,
  LLM_PROVIDERS.BEDROCK,
  LLM_PROVIDERS.BROWSEROS,
  LLM_PROVIDERS.OPENAI_COMPATIBLE,
  LLM_PROVIDERS.MOONSHOT,
  LLM_PROVIDERS.CHATGPT_PRO,
  LLM_PROVIDERS.GITHUB_COPILOT,
  LLM_PROVIDERS.QWEN_CODE,
  LLM_PROVIDERS.MINIMAX,
  LLM_PROVIDERS.ACP,
])

/**
 * ACP-specific permission modes (matches acpx/runtime).
 * Tools an ACP agent invokes go through one of three policies up
 * front — there is no per-call interactive permission prompt.
 */
export const AcpPermissionModeSchema: z.ZodEnum<
  ['approve-all', 'approve-reads', 'deny-all']
> = z.enum(['approve-all', 'approve-reads', 'deny-all'])

export type AcpPermissionMode = z.infer<typeof AcpPermissionModeSchema>

export type LLMProvider = z.infer<typeof LLMProviderSchema>

/**
 * LLM configuration schema
 * Used by SDK endpoints and agent configuration
 */
export const LLMConfigSchema: z.ZodObject<{
  provider: typeof LLMProviderSchema
  model: z.ZodOptional<z.ZodString>
  apiKey: z.ZodOptional<z.ZodString>
  baseUrl: z.ZodOptional<z.ZodString>
  resourceName: z.ZodOptional<z.ZodString>
  region: z.ZodOptional<z.ZodString>
  accessKeyId: z.ZodOptional<z.ZodString>
  secretAccessKey: z.ZodOptional<z.ZodString>
  sessionToken: z.ZodOptional<z.ZodString>
  reasoningEffort: z.ZodOptional<z.ZodEnum<['none', 'low', 'medium', 'high']>>
  reasoningSummary: z.ZodOptional<z.ZodEnum<['auto', 'concise', 'detailed']>>
  acpAgentId: z.ZodOptional<z.ZodString>
  acpDefaultCwd: z.ZodOptional<z.ZodString>
  acpPermissionMode: z.ZodOptional<typeof AcpPermissionModeSchema>
}> = z.object({
  provider: LLMProviderSchema,
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  // Azure-specific
  resourceName: z.string().optional(),
  // AWS Bedrock-specific
  region: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),
  // ChatGPT Pro (Codex)
  reasoningEffort: z.enum(['none', 'low', 'medium', 'high']).optional(),
  reasoningSummary: z.enum(['auto', 'concise', 'detailed']).optional(),
  // ACP (acpx-ai-provider)
  acpAgentId: z.string().optional(),
  acpDefaultCwd: z.string().optional(),
  acpPermissionMode: AcpPermissionModeSchema.optional(),
})

export type LLMConfig = z.infer<typeof LLMConfigSchema>
