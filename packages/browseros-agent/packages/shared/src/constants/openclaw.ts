export const OPENCLAW_AGENT_NAME = 'openclaw'
// Pin away from latest because newer OpenClaw releases regress OpenRouter chat streams.
export const OPENCLAW_GATEWAY_IMAGE = 'ghcr.io/openclaw/openclaw:2026.4.12'
export const OPENCLAW_GATEWAY_CONTAINER_PORT = 18789
export const OPENCLAW_CONTAINER_HOME = '/home/node/.openclaw'
export const OPENCLAW_COMPOSE_PROJECT_NAME = 'browseros-openclaw'
export const OPENCLAW_GATEWAY_CONTAINER_NAME = `${OPENCLAW_COMPOSE_PROJECT_NAME}-openclaw-gateway-1`
export const OPENCLAW_TERMINAL_SHELL = '/bin/sh'
