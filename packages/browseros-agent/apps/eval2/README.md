# eval2 — Phoenix-traced eval

A minimal eval runner that runs a SingleAgent (OpenAI via
`@browseros/server`'s `AiSdkAgent`) against agisdk smoke tasks and ships the
agent's LLM/tool-call spans plus per-tool screenshots to
[Arize Phoenix](https://phoenix.arize.com).

This is v1. See `.llm/specs/2026-04-28-eval2-laminar-design.md` section 10 for
follow-ups: multi-worker execution, manual TOOL spans, more providers, and
more graders.

## Prerequisites

- BrowserOS app installed at `/Applications/BrowserOS.app/Contents/MacOS/BrowserOS`
  or a custom `browserosBinary` in the config.
- Bun for running TypeScript.
- `python3` with `agisdk` installed for the grader (`pip install agisdk`).
- A Phoenix collector — either:
  - Cloud: `https://app.phoenix.arize.com/s/<workspace>` with a `PHOENIX_API_KEY`.
  - Local: `pip install arize-phoenix && phoenix serve` (defaults to `http://localhost:6006`, no key needed).
- Env vars in `.env.development` or your shell:
  - `OPENAI_API_KEY` is required.
  - `PHOENIX_API_KEY` is required for the cloud endpoint, optional for local.

## Run

```bash
cd packages/browseros-agent/apps/eval2
bun run eval --config benchmark-configs/agisdk-mini.jsonc       # 2-task smoke
bun run eval --config benchmark-configs/agisdk-smoke.jsonc      # full smoke
```

Console output includes per-task progress, a summary table, and the
`summary.json` path. Each task produces a Phoenix session with id
`<runId>-<queryId>` containing the agent's LLM/tool-call spans plus
`eval.step.screenshot` spans for each tool call.

## Verify in Phoenix

Open the configured `phoenix.endpoint` in a browser. Filter by project
`browseros-eval2`. Confirm:

1. One session per task with id `<runId>-<queryId>`.
2. Each session has a tree of LLM and tool-call spans.
3. Tool-call spans show duration in the timeline.
4. `eval.step.screenshot` spans render the captured PNG inline.

## Config

`benchmark-configs/*.jsonc` files are commented; the `phoenix` block controls
tracing:

```jsonc
"phoenix": {
  "enabled": true,                                              // false skips tracing
  "endpoint": "https://app.phoenix.arize.com/s/niffler92",      // or http://localhost:6006
  "apiKeyEnv": "PHOENIX_API_KEY",                               // omit for local
  "projectName": "browseros-eval2",                             // shown in the Phoenix UI
  "sessionPrefix": "agisdk"                                     // sessionId = "<runId>-<queryId>"
}
```

## Layout

- `benchmark-configs/` — commented JSONC configs.
- `datasets/` — copied JSONL datasets from `apps/eval`.
- `scripts/` — copied Python agisdk sidecar.
- `src/` — TypeScript runner. `browseros-app-manager.ts`, `agisdk-grader.ts`,
  and `utils/` are copied from `apps/eval` with local path tweaks.

## Silo rule

No imports from `apps/eval`. Anything needed from the original eval app is
copied into `apps/eval2`.
