// @vitest-environment node
import { describe, expect, it } from "vitest";
import { labelForSpan, parseQuery, quickDetectQueryType, sanitizeString, typeFromDescription } from "../query";

describe("parseQuery", () => {
  it.each([
    ['The Islamic Golden Age 750 - 1258', 'Islamic Golden Age', 750, 1258],
    ['Tang dynasty 618–907', 'Tang dynasty', 618, 907],
    ['Han dynasty 202 BCE - 220 CE', 'Han dynasty', -202, 220],
  ])('reads the complete explicit range in %s', (query, topic, start, end) => {
    expect(parseQuery(query, 2026)).toMatchObject({topic, range: {start, end}});
  });
  it("splits topic and explicit range", () => {
    expect(parseQuery("Roman Empire 27 BCE - 476 CE", 2026)).toMatchObject({
      topic: "Roman Empire",
      range: { start: -27, end: 476 },
      historyOf: false,
      pureTime: false,
    });
    expect(parseQuery("Roman Empire from 27 BC to AD 476", 2026)).toMatchObject({ topic: "Roman Empire", range: { start: -27, end: 476 } });
    expect(parseQuery("Ancient Egypt (3100 BC – 30 BC)", 2026)).toMatchObject({ topic: "Ancient Egypt", range: { start: -3100, end: -30 } });
    expect(parseQuery("Japan 1600-1868", 2026)).toMatchObject({ topic: "Japan", range: { start: 1600, end: 1868 } });
    expect(parseQuery("Berkeley in the 1960s", 2026)).toMatchObject({ topic: "Berkeley", range: { start: 1960, end: 1969 } });
  });

  it("leaves topics without dates alone", () => {
    expect(parseQuery("Silk Road", 2026)).toMatchObject({ topic: "Silk Road", range: undefined });
    expect(parseQuery("Fall of Rome", 2026)).toMatchObject({ topic: "Fall of Rome", range: undefined, hint: "topic" });
    expect(parseQuery("World War II", 2026)).toMatchObject({ topic: "World War II", range: undefined });
    expect(parseQuery("1923 Berkeley fire", 2026)).toMatchObject({ topic: "1923 Berkeley fire", range: undefined });
  });

  it("unwraps History of X", () => {
    expect(parseQuery("History of Berkeley, California", 2026)).toMatchObject({
      topic: "Berkeley, California",
      historyOf: true,
      hint: "city",
    });
    expect(parseQuery("a brief history of the Silk Road", 2026)).toMatchObject({ topic: "Silk Road", historyOf: true });
  });

  it("turns a bare period into a topic", () => {
    expect(parseQuery("1900s", 2026)).toMatchObject({ topic: "20th century", range: { start: 1900, end: 1999 }, pureTime: true, hint: "era" });
    expect(parseQuery("the 1960s", 2026)).toMatchObject({ topic: "1960s", range: { start: 1960, end: 1969 }, pureTime: true });
    expect(parseQuery("1900s America", 2026)).toMatchObject({ topic: "America", range: { start: 1900, end: 1999 } });
  });

  it("caps future ends at the current year", () => {
    expect(parseQuery("Berkeley 2010s and 2020s", 2026).range).toEqual({ start: 2010, end: 2026 });
  });
});

describe("labelForSpan", () => {
  it("names common spans", () => {
    expect(labelForSpan({ start: 1960, end: 1969 })).toBe("1960s");
    expect(labelForSpan({ start: 1901, end: 2000 })).toBe("20th century");
    expect(labelForSpan({ start: 1900, end: 1999 })).toBe("20th century");
    expect(labelForSpan({ start: -200, end: -101 })).toBe("2nd century BC");
    expect(labelForSpan({ start: 1969, end: 1969 })).toBe("1969");
  });
});

describe("quickDetectQueryType (ported)", () => {
  it("detects the original cases", () => {
    expect(quickDetectQueryType("")).toBeNull();
    expect(quickDetectQueryType("San Francisco, California")).toBe("city");
    expect(quickDetectQueryType("Portland, OR")).toBe("city");
    expect(quickDetectQueryType("France")).toBe("country");
    expect(quickDetectQueryType("FRANCE")).toBe("country");
    expect(quickDetectQueryType("Medieval period")).toBe("era");
    expect(quickDetectQueryType("Silk Road trade")).toBe("topic");
    expect(quickDetectQueryType("interesting things")).toBeNull();
  });
  it("reads Wikipedia descriptions", () => {
    expect(typeFromDescription("City in Alameda County, California, United States")).toBe("city");
    expect(typeFromDescription("Decade of the Gregorian calendar (1900–1909)")).toBe("era");
  });
});

describe("sanitizeString (ported)", () => {
  it("cleans input", () => {
    expect(sanitizeString(null)).toBeNull();
    expect(sanitizeString("   ")).toBeNull();
    expect(sanitizeString("!@#$%^&*")).toBeNull();
    expect(sanitizeString("<b>bold</b>")).toBe("bold");
    expect(sanitizeString("São Paulo")).toBe("São Paulo");
    expect(sanitizeString("27 BCE – 476 CE")).toBe("27 BCE – 476 CE");
    expect(sanitizeString("a".repeat(300), 200)!.length).toBe(200);
  });
});
