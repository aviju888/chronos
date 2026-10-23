/* ─────────────────────────────────────────────────────────
 * CITE — citation markers inside narrative text.
 * Client-safe (no server imports): the UI parses the stream
 * with parseNarrative() as it arrives.
 * ───────────────────────────────────────────────────────── */

/** ids are URI-encoded so a marker never contains spaces and streams as one word */
export const citeMarker = (id: string) => `[[cite:${encodeURIComponent(id)}]]`;

export type NarrativeToken = { kind: "text"; text: string } | { kind: "cite"; id: string };

/** Split narrative text into prose and citation tokens. A half-streamed marker at the end is held back. */
export function parseNarrative(text: string): NarrativeToken[] {
  const tokens: NarrativeToken[] = [];
  const re = /\[\[cite:([^\]\s]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ kind: "text", text: text.slice(last, m.index) });
    let id = m[1];
    try {
      id = decodeURIComponent(m[1]);
    } catch {
      // leave undecodable ids as they are
    }
    tokens.push({ kind: "cite", id });
    last = m.index + m[0].length;
  }
  let tail = text.slice(last);
  const partial = tail.lastIndexOf("[[");
  if (partial >= 0 && !tail.slice(partial).includes("]]")) tail = tail.slice(0, partial);
  if (tail) tokens.push({ kind: "text", text: tail });
  return tokens;
}

/** Plain text without markers (for copying) */
export function narrativePlain(text: string): string {
  return text.replace(/\s*\[\[cite:[^\]]+\]\]/g, "");
}
