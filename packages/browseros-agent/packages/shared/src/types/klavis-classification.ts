/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export const KLAVIS_CAPABILITY_TYPES = [
  'discovery',
  'documentation_lookup',
  'auth',
  'read',
  'search',
  'list',
  'draft_create',
  'draft_update',
  'send_message',
  'post_message',
  'create_record',
  'update_record',
  'delete_record',
  'file_upload',
  'file_download',
  'workflow_trigger',
  'admin_change',
  'financial_operation',
  'unknown',
] as const

export type KlavisCapabilityType = (typeof KLAVIS_CAPABILITY_TYPES)[number]

export const KLAVIS_RISK_LEVELS = [
  'low',
  'medium',
  'high',
  'critical',
  'unknown',
] as const

export type KlavisRiskLevel = (typeof KLAVIS_RISK_LEVELS)[number]

export const KLAVIS_EFFECT_TYPES = [
  'none',
  'read_only',
  'draft_only',
  'external_side_effect',
  'destructive',
  'unknown',
] as const

export type KlavisEffectType = (typeof KLAVIS_EFFECT_TYPES)[number]

export const KLAVIS_RESOURCE_KINDS = [
  'message',
  'draft',
  'email',
  'calendar_event',
  'document',
  'file',
  'issue',
  'ticket',
  'task',
  'contact',
  'repository',
  'payment',
  'deployment',
  'analytics',
  'admin',
  'unknown',
] as const

export type KlavisResourceKind = (typeof KLAVIS_RESOURCE_KINDS)[number]

export const KLAVIS_POLICY_FAMILIES = [
  'safe_meta',
  'read_only_external',
  'drafting',
  'communications',
  'external_mutation',
  'destructive_mutation',
  'admin_control',
  'financial',
  'unknown',
] as const

export type KlavisPolicyFamily = (typeof KLAVIS_POLICY_FAMILIES)[number]

export const KLAVIS_CLASSIFICATION_SURFACES = [
  'strata_tool',
  'external_action',
] as const

export type KlavisClassificationSurface =
  (typeof KLAVIS_CLASSIFICATION_SURFACES)[number]

export interface KlavisExternalActionRef {
  serverName: string
  categoryName?: string
  actionName: string
}

export interface KlavisCapabilityClassification {
  surface: KlavisClassificationSurface
  normalizedKey: string
  capabilityType: KlavisCapabilityType
  riskLevel: KlavisRiskLevel
  effectType: KlavisEffectType
  resourceKind: KlavisResourceKind
  policyFamily: KlavisPolicyFamily
  requiresConfirmedIntent: boolean
  supportsDraftMode: boolean
  toolName?: string
  serverName?: string
  categoryName?: string
  actionName?: string
  notes?: string
}
