# Chronos Launch Action Items

## Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 🔴 Critical | OG Image | 30 min | High |
| 🔴 Critical | Input Validation | 2-3 hrs | High |
| 🟠 High | Chat Loading State | 30 min | Medium |
| 🟠 High | Narrative Length | 1 hr | Medium |
| 🟡 Medium | Mobile Header | 1 hr | Low |
| 🟢 Low | LinkedIn Post + Recording | 1 hr | High |

---

## Phase 1: Pre-Launch Critical (Do First)

### 1. Create OG Image
**Time: 30 minutes**

- [ ] Create 1200x630 image for social sharing
- [ ] Include: Chronos logo, sample map/timeline visual, tagline
- [ ] Save as `/public/og-image.png`
- [ ] Test with [opengraph.xyz](https://opengraph.xyz) or Twitter Card Validator

**Quick option**: Screenshot of the Timeline view with "Chronos" overlay

---

### 2. Add Input Validation for Regions
**Time: 2-3 hours**

**Approach**: Validate input against Wikidata before generation

```typescript
// In api/generate.ts or new validation endpoint

async function validateRegion(query: string): Promise<{
  isValid: boolean;
  suggestion?: string;
  wikidataId?: string;
}> {
  // Query Wikidata for the region
  const sparqlQuery = `
    SELECT ?item ?itemLabel WHERE {
      ?item rdfs:label "${query}"@en.
      ?item wdt:P31/wdt:P279* wd:Q82794. # Instance of geographic region
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 1
  `;

  // If no results, return invalid with suggestions
  // If results, return valid with Wikidata ID for enrichment
}
```

**Tasks:**
- [ ] Create `validateRegion()` function using Wikidata SPARQL
- [ ] Call validation before generation starts
- [ ] If invalid: Show friendly error "We couldn't find historical records for [X]. Try one of these instead: [suggestions]"
- [ ] If valid: Proceed with generation, pass Wikidata ID for better enrichment

**Fallback option** (simpler, less robust):
- [ ] Create allowlist of ~500 known regions/civilizations/eras
- [ ] Fuzzy match against list before generation
- [ ] Show warning for unrecognized input

---

## Phase 2: High Priority Polish

### 3. Add Chat Loading State
**Time: 30 minutes**

- [ ] In chat panel, show typing indicator while waiting for response
- [ ] Simple CSS animation with 3 dots or "Historian is thinking..."
- [ ] Clear indicator when response arrives

---

### 4. Improve Narrative Length
**Time: 1 hour**

- [ ] In Quick mode prompt, request minimum 3 paragraphs
- [ ] Or: Change heading from "Historical Narrative" to "Summary" for Quick mode
- [ ] Consider: Add "Generate deeper narrative" button

---

## Phase 3: Nice-to-Have

### 5. Mobile Header Improvement
**Time: 1 hour**

- [ ] On screens < 480px, collapse view tabs into dropdown
- [ ] Or: Use icons-only for navigation on small screens

---

### 6. Minor Fixes
- [ ] Fix search suggestion categorization (nonsense → "Search for...")
- [ ] Add copy feedback on Share modal ("Copied!" tooltip)
- [ ] Consider adding focus-visible states for accessibility

---

## Phase 4: Launch Prep

### 7. Create LinkedIn Content
**Time: 1 hour**

- [ ] Record 30-60 second screen capture showing:
  - Type "Ancient Rome"
  - Watch loading animation
  - Explore map view with timeline playback
  - Click event to show detail modal
- [ ] Write post (see draft below)
- [ ] Schedule for optimal time (Tuesday-Thursday, 9-11am)

**Draft Post:**
```
Built something for fellow history nerds.

Chronos lets you explore any region + time period with AI-generated timelines, interactive maps, and Wikipedia citations.

Type "Feudal Japan" → get 25 events from 1185 to 1603, mapped geographically, with sources you can verify.

What makes it different:
• Cross-references Wikidata + Wikipedia (not just LLM vibes)
• Flags historically disputed events
• "Ask a Historian" chat for deeper questions

Side project energy - feedback welcome.

[link]
```

---

## Pre-Launch Checklist

### Technical
- [ ] OG image created and tested
- [ ] Input validation implemented
- [ ] Test with 5 different regions (Rome, Japan, Egypt, Victorian England, Silk Road)
- [ ] Test invalid input shows helpful error
- [ ] Verify no API keys in client bundle
- [ ] Check rate limiting works

### Content
- [ ] Screen recording created
- [ ] LinkedIn post drafted and reviewed
- [ ] Link works and loads fast

### Final Smoke Test
- [ ] Full flow on desktop Chrome
- [ ] Full flow on mobile Safari
- [ ] Share link opens correctly
- [ ] Events view filtering works
- [ ] Chat responds appropriately

---

## Effort Estimate

| Phase | Time |
|-------|------|
| Phase 1 (Critical) | 3-4 hours |
| Phase 2 (Polish) | 1.5 hours |
| Phase 3 (Nice-to-have) | 1-2 hours |
| Phase 4 (Launch) | 1 hour |
| **Total** | **6-8 hours** |

---

## Recommended Order

1. ⏱️ **Morning**: OG image + input validation (the two critical blockers)
2. ⏱️ **Afternoon**: Chat loading + narrative fix (quick polish wins)
3. ⏱️ **Evening**: Screen recording + LinkedIn draft
4. 🚀 **Next day**: Final smoke test → Launch

Good luck! 🏛️
