// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eraMessages, narrativeMessages, normalizeEras, normalizeRange, normalizeSeedEvents, seedMessages } from "../llm";
import { coerceYear, validateCoordinates, validateEvent, validateTimeRange, validateYear } from "../validation";
import type { ChronosEvent } from "../types";

const range = { start: -27, end: 476 };

describe("normalizeSeedEvents (live model output → records)", () => {
  it("coerces string years, validates and clips to the range", () => {
    const records = normalizeSeedEvents(
      {
        events: [
          { title: "Battle of the Teutoburg Forest", wikipediaTitle: "Battle of the Teutoburg Forest", year: "9", category: "War", summary: "three legions destroyed", location: { lat: 52.4, lng: 8.1, name: "Kalkriese" } },
          { title: "Battle of Actium", year: -31, category: "War", summary: "before the range" },
          { title: "Year zero", year: 0, summary: "invalid" },
          { title: "", year: 100, summary: "no title" },
          { title: "Odd category", year: 200, category: "Gossip", summary: "bad category is rejected" },
          { title: "Bad place", year: 300, summary: "coords out of bounds", location: { lat: 500, lng: 8 } },
        ],
      },
      range,
      "Llama 3.3 70B",
    );
    expect(records.map((r) => r.title)).toEqual(["Battle of the Teutoburg Forest", "Bad place"]);
    expect(records[0]).toMatchObject({ id: "llm:0", source: "llm", year: 9, category: "War", summary: "Three legions destroyed", wikipediaTitle: "Battle of the Teutoburg Forest" });
    expect(records[0].location).toEqual({ lat: 52.4, lng: 8.1, name: "Kalkriese" });
    expect(records[0].citation.label).toBe("Model: Llama 3.3 70B");
    expect(records[1].location).toBeUndefined();
  });

  it("tolerates junk", () => {
    expect(normalizeSeedEvents(null, range, "m")).toEqual([]);
    expect(normalizeSeedEvents({ events: "nope" }, range, "m")).toEqual([]);
  });
});

describe("normalizeEras", () => {
  it("keeps valid eras and fixes AD sign errors like the original", () => {
    const eras = normalizeEras(
      {
        eras: [
          { title: "Principate", startYear: -27, endYear: 284 },
          { title: "Dominate", startYear: "284", endYear: "476" },
          { title: "Backwards", startYear: 300, endYear: 200 },
        ],
      },
      range,
    );
    expect(eras.map((e) => [e.title, e.start, e.end])).toEqual([
      ["Principate", -27, 284],
      ["Dominate", 284, 476],
    ]);
    const flipped = normalizeEras({ eras: [{ title: "Victorian era", startYear: -1837, endYear: 1901 }] }, { start: 1800, end: 1950 });
    expect(flipped[0]).toMatchObject({ start: 1837, end: 1901 });
  });
});

describe("normalizeRange", () => {
  it("accepts numbers or numeric strings in order", () => {
    expect(normalizeRange({ start: -753, end: "476" })).toEqual({ start: -753, end: 476 });
    expect(normalizeRange({ start: 500, end: 100 })).toBeNull();
    expect(normalizeRange({})).toBeNull();
  });
});

describe("prompts", () => {
  it("name the topic, the range and the citation format", () => {
    expect(seedMessages("Roman Empire", range, "topic", "deep")[1].content).toContain("Generate 15 events for \"Roman Empire\"");
    expect(seedMessages("Roman Empire", range, "topic", "quick")[1].content).toContain("27 BC to 476 AD");
    expect(eraMessages("Roman Empire", range)[1].content).toContain("4-8 standard historical eras");
    const ev = { id: "x", title: "Great Fire of Rome", year: 64 } as ChronosEvent;
    expect(narrativeMessages("Roman Empire", range, [ev])[1].content).toContain("[1] Great Fire of Rome (64 AD)");
  });
});

describe("validation (ported cases)", () => {
  it("validates coordinates", () => {
    expect(validateCoordinates(41.9028, 12.4964)).toEqual({ lat: 41.9028, lng: 12.4964 });
    expect(validateCoordinates("41", "12")).toBeNull();
    expect(validateCoordinates(91, 0)).toBeNull();
    expect(validateCoordinates(Number.NaN, 0)).toBeNull();
  });
  it("validates years and ranges", () => {
    expect(validateYear(-44)).toBe(-44);
    expect(validateYear(0)).toBeNull();
    expect(validateYear(1.5)).toBeNull();
    expect(validateYear(2500)).toBeNull();
    expect(validateTimeRange(-27, 476)).toEqual({ start: -27, end: 476 });
    expect(validateTimeRange(476, -27)).toBeNull();
    expect(validateTimeRange(-6000, 1)).toBeNull();
    expect(coerceYear("1776")).toBe(1776);
    expect(coerceYear("abc")).toBeNull();
  });
  it("validates events", () => {
    expect(validateEvent({ title: "A", year: 10, summary: "s" })).toEqual({ valid: true, errors: [] });
    expect(validateEvent({ title: "A", year: 0, summary: "s" }).errors).toContain("Year 0 does not exist");
    expect(validateEvent({ title: "A", year: 10, summary: "s", category: "Gossip" }).valid).toBe(false);
    expect(validateEvent(null)).toEqual({ valid: false, errors: ["Event is not an object"] });
  });
});
