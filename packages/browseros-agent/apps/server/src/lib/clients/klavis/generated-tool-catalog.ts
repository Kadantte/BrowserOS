/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import catalog from './generated/server-tool-catalog.json'

export interface GeneratedKlavisToolCatalogEntry {
  serverName: string
  toolName: string
  description: string
  inputSchema?: unknown
  normalizedToolName: string
  normalizedSearchText: string
}

export interface GeneratedKlavisServerCatalog {
  serverName: string
  toolCount: number
  tools: GeneratedKlavisToolCatalogEntry[]
}

export interface GeneratedKlavisToolCatalog {
  generatedAt: string | null
  sourceFormat: string
  sourceApiBaseUrl: string | null
  serverCount: number
  servers: GeneratedKlavisServerCatalog[]
}

export const GENERATED_KLAVIS_TOOL_CATALOG =
  catalog as GeneratedKlavisToolCatalog

const catalogByServer = new Map(
  GENERATED_KLAVIS_TOOL_CATALOG.servers.map((server) => [
    server.serverName,
    server,
  ]),
)

export function getGeneratedCatalogForServer(
  serverName: string,
): GeneratedKlavisServerCatalog | undefined {
  return catalogByServer.get(serverName)
}

export function getGeneratedCatalogEntry(
  serverName: string,
  normalizedToolName: string,
): GeneratedKlavisToolCatalogEntry | undefined {
  return getGeneratedCatalogForServer(serverName)?.tools.find(
    (tool) => tool.normalizedToolName === normalizedToolName,
  )
}
