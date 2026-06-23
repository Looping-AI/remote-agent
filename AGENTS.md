# AGENTS.md

Guidance for coding agents working in this repo. Keep it accurate — update it when the build, layout, or contract below changes.

## What this is

A deployable **reference remote (custom) A2A agent** for [looping-gateway](https://github.com/Looping-AI/looping-gateway), running as a single **Cloudflare Worker**. It demonstrates the zero-shared-secrets trust contract a third party must implement to be registered and routed to by the gateway. All trust flows through asymmetric **Ed25519 / EdDSA** signatures over public JWKS — there are no symmetric secrets in either direction.

The agent itself is a trivial echo: it verifies the caller and replies `Hello <name>, you said: <text>`. The value is the _contract_, not the behavior.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the full trust model and sequence diagrams, and [README.md](README.md) for setup/deploy/registration.

## Commands

```sh
npm install            # install deps
npm run dev            # wrangler dev (local Worker); press `t` for a quick tunnel
npm run test           # vitest run (vitest-pool-workers, hermetic — no network)
npm run test:watch     # vitest watch
npm run check          # prettier --check && eslint && tsc (src) && tsc (test)  ← CI + pre-commit gate
npm run lint           # eslint only
npm run format         # prettier --write .
npm run types          # regenerate env.d.ts from wrangler bindings
npm run keygen <kid>   # generate an Ed25519 private JWK for A2A_SIGNING_KEY
```

`npm run check` is the source of truth: it runs in CI ([.github/workflows/test.yml](.github/workflows/test.yml)) and as the husky `pre-commit` hook. Run `npm run check && npm run test` before committing — the commit will be rejected otherwise.

## Layout

| Path                                                   | Role                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [src/index.ts](src/index.ts)                           | Worker entry. Routes JWKS / AgentCard / JSON-RPC; verifies the gateway JWT.                    |
| [src/agent/executor.ts](src/agent/executor.ts)         | `EchoExecutor` — handles A2A task execution and builds the reply.                              |
| [src/agent/manifest.ts](src/agent/manifest.ts)         | AgentCard manifest definition.                                                                 |
| [src/auth/card.ts](src/auth/card.ts)                   | Build + EdDSA-sign the AgentCard; derive the public card-signing JWKS.                         |
| [src/auth/canonical.ts](src/auth/canonical.ts)         | Canonical-JSON serialization used for the card signature. **Mirrors the gateway — see below.** |
| [src/auth/verify.ts](src/auth/verify.ts)               | Verify the inbound gateway identity JWT (sig + `iss` + `aud` + `exp` + `jku` origin).          |
| [scripts/generate-keys.mjs](scripts/generate-keys.mjs) | Ed25519 JWK keypair generator.                                                                 |
| [test/](test/)                                         | Vitest specs + [test/fixtures.ts](test/fixtures.ts) (fixed test keys, `makeGatewayToken`).     |
| [wrangler.jsonc](wrangler.jsonc)                       | Worker config + `GATEWAY_ORIGINS` var.                                                         |

## Non-negotiable constraints

These are the things that silently break the contract or the trust model. Treat them as invariants.

1. **`src/auth/canonical.ts` must stay byte-for-byte identical to the gateway's** `src/a2a/card-verify.ts` canonicalizer (keys sorted recursively ascending, `JSON.stringify` no whitespace, `signatures` excluded, base64url no padding). The gateway recomputes the signed payload independently; any deviation makes signatures fail to verify. **If you change one, change both.** Don't "improve" the serialization.

2. **Algorithm is `EdDSA` (Ed25519) everywhere** — card signing, gateway JWT verification, key generation. Reject/forbid anything else. The constant `ALG = "EdDSA"` appears in `src/auth/card.ts` and `src/auth/verify.ts`; keep them in lockstep.

3. **Never weaken the JWT verification in `src/auth/verify.ts`.** It enforces, in order: `jku` header present → `jku` origin ∈ `GATEWAY_ORIGINS` → `iss` origin === `jku` origin → `jwtVerify` with `issuer`/`audience`/`algorithms`. The `jku`-origin allowlist and the `iss`===`jku` check prevent key-injection and cross-gateway impersonation. Do not skip a check, widen the allowlist to wildcards, or fetch a `jku` before validating its origin.

4. **Zero shared secrets.** Only public JWKS cross the boundary. The single private key (`A2A_SIGNING_KEY`) never leaves the Worker; only its public half is served at `/.well-known/jwks.json`. Never log, echo, or commit a private JWK or the `d` field.

5. **`GATEWAY_ORIGINS` (Worker var) must match the deployed gateway's `GATEWAY_ORIGIN`.** It's a JSON array string, e.g. `["https://gw.example.com"]`. It validates both the JWT `jku` and `iss`.

## Runtime & style

- **Cloudflare Workers runtime**, not Node. `nodejs_compat` is on, but prefer Web APIs (`crypto`, `fetch`, `Response.json`, `TextEncoder`). Crypto goes through [`jose`](https://github.com/panva/jose).
- TypeScript is `strict`. ESLint forbids `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-deprecated` (both `error`). Prefix intentionally-unused vars with `_`.
- Prettier with `trailingComma: "none"`. Run `npm run format`; don't hand-format.
- Module entry is `satisfies ExportedHandler<Env>`; bindings are typed via the `Env` interface in `src/index.ts` (mirrored in `wrangler.jsonc` vars).

## Tests

- Use `@cloudflare/vitest-pool-workers` — specs run inside the Workers runtime. Config: [vitest.config.ts](vitest.config.ts).
- The suite is **hermetic**: `MockAgent` with `disableNetConnect()` intercepts the gateway JWKS fetch; any unmocked outbound request throws. Don't add real network calls in tests.
- Test keys and `makeGatewayToken(...)` live in [test/fixtures.ts](test/fixtures.ts). Build gateway tokens through that helper so headers/claims stay consistent.
- When adding a route or verification branch, cover it with both an accept and a reject case (mirror the existing `test/auth/verify.spec.ts` / `test/index.spec.ts` style).

## Secrets

- `A2A_SIGNING_KEY` — Ed25519 private JWK (must include `kid`). Locally in `.dev.vars` (gitignored; see [.dev.vars.example](.dev.vars.example)); in prod via `wrangler secret put A2A_SIGNING_KEY`. Generate with `npm run keygen <kid>`. Never commit it.

## Note on `.agents/skills/`

That directory holds vendored Cloudflare skill packs (tracked in `skills-lock.json`) — reference material, not application code. Don't edit those files by hand.
