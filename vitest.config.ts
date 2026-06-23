import { defineConfig } from "vitest/config";
import { cloudflarePool } from "@cloudflare/vitest-pool-workers";
import { resolve } from "path";
import { MockAgent } from "undici";
import {
  GATEWAY_ORIGIN,
  TEST_AGENT_PRIVATE_JWK,
  gatewayPublicJwks
} from "./test/fixtures";

// Intercept the gateway's JWKS fetch (triggered by createRemoteJWKSet during
// token verification) so tests never hit the network. disableNetConnect makes
// any unmocked outbound request throw, keeping the suite hermetic.
const fetchMock = new MockAgent();
fetchMock.disableNetConnect();
fetchMock
  .get(GATEWAY_ORIGIN)
  .intercept({ path: "/.well-known/jwks.json" })
  .reply(200, gatewayPublicJwks(), {
    headers: { "content-type": "application/json" }
  })
  .persist();

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "src") }
  },
  test: {
    pool: cloudflarePool({
      main: "./src/index.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        fetchMock,
        bindings: {
          A2A_SIGNING_KEY: JSON.stringify(TEST_AGENT_PRIVATE_JWK),
          GATEWAY_ORIGINS: JSON.stringify([GATEWAY_ORIGIN])
        }
      }
    })
  }
});
