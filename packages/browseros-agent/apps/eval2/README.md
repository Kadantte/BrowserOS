# eval2 - Laminar-traced eval

A minimal eval runner that runs a SingleAgent (OpenAI via
`@browseros/server`'s `AiSdkAgent`) against agisdk smoke tasks and sends the
task span plus AI SDK LLM/tool-call spans to Laminar.

This is v1. See
`.llm/specs/2026-04-28-eval2-laminar-design.md` section 10 for follow-ups:
multi-worker execution, manual TOOL spans, more providers, and more graders.

## Prerequisites

- BrowserOS app installed at `/Applications/BrowserOS.app/Contents/MacOS/BrowserOS`
  or a custom `browserosBinary` in the config.
- Bun for running TypeScript.
- `python3` with `agisdk` installed for the grader (`pip install agisdk`).
- Env vars in `.env.development` or your shell:
  - `OPENAI_API_KEY` is required.
  - `LMNR_PROJECT_API_KEY` is optional. Without it, the runner warns and runs
    without tracing.

## Run

```bash
cd packages/browseros-agent/apps/eval2
bun run eval --config benchmark-configs/agisdk-smoke.jsonc
```

Console output includes per-task progress, a summary table, and the
`summary.json` path. If tracing is enabled, each task has a Laminar session
like `agisdk-dashdish-10` containing an `eval.task` span and nested AI SDK spans
for LLM calls and tool calls.

## Layout

- `benchmark-configs/` contains commented JSONC configs.
- `datasets/` contains copied JSONL datasets from `apps/eval`.
- `scripts/` contains the copied Python agisdk sidecar.
- `src/` contains the TypeScript runner. `browseros-app-manager.ts`,
  `agisdk-grader.ts`, and `utils/` are copied from `apps/eval` with local path
  tweaks.

## Silo Rule

No imports from `apps/eval`. Anything needed from the original eval app is
copied into `apps/eval2`.
