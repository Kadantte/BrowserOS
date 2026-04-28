import { OrchestratorExecutorEvaluator } from './orchestrator-executor'
import { registerAgent } from './registry'
import { SingleAgentEvaluator } from './single-agent'

// Register built-in agent types
registerAgent('single', (ctx) => new SingleAgentEvaluator(ctx))
registerAgent(
  'orchestrator-executor',
  (ctx) => new OrchestratorExecutorEvaluator(ctx),
)

// Re-exports
export {
  createAgent,
  getRegisteredAgentTypes,
  isAgentTypeRegistered,
  registerAgent,
} from './registry'
export type { AgentContext, AgentEvaluator, AgentResult } from './types'
