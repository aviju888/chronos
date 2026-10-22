// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addYears,
  centuryRange,
  formatRange,
  formatYear,
  fromWikidataYear,
  millenniumRange,
  parseTimeExpr,
  parseTimeExprs,
  parseWikidataDate,
  spanOf,
  toWikidataYear,
  yearsBetween,
} from "../time";

const range = (text: string, opts = {}) => {
  const x = parseTimeExpr(text, { now: 2026, ...opts });
  return x ? [x.start, x.end] : null;
};

describe("parseTimeExpr: single years", () => {
  it("reads BC/BCE/AD/CE in either position", () => {
    expect(range("31 BC")).toEqual([-31, -31]);
    expect(range("around 753 BCE")).toEqual([-753, -753]);
    expect(range("476 CE")).toEqual([476, 476]);
    expect(range("AD 14")).toEqual([14, 14]);
    expect(range("in 9 AD the legions fell")).toEqual([9, 9]);
    expect(range("44 B.C.")).toEqual([-44, -44]);
  });

  it("takes the first alternative in 476/1453 AD", () => {
    expect(range("476/1453 AD")).toEqual([476, 476]);
  });

  it("reads bare years only where they look like years", () => {
    expect(range("The year was 1776.")).toEqual([1776, 1776]);
    expect(range("Founded in 476 by")).toEqual([476, 476]);
    expect(range("751 battle between the Abbasid Caliphate and the Tang dynasty")).toEqual([751, 751]);
    expect(range("Legalization of Christianity in the Roman Empire (313)")).toEqual([313, 313]);
    expect(range("an army of 300 soldiers")).toBeNull();
    expect(range("1500 soldiers marched")).toBeNull();
    expect(range("Spanning over 6,400 km (4,000 mi)")).toBeNull();
    expect(range("a population of 124,321")).toBeNull();
    expect(range("no dates here")).toBeNull();
  });

  it("reads full dates", () => {
    expect(range("The battle took place on 2 September 31 BC in the Ionian Sea")).toEqual([-31, -31]);
    expect(range("on July 4, 1776 the declaration")).toEqual([1776, 1776]);
    expect(range("The sack of Rome on 24 August 410 AD was undertaken by the Visigoths")).toEqual([410, 410]);
  });
});

describe("parseTimeExpr: ranges", () => {
  it("joins two dated ends", () => {
    expect(range("Roman Empire 27 BCE - 476 CE")).toEqual([-27, 476]);
    expect(range("27 BC–AD 14")).toEqual([-27, 14]);
    expect(range("from 27 BC to AD 14")).toEqual([-27, 14]);
    expect(range("27 BC–476/1453 AD state and civilization")).toEqual([-27, 476]);
    expect(range("1789-1799")).toEqual([1789, 1799]);
  });

  it("lets a trailing BC cover both ends", () => {
    expect(range("753–509 BC")).toEqual([-753, -509]);
    expect(range("500–400 BC")).toEqual([-500, -400]);
  });

  it("closes a range with a bare number", () => {
    expect(range("from 284 to 305")).toEqual([284, 305]);
    expect(range("1964–65 academic year")).toEqual([1964, 1965]);
    expect(range("1914–18")).toEqual([1914, 1918]);
    expect(range("Flavian dynasty (69–96)")).toEqual([69, 96]);
    expect(range("Julio-Claudian Dynasty (14–68)")).toEqual([14, 68]);
  });

  it("handles BCE start with an unmarked end", () => {
    expect(range("509 BC – 27")).toEqual([-509, -27]);
  });
});

describe("parseTimeExpr: decades, centuries, millennia", () => {
  it("reads decades", () => {
    expect(range("the 1960s")).toEqual([1960, 1969]);
    expect(range("1940s–1960s")).toEqual([1940, 1969]);
    expect(range("1970s and 1980s")).toEqual([1970, 1989]);
    expect(range("the 330s BC")).toEqual([-339, -330]);
  });

  it("reads 1900s as a century only when asked", () => {
    expect(range("1900s")).toEqual([1900, 1909]);
    expect(range("1900s", { hundredsAsCentury: true })).toEqual([1900, 1999]);
    expect(range("2000s", { hundredsAsCentury: true })).toEqual([2000, 2009]);
  });

  it("reads centuries with modifiers", () => {
    expect(range("7th century")).toEqual([601, 700]);
    expect(range("second century BCE")).toEqual([-200, -101]);
    expect(range("Late 19th century")).toEqual([1867, 1900]);
    expect(range("Early 20th century")).toEqual([1901, 1933]);
    expect(range("mid-15th century")).toEqual([1434, 1466]);
    expect(range("the twenty-first century")).toEqual([2001, 2100]);
  });

  it("reads century spans", () => {
    expect(range("Byzantine Empire (6th–14th centuries)")).toEqual([501, 1400]);
    expect(range("Sogdian–Türkic tribes (4th–8th centuries)")).toEqual([301, 800]);
    expect(range("Roman Empire (30 BCE – 3rd century CE)")).toEqual([-30, 300]);
    expect(range("active from the second century BCE until the mid-15th century")).toEqual([-200, 1466]);
    expect(range("Decline (15th century–present)")).toEqual([1401, 2026]);
  });

  it("reads millennia", () => {
    expect(range("2nd millennium BCE")).toEqual([-2000, -1001]);
    expect(range("first millennium")).toEqual([1, 1000]);
  });
});

describe("parseTimeExprs / spanOf", () => {
  it("returns every expression in order", () => {
    const xs = parseTimeExprs("In 64 a fire burned Rome; in 70 the temple fell.", { now: 2026 });
    expect(xs.map((x) => x.start)).toEqual([64, 70]);
  });

  it("spans everything mentioned", () => {
    expect(spanOf("between 284 and 305, and again in 312", { now: 2026 })).toEqual({ start: 284, end: 312 });
    expect(spanOf("nothing here")).toBeNull();
  });
});

describe("century and millennium helpers", () => {
  it("have no year zero", () => {
    expect(centuryRange(1, "bce")).toEqual([-100, -1]);
    expect(centuryRange(1, "ce")).toEqual([1, 100]);
    expect(millenniumRange(1, "bce")).toEqual([-1000, -1]);
  });
});

describe("formatting", () => {
  it("formats BCE years", () => {
    expect(formatYear(-44)).toBe("44 BCE");
    expect(formatYear(476)).toBe("476");
    expect(formatYear(476, { era: "always" })).toBe("476 CE");
    expect(formatRange(-27, 476)).toBe("27 BCE to 476 CE");
    expect(formatRange(1866, 2026)).toBe("1866 to 2026");
  });

  it("does year math across zero", () => {
    expect(addYears(-1, 1)).toBe(1);
    expect(addYears(1, -1)).toBe(-1);
    expect(addYears(-44, 10)).toBe(-34);
    expect(yearsBetween(-1, 1)).toBe(1);
    expect(yearsBetween(-27, 476)).toBe(502);
  });
});

describe("Wikidata calendar", () => {
  it("round-trips years", () => {
    expect(toWikidataYear(-44)).toBe(-43);
    expect(fromWikidataYear(-43)).toBe(-44);
    expect(fromWikidataYear(0)).toBe(-1);
    for (const y of [1776, 1, -1, -44, -753, -3000]) expect(fromWikidataYear(toWikidataYear(y))).toBe(y);
  });

  it("parses date literals with precision", () => {
    expect(parseWikidataDate("-0043-03-15T00:00:00Z")).toEqual({ year: -44, exactDate: "March 15, 44 BCE", approx: false });
    expect(parseWikidataDate("1066-10-14T00:00:00Z")).toEqual({ year: 1066, exactDate: "October 14, 1066", approx: false });
    expect(parseWikidataDate("1776-01-01T00:00:00Z", 9)).toEqual({ year: 1776, exactDate: undefined, approx: false });
    expect(parseWikidataDate("0068-06-01T00:00:00Z", 10)).toEqual({ year: 68, exactDate: "June 68", approx: false });
    expect(parseWikidataDate("0100-01-01T00:00:00Z", 7)?.approx).toBe(true);
    expect(parseWikidataDate("garbage")).toBeNull();
  });
});
