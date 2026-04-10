/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type {
  KlavisCapabilityClassification,
  KlavisExternalActionRef,
} from '@browseros/shared/types/klavis-classification'
import {
  createUnknownActionClassification,
  KLAVIS_ACTION_PATTERN_RULES,
  KLAVIS_SERVER_PROFILES,
  KLAVIS_STATIC_TOOL_CLASSIFICATIONS,
} from './action-classification-registry'
import {
  getGeneratedCatalogEntry,
  getGeneratedCatalogForServer,
} from './generated-tool-catalog'

export function normalizeKlavisSegment(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function buildKlavisActionKey(action: KlavisExternalActionRef): string {
  return [
    'external_action',
    normalizeKlavisSegment(action.serverName).replace(/ /g, '_'),
    normalizeKlavisSegment(action.categoryName).replace(/ /g, '_') || '_',
    normalizeKlavisSegment(action.actionName).replace(/ /g, '_'),
  ].join(':')
}

export function classifyKlavisToolName(
  toolName: string,
): KlavisCapabilityClassification {
  const known = KLAVIS_STATIC_TOOL_CLASSIFICATIONS.get(toolName)
  if (known) {
    return known
  }

  const normalizedToolName = normalizeKlavisSegment(toolName)
  const matches = []
  for (const server of KLAVIS_SERVER_PROFILES.keys()) {
    const entry = getGeneratedCatalogEntry(server, normalizedToolName)
    if (entry) matches.push(entry)
  }
  if (matches.length > 0) {
    return classifyKlavisExternalAction({
      serverName: matches[0].serverName,
      actionName: matches[0].toolName,
    })
  }

  return {
    surface: 'strata_tool',
    normalizedKey: `strata_tool:${toolName}`,
    toolName,
    capabilityType: 'unknown',
    riskLevel: 'unknown',
    effectType: 'unknown',
    resourceKind: 'unknown',
    policyFamily: 'unknown',
    requiresConfirmedIntent: true,
    supportsDraftMode: false,
    notes: 'Unknown Strata tool name; treat as conservative until classified.',
  }
}

export function classifyKlavisExternalAction(
  action: KlavisExternalActionRef,
): KlavisCapabilityClassification {
  const normalizedCategory = normalizeKlavisSegment(action.categoryName)
  const normalizedAction = normalizeKlavisSegment(action.actionName)
  const generatedEntry = getGeneratedCatalogEntry(
    action.serverName,
    normalizedAction,
  )
  const generatedCatalog = getGeneratedCatalogForServer(action.serverName)
  const combinedText = [
    normalizedCategory,
    normalizedAction,
    generatedEntry?.normalizedSearchText,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
  const profile = KLAVIS_SERVER_PROFILES.get(action.serverName)

  const base = {
    ...createUnknownActionClassification(action),
    normalizedKey: buildKlavisActionKey(action),
    serverName: action.serverName,
    categoryName: action.categoryName,
    actionName: action.actionName,
    resourceKind: profile?.resourceKind ?? 'unknown',
    policyFamily: profile?.defaultPolicyFamily ?? 'unknown',
    riskLevel: profile?.defaultRiskLevel ?? 'unknown',
    effectType: profile?.defaultEffectType ?? 'unknown',
    notes:
      generatedEntry && generatedCatalog
        ? `Matched generated Klavis catalog for ${generatedCatalog.serverName}.`
        : undefined,
  }

  const matchedRule = KLAVIS_ACTION_PATTERN_RULES.find((rule) =>
    rule.test({
      profile,
      normalizedCategory,
      normalizedAction,
      combinedText,
    }),
  )

  if (!matchedRule) {
    return base
  }

  return matchedRule.apply(base)
}

export function summarizeKlavisToolExposure(
  toolNames: string[],
): Record<string, number> {
  const summary: Record<string, number> = {}
  for (const toolName of toolNames) {
    const classification = classifyKlavisToolName(toolName)
    summary[classification.capabilityType] =
      (summary[classification.capabilityType] ?? 0) + 1
  }
  return summary
}
