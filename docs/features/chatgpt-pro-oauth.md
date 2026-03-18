# PRD: ChatGPT Pro OAuth as LLM Provider

## Level 1 — Executive Summary

### Requirements

- Users can authenticate with their ChatGPT Pro subscription via OAuth 2.0 (Authorization Code + PKCE) directly from the AI Settings page
- After login, ChatGPT Pro appears as a connected provider in the configured providers list (same UX as adding an OpenRouter API key)
- The OAuth access token is routed to the Codex API (`chatgpt.com/backend-api/codex/responses`) via a custom fetch wrapper — the agent loop is completely unaware of OAuth
- Tokens are stored server-side in SQLite, with automatic refresh on expiry (single-use rotating refresh tokens, mutex-protected against concurrent refresh)
- On successful OAuth callback, a success page is shown (chrome-extension:// redirects are blocked by Chromium) — the extension polls for status and auto-creates the provider
- The system is extensible for future OAuth providers (Gemini, Alibaba/Qwen) with minimal additional code
- Users can disconnect/logout from ChatGPT Pro, which clears stored tokens

### Background

BrowserOS currently supports 11 LLM providers, all authenticated via static API keys or cloud credentials. Users who have a ChatGPT Pro subscription ($200/month) must separately purchase OpenAI API credits to use BrowserOS — a poor experience since they're already paying for access.

OpenAI exposes a public OAuth 2.0 endpoint (`auth.openai.com`) that allows third-party tools to authenticate with ChatGPT Pro subscriptions. This is the same OAuth infrastructure used by Codex CLI, OpenCode, and Pi Coding Agent. The resulting access token works as a Bearer token with the Codex API at `chatgpt.com/backend-api/codex/responses` (NOT the standard `api.openai.com` endpoint). The `@ai-sdk/openai` adapter's `.responses()` method is used with a custom fetch wrapper that rewrites URLs and injects required headers.

### Design Overview

The server handles the complete OAuth lifecycle: PKCE generation, callback handling (dedicated server on port 1455 matching the Codex CLI client ID registration), token exchange, storage, and refresh. The extension is a thin UI layer that triggers login and polls for status.

When the user clicks the "ChatGPT Pro" template card in AI Settings, it opens the server's `/oauth/chatgpt-pro/start` endpoint in a new tab, which redirects to OpenAI's authorization page. After the user authenticates, OpenAI redirects to `http://localhost:1455/auth/callback`. The dedicated callback server exchanges the code for tokens, stores them in SQLite, and shows a success page. The extension polls `/oauth/chatgpt-pro/status` and auto-creates the provider when authenticated.

On chat requests, the extension sends `{ provider: 'chatgpt-pro', model: 'gpt-5.3-codex' }` without any API key. The server's `resolveLLMConfig()` intercepts this, looks up the stored OAuth token, refreshes if expired, and returns a resolved config with the access token. The provider factory creates an `@ai-sdk/openai` model with a custom `codexFetch` wrapper that rewrites URLs to `chatgpt.com/backend-api/codex/responses` and injects required headers (`ChatGPT-Account-Id`, `originator`, `OpenAI-Beta`).

---

## Level 2 — Component Details

### 1. OAuth Provider Config Registry

A provider-agnostic configuration module that defines OAuth parameters per provider (client ID, endpoints, scopes, extra params). For ChatGPT Pro, this encapsulates all OpenAI-specific OAuth details. Future providers add a new config object here without changing any other OAuth code. Endpoints imported from `@browseros/shared/constants/urls`.

### 2. OAuth Token Manager

A server-side module responsible for the OAuth mechanics: PKCE generation (verifier + SHA-256 challenge), authorization URL construction, token exchange (POST to token endpoint), and token refresh (with single-use rotation + mutex to prevent concurrent refreshes). It also handles JWT parsing to extract the `accountId` claim from the nested path `https://api.openai.com/auth.chatgpt_account_id` and `email` from `https://api.openai.com/profile.email`. Pending OAuth flows (verifier + state) are stored in-memory with a 5-minute TTL. Missing refresh tokens are explicitly logged and guarded against in the refresh path.

### 3. OAuth Token Storage (SQLite)

A new `oauth_tokens` table in the existing SQLite database stores tokens keyed by `(browseros_id, provider)`. Uses `ON CONFLICT DO UPDATE` for upsert semantics. Created via the existing `CREATE TABLE IF NOT EXISTS` pattern.

### 4. Codex Fetch Wrapper

A shared module (`codex-fetch.ts`) that creates a custom `fetch` function for the Codex API. It rewrites URLs from `api.openai.com/v1/responses` or `/chat/completions` to `chatgpt.com/backend-api/codex/responses`, sets required headers (`ChatGPT-Account-Id`, `originator: browseros`, `OpenAI-Beta: responses=experimental`), and injects required body fields (`stream: true`, `store: false`, default `instructions`). Used by both provider factories.

### 5. OAuth Callback Server

A dedicated Bun HTTP server on port 1455 that handles the OAuth redirect callback. Port 1455 matches the redirect URI registered with OpenAI's Codex client ID (same port used by Codex CLI, OpenCode, Pi). The server shows a success/error HTML page after processing — chrome-extension:// redirects are blocked by Chromium so the extension uses status polling instead. Port is released automatically on process exit.

### 6. OAuth HTTP Routes

A Hono route module registered at `/oauth` on the main server. Three endpoints: `GET /:provider/start` (generates PKCE, redirects to auth server), `GET /:provider/status` (returns auth status for polling), and `DELETE /:provider` (logout — clears tokens). The callback is handled by the dedicated server on port 1455, not these routes.

### 7. LLM Config Resolution (chatgpt-pro)

Extension of the existing `resolveLLMConfig()` function. When it sees `chatgpt-pro`, it looks up the OAuth token from SQLite, checks expiry, refreshes if needed (mutex-protected), and returns a `ResolvedLLMConfig` with the access token as `apiKey`, `openai` as the upstream provider, and `accountId` for the Codex headers.

### 8. Provider Factories (chatgpt-pro)

Two factories (matching the existing dual-factory pattern):
- `provider.ts`: `createChatGPTProModel` — used by test-provider, refine-prompt
- `provider-factory.ts`: `createChatGPTProFactory` — used by agent/chat

Both use `createOpenAI({ apiKey, fetch: createCodexFetch(accountId) }).responses(modelId)`. The shared `codexFetch` wrapper handles URL rewriting and headers.

### 9. Extension UI

- **Template card**: "ChatGPT Pro" appears in provider templates. Clicking it triggers the OAuth flow (opens `/oauth/chatgpt-pro/start` in a new tab) instead of the standard form dialog.
- **Status polling**: `useOAuthStatus` hook polls `/oauth/:provider/status` every 2s for up to 5 minutes.
- **Auto-create**: When polling detects authentication, a provider entry is auto-created from the template defaults (model, context window sourced from `getProviderTemplate`).
- **Disconnect**: Deleting the provider calls `DELETE /oauth/chatgpt-pro` to clear server-side tokens.
- **Edit dialog**: Shows "Credentials are managed via OAuth" banner instead of API key field.

---

## Level 3 — Implementation Details

### Files Created

| File | Purpose |
|------|---------|
| `apps/server/src/lib/clients/oauth/providers.ts` | OAuth provider config (client ID, endpoints, scopes) |
| `apps/server/src/lib/clients/oauth/token-manager.ts` | PKCE, token exchange, refresh with mutex |
| `apps/server/src/lib/clients/oauth/token-store.ts` | SQLite CRUD for OAuth tokens |
| `apps/server/src/lib/clients/oauth/codex-fetch.ts` | Custom fetch wrapper for Codex API |
| `apps/server/src/lib/clients/oauth/callback-server.ts` | Dedicated HTTP server on port 1455 |
| `apps/server/src/lib/clients/oauth/index.ts` | Singleton initializer |
| `apps/server/src/api/routes/oauth.ts` | OAuth HTTP routes (start, status, delete) |
| `apps/agent/lib/llm-providers/useOAuthStatus.ts` | React hook for status polling |

### Files Modified

| File | Change |
|------|--------|
| `packages/shared/src/schemas/llm.ts` | Add `CHATGPT_PRO` to providers |
| `packages/shared/src/constants/ports.ts` | Add `OAUTH_CALLBACK_PORT` (1455) |
| `packages/shared/src/constants/timeouts.ts` | Add OAuth timeouts |
| `packages/shared/src/constants/urls.ts` | Add `OPENAI_AUTH`, `OPENAI_TOKEN` |
| `apps/server/src/lib/db/schema.ts` | Add `oauth_tokens` table |
| `apps/server/src/api/server.ts` | Initialize OAuth, register routes |
| `apps/server/src/lib/clients/llm/config.ts` | Handle `chatgpt-pro` resolution |
| `apps/server/src/lib/clients/llm/provider.ts` | Add `createChatGPTProModel` factory |
| `apps/server/src/lib/clients/llm/types.ts` | Add `accountId` to `ResolvedLLMConfig` |
| `apps/server/src/lib/clients/llm/test-provider.ts` | Use `streamText` for all providers |
| `apps/server/src/lib/clients/llm/refine-prompt.ts` | Use `streamText`, pass `browserosId` |
| `apps/server/src/agent/provider-factory.ts` | Add `createChatGPTProFactory` |
| `apps/server/src/agent/types.ts` | Add `accountId` to `ResolvedAgentConfig` |
| `apps/server/src/api/services/chat-service.ts` | Pass `accountId` to agent config |
| `apps/server/src/api/routes/provider.ts` | Thread `browserosId` for token lookup |
| `apps/server/src/api/routes/refine-prompt.ts` | Thread `browserosId` for token lookup |
| `apps/agent/lib/llm-providers/types.ts` | Add `chatgpt-pro` to `ProviderType` |
| `apps/agent/lib/llm-providers/providerTemplates.ts` | Add ChatGPT Pro template |
| `apps/agent/entrypoints/app/ai-settings/models.ts` | Add Codex model list |
| `apps/agent/entrypoints/app/ai-settings/AISettingsPage.tsx` | OAuth flow trigger + auto-create |
| `apps/agent/entrypoints/app/ai-settings/NewProviderDialog.tsx` | Skip API key for chatgpt-pro |
| `apps/agent/lib/constants/analyticsEvents.ts` | Add OAuth analytics events |

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Codex API (`chatgpt.com/backend-api/codex`) not `api.openai.com` | OAuth tokens don't have API scopes — they only work with the Codex backend |
| Dedicated callback server on port 1455 | OpenAI's client ID registration requires this specific port |
| `.responses()` not `.chat()` | Codex backend uses the Responses API format |
| Custom fetch wrapper (`codexFetch`) | Rewrites URLs, injects headers/body fields required by Codex |
| `streamText` for all providers (test + refine) | Codex requires `stream: true` — using streaming universally avoids provider-specific branching |
| Codex models only (`gpt-5.x-codex`) | OAuth tokens are restricted to Codex-supported models |
| Success page (not redirect) on callback | Chromium blocks HTTP→chrome-extension:// redirects |
| Extension polls for status | Alternative to blocked redirect — detects auth via `/oauth/:provider/status` |

---

## Edge Cases & Lifecycle

### User Deletes the Provider
1. Extension calls `DELETE /oauth/chatgpt-pro` to clear server-side tokens
2. Extension removes provider from local storage
3. If delete fails on server, extension still removes locally

### Token Expires During a Chat Session
- `resolveLLMConfig()` checks `expires_at` before each request and auto-refreshes
- Refresh is mutex-protected — concurrent requests share one in-flight refresh
- If refresh fails (no refresh token or subscription cancelled), stale tokens are deleted and error prompts re-login

### Missing Refresh Token
- Logged at warning level during initial token storage
- `executeRefresh` checks for empty refresh token, deletes stale tokens, throws clear error

### Server Restarts
- Tokens persist in SQLite — no data loss
- Callback server port (1455) released automatically on process exit
- Pending OAuth flows (in-memory) are lost — user retries by clicking template card

### Extension Reinstalled
- Server-side tokens survive — status endpoint returns `authenticated: true` immediately
- Extension auto-creates provider config without requiring re-login
