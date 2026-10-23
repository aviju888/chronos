/* ─────────────────────────────────────────────────────────
 * TEXT — string helpers ported from aviju888/chronos
 * lib/parsing.ts (normalizeString, areTitlesSimilar,
 * categorizeEvent, safeParseJSON, truncateAtSentence) plus
 * the heuristics the keyless pipeline needs to read
 * Wikipedia: sentence splitting, extract cleanup, and
 * "is this article an event?" checks.
 * ───────────────────────────────────────────────────────── */

import type { Category } from "./types.js";
import { parseTimeExprs, type ParseOpts } from "./time.js";

/** lowercase, strip punctuation, collapse whitespace (original Chronos behaviour) */
export function normalizeString(str: string): string {
  return str
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Battle of Ctesiphon (363)" → "Battle of Ctesiphon" */
export function stripParenthetical(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** normalized key for matching titles: no disambiguation suffix, no leading article */
export function titleKey(title: string): string {
  return normalizeString(stripParenthetical(title)).replace(/^(the|a|an) /, "");
}

// Ordinal qualifiers mark similarly named titles as distinct events
// (the First and Second Battle of Zurich both took place in 1799)
const ORDINAL_QUALIFIERS = new Set([
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
  "9th",
  "10th",
  "ii",
  "iii",
  "iv",
  "vi",
  "vii",
  "viii",
  "ix",
]);

function ordinalSignature(normalizedTitle: string): string {
  return normalizedTitle
    .split(" ")
    .filter((w) => ORDINAL_QUALIFIERS.has(w))
    .sort()
    .join(" ");
}

/** Are two event titles similar enough to be the same event? (ported) */
export function areTitlesSimilar(a: string, b: string): boolean {
  const na = normalizeString(a);
  const nb = normalizeString(b);
  if (na === nb) return true;
  if (ordinalSignature(na) !== ordinalSignature(nb)) return false;
  if (na.includes(nb) || nb.includes(na)) return true;

  const wordsA = na.split(" ").filter((w) => w.length > 2);
  const wordsB = nb.split(" ").filter((w) => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  const overlap = wordsA.filter((w) => wordsB.includes(w)).length;
  return overlap / Math.min(wordsA.length, wordsB.length) >= 0.7;
}

/** Number of words longer than two letters, the unit areTitlesSimilar compares */
export function significantWords(title: string): number {
  return normalizeString(title)
    .split(" ")
    .filter((w) => w.length > 2).length;
}

const CATEGORY_RULES: [Category, RegExp][] = [
  ["Religion", /\b(council of|ecumenical|synod|church|pope|papal|bishop|monaster|religio|christian|christianity|jesus|gospel|crucifixion|apostle|saint|miracle|persecution|schism|heresy|temple of|mosque|buddhis|islam|jewish diaspora|reformation|crusade)/],
  ["War", /\b(battle|siege|war\b|wars\b|warfare|invasion|conquest|campaign|crusade|rebellion|revolt|uprising|mutiny|raid|sack\b|sack of|massacre|military|ambush|insurrection|insurgency|skirmish|blockade|looting|pillage|pogrom|armed conflict|civil war)/],
  ["Disaster", /\b(earthquake|eruption|volcan|fire\b|firestorm|flood|tsunami|famine|plague|pandemic|epidemic|outbreak|drought|hurricane|storm|disaster|collapse|accident|explosion|landslide)/],
  ["Economy", /\b(trade|commerce|economic|financial|market|currency|coin|tax|company|railway|railroad|bank|gold rush|industry|industrial|port\b|harbor|harbour|shipping|silk|price|depression|recession|housing|rent control|zoning)/],
  ["Politics", /\b(treaty|peace|alliance|agreement|accord|coronation|death of|assassination|murder of|reign|emperor|king|queen|act\b|law\b|edict|decree|constitution|revolution|election|independence|government|reform|annexation|incorporat|abdication|deposition|succession|partition|unification|division|protest|movement|riot|state system|tetrarchy|dominate|principate|senate|republic|empire|coup|declaration|charter|court|trial|kidnapping|strike|crisis|fall of|anarchy)/],
  ["Science", /\b(invention|science|scientific|astronomy|mathematic|laboratory|observatory|technology|cyclotron|patent|map\b|world map|expedition|exploration|voyage|discovery of)/],
  ["Culture", /\b(art\b|arts|literature|philosophy|university|college|school|museum|library|games|olympic|festival|architecture|construction|building|theatre|theater|music|exhibition|film|newspaper|stadium|amphitheatre|amphitheater|colosseum|monument|tournament|inaugur|founding|founded|opening|counterculture|poet|book)/],
];

/** Category from the title plus any Wikidata class labels ("battle", "ecumenical council") */
export function categorizeEvent(title: string, types: string[] = [], description = ""): Category {
  const hay = `${types.join(" ")} | ${title} | ${description}`.toLowerCase();
  // class labels are the strongest signal, so test them on their own first
  const typeHay = types.join(" ").toLowerCase();
  if (typeHay) {
    for (const [cat, re] of CATEGORY_RULES) if (re.test(typeHay)) return cat;
  }
  const titleHay = title.toLowerCase();
  for (const [cat, re] of CATEGORY_RULES) if (re.test(titleHay)) return cat;
  for (const [cat, re] of CATEGORY_RULES) if (re.test(hay)) return cat;
  return "Other";
}

/** Wikipedia prose uses em-dashes for asides; the UI copy rules don't, so turn them into commas */
export function tidyProse(text: string): string {
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Capitalize the first letter (Wikidata labels are lowercase: "crucifixion of Jesus") */
export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Safely parse JSON with recovery for common LLM issues (ported):
 * markdown fences, chatter around the JSON, truncated output.
 */
export function safeParseJSON<T>(text: string, fallback: T): { data: T; recovered: boolean } {
  if (!text || typeof text !== "string") return { data: fallback, recovered: true };
  try {
    return { data: JSON.parse(text) as T, recovered: false };
  } catch {
    // continue to recovery
  }
  let cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) cleaned = jsonMatch[1];
  try {
    return { data: JSON.parse(cleaned) as T, recovered: true };
  } catch {
    // continue to bracket repair
  }
  let repaired = cleaned.trim().replace(/,\s*$/, "").replace(/,\s*([}\]])/g, "$1");
  const count = (re: RegExp) => (repaired.match(re) || []).length;
  const openBraces = count(/\{/g);
  const closeBraces = count(/\}/g);
  const openBrackets = count(/\[/g);
  const closeBrackets = count(/\]/g);
  for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += "]";
  for (let i = 0; i < openBraces - closeBraces; i++) repaired += "}";
  try {
    return { data: JSON.parse(repaired) as T, recovered: true };
  } catch {
    return { data: fallback, recovered: true };
  }
}

/** Truncate at the last complete sentence within maxLen (ported) */
export function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastBreak = Math.max(truncated.lastIndexOf(". "), truncated.lastIndexOf("! "), truncated.lastIndexOf("? "));
  if (lastBreak > maxLen * 0.3) return truncated.slice(0, lastBreak + 1);
  if (truncated.endsWith(".")) return truncated;
  const lastPeriod = truncated.lastIndexOf(".");
  if (lastPeriod > maxLen * 0.3) return truncated.slice(0, lastPeriod + 1);
  return `${truncated.trimEnd()}…`;
}

const ABBREVIATIONS = /(?:\b(?:c|ca|St|Mt|Dr|Mr|Mrs|Ms|Jr|Sr|Gen|Col|Lt|Capt|Gov|Rev|Fr|vs|etc|e\.g|i\.e|U\.S|U\.K|No|approx|fl|r|b|d|lit|cf|al)\.|\b[A-Z]\.)$/;

/** Split prose into sentences without breaking on "c. 256", "St. Peter" or "U.S." */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const re = /[.!?]["”’)]?\s+(?=["“(]?[A-Z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].trimEnd().length;
    const candidate = text.slice(start, end);
    if (ABBREVIATIONS.test(candidate.slice(-8).trimEnd())) continue;
    const s = candidate.trim();
    if (s) out.push(s);
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * Clean a Wikipedia extract for display: drop pronunciation and foreign-script
 * parentheticals ("(Latin: Edictum Mediolanense; Greek: …)"), collapse spaces.
 */
export function cleanExtract(text: string): string {
  return text
    .replace(/\s*\((?:[^()]*?(?:Latin|Greek|Chinese|Arabic|pinyin|Persian|Hebrew|Ancient Greek|Old English|French|German|Spanish|Italian|Turkish|Russian|Mongolian|Sanskrit|romanized|listen|pronounced|lit\.|IPA)[^()]*?)\)/g, "")
    .replace(/\s*\([^()]*[Ͱ-ϿЀ-ӿ֐-׿؀-ۿऀ-ॿ぀-ヿ㐀-鿿가-힯][^()]*\)/g, "")
    .replace(/\s*\(\s*\)/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** First n sentences of a cleaned extract */
export function leadSentences(text: string, n: number): string {
  return tidyProse(splitSentences(cleanExtract(text)).slice(0, n).join(" "));
}

/**
 * Best guess at the year an article's subject happened, reading the short
 * description first ("Naval battle … (31 BC)") and then the extract.
 * Ignores lifespans in the opening parenthetical of biographies.
 */
export function extractEventYear(
  description: string | undefined,
  extract: string | undefined,
  opts: ParseOpts = {},
): { year: number; endYear?: number; approx: boolean; from: "description" | "extract" } | null {
  const fromDescription = description ? parseTimeExprs(description, opts) : [];
  const d = fromDescription.find((x) => !x.fuzzy) ?? fromDescription[0];
  if (d) {
    return { year: d.start, endYear: d.end !== d.start ? d.end : undefined, approx: d.fuzzy, from: "description" };
  }
  if (!extract) return null;
  const sentences = splitSentences(cleanExtract(extract)).slice(0, 3);
  for (const sentence of sentences) {
    const exprs = parseTimeExprs(sentence, opts).filter((x) => !x.fuzzy || x.explicitEra);
    const x = exprs[0];
    if (x) return { year: x.start, endYear: x.end !== x.start ? x.end : undefined, approx: x.fuzzy, from: "extract" };
  }
  return null;
}

const EVENT_TITLE = /^(battle|siege|sack|treaty|edict|council|synod|fall|founding|foundation|construction|coronation|assassination|abdication|death|birth|declaration|act|massacre|conquest|invasion|expedition|voyage|discovery|invention|partition|unification|revolt|rebellion|uprising|great fire|fire|siege|capture|destruction|burning|crisis|year of|plague|flight|exodus|crossing|march|occupation|liberation|annexation|division|reunification|establishment|opening|closure|dissolution|signing|election|trial|riots?|strike|eruption|earthquake|incorporation)\b/i;
const EVENT_SUFFIX = /\b(war|wars|revolution|rebellion|revolt|uprising|campaign|crusade|massacre|earthquake|eruption|fire|firestorm|flood|famine|plague|pandemic|epidemic|riots?|protests?|movement|strike|crisis|council|treaty|accords?|agreement|conquest|invasion|expedition|incident|affair|disaster|collapse|reforms?|schism|persecution|exodus|migration|occupation|sack|siege|battle|games|olympics|expo|exposition|fair)(\s*\([^)]*\))?$/i;
const EVENT_WORDS = /\b(battle|siege|war\b|wars\b|treaty|revolt|rebellion|uprising|massacre|earthquake|eruption|fire\b|firestorm|flood|famine|plague|pandemic|epidemic|council|edict|sack|conquest|invasion|campaign|expedition|coronation|assassination|election|protest|movement|riot|strike|disaster|accident|collapse|founding|founded|establishment|opening|construction|discovery|crisis|reform|decree|incident|attack|bombing|explosion|trial|persecution|schism|migration|exodus|declaration|referendum|ceremony|games|summit|conference|occupation|annexation|abolition|dissolution|independence|recession|depression|crash|panic|execution|crucifixion|shutdown|lockdown)\b/i;
const PERSON_WORDS = /\b(emperor|empress|king|queen|politician|diplomat|explorer|envoy|writer|author|poet|philosopher|historian|general|admiral|saint|pope|bishop|merchant|scientist|physicist|chemist|biologist|mathematician|architect|painter|sculptor|composer|musician|singer|actor|actress|activist|lawyer|judge|businessman|businesswoman|entrepreneur|inventor|engineer|monk|priest|missionary|traveller|traveler|navigator|ruler|prince|princess|duke|consul|senator|governor|mayor|president|chancellor|commander|soldier|statesman|leader|founder|journalist|economist|professor|athlete|player|coach)\b/i;
const PLACE_WORDS = /\b(city|town|village|municipality|county|province|region|river|mountain|island|lake|sea|ocean|desert|peninsula|country|state|capital|district|neighborhood|neighbourhood|valley|plateau|basin|bay|site|ruins|archaeological|empire|kingdom|dynasty|caliphate|khanate|khaganate|sultanate|polity|confederation|language|people|ethnic group|tribe|civilization|culture|religion|organization|organisation|company|university|newspaper|journal|book|novel|film|album|song|species|genus|plant|animal|mineral|road|street|bridge|building|church|cathedral|temple|museum|park|station|stadium)\b/i;

const WEAK_EVENT_WORDS = /\b(founded|founding|establishment|established|opening|construction|movement|games|ceremony|summit|conference|independence|dissolution|reign)\b/i;

/** Does a Wikipedia article (title + short description) describe an event rather than a person or place? */
export function isEventLike(title: string, description = ""): boolean {
  const desc = description.toLowerCase();
  const titleIsEvent =
    EVENT_TITLE.test(title) ||
    EVENT_SUFFIX.test(title) ||
    /\b(1\d{3}|20\d{2})\b/.test(title) ||
    /\(\d{1,4}(?:\s*(?:BC|AD|BCE|CE))?\)$/.test(title);
  if (titleIsEvent) return !/\b(film|novel|album|song|book|painting|video game|play|opera|tv series|television|band|newspaper|magazine|ship|aircraft)\b/.test(desc);
  if (!desc) return false;
  const personish = PERSON_WORDS.test(desc) && !/\b(battle|war|revolt|siege|treaty|council|movement|protest|massacre)\b/.test(desc);
  if (personish) return false;
  const strong = EVENT_WORDS.test(desc.replace(new RegExp(WEAK_EVENT_WORDS.source, "gi"), ""));
  if (strong) return true;
  // "founded", "movement"… only count when the subject isn't a place, polity or organization
  return WEAK_EVENT_WORDS.test(desc) && !PLACE_WORDS.test(desc);
}

/** Biography or place descriptions we never want as events */
export function isPersonOrPlace(description = ""): boolean {
  return PERSON_WORDS.test(description) || PLACE_WORDS.test(description);
}
