import { describe, it, expect } from "vitest";
import type { Message } from "@a2a-js/sdk";
import type { ExecutionEventBus, RequestContext } from "@a2a-js/sdk/server";
import { EchoExecutor } from "@/agent/executor";

function makeCtx(
  parts: Array<{ kind: string; [k: string]: unknown }>,
  contextId = "ctx-1"
): RequestContext {
  return {
    userMessage: { parts, contextId } as unknown as Message,
    contextId
  } as unknown as RequestContext;
}

function makeBus() {
  const published: Message[] = [];
  let done = false;
  const bus = {
    publish: (msg: Message) => {
      published.push(msg);
    },
    finished: () => {
      done = true;
    }
  } as unknown as ExecutionEventBus;
  return {
    bus,
    get published() {
      return published;
    },
    get done() {
      return done;
    }
  };
}

describe("EchoExecutor — identity resolution", () => {
  it("greets by displayName when present", async () => {
    const { bus, published } = makeBus();
    await new EchoExecutor({ displayName: "Alice" }).execute(
      makeCtx([{ kind: "text", text: "hi" }]),
      bus
    );
    expect(published[0].parts[0]).toMatchObject({
      text: "Hello Alice, you said: hi"
    });
  });

  it("falls back to slackUserId when displayName is absent", async () => {
    const { bus, published } = makeBus();
    await new EchoExecutor({ slackUserId: "U9999" }).execute(
      makeCtx([{ kind: "text", text: "hey" }]),
      bus
    );
    expect(published[0].parts[0]).toMatchObject({
      text: "Hello U9999, you said: hey"
    });
  });

  it("falls back to 'unknown caller' when both are absent", async () => {
    const { bus, published } = makeBus();
    await new EchoExecutor({}).execute(
      makeCtx([{ kind: "text", text: "hello" }]),
      bus
    );
    expect(published[0].parts[0]).toMatchObject({
      text: "Hello unknown caller, you said: hello"
    });
  });
});

describe("EchoExecutor — message handling", () => {
  it("concatenates multiple text parts", async () => {
    const { bus, published } = makeBus();
    await new EchoExecutor({ displayName: "Bob" }).execute(
      makeCtx([
        { kind: "text", text: "foo" },
        { kind: "text", text: "bar" }
      ]),
      bus
    );
    expect(published[0].parts[0]).toMatchObject({
      text: "Hello Bob, you said: foobar"
    });
  });

  it("ignores non-text parts", async () => {
    const { bus, published } = makeBus();
    await new EchoExecutor({ displayName: "Carol" }).execute(
      makeCtx([
        { kind: "file", url: "https://example.com/file.pdf" },
        { kind: "text", text: "check this" }
      ]),
      bus
    );
    expect(published[0].parts[0]).toMatchObject({
      text: "Hello Carol, you said: check this"
    });
  });

  it("echoes an empty message without error", async () => {
    const { bus, published } = makeBus();
    await new EchoExecutor({ displayName: "Dan" }).execute(makeCtx([]), bus);
    expect(published[0].parts[0]).toMatchObject({
      text: "Hello Dan, you said: "
    });
  });
});

describe("EchoExecutor — bus contract", () => {
  it("publishes exactly one reply", async () => {
    const { bus, published } = makeBus();
    await new EchoExecutor({ displayName: "Eve" }).execute(
      makeCtx([{ kind: "text", text: "test" }]),
      bus
    );
    expect(published).toHaveLength(1);
  });

  it("calls bus.finished() after publishing", async () => {
    const tracker = makeBus();
    await new EchoExecutor({ displayName: "Eve" }).execute(
      makeCtx([{ kind: "text", text: "test" }]),
      tracker.bus
    );
    expect(tracker.done).toBe(true);
  });

  it("reply carries the contextId from the request", async () => {
    const { bus, published } = makeBus();
    await new EchoExecutor({ displayName: "Frank" }).execute(
      makeCtx([{ kind: "text", text: "ctx check" }], "my-context-42"),
      bus
    );
    expect(published[0].contextId).toBe("my-context-42");
  });

  it("reply has role 'agent'", async () => {
    const { bus, published } = makeBus();
    await new EchoExecutor({}).execute(
      makeCtx([{ kind: "text", text: "x" }]),
      bus
    );
    expect(published[0].role).toBe("agent");
  });

  it("cancelTask resolves without error", async () => {
    await expect(new EchoExecutor({}).cancelTask()).resolves.toBeUndefined();
  });
});
