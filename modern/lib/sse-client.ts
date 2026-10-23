/* ─────────────────────────────────────────────────────────
 * SSE (client) — POST a JSON body and receive named events.
 * fetch-based (EventSource can't POST).
 *
 *   await postSSE("/api/reviewer/audit", { url }, (event, data) => {...}, signal);
 * ───────────────────────────────────────────────────────── */

export type SSEFrame = { event: string; data: unknown };

/** Parses one `event:/data:` frame. Returns null for comments or empty frames. */
export function parseFrame(frame: string): SSEFrame | null {
  let event = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (data.length === 0) return null;
  const raw = data.join("\n");
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

/** Splits a growing buffer into complete frames plus the unfinished remainder. */
export function splitFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = parts.pop() ?? "";
  return { frames: parts.filter((p) => p.trim().length > 0), rest };
}

export async function postSSE(
  url: string,
  body: unknown,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${detail.slice(0, 200)}`.trim());
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  const emit = (frame: string) => {
    if (signal?.aborted || terminal) return;
    const parsed = parseFrame(frame);
    if (!parsed) return;
    onEvent(parsed.event, parsed.data);
    terminal = parsed.event === "done" || parsed.event === "error";
  };
  try {
    signal?.throwIfAborted();
    while (!terminal) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        buffer += decoder.decode();
        emit(buffer);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = splitFrames(buffer);
      buffer = rest;
      for (const frame of frames) emit(frame);
    }
    if (!terminal) throw new Error("The timeline stream ended before completion. Try again.");
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
