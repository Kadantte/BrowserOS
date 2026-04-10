import {
  KlavisClient,
  type KlavisServerToolsFormat,
} from '../apps/server/src/lib/clients/klavis/klavis-client'
import { OAUTH_MCP_SERVERS } from '../apps/server/src/lib/clients/klavis/oauth-mcp-servers'

const OUTPUT_PATH = new URL(
  '../apps/server/src/lib/clients/klavis/generated/server-tool-catalog.json',
  import.meta.url,
).pathname

type OpenAITool = {
  type?: string
  function?: {
    name?: string
    description?: string
    parameters?: unknown
  }
}

interface GeneratedKlavisToolCatalogEntry {
  serverName: string
  toolName: string
  description: string
  inputSchema?: unknown
  normalizedToolName: string
  normalizedSearchText: string
}

interface GeneratedKlavisServerCatalog {
  serverName: string
  toolCount: number
  tools: GeneratedKlavisToolCatalogEntry[]
}

interface GeneratedKlavisToolCatalog {
  generatedAt: string | null
  sourceFormat: KlavisServerToolsFormat
  sourceApiBaseUrl: string | null
  serverCount: number
  servers: GeneratedKlavisServerCatalog[]
}

function normalizeText(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeOpenAITools(
  serverName: string,
  tools: unknown[] | null,
): GeneratedKlavisServerCatalog {
  const normalizedTools = (Array.isArray(tools) ? tools : [])
    .map((tool) => tool as OpenAITool)
    .map((tool) => {
      const toolName = tool.function?.name?.trim() ?? ''
      if (!toolName) {
        return null
      }

      const description = tool.function?.description?.trim() ?? ''
      const normalizedToolName = normalizeText(toolName)

      return {
        serverName,
        toolName,
        description,
        inputSchema: tool.function?.parameters,
        normalizedToolName,
        normalizedSearchText: normalizeText(`${toolName} ${description}`),
      } satisfies GeneratedKlavisToolCatalogEntry
    })
    .filter((entry): entry is GeneratedKlavisToolCatalogEntry => entry !== null)
    .sort((a, b) => a.toolName.localeCompare(b.toolName))

  return {
    serverName,
    toolCount: normalizedTools.length,
    tools: normalizedTools,
  }
}

async function main() {
  const format: KlavisServerToolsFormat = 'openai'
  const client = new KlavisClient()
  const apiBaseUrl = process.env.KLAVIS_API_BASE_URL || 'https://api.klavis.ai'

  console.log(
    `Fetching Klavis tool catalogs for ${OAUTH_MCP_SERVERS.length} supported servers...`,
  )

  const servers: GeneratedKlavisServerCatalog[] = []

  for (const server of OAUTH_MCP_SERVERS) {
    console.log(`- ${server.name}`)
    const response = await client.getServerTools(server.name, format)
    if (!response.success) {
      throw new Error(
        `Klavis metadata fetch failed for ${server.name}: ${response.error ?? 'unknown error'}`,
      )
    }
    servers.push(normalizeOpenAITools(server.name, response.tools))
  }

  servers.sort((a, b) => a.serverName.localeCompare(b.serverName))

  const output: GeneratedKlavisToolCatalog = {
    generatedAt: new Date().toISOString(),
    sourceFormat: format,
    sourceApiBaseUrl: apiBaseUrl,
    serverCount: servers.length,
    servers,
  }

  await Bun.write(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`Written ${servers.length} server catalogs to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
