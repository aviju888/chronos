/* ─────────────────────────────────────────────────────────
 * SCRIPTED — demo-mode stand-ins for model output.
 * Streams pre-written text with human-feeling jitter so the
 * UI exercises the exact same states as a live model.
 * ───────────────────────────────────────────────────────── */

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** Splits text into word-sized chunks, keeping whitespace attached. */
export function chunkWords(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/**
 * Yields `text` a word at a time at roughly `wordsPerSecond`,
 * with ±40% jitter and a short pause after sentence ends.
 */
export async function* scriptedStream(
  text: string,
  { wordsPerSecond = 32, signal }: { wordsPerSecond?: number; signal?: AbortSignal } = {},
): AsyncGenerator<string> {
  const base = 1000 / wordsPerSecond;
  for (const word of chunkWords(text)) {
    const jitter = base * (0.6 + Math.random() * 0.8);
    const pause = /[.!?]\s*$/.test(word) ? base * 3 : 0;
    await sleep(jitter + pause, signal);
    yield word;
  }
}
