import type { Message, Part } from "@a2a-js/sdk";
import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext
} from "@a2a-js/sdk/server";
import type { GatewayIdentity } from "../auth/verify";

/** Concatenate the text parts of an inbound A2A message. */
function textOf(message: Message): string {
  return (message.parts ?? [])
    .filter(
      (p: Part): p is Extract<Part, { kind: "text" }> => p.kind === "text"
    )
    .map((p) => p.text)
    .join("")
    .trim();
}

/** Echo executor that greets the verified caller by name (from the JWT claims). */
export class EchoExecutor implements AgentExecutor {
  constructor(private readonly identity: GatewayIdentity) {}

  execute = async (
    ctx: RequestContext,
    bus: ExecutionEventBus
  ): Promise<void> => {
    const said = textOf(ctx.userMessage);
    const who =
      this.identity.displayName ||
      this.identity.slackUserId ||
      "unknown caller";
    const reply: Message = {
      kind: "message",
      messageId: crypto.randomUUID(),
      role: "agent",
      parts: [{ kind: "text", text: `Hello ${who}, you said: ${said}` }],
      contextId: ctx.contextId
    };
    bus.publish(reply);
    bus.finished();
  };

  cancelTask = async (): Promise<void> => {};
}
