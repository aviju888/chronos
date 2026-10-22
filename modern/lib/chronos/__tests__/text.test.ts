// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  areTitlesSimilar,
  categorizeEvent,
  cleanExtract,
  extractEventYear,
  isEventLike,
  normalizeString,
  safeParseJSON,
  splitSentences,
  stripParenthetical,
  titleKey,
  truncateAtSentence,
} from "../text";

describe("safeParseJSON (ported)", () => {
  const fallback = { events: [] };
  it("parses valid JSON directly", () => {
    expect(safeParseJSON('{"name":"test"}', fallback)).toEqual({ data: { name: "test" }, recovered: false });
  });
  it("returns the fallback for empty or non-string input", () => {
    expect(safeParseJSON("", fallback).data).toBe(fallback);
    expect(safeParseJSON(null as unknown as string, fallback).data).toBe(fallback);
    expect(safeParseJSON(123 as unknown as string, fallback).data).toBe(fallback);
  });
  it("strips markdown fences and chatter", () => {
    expect(safeParseJSON('```json\n{"name":"test"}\n```', fallback).data).toEqual({ name: "test" });
    expect(safeParseJSON('Here is the data: {"name":"test"} hope that helps!', fallback).data).toEqual({ name: "test" });
  });
  it("repairs truncated JSON and trailing commas", () => {
    expect(safeParseJSON('{"events":[{"name":"test"}', fallback).data).toEqual({ events: [{ name: "test" }] });
    expect(safeParseJSON('{"events":[1,2,3,]}', fallback).data).toEqual({ events: [1, 2, 3] });
    expect(safeParseJSON('{"a":{"b":[1,2,3', fallback).data).toEqual({ a: { b: [1, 2, 3] } });
  });
  it("gives up gracefully", () => {
    expect(safeParseJSON("not json at all, no braces", fallback).data).toBe(fallback);
  });
});

describe("normalizeString / titleKey (ported)", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeString("HELLO")).toBe("hello");
    expect(normalizeString("Rome's Fall!")).toBe("romes fall");
    expect(normalizeString("  hello   world  ")).toBe("hello world");
    expect(normalizeString("Zürich")).toBe("zurich");
  });
  it("drops disambiguation and leading articles", () => {
    expect(stripParenthetical("Battle of Ctesiphon (363)")).toBe("Battle of Ctesiphon");
    expect(titleKey("The Battle of Hastings")).toBe("battle of hastings");
  });
});

describe("areTitlesSimilar (ported)", () => {
  it("matches normalized, contained and overlapping titles", () => {
    expect(areTitlesSimilar("Battle of Thermopylae", "battle of thermopylae")).toBe(true);
    expect(areTitlesSimilar("Battle of Thermopylae", "Thermopylae")).toBe(true);
    expect(areTitlesSimilar("Fall of the Roman Empire", "The Fall of Roman Empire in Europe")).toBe(true);
  });
  it("rejects different events", () => {
    expect(areTitlesSimilar("Battle of Thermopylae", "Treaty of Paris")).toBe(false);
    expect(areTitlesSimilar("a b c", "x y z")).toBe(false);
  });
  it("treats ordinal qualifiers as distinct events", () => {
    expect(areTitlesSimilar("Battle of Zurich", "Second Battle of Zurich")).toBe(false);
    expect(areTitlesSimilar("First Battle of Panipat", "Second Battle of Panipat")).toBe(false);
    expect(areTitlesSimilar("Council of Nicaea", "Second Council of Nicaea")).toBe(false);
  });
});

describe("categorizeEvent", () => {
  it("keeps the original title rules", () => {
    expect(categorizeEvent("Battle of Hastings")).toBe("War");
    expect(categorizeEvent("The Siege of Vienna")).toBe("War");
    expect(categorizeEvent("Treaty of Versailles")).toBe("Politics");
    expect(categorizeEvent("French Revolution")).toBe("Politics");
    expect(categorizeEvent("Council of Nicaea")).toBe("Religion");
    expect(categorizeEvent("Silk Road Trade Routes")).toBe("Economy");
    expect(categorizeEvent("Invention of the Printing Press")).toBe("Science");
    expect(categorizeEvent("Foundation of the University")).toBe("Culture");
    expect(categorizeEvent("Something Happened")).toBe("Other");
  });
  it("prefers Wikidata class labels", () => {
    expect(categorizeEvent("eruption of Mount Vesuvius in 79", ["Plinian eruption"])).toBe("Disaster");
    expect(categorizeEvent("First Council of Nicaea", ["ecumenical council"])).toBe("Religion");
    expect(categorizeEvent("Inaugural games of the Flavian Amphitheatre", ["tournament"])).toBe("Culture");
    expect(categorizeEvent("Year of the Four Emperors", ["civil war"])).toBe("War");
  });
});

describe("sentences and extracts", () => {
  it("splits sentences without breaking on abbreviations", () => {
    expect(splitSentences("The siege began c. 256. Dura fell. St. Peter was there.")).toEqual([
      "The siege began c. 256.",
      "Dura fell.",
      "St. Peter was there.",
    ]);
    expect(splitSentences("It ended in 31 BC. Octavian won.")).toEqual(["It ended in 31 BC.", "Octavian won."]);
  });
  it("removes foreign-script and pronunciation parentheticals", () => {
    expect(
      cleanExtract("The Edict of Milan (Latin: Edictum Mediolanense; Greek: Διάταγμα τῶν Μεδιολάνων) was the 313 AD agreement."),
    ).toBe("The Edict of Milan was the 313 AD agreement.");
    expect(cleanExtract("The Battle of Talas (Chinese: 怛羅斯戰役; pinyin: Dáluósī Zhànyì) was a battle.")).toBe(
      "The Battle of Talas was a battle.",
    );
  });
  it("truncates at a sentence end (ported)", () => {
    expect(truncateAtSentence("One two. Three four five six.", 12)).toBe("One two.");
    expect(truncateAtSentence("short", 100)).toBe("short");
  });
});

describe("extractEventYear", () => {
  it("prefers the short description", () => {
    expect(extractEventYear("Naval battle between Octavian and Mark Antony/Cleopatra (31 BC)", "")).toMatchObject({ year: -31, from: "description" });
    expect(extractEventYear("Student protest in California, 1964–1965", "")).toMatchObject({ year: 1964, endYear: 1965 });
    expect(extractEventYear("751 battle between the Abbasid Caliphate and the Tang dynasty", "")).toMatchObject({ year: 751 });
  });
  it("falls back to the extract", () => {
    expect(
      extractEventYear("Siege and sack of Rome by the Visigoths", "The sack of Rome on 24 August 410 AD was undertaken by the Visigoths led by their king, Alaric."),
    ).toMatchObject({ year: 410, from: "extract" });
    expect(extractEventYear(undefined, "No date in this text at all.")).toBeNull();
  });
});

describe("isEventLike", () => {
  it("accepts event articles", () => {
    expect(isEventLike("Battle of Actium", "Naval battle between Octavian and Mark Antony/Cleopatra (31 BC)")).toBe(true);
    expect(isEventLike("Free Speech Movement", "Student protest in California, 1964–1965")).toBe(true);
    expect(isEventLike("1923 Berkeley fire", "")).toBe(true);
    expect(isEventLike("Sack of Rome (410)", "Siege and sack of Rome by the Visigoths")).toBe(true);
    expect(isEventLike("Edict of Milan", "Legalization of Christianity in the Roman Empire (313)")).toBe(true);
  });
  it("rejects people, places and works", () => {
    expect(isEventLike("Augustus", "Roman emperor from 27 BC to AD 14")).toBe(false);
    expect(isEventLike("Zhang Qian", "Imperial envoy to the world outside of China in the 2nd century BC")).toBe(false);
    expect(isEventLike("Ctesiphon", "Ancient city in Iraq")).toBe(false);
    expect(isEventLike("Gladiator (2000 film)", "2000 film by Ridley Scott")).toBe(false);
  });
});
