import Anthropic from "@anthropic-ai/sdk";

export interface AiProvider {
  name: string;
  /** Returns parsed JSON matching `schema`, or null if the model declined. */
  generate(system: string, user: string, schema: Record<string, unknown>): Promise<unknown | null>;
}

let override: AiProvider | null | undefined;
/** Tests inject a fake here so safety logic is verified without network calls. */
export const setAiProvider = (p: AiProvider | null | undefined) => { override = p; };

export function aiProvider(): AiProvider | null {
  if (override !== undefined) return override;
  // A dedicated variable, so a developer's ambient credentials never enable this feature by accident.
  const apiKey = process.env.AI_ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.AI_MODEL || "claude-opus-5-5";
  const client = new Anthropic({ apiKey });
  return {
    name: model,
    async generate(system, user, schema) {
      const res = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema } },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      } as never) as unknown as Anthropic.Message;
      if (res.stop_reason === "refusal") return null;
      const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
      return text ? JSON.parse(text) : null;
    },
  };
}
