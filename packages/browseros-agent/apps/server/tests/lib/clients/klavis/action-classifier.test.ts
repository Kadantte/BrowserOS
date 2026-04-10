import { describe, expect, it } from 'bun:test'
import {
  buildKlavisActionKey,
  classifyKlavisExternalAction,
  classifyKlavisToolName,
  normalizeKlavisSegment,
  summarizeKlavisToolExposure,
} from '../../../../src/lib/clients/klavis/action-classifier'

describe('normalizeKlavisSegment', () => {
  it('normalizes mixed casing and punctuation', () => {
    expect(normalizeKlavisSegment('Send Email!')).toBe('send email')
    expect(normalizeKlavisSegment('  Create_Draft  ')).toBe('create draft')
  })
})

describe('classifyKlavisToolName', () => {
  it('classifies discovery tools as low risk safe meta', () => {
    const classification = classifyKlavisToolName(
      'discover_server_categories_or_actions',
    )
    expect(classification.capabilityType).toBe('discovery')
    expect(classification.riskLevel).toBe('low')
    expect(classification.policyFamily).toBe('safe_meta')
    expect(classification.effectType).toBe('read_only')
  })

  it('treats execute_action as a high-risk dispatcher', () => {
    const classification = classifyKlavisToolName('execute_action')
    expect(classification.capabilityType).toBe('unknown')
    expect(classification.riskLevel).toBe('high')
    expect(classification.requiresConfirmedIntent).toBe(true)
  })

  it('falls back conservatively for unknown tools', () => {
    const classification = classifyKlavisToolName('mystery_tool')
    expect(classification.capabilityType).toBe('unknown')
    expect(classification.riskLevel).toBe('unknown')
    expect(classification.policyFamily).toBe('unknown')
  })
})

describe('classifyKlavisExternalAction', () => {
  it('classifies Gmail send email as high-risk communications', () => {
    const classification = classifyKlavisExternalAction({
      serverName: 'Gmail',
      categoryName: 'Messages',
      actionName: 'Send Email',
    })
    expect(classification.capabilityType).toBe('send_message')
    expect(classification.riskLevel).toBe('high')
    expect(classification.effectType).toBe('external_side_effect')
    expect(classification.policyFamily).toBe('communications')
    expect(classification.supportsDraftMode).toBe(true)
  })

  it('classifies Slack post message as high-risk communications', () => {
    const classification = classifyKlavisExternalAction({
      serverName: 'Slack',
      categoryName: 'Messaging',
      actionName: 'Post Message',
    })
    expect(classification.capabilityType).toBe('post_message')
    expect(classification.riskLevel).toBe('high')
    expect(classification.policyFamily).toBe('communications')
  })

  it('classifies create draft as draft-only', () => {
    const classification = classifyKlavisExternalAction({
      serverName: 'Gmail',
      categoryName: 'Messages',
      actionName: 'Create Draft',
    })
    expect(classification.capabilityType).toBe('draft_create')
    expect(classification.effectType).toBe('draft_only')
    expect(classification.policyFamily).toBe('drafting')
  })

  it('classifies Stripe refund charge as critical financial operation', () => {
    const classification = classifyKlavisExternalAction({
      serverName: 'Stripe',
      categoryName: 'Payments',
      actionName: 'Refund Charge',
    })
    expect(classification.capabilityType).toBe('financial_operation')
    expect(classification.riskLevel).toBe('critical')
    expect(classification.policyFamily).toBe('financial')
    expect(classification.resourceKind).toBe('payment')
  })

  it('classifies Notion delete page as destructive mutation', () => {
    const classification = classifyKlavisExternalAction({
      serverName: 'Notion',
      categoryName: 'Pages',
      actionName: 'Delete Page',
    })
    expect(classification.capabilityType).toBe('delete_record')
    expect(classification.effectType).toBe('destructive')
    expect(classification.policyFamily).toBe('destructive_mutation')
    expect(classification.riskLevel).toBe('critical')
  })

  it('classifies Brave Search query as read-only external', () => {
    const classification = classifyKlavisExternalAction({
      serverName: 'Brave Search',
      categoryName: 'Web',
      actionName: 'Search Query',
    })
    expect(classification.capabilityType).toBe('search')
    expect(classification.effectType).toBe('read_only')
    expect(classification.policyFamily).toBe('read_only_external')
    expect(classification.riskLevel).toBe('low')
  })

  it('falls back conservatively for unknown external actions', () => {
    const classification = classifyKlavisExternalAction({
      serverName: 'Unknown App',
      categoryName: 'Mystery',
      actionName: 'Do Stuff',
    })
    expect(classification.capabilityType).toBe('unknown')
    expect(classification.riskLevel).toBe('unknown')
    expect(classification.effectType).toBe('unknown')
    expect(classification.policyFamily).toBe('unknown')
    expect(classification.requiresConfirmedIntent).toBe(true)
  })
})

describe('buildKlavisActionKey', () => {
  it('builds a normalized stable key', () => {
    expect(
      buildKlavisActionKey({
        serverName: 'Google Calendar',
        categoryName: 'Events',
        actionName: 'Create Event',
      }),
    ).toBe('external_action:google_calendar:events:create_event')
  })
})

describe('summarizeKlavisToolExposure', () => {
  it('groups tool names by capability type', () => {
    expect(
      summarizeKlavisToolExposure([
        'discover_server_categories_or_actions',
        'get_action_details',
        'execute_action',
      ]),
    ).toEqual({
      discovery: 2,
      unknown: 1,
    })
  })
})
