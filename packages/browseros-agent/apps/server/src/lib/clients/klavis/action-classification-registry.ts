/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
  KlavisCapabilityClassification,
  KlavisCapabilityType,
  KlavisEffectType,
  KlavisExternalActionRef,
  KlavisPolicyFamily,
  KlavisResourceKind,
  KlavisRiskLevel,
} from '@browseros/shared/types/klavis-classification'
import { OAUTH_MCP_SERVERS } from './oauth-mcp-servers'

export interface KlavisServerProfile {
  serverName: string
  resourceKind: KlavisResourceKind
  defaultPolicyFamily: KlavisPolicyFamily
  defaultRiskLevel: KlavisRiskLevel
  defaultEffectType: KlavisEffectType
  notes?: string
}

export interface KlavisActionPatternRule {
  id: string
  test: (input: {
    profile?: KlavisServerProfile
    normalizedCategory: string
    normalizedAction: string
    combinedText: string
  }) => boolean
  apply: (
    base: KlavisCapabilityClassification,
  ) => KlavisCapabilityClassification
}

function createToolClassification(config: {
  toolName: string
  capabilityType: KlavisCapabilityType
  riskLevel: KlavisRiskLevel
  effectType: KlavisEffectType
  resourceKind?: KlavisResourceKind
  policyFamily: KlavisPolicyFamily
  requiresConfirmedIntent?: boolean
  supportsDraftMode?: boolean
  notes?: string
}): KlavisCapabilityClassification {
  return {
    surface: 'strata_tool',
    normalizedKey: `strata_tool:${config.toolName}`,
    toolName: config.toolName,
    capabilityType: config.capabilityType,
    riskLevel: config.riskLevel,
    effectType: config.effectType,
    resourceKind: config.resourceKind ?? 'unknown',
    policyFamily: config.policyFamily,
    requiresConfirmedIntent: config.requiresConfirmedIntent ?? false,
    supportsDraftMode: config.supportsDraftMode ?? false,
    notes: config.notes,
  }
}

export const KLAVIS_STATIC_TOOL_CLASSIFICATIONS = new Map(
  [
    createToolClassification({
      toolName: 'discover_server_categories_or_actions',
      capabilityType: 'discovery',
      riskLevel: 'low',
      effectType: 'read_only',
      policyFamily: 'safe_meta',
      notes: 'Entry point for Strata capability discovery.',
    }),
    createToolClassification({
      toolName: 'get_category_actions',
      capabilityType: 'discovery',
      riskLevel: 'low',
      effectType: 'read_only',
      policyFamily: 'safe_meta',
    }),
    createToolClassification({
      toolName: 'get_action_details',
      capabilityType: 'discovery',
      riskLevel: 'low',
      effectType: 'read_only',
      policyFamily: 'safe_meta',
      notes: 'Action schema inspection before execution.',
    }),
    createToolClassification({
      toolName: 'search_documentation',
      capabilityType: 'documentation_lookup',
      riskLevel: 'low',
      effectType: 'read_only',
      policyFamily: 'safe_meta',
    }),
    createToolClassification({
      toolName: 'execute_action',
      capabilityType: 'unknown',
      riskLevel: 'high',
      effectType: 'unknown',
      policyFamily: 'unknown',
      requiresConfirmedIntent: true,
      notes:
        'Dynamic dispatcher; downstream action must be classified from server/category/action args.',
    }),
    createToolClassification({
      toolName: 'handle_auth_failure',
      capabilityType: 'auth',
      riskLevel: 'medium',
      effectType: 'external_side_effect',
      resourceKind: 'admin',
      policyFamily: 'admin_control',
      requiresConfirmedIntent: true,
      notes: 'Authentication helper tool on Strata surfaces.',
    }),
  ].map((classification) => [classification.toolName, classification]),
)

const SERVER_PROFILE_OVERRIDES: Record<
  string,
  Omit<KlavisServerProfile, 'serverName'>
> = {
  Gmail: {
    resourceKind: 'email',
    defaultPolicyFamily: 'communications',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
    notes: 'Email read and send surface.',
  },
  Slack: {
    resourceKind: 'message',
    defaultPolicyFamily: 'communications',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  LinkedIn: {
    resourceKind: 'message',
    defaultPolicyFamily: 'communications',
    defaultRiskLevel: 'high',
    defaultEffectType: 'unknown',
  },
  Notion: {
    resourceKind: 'document',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Airtable: {
    resourceKind: 'task',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Confluence: {
    resourceKind: 'document',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  GitHub: {
    resourceKind: 'repository',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  GitLab: {
    resourceKind: 'repository',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Linear: {
    resourceKind: 'issue',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Jira: {
    resourceKind: 'ticket',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Salesforce: {
    resourceKind: 'contact',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'high',
    defaultEffectType: 'unknown',
  },
  ClickUp: {
    resourceKind: 'task',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Asana: {
    resourceKind: 'task',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Monday: {
    resourceKind: 'task',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  'Microsoft Teams': {
    resourceKind: 'message',
    defaultPolicyFamily: 'communications',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  'Outlook Mail': {
    resourceKind: 'email',
    defaultPolicyFamily: 'communications',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  'Outlook Calendar': {
    resourceKind: 'calendar_event',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Supabase: {
    resourceKind: 'admin',
    defaultPolicyFamily: 'admin_control',
    defaultRiskLevel: 'high',
    defaultEffectType: 'unknown',
  },
  Vercel: {
    resourceKind: 'deployment',
    defaultPolicyFamily: 'admin_control',
    defaultRiskLevel: 'high',
    defaultEffectType: 'unknown',
  },
  Postman: {
    resourceKind: 'admin',
    defaultPolicyFamily: 'admin_control',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Stripe: {
    resourceKind: 'payment',
    defaultPolicyFamily: 'financial',
    defaultRiskLevel: 'critical',
    defaultEffectType: 'unknown',
  },
  Cloudflare: {
    resourceKind: 'admin',
    defaultPolicyFamily: 'admin_control',
    defaultRiskLevel: 'critical',
    defaultEffectType: 'unknown',
  },
  'Brave Search': {
    resourceKind: 'unknown',
    defaultPolicyFamily: 'read_only_external',
    defaultRiskLevel: 'low',
    defaultEffectType: 'read_only',
  },
  Mem0: {
    resourceKind: 'unknown',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Dropbox: {
    resourceKind: 'file',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  OneDrive: {
    resourceKind: 'file',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  WordPress: {
    resourceKind: 'document',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'high',
    defaultEffectType: 'unknown',
  },
  YouTube: {
    resourceKind: 'document',
    defaultPolicyFamily: 'read_only_external',
    defaultRiskLevel: 'low',
    defaultEffectType: 'unknown',
  },
  Box: {
    resourceKind: 'file',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  HubSpot: {
    resourceKind: 'contact',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'high',
    defaultEffectType: 'unknown',
  },
  PostHog: {
    resourceKind: 'analytics',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Mixpanel: {
    resourceKind: 'analytics',
    defaultPolicyFamily: 'read_only_external',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Discord: {
    resourceKind: 'message',
    defaultPolicyFamily: 'communications',
    defaultRiskLevel: 'high',
    defaultEffectType: 'unknown',
  },
  WhatsApp: {
    resourceKind: 'message',
    defaultPolicyFamily: 'communications',
    defaultRiskLevel: 'critical',
    defaultEffectType: 'unknown',
  },
  Shopify: {
    resourceKind: 'payment',
    defaultPolicyFamily: 'financial',
    defaultRiskLevel: 'high',
    defaultEffectType: 'unknown',
  },
  'Cal.com': {
    resourceKind: 'calendar_event',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Resend: {
    resourceKind: 'email',
    defaultPolicyFamily: 'communications',
    defaultRiskLevel: 'critical',
    defaultEffectType: 'unknown',
  },
  'Google Calendar': {
    resourceKind: 'calendar_event',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  'Google Docs': {
    resourceKind: 'document',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  'Google Drive': {
    resourceKind: 'file',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  'Google Sheets': {
    resourceKind: 'document',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  'Google Forms': {
    resourceKind: 'document',
    defaultPolicyFamily: 'external_mutation',
    defaultRiskLevel: 'medium',
    defaultEffectType: 'unknown',
  },
  Zendesk: {
    resourceKind: 'ticket',
    defaultPolicyFamily: 'communications',
    defaultRiskLevel: 'high',
    defaultEffectType: 'unknown',
  },
  Intercom: {
    resourceKind: 'message',
    defaultPolicyFamily: 'communications',
    defaultRiskLevel: 'high',
    defaultEffectType: 'unknown',
  },
}

export const KLAVIS_SERVER_PROFILES = new Map<string, KlavisServerProfile>(
  OAUTH_MCP_SERVERS.map((server) => [
    server.name,
    Object.assign(
      {
        serverName: server.name,
        resourceKind: 'unknown' as const,
        defaultPolicyFamily: 'unknown' as const,
        defaultRiskLevel: 'unknown' as const,
        defaultEffectType: 'unknown' as const,
      },
      SERVER_PROFILE_OVERRIDES[server.name] ?? {},
    ),
  ]),
)

function textMatcher(pattern: RegExp): KlavisActionPatternRule['test'] {
  return ({ combinedText }) => pattern.test(combinedText)
}

function applyClassification(
  base: KlavisCapabilityClassification,
  patch: Partial<KlavisCapabilityClassification>,
): KlavisCapabilityClassification {
  return { ...base, ...patch }
}

export const KLAVIS_ACTION_PATTERN_RULES: KlavisActionPatternRule[] = [
  {
    id: 'financial',
    test: textMatcher(
      /\b(pay|charge|refund|invoice|subscription|transfer|payout|billing)\b/i,
    ),
    apply: (base) =>
      applyClassification(base, {
        capabilityType: 'financial_operation',
        riskLevel: 'critical',
        effectType: 'external_side_effect',
        resourceKind: 'payment',
        policyFamily: 'financial',
        requiresConfirmedIntent: true,
        supportsDraftMode: false,
      }),
  },
  {
    id: 'admin',
    test: textMatcher(
      /\b(permission|permissions|role|member|token|secret|api key|dns|deploy|deployment|environment variable|setting|settings|config)\b/i,
    ),
    apply: (base) =>
      applyClassification(base, {
        capabilityType: 'admin_change',
        riskLevel: base.serverName === 'Cloudflare' ? 'critical' : 'high',
        effectType: 'external_side_effect',
        resourceKind: 'admin',
        policyFamily: 'admin_control',
        requiresConfirmedIntent: true,
        supportsDraftMode: false,
      }),
  },
  {
    id: 'delete',
    test: textMatcher(/\b(delete|remove|archive|destroy|purge)\b/i),
    apply: (base) =>
      applyClassification(base, {
        capabilityType: 'delete_record',
        riskLevel: 'critical',
        effectType: 'destructive',
        policyFamily: 'destructive_mutation',
        requiresConfirmedIntent: true,
        supportsDraftMode: false,
      }),
  },
  {
    id: 'send-message',
    test: textMatcher(
      /\b(send|reply|forward|post message|post reply|send email|send message|dm|direct message|publish)\b/i,
    ),
    apply: (base) =>
      applyClassification(base, {
        capabilityType:
          base.resourceKind === 'email' ? 'send_message' : 'post_message',
        riskLevel:
          base.serverName === 'WhatsApp' || base.serverName === 'Resend'
            ? 'critical'
            : 'high',
        effectType: 'external_side_effect',
        policyFamily: 'communications',
        requiresConfirmedIntent: true,
        supportsDraftMode: true,
      }),
  },
  {
    id: 'draft',
    test: textMatcher(/\b(draft|compose draft|create draft|save draft)\b/i),
    apply: (base) =>
      applyClassification(base, {
        capabilityType: 'draft_create',
        riskLevel: 'medium',
        effectType: 'draft_only',
        resourceKind:
          base.resourceKind === 'unknown' ? 'draft' : base.resourceKind,
        policyFamily: 'drafting',
        requiresConfirmedIntent: false,
        supportsDraftMode: true,
      }),
  },
  {
    id: 'upload-download',
    test: textMatcher(/\b(upload|attach|import|download|export)\b/i),
    apply: (base) =>
      applyClassification(base, {
        capabilityType: /\b(download|export)\b/i.test(base.actionName ?? '')
          ? 'file_download'
          : 'file_upload',
        riskLevel: 'medium',
        effectType: 'external_side_effect',
        resourceKind: 'file',
        policyFamily: 'external_mutation',
        requiresConfirmedIntent: false,
        supportsDraftMode: false,
      }),
  },
  {
    id: 'create',
    test: textMatcher(/\b(create|add|insert|open issue|new event|schedule)\b/i),
    apply: (base) =>
      applyClassification(base, {
        capabilityType: 'create_record',
        riskLevel: base.policyFamily === 'communications' ? 'high' : 'medium',
        effectType: 'external_side_effect',
        policyFamily:
          base.policyFamily === 'unknown'
            ? 'external_mutation'
            : base.policyFamily,
        requiresConfirmedIntent: base.policyFamily === 'communications',
        supportsDraftMode: false,
      }),
  },
  {
    id: 'update',
    test: textMatcher(/\b(update|edit|modify|move|assign|close|reopen)\b/i),
    apply: (base) =>
      applyClassification(base, {
        capabilityType: 'update_record',
        riskLevel: 'medium',
        effectType: 'external_side_effect',
        policyFamily:
          base.policyFamily === 'unknown'
            ? 'external_mutation'
            : base.policyFamily,
        requiresConfirmedIntent: false,
        supportsDraftMode: false,
      }),
  },
  {
    id: 'read-search-list',
    test: textMatcher(
      /\b(list|get|find|search|fetch|read|retrieve|view|show|lookup|query)\b/i,
    ),
    apply: (base) =>
      applyClassification(base, {
        capabilityType: /\b(search|find|lookup|query)\b/i.test(
          base.actionName ?? '',
        )
          ? 'search'
          : /\b(list)\b/i.test(base.actionName ?? '')
            ? 'list'
            : 'read',
        riskLevel: base.policyFamily === 'financial' ? 'medium' : 'low',
        effectType: 'read_only',
        policyFamily:
          base.policyFamily === 'financial'
            ? 'financial'
            : 'read_only_external',
        requiresConfirmedIntent: false,
        supportsDraftMode: false,
      }),
  },
]

export function createUnknownActionClassification(
  action: KlavisExternalActionRef,
): KlavisCapabilityClassification {
  return {
    surface: 'external_action',
    normalizedKey: '',
    capabilityType: 'unknown',
    riskLevel: 'unknown',
    effectType: 'unknown',
    resourceKind: 'unknown',
    policyFamily: 'unknown',
    requiresConfirmedIntent: true,
    supportsDraftMode: false,
    serverName: action.serverName,
    categoryName: action.categoryName,
    actionName: action.actionName,
    notes:
      'Unknown external action; future policy should treat conservatively.',
  }
}
