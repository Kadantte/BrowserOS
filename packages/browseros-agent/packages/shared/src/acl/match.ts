import type { AclRule, ElementProperties } from '../types/acl'

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
  return new RegExp(`^${escaped}$`, 'i')
}

export function matchesSitePattern(url: string, pattern: string): boolean {
  if (!pattern) return false
  try {
    const { hostname, pathname } = new URL(url)
    const fullPath = hostname + pathname
    return globToRegex(pattern).test(fullPath)
  } catch {
    return false
  }
}

export function matchesElement(
  props: ElementProperties,
  rule: AclRule,
): boolean {
  if (!rule.selector && !rule.textMatch) return false

  if (rule.selector && !selectorMatchesProps(rule.selector, props)) {
    return false
  }

  if (rule.textMatch) {
    const text = props.textContent.toLowerCase()
    const match = rule.textMatch.toLowerCase()
    if (!text.includes(match)) return false
  }

  return true
}

function selectorMatchesProps(
  selector: string,
  props: ElementProperties,
): boolean {
  const tag = props.tagName.toLowerCase()
  const id = props.attributes.id
  const classes = (props.attributes.class ?? '').split(/\s+/).filter(Boolean)

  const parts = selector.split(',').map((s) => s.trim())
  return parts.some((part) => {
    if (part.startsWith('#') && id) return part === `#${id}`
    if (part.startsWith('.')) return classes.some((c) => part === `.${c}`)
    const tagMatch = part.match(/^(\w+)/)
    if (tagMatch) return tagMatch[1].toLowerCase() === tag
    return false
  })
}

export function findMatchingRules(
  url: string,
  props: ElementProperties,
  rules: AclRule[],
): AclRule[] {
  const siteRules = rules.filter(
    (r) => r.enabled && matchesSitePattern(url, r.sitePattern),
  )
  return siteRules.filter((r) => {
    if (!r.selector && !r.textMatch) return true
    return matchesElement(props, r)
  })
}
