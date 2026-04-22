import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { buildAgentTarball } from './build'
import { filterAgents, loadAgentTarballConfig } from './config'
import { getDefaultConfigPath, getDefaultOutputDir } from './paths'
import { loadR2PublishConfig } from './r2'
import type { AgentTarballConfigEntry, BuiltAgentTarball } from './types'
import { publishAgentTarballs } from './upload'

interface CliOptions {
  agentId?: string
  configPath: string
  outputDir: string
  upload: boolean
}

function parseArgs(argv: string[]): CliOptions {
  let agentId: string | undefined
  let configPath = getDefaultConfigPath()
  let outputDir = getDefaultOutputDir()
  let upload = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--upload') upload = true
    else if (arg === '--no-upload') upload = false
    else if (arg === '--agent') agentId = argv[++i]
    else if (arg === '--config') configPath = argv[++i]
    else if (arg === '--output-dir') outputDir = argv[++i]
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return { agentId, configPath, outputDir, upload }
}

async function buildArtifacts(
  agents: AgentTarballConfigEntry[],
  outputDir: string,
): Promise<BuiltAgentTarball[]> {
  const artifacts: BuiltAgentTarball[] = []

  for (const agent of agents) {
    for (const platform of agent.platforms) {
      console.info(`Building ${agent.agentId} ${agent.version} for ${platform}`)
      artifacts.push(await buildAgentTarball(agent, platform, outputDir))
    }
  }

  return artifacts
}

export async function runAgentTarballRelease(argv: string[]): Promise<void> {
  const options = parseArgs(argv)
  const config = await loadAgentTarballConfig(options.configPath)
  const agents = filterAgents(config, options.agentId)

  if (agents.length === 0) {
    throw new Error(`No agents matched ${options.agentId}`)
  }

  await mkdir(options.outputDir, { recursive: true })
  const artifacts = await buildArtifacts(agents, options.outputDir)

  if (!options.upload) {
    console.info(
      `Built ${artifacts.length} tarball artifact(s) in ${options.outputDir}`,
    )
    return
  }

  const manifestPath = join(options.outputDir, 'manifest.json')
  const publishConfig = loadR2PublishConfig()
  const result = await publishAgentTarballs(artifacts, publishConfig, {
    manifestPath,
  })

  console.info(
    `Published ${result.publishedArtifacts.length} tarball artifact(s)`,
  )
  console.info(`Manifest written to ${result.manifestPath}`)
}

if (import.meta.main) {
  runAgentTarballRelease(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
