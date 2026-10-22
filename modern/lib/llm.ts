/* ─────────────────────────────────────────────────────────
 * LLM — one door to Groq (OpenAI-compatible chat completions).
 * Server-only: reads GROQ_API_KEY from the server environment.
 *
 * The pipeline labels scripted output honestly when no key is present.
 * ───────────────────────────────────────────────────────── */

export type Msg = { role: "system" | "user" | "assistant"; content: string };

export const MODELS = {
  fast: "openai/gpt-oss-20b",
  deep: "openai/gpt-oss-120b",
} as const;

export type ModelKey = keyof typeof MODELS;

export type CompleteOpts = {
  messages: Msg[];
  model?: ModelKey;
  /** ask Groq for a JSON object response */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export function hasLLM(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

/** "live" when a Groq key is configured, otherwise "demo" (scripted). */
export function llmMode(): "live" | "demo" {
  return hasLLM() ? "live" : "demo";
}

function body(opts: CompleteOpts, stream: boolean) {
  return JSON.stringify({
    model: MODELS[opts.model ?? "fast"],
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: (opts.maxTokens ?? 1200) + 256,
    reasoning_effort: "low",
    include_reasoning: false,
    stream,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
}

async function post(opts: CompleteOpts, stream: boolean): Promise<Response> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: body(opts, stream),
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res;
}

/** Single completion, returns the full text. */
export async function complete(opts: CompleteOpts): Promise<string> {
  const res = await post(opts, false);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Completion parsed as JSON. Throws if the model returns invalid JSON. */
export async function completeJSON<T>(opts: Omit<CompleteOpts, "json">): Promise<T> {
  const text = await complete({ ...opts, json: true });
  return JSON.parse(text) as T;
}

/** Streams content deltas as they arrive. */
export async function* stream(opts: CompleteOpts): AsyncGenerator<string> {
  const res = await post(opts, true);
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const chunk = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // partial or keep-alive line; skip
      }
    }
  }
}
