import { describe, it, expect } from "vitest";
import worker from "../../src/index";
import {
  makeGatewayToken,
  TEST_AGENT_PRIVATE_JWK,
  GATEWAY_ORIGIN,
  AGENT_ORIGIN
} from "../fixtures";

const TEST_ENV = {
  A2A_SIGNING_KEY: JSON.stringify(TEST_AGENT_PRIVATE_JWK),
  GATEWAY_ORIGINS: JSON.stringify([GATEWAY_ORIGIN])
};

// The worker's fetch handler only takes (request, env) — it never uses ctx.
async function req(
  method: string,
  path: string,
  init?: RequestInit,
  env: typeof TEST_ENV = TEST_ENV
) {
  return worker.fetch(
    new Request(`${AGENT_ORIGIN}${path}`, { method, ...init }),
    env
  );
}

describe("GET /.well-known/jwks.json", () => {
  it("returns 200", async () => {
    const res = await req("GET", "/.well-known/jwks.json");
    expect(res.status).toBe(200);
  });

  it("returns a JWKS with exactly one key and no private d param", async () => {
    const res = await req("GET", "/.well-known/jwks.json");
    const body = await res.json<{ keys: Record<string, unknown>[] }>();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).not.toHaveProperty("d");
  });

  it("sets cache-control max-age", async () => {
    const res = await req("GET", "/.well-known/jwks.json");
    expect(res.headers.get("cache-control")).toContain("max-age=3600");
  });
});

describe("GET /.well-known/agent-card.json", () => {
  it("returns 200", async () => {
    const res = await req("GET", "/.well-known/agent-card.json");
    expect(res.status).toBe(200);
  });

  it("returns a signed card with agent name and signatures array", async () => {
    const res = await req("GET", "/.well-known/agent-card.json");
    const body = await res.json<{
      name: string;
      signatures: unknown[];
    }>();
    expect(body.name).toBeTruthy();
    expect(Array.isArray(body.signatures)).toBe(true);
    expect(body.signatures.length).toBeGreaterThan(0);
  });
});

describe("POST /a2a", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await req("POST", "/a2a", {
      body: "{}",
      headers: { "content-type": "application/json" }
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for a malformed Bearer token", async () => {
    const res = await req("POST", "/a2a", {
      body: "{}",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer not.a.real.jwt"
      }
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when jku origin is not in GATEWAY_ORIGINS", async () => {
    const token = await makeGatewayToken({ audience: AGENT_ORIGIN });
    const res = await req(
      "POST",
      "/a2a",
      {
        body: "{}",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        }
      },
      { ...TEST_ENV, GATEWAY_ORIGINS: "[]" }
    );
    expect(res.status).toBe(401);
  });

  it("echoes the caller's message, greeting them by the verified identity", async () => {
    const token = await makeGatewayToken({
      audience: AGENT_ORIGIN,
      identity: { displayName: "Ada" }
    });
    const rpcBody = {
      jsonrpc: "2.0",
      id: "1",
      method: "message/send",
      params: {
        message: {
          messageId: "msg-test-1",
          role: "user",
          kind: "message",
          parts: [{ kind: "text", text: "Hello from test!" }]
        }
      }
    };
    const res = await req("POST", "/a2a", {
      body: JSON.stringify(rpcBody),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json<{
      result: { parts: { kind: string; text: string }[] };
    }>();
    // The greeting name comes from the verified JWT identity claim, proving the
    // token was verified and the identity threaded through to the executor.
    expect(body.result.parts[0].text).toBe(
      "Hello Ada, you said: Hello from test!"
    );
  });
});

describe("unknown routes", () => {
  it("returns 404 for GET /unknown", async () => {
    const res = await req("GET", "/unknown");
    expect(res.status).toBe(404);
  });

  it("returns 404 for GET /", async () => {
    const res = await req("GET", "/");
    expect(res.status).toBe(404);
  });
});
