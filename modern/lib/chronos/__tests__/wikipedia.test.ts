// @vitest-environment node
import { describe, expect, it } from "vitest";
import { historySections, mineHtml, proseClaims, recordFromPage, spreadPick, synthesizeTitle } from "../wikipedia";
import { parseTimeExpr } from "../time";

const HTML = `<div class="mw-parser-output">
<div class="mw-heading mw-heading3"><h3 id="Transition">Transition from Republic to Empire</h3></div>
<style>.x{}</style>
<div role="note" class="hatnote">Further information: <a href="/wiki/Roman_Republic" title="Roman Republic">Roman Republic</a></div>
<p>In 27 BC the <a href="/wiki/Roman_Senate" title="Roman Senate">Senate</a> gave him the title Augustus ("venerated") and made him princeps.<sup class="reference"><a href="#cite_note-1">[1]</a></sup> Octavian defeated Antony at the <a href="/wiki/Battle_of_Actium" title="Battle of Actium">Battle of Actium</a> in 31 BC, ending the civil wars.</p>
<figure><figcaption><a href="/wiki/File:Augustus.jpg" title="File:Augustus.jpg">caption</a></figcaption></figure>
<div class="mw-heading mw-heading3"><h3 id="Fall">Fall in the West</h3></div>
<p>Most chronologies place the end of the Western Roman Empire in 476, when Romulus Augustulus was forced to abdicate to <a href="/wiki/Odoacer" title="Odoacer">Odoacer</a>.</p>
<p>Around 640 structures burned before the wind changed.</p>
<ul><li>Short item</li></ul>
</div>`;

describe("mineHtml", () => {
  const mined = mineHtml(HTML);

  it("keeps prose paragraphs with their section", () => {
    expect(mined.paragraphs).toHaveLength(3);
    expect(mined.paragraphs[0].heading).toBe("Transition from Republic to Empire");
    expect(mined.paragraphs[0].anchor).toBe("Transition");
    expect(mined.paragraphs[1].heading).toBe("Fall in the West");
  });

  it("drops references, hatnotes and file links", () => {
    expect(mined.paragraphs[0].text).not.toContain("[1]");
    expect(mined.links).not.toContain("Roman Republic");
    expect(mined.links.some((l) => l.startsWith("File:"))).toBe(false);
  });

  it("records link positions in the flattened text", () => {
    const p = mined.paragraphs[0];
    const actium = p.links.find((l) => l.title === "Battle of Actium")!;
    expect(p.text.slice(actium.start, actium.end)).toBe("Battle of Actium");
    expect(mined.links).toEqual(["Roman Senate", "Battle of Actium", "Odoacer"]);
  });
});

describe("proseClaims (the scripted model)", () => {
  const { paragraphs } = mineHtml(HTML);
  const claims = proseClaims(paragraphs, { start: -50, end: 500 }, 2026);

  it("ties a dated sentence to the event article it links", () => {
    const actium = claims.find((c) => c.wikipediaTitle === "Battle of Actium");
    expect(actium).toMatchObject({ year: -31, synthTitle: false, title: "Battle of Actium" });
  });

  it("synthesizes a title when no event is linked", () => {
    const augustus = claims.find((c) => c.year === -27);
    expect(augustus?.synthTitle).toBe(true);
    expect(augustus?.title).toBe("The Senate gave him the title Augustus and made him princeps");
  });

  it("ignores counts that look like years", () => {
    expect(claims.some((c) => c.year === 640)).toBe(false);
  });

  it("respects the range", () => {
    expect(proseClaims(paragraphs, { start: 400, end: 500 }, 2026).map((c) => c.year)).toEqual([476]);
  });
});

describe("synthesizeTitle", () => {
  const t = (sentence: string, expr: string) => synthesizeTitle(sentence, parseTimeExpr(expr, { now: 2026 })!);
  it("takes the clause that holds the date", () => {
    expect(
      t("In the view of contemporary Greek historian Cassius Dio, the accession of Commodus in 180 marked the descent from a kingdom of gold to one of iron.", "180"),
    ).toBe("The accession of Commodus marked the descent from a kingdom");
  });
  it("strips full dates", () => {
    expect(t("On March 25, 1853, Alameda County was created from a partition of Contra Costa County, as the town grew.", "1853")).toBe(
      "Alameda County was created from a partition of Contra Costa County",
    );
  });
  it("stops before a trailing when-clause", () => {
    expect(t("Most chronologies place the end of the Western Roman Empire in 476, when Romulus Augustulus abdicated.", "476")).toBe(
      "The end of the Western Roman Empire",
    );
  });
});

describe("historySections", () => {
  const sections = [
    { index: 1, line: "Name", level: 1, anchor: "Name" },
    { index: 2, line: "History", level: 1, anchor: "History" },
    { index: 3, line: "Precursors", level: 2, anchor: "Precursors" },
    { index: 4, line: "Decline (15th century–present)", level: 2, anchor: "Decline" },
    { index: 5, line: "Geography", level: 1, anchor: "Geography" },
  ];
  it("returns History and its subsections", () => {
    expect(historySections(sections).map((s) => s.index)).toEqual([2, 3, 4]);
  });
  it("honours a redirect fragment", () => {
    expect(historySections(sections, "Precursors").map((s) => s.index)).toEqual([3]);
  });
});

describe("spreadPick", () => {
  it("spreads picks over the range", () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => ({ year: 100 + i, weight: 5 })),
      { year: 400, weight: 1 },
      { year: 800, weight: 1 },
    ];
    const picked = spreadPick(items, 4, { start: 100, end: 900 });
    expect(picked.map((p) => p.year)).toContain(400);
    expect(picked.map((p) => p.year)).toContain(800);
  });
});

describe("recordFromPage", () => {
  it("dates an event article from its own text", () => {
    const rec = recordFromPage(
      {
        title: "Battle of Actium",
        qid: "Q160387",
        description: "Naval battle between Octavian and Mark Antony/Cleopatra (31 BC)",
        extract: "The Battle of Actium was a naval battle fought between Octavian's maritime fleet and the combined fleets of Mark Antony and Cleopatra. The battle took place on 2 September 31 BC.",
        coordinates: { lat: 38.9, lng: 20.7 },
      },
      { start: -50, end: 476 },
      2026,
    );
    expect(rec).toMatchObject({ id: "wp:Battle of Actium", source: "wikipedia", year: -31, qid: "Q160387" });
    expect(rec?.summary.startsWith("The Battle of Actium was a naval battle")).toBe(true);
  });
  it("skips people and out-of-range events", () => {
    expect(recordFromPage({ title: "Augustus", description: "Roman emperor from 27 BC to AD 14" }, { start: -50, end: 476 }, 2026)).toBeNull();
    expect(recordFromPage({ title: "Battle of Hastings", description: "1066 battle" }, { start: -50, end: 476 }, 2026)).toBeNull();
  });
});
