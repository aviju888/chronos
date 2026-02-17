/**
 * Wikidata SPARQL integration for enriching timelines with structured historical data.
 * Free, unlimited API with precise dates, coordinates, and cross-references.
 */

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

export interface WikidataEvent {
  title: string;
  description: string;
  year: number;
  exactDate?: string;
  coordinates?: { lat: number; lng: number };
  wikidataId: string;
  wikipediaTitle?: string;
}

/**
 * Search for a Wikidata entity by name.
 * Returns the Q-ID and label of the best match.
 */
export async function findWikidataEntity(
  query: string
): Promise<{ id: string; label: string; description: string } | null> {
  try {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      search: query,
      language: 'en',
      type: 'item',
      limit: '5',
      format: 'json',
      origin: '*',
    });

    const response = await fetch(`${WIKIDATA_API}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.search || data.search.length === 0) return null;

    return {
      id: data.search[0].id,
      label: data.search[0].label,
      description: data.search[0].description || '',
    };
  } catch (error) {
    console.error('Wikidata entity search error:', error);
    return null;
  }
}

/**
 * Validate that a string is a valid Wikidata Q-ID (e.g., "Q42").
 */
export function isValidQId(id: string): boolean {
  return /^Q\d+$/.test(id);
}

/**
 * Convert our year convention to Wikidata/proleptic Gregorian.
 * Our convention: no year 0, -1 = 1 BC, -44 = 44 BC
 * Wikidata: has year 0, 0 = 1 BC, -43 = 44 BC
 */
export function toWikidataYear(year: number): number {
  return year < 0 ? year + 1 : year;
}

/**
 * Convert Wikidata/proleptic Gregorian year to our convention.
 * Wikidata: 0 = 1 BC → our -1, Wikidata: -43 = 44 BC → our -44
 */
export function fromWikidataYear(year: number): number {
  return year <= 0 ? year - 1 : year;
}

/**
 * Parse SPARQL JSON results into WikidataEvent objects.
 */
export function parseWikidataResults(data: any): WikidataEvent[] {
  const events: WikidataEvent[] = [];
  const seen = new Set<string>();

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  for (const binding of data?.results?.bindings || []) {
    const wikidataId = binding.event?.value?.split('/').pop() || '';
    if (!wikidataId || seen.has(wikidataId)) continue;
    seen.add(wikidataId);

    const title = binding.eventLabel?.value;
    if (!title || title === wikidataId) continue; // Skip if no label (just Q-ID)

    const dateStr = binding.date?.value;
    if (!dateStr) continue;

    // Parse date: "1776-07-04T00:00:00Z" or "-0043-03-15T00:00:00Z"
    const dateMatch = dateStr.match(/^(-?\d+)-(\d{2})-(\d{2})/);
    if (!dateMatch) continue;

    const wikidataYear = parseInt(dateMatch[1], 10);
    const year = fromWikidataYear(wikidataYear);
    if (year === 0) continue; // Safety check

    // Parse coordinates from WKT point literal
    let coordinates: { lat: number; lng: number } | undefined;
    if (binding.coord?.value) {
      const coordMatch = binding.coord.value.match(
        /Point\(([-\d.]+)\s+([-\d.]+)\)/
      );
      if (coordMatch) {
        const lng = parseFloat(coordMatch[1]);
        const lat = parseFloat(coordMatch[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          coordinates = { lat, lng };
        }
      }
    }

    // Format exact date (skip Jan 1 which often means "year only" in Wikidata)
    const month = parseInt(dateMatch[2], 10);
    const day = parseInt(dateMatch[3], 10);
    let exactDate: string | undefined;
    if (month > 0 && month <= 12 && day > 0 && day <= 31 && !(month === 1 && day === 1)) {
      const yearDisplay = year < 0 ? `${Math.abs(year)} BC` : `${year}`;
      exactDate = `${months[month - 1]} ${day}, ${yearDisplay}`;
    }

    events.push({
      title,
      description: binding.eventDescription?.value || '',
      year,
      exactDate,
      coordinates,
      wikidataId,
      wikipediaTitle: binding.wpTitle?.value,
    });
  }

  return events;
}

/**
 * Query Wikidata SPARQL for historical events associated with a location entity.
 * Uses specific event types for performance (avoids transitive closure).
 */
export async function queryWikidataEvents(
  entityId: string,
  startYear: number,
  endYear: number,
  limit: number = 40
): Promise<WikidataEvent[]> {
  if (!isValidQId(entityId)) {
    console.warn(`Invalid Wikidata entity ID: ${entityId}`);
    return [];
  }

  const sparqlStart = toWikidataYear(startYear);
  const sparqlEnd = toWikidataYear(endYear);

  // Use VALUES with common event types for performance (no transitive closure)
  const query = `
SELECT DISTINCT ?event ?eventLabel ?eventDescription ?date ?coord ?wpTitle WHERE {
  # Associated with the queried location
  {
    ?event wdt:P276 wd:${entityId} .
  } UNION {
    ?event wdt:P17 wd:${entityId} .
  } UNION {
    ?event wdt:P131 wd:${entityId} .
  } UNION {
    ?event wdt:P361 wd:${entityId} .
  }

  # Must be a known event type (explicit list for query performance)
  VALUES ?type {
    wd:Q1190554  # occurrence
    wd:Q1656682  # event
    wd:Q178561   # battle
    wd:Q198      # war
    wd:Q131569   # treaty
    wd:Q350604   # armed conflict
    wd:Q124757   # massacre
    wd:Q188055   # siege
    wd:Q7278     # political revolution
    wd:Q3839081  # natural disaster
    wd:Q8016240  # human migration
    wd:Q44512    # epidemic
    wd:Q7944     # earthquake
    wd:Q209715   # coronation
    wd:Q51645    # ecumenical council
    wd:Q168247   # famine
    wd:Q168983   # conflagration
    wd:Q40231    # election
    wd:Q2198855  # cultural movement
  }
  ?event wdt:P31 ?type .

  # Must have a date (point in time or start time)
  {
    ?event wdt:P585 ?date .
  } UNION {
    ?event wdt:P580 ?date .
  }

  FILTER(YEAR(?date) >= ${sparqlStart} && YEAR(?date) <= ${sparqlEnd})

  # Optional coordinates
  OPTIONAL { ?event wdt:P625 ?coord . }

  # Optional Wikipedia article title
  OPTIONAL {
    ?wpArticle schema:about ?event ;
               schema:isPartOf <https://en.wikipedia.org/> ;
               schema:name ?wpTitle .
  }

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
ORDER BY ?date
LIMIT ${limit}
  `.trim();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
      `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': 'Chronos/1.0 (historical-timeline-explorer)',
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`SPARQL query failed: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    return parseWikidataResults(data);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn('Wikidata SPARQL query timed out (15s limit)');
    } else {
      console.error('Wikidata SPARQL error:', error);
    }
    return [];
  }
}

/**
 * Full Wikidata enrichment pipeline:
 * 1. Find the entity for the queried location
 * 2. Query SPARQL for historical events
 * 3. Return structured events ready for merging
 */
export async function enrichFromWikidata(
  query: string,
  startYear: number,
  endYear: number
): Promise<WikidataEvent[]> {
  console.log(`Wikidata: searching for entity "${query}"...`);

  const entity = await findWikidataEntity(query);
  if (!entity) {
    console.log('Wikidata: no entity found, skipping enrichment');
    return [];
  }

  console.log(`Wikidata: found entity ${entity.id} (${entity.label}: ${entity.description})`);

  const events = await queryWikidataEvents(entity.id, startYear, endYear);
  console.log(`Wikidata: discovered ${events.length} events`);

  return events;
}
