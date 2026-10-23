/* ─────────────────────────────────────────────────────────
 * TIME — parse the ways people (and Wikipedia) write dates.
 *
 *   "27 BCE - 476 CE"        → [-27, 476]
 *   "27 BC–AD 14"            → [-27, 14]
 *   "753–509 BC"             → [-753, -509]
 *   "6th–14th centuries"     → [501, 1400]
 *   "mid-15th century"       → [1434, 1466]
 *   "1940s–1960s"            → [1940, 1969]
 *   "15th century–present"   → [1401, now]
 *
 * Convention (same as the original Chronos): there is no year
 * 0, 1 BCE = -1, 44 BCE = -44. Wikidata counts astronomically
 * (0 = 1 BCE), see toWikidataYear / fromWikidataYear.
 * ───────────────────────────────────────────────────────── */

export type TimeExpr = {
  start: number;
  end: number;
  /** char offset of the match in the source text */
  index: number;
  length: number;
  text: string;
  kind: "point" | "range";
  /** an era marker (BC/BCE/AD/CE) was written somewhere in the expression */
  explicitEra: boolean;
  /** the expression names a span (decade, century) rather than a single year */
  fuzzy: boolean;
};

export type ParseOpts = {
  /** Search prompts may end in an unmarked early-year range, e.g. 750–1258. */
  bareRanges?: boolean;
  /** current year, used for "present" and clamping */
  now?: number;
  /** read "1900s" as the century 1900–1999 (how people type it) instead of the decade */
  hundredsAsCentury?: boolean;
};

type EraTag = "bce" | "ce" | null;
type Modifier = "early" | "mid" | "late" | null;

type Atom = {
  index: number;
  length: number;
  era: EraTag;
  kind: "year" | "decade" | "century" | "millennium" | "present";
  fuzzy: boolean;
  /** computes the span once the era is known (an atom may inherit it from its range partner) */
  span: (era: "bce" | "ce") => [number, number];
  /** raw number, used to decide era inheritance ("500–400 BC") */
  n: number;
};

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  "twenty-first": 21,
  "twenty first": 21,
};

const ORD = String.raw`(\d{1,2}(?:st|nd|rd|th)|twenty[- ]first|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)`;
const MOD = String.raw`(?:(early|mid|middle|late)[\s-]+)?`;
const ERA = String.raw`(B\.?\s?C\.?\s?E\.?|B\.?\s?C\.?|A\.?\s?D\.?|C\.?\s?E\.?)(?![A-Za-z])`;
const UNITS = String.raw`(?:%|(?:km|kilomet(?:re|er)s?|mi|miles?|metres?|meters?|m|ft|feet|kg|lb|tons?|tonnes?|people|persons|men|women|soldiers|troops|ships|horses|years?|yrs?|days?|months?|hectares|acres|students|residents|inhabitants|copies|pages|votes|deaths|casualties|killed|dead|cavalry|infantry|warriors|slaves|prisoners|metres|sq)(?![A-Za-z]))`;

function ordinalValue(raw: string): number {
  const word = raw.toLowerCase().replace(/\s+/g, " ");
  if (word in ORDINAL_WORDS) return ORDINAL_WORDS[word];
  if (word.replace(" ", "-") in ORDINAL_WORDS) return ORDINAL_WORDS[word.replace(" ", "-")];
  return parseInt(word, 10);
}

function eraOf(raw: string | undefined): EraTag {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[.\s]/g, "");
  if (s.startsWith("B")) return "bce";
  return "ce";
}

function modOf(raw: string | undefined): Modifier {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s === "early") return "early";
  if (s === "late") return "late";
  return "mid";
}

/** first/middle/last third of a chronological span */
function applyModifier([s, e]: [number, number], mod: Modifier): [number, number] {
  if (!mod) return [s, e];
  const len = e - s + 1;
  const third = Math.floor(len / 3);
  if (mod === "early") return [s, s + third - 1];
  if (mod === "mid") return [s + third, s + 2 * third - 1];
  return [s + 2 * third, e];
}

/** 2nd century CE → [101, 200]; 2nd century BCE → [-200, -101] */
export function centuryRange(n: number, era: "bce" | "ce" = "ce"): [number, number] {
  if (era === "bce") return [-(n * 100), -((n - 1) * 100 + 1)];
  return [(n - 1) * 100 + 1, n * 100];
}

/** 2nd millennium BCE → [-2000, -1001] */
export function millenniumRange(n: number, era: "bce" | "ce" = "ce"): [number, number] {
  if (era === "bce") return [-(n * 1000), -((n - 1) * 1000 + 1)];
  return [(n - 1) * 1000 + 1, n * 1000];
}

/** 1960s → [1960, 1969]; 330s BCE → [-339, -330] */
export function decadeRange(start: number, era: "bce" | "ce" = "ce"): [number, number] {
  if (era === "bce") return [-(start + 9), -Math.max(1, start)];
  return [Math.max(1, start), start + 9];
}

function signed(n: number, era: "bce" | "ce"): number {
  return era === "bce" ? -n : n;
}

function collectAtoms(text: string, opts: ParseOpts): Atom[] {
  const now = opts.now ?? new Date().getFullYear();
  const found: Atom[] = [];
  const push = (m: RegExpExecArray, atom: Omit<Atom, "index" | "length">, offset = 0) =>
    found.push({ ...atom, index: m.index + offset, length: m[0].length - offset });

  const run = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      fn(m);
      if (m[0].length === 0) re.lastIndex++;
    }
  };

  // "6th–14th centuries" / "4th to 8th centuries BCE" (shared suffix)
  run(
    new RegExp(String.raw`\b${MOD}${ORD}\s*(?:–|—|‒|-|to|and|or)\s*${MOD}${ORD}[\s-]+centuries(?:\s*${ERA})?`, "gi"),
    (m) => {
      const a = ordinalValue(m[2]);
      const b = ordinalValue(m[4]);
      const era = eraOf(m[5]);
      const ma = modOf(m[1]);
      const mb = modOf(m[3]);
      push(m, {
        era,
        kind: "century",
        fuzzy: true,
        n: a,
        span: (e) => {
          const ra = applyModifier(centuryRange(a, e), ma);
          const rb = applyModifier(centuryRange(b, e), mb);
          return [Math.min(ra[0], rb[0]), Math.max(ra[1], rb[1])];
        },
      });
    },
  );

  run(new RegExp(String.raw`\b${MOD}${ORD}[\s-]+century(?:\s*${ERA})?`, "gi"), (m) => {
    const n = ordinalValue(m[2]);
    const mod = modOf(m[1]);
    push(m, { era: eraOf(m[3]), kind: "century", fuzzy: true, n, span: (e) => applyModifier(centuryRange(n, e), mod) });
  });

  run(new RegExp(String.raw`\b${MOD}${ORD}[\s-]+millennium(?:\s*${ERA})?`, "gi"), (m) => {
    const n = ordinalValue(m[2]);
    const mod = modOf(m[1]);
    push(m, { era: eraOf(m[3]), kind: "millennium", fuzzy: true, n, span: (e) => applyModifier(millenniumRange(n, e), mod) });
  });

  // decades: 1960s, 880s, 330s BC
  run(new RegExp(String.raw`\b(\d{2,3}0)s\b(?:\s*${ERA})?`, "gi"), (m) => {
    const start = parseInt(m[1], 10);
    const era = eraOf(m[2]);
    const century = opts.hundredsAsCentury && start % 100 === 0 && start >= 1000 && start < 2000;
    push(m, {
      era,
      kind: "decade",
      fuzzy: true,
      n: start,
      span: (e) => (century && e === "ce" ? [start, start + 99] : decadeRange(start, e)),
    });
  });

  // AD 14 / A.D. 476
  run(/\b(A\.?\s?D\.?)\s*(\d{1,4})\b/g, (m) => {
    const n = parseInt(m[2], 10);
    if (n <= 0) return;
    push(m, { era: "ce", kind: "year", fuzzy: false, n, span: () => [n, n] });
  });

  // 31 BC, 476 CE, 476/1453 AD
  run(new RegExp(String.raw`(?<![\d,.])\b(\d{1,5})(?:\s*\/\s*\d{1,5})?\s*${ERA}`, "gi"), (m) => {
    const n = parseInt(m[1], 10);
    if (n <= 0) return;
    push(m, { era: eraOf(m[2]), kind: "year", fuzzy: false, n, span: (e) => [signed(n, e), signed(n, e)] });
  });

  // bare 4-digit years 1000–2099
  if (opts.bareRanges) {
    run(/(?<![\d,.])\b(\d{1,4})(?=\s*(?:–|—|-|to)\s*(?:AD\s*)?\d{1,4}\b)/gi, (m) => {
      const n = Number(m[1]);
      if (n > 0) push(m, { era: null, kind: 'year', fuzzy: false, n, span: (e) => [signed(n, e), signed(n, e)] });
    });
  }
  run(new RegExp(String.raw`(?<![\d,.$£€#])\b(1\d{3}|20\d{2})\b(?![\d,]\d)(?!\s*${UNITS})`, "gi"), (m) => {
    const n = parseInt(m[1], 10);
    push(m, { era: null, kind: "year", fuzzy: false, n, span: (e) => [signed(n, e), signed(n, e)] });
  });

  // bare 1–3 digit years need context: a temporal preposition, the start of the text, or parentheses
  run(
    new RegExp(
      String.raw`(?:\b(?:in|by|from|until|till|since|after|before|during|around|circa|c\.|ca\.|year|between)\s+|^\s*|\()(\d{2,3})\b(?![\d,.]\d)(?!\s*${UNITS})(?!\s+(?!BCE?\b|AD\b|CE\b)[a-z]+s\b)`,
      "gi",
    ),
    (m) => {
      const n = parseInt(m[1], 10);
      if (n <= 0) return;
      push(m, { era: null, kind: "year", fuzzy: false, n, span: (e) => [signed(n, e), signed(n, e)] }, m[0].length - m[1].length);
    },
  );

  run(/\b(present|today|now)\b/gi, (m) => {
    push(m, { era: "ce", kind: "present", fuzzy: false, n: now, span: () => [now, now] });
  });

  // keep the longest match at each position, drop overlaps
  found.sort((a, b) => a.index - b.index || b.length - a.length);
  const atoms: Atom[] = [];
  let cursor = -1;
  for (const atom of found) {
    if (atom.index < cursor) continue;
    atoms.push(atom);
    cursor = atom.index + atom.length;
  }
  return atoms;
}

const CONNECTOR = /^\s*(?:,\s*)?(?:–|—|‒|-|to|until|till|through|and|or)(?:\s+(?:the|about|around|c\.|ca\.))?\s*$/i;
const RANGE_TAIL = new RegExp(
  String.raw`^\s*(?:–|—|‒|-|to|until|till|through)\s*(?:AD\s*)?(\d{1,4})(?![\d,.]\d)(?:\s*${ERA})?(?!\s*${UNITS})`,
  "i",
);

/** All time expressions in reading order. Ranges are joined when two dates sit either side of a connector. */
export function parseTimeExprs(text: string, opts: ParseOpts = {}): TimeExpr[] {
  if (!text) return [];
  const atoms = collectAtoms(text, opts);
  const out: TimeExpr[] = [];

  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const b = atoms[i + 1];
    const between = b ? text.slice(a.index + a.length, b.index) : "";

    if (b && CONNECTOR.test(between) && a.kind !== "present") {
      let eraA: "bce" | "ce";
      let eraB: "bce" | "ce";
      if (a.era && b.era) {
        eraA = a.era;
        eraB = b.era;
      } else if (b.era === "bce") {
        // "753–509 BC": the trailing marker covers both ends
        eraA = "bce";
        eraB = "bce";
      } else if (a.era === "bce" && !b.era) {
        // "509 BC – 27": BCE ranges count down; a larger second number means CE
        eraA = "bce";
        eraB = b.n < a.n ? "bce" : "ce";
      } else {
        eraA = a.era ?? "ce";
        eraB = b.era ?? "ce";
      }
      const [s] = a.span(eraA);
      const [, e] = b.span(eraB);
      if (s <= e) {
        out.push({
          start: s,
          end: e,
          index: a.index,
          length: b.index + b.length - a.index,
          text: text.slice(a.index, b.index + b.length),
          kind: "range",
          explicitEra: Boolean(a.era || b.era) && b.kind !== "present",
          fuzzy: a.fuzzy || b.fuzzy,
        });
        i++;
        continue;
      }
    }

    if (a.kind === "present") continue;

    // a bare number closing the range: "from 284 to 305", "1964–65", "1914–18"
    if (a.kind === "year") {
      const after = text.slice(a.index + a.length);
      const tail = RANGE_TAIL.exec(after);
      const tailEnd = tail ? a.index + a.length + tail[0].length : 0;
      if (tail && !(b && b.index < tailEnd)) {
        const digits = tail[1];
        const tailEra = eraOf(tail[2]);
        let endN = parseInt(digits, 10);
        let eraA: "bce" | "ce" = a.era ?? "ce";
        let eraB: "bce" | "ce" = tailEra ?? "ce";
        if (digits.length === 2 && a.n >= 1000 && !a.era && !tailEra) {
          endN = Math.floor(a.n / 100) * 100 + endN;
        } else if (tailEra === "bce" && !a.era) {
          eraA = "bce";
        } else if (a.era === "bce" && !tailEra) {
          eraB = endN < a.n ? "bce" : "ce";
        }
        const [s] = a.span(eraA);
        const e = signed(endN, eraB);
        if (endN > 0 && s < e) {
          out.push({
            start: s,
            end: e,
            index: a.index,
            length: tailEnd - a.index,
            text: text.slice(a.index, tailEnd),
            kind: "range",
            explicitEra: Boolean(a.era || tailEra),
            fuzzy: false,
          });
          continue;
        }
      }
    }

    const [s, e] = a.span(a.era ?? "ce");
    out.push({
      start: s,
      end: e,
      index: a.index,
      length: a.length,
      text: text.slice(a.index, a.index + a.length),
      kind: s === e ? "point" : "range",
      explicitEra: Boolean(a.era),
      fuzzy: a.fuzzy,
    });
  }
  return out;
}

/** First time expression in the text, or null. */
export function parseTimeExpr(text: string, opts: ParseOpts = {}): TimeExpr | null {
  return parseTimeExprs(text, opts)[0] ?? null;
}

/** Overall span covered by every expression in the text, or null. */
export function spanOf(text: string, opts: ParseOpts = {}): { start: number; end: number } | null {
  const exprs = parseTimeExprs(text, opts);
  if (exprs.length === 0) return null;
  return {
    start: Math.min(...exprs.map((x) => x.start)),
    end: Math.max(...exprs.map((x) => x.end)),
  };
}

/* ── formatting ── */

/** -44 → "44 BCE"; 476 → "476" (or "476 CE" with era: "always") */
export function formatYear(year: number, { era = "auto" }: { era?: "auto" | "always" | "never" } = {}): string {
  if (year < 0) return era === "never" ? String(-year) : `${-year} BCE`;
  return era === "always" ? `${year} CE` : String(year);
}

/** "27 BCE to 476 CE" when the span crosses zero, else "1866 to 2026" */
export function formatRange(start: number, end: number, sep = " to "): string {
  const crosses = start < 0 && end > 0;
  return `${formatYear(start)}${sep}${formatYear(end, { era: crosses ? "always" : "auto" })}`;
}

/** Year arithmetic that skips year 0: addYears(-1, 1) = 1 */
export function addYears(year: number, delta: number): number {
  const astro = year < 0 ? year + 1 : year;
  const next = astro + delta;
  return next <= 0 ? next - 1 : next;
}

/** Signed distance in years, skipping year 0: yearsBetween(-1, 1) = 1 */
export function yearsBetween(a: number, b: number): number {
  const astro = (y: number) => (y < 0 ? y + 1 : y);
  return astro(b) - astro(a);
}

/* ── Wikidata calendar bridge ── */

/** Ours → Wikidata (proleptic Gregorian with year 0): -44 → -43 */
export function toWikidataYear(year: number): number {
  return year < 0 ? year + 1 : year;
}

/** Wikidata → ours: 0 → -1, -43 → -44 */
export function fromWikidataYear(year: number): number {
  return year <= 0 ? year - 1 : year;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "-0043-03-15T00:00:00Z" → { year: -44, exactDate: "March 15, 44 BCE" }.
 * Precision follows Wikidata: 11 day, 10 month, 9 year, 8 decade, 7 century.
 */
export function parseWikidataDate(
  value: string,
  precision = 11,
): { year: number; exactDate?: string; approx: boolean } | null {
  const m = /^(-?\+?\d+)-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const year = fromWikidataYear(parseInt(m[1].replace("+", ""), 10));
  if (year === 0 || !Number.isFinite(year)) return null;
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  let exactDate: string | undefined;
  const label = formatYear(year);
  if (precision >= 11 && month >= 1 && month <= 12 && day >= 1) {
    exactDate = `${MONTHS[month - 1]} ${day}, ${label}`;
  } else if (precision === 10 && month >= 1 && month <= 12) {
    exactDate = `${MONTHS[month - 1]} ${label}`;
  }
  return { year, exactDate, approx: precision < 9 };
}
