import * as cheerio from 'cheerio';
import type { Recipe, RecipeIngredient, RecipeStep } from '../../shared/types';
import { matchIngredient } from '../../shared/logic';
import { baseCatalogList, ensureBlsIngredient, getCatalog } from './catalog';
import { claudeEnabled, structureRecipe, type StructuredRecipe } from './claude';
import { slugify, uid } from './store';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

export class ImportError extends Error {
  constructor(message: string, public needsText = false) {
    super(message);
  }
}

function assertPublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ImportError('Das ist kein gültiger Link.');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new ImportError('Nur http- und https-Links werden unterstützt.');
  const h = u.hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    throw new ImportError('Lokale Adressen können nicht importiert werden.');
  }
  return u;
}

async function fetchHtml(url: URL): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.7', Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new ImportError(`Die Seite hat mit Fehler ${res.status} geantwortet.`, true);
  const text = await res.text();
  return text.slice(0, 4_000_000);
}

// ------------------------------------------------------------ JSON-LD (schema.org/Recipe)

type Json = any;

function findRecipe(node: Json): Json | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  const t = node['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return node;
  if (node['@graph']) return findRecipe(node['@graph']);
  return null;
}

function isoMinutes(v?: string): number | undefined {
  if (!v) return undefined;
  const m = v.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return undefined;
  const mins = Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return mins || undefined;
}

function imageOf(v: Json): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return imageOf(v[v.length - 1]) ?? imageOf(v[0]);
  return v.url ?? v.contentUrl;
}

function stepsOf(v: Json): string[] {
  if (!v) return [];
  if (typeof v === 'string') return v.split(/\n+|(?<=\.)\s+(?=[A-ZÄÖÜ])/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(stepsOf);
  if (v['@type'] === 'HowToSection') return stepsOf(v.itemListElement);
  return [String(v.text ?? v.name ?? '').trim()].filter(Boolean);
}

const clean = (s: string) => cheerio.load(`<p>${s}</p>`).text().replace(/\s+/g, ' ').trim();

/** Kürzt auf ganze Sätze bzw. Wörter (max. 160 Zeichen). */
function shorten(s: string, max = 160): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sentence = cut.lastIndexOf('. ');
  if (sentence > 60) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(' '))} …`;
}

// ------------------------------------------------------------ Zutatenzeilen ohne KI lesen

const UNIT_MAP: Record<string, string> = {
  g: 'g', gr: 'g', gramm: 'g', kg: 'kg', ml: 'ml', l: 'l', liter: 'l', cl: 'cl',
  el: 'el', 'el.': 'el', esslöffel: 'el', tl: 'tl', 'tl.': 'tl', teelöffel: 'tl',
  prise: 'prise', prisen: 'prise', msp: 'prise', 'msp.': 'prise',
  zehe: 'zehe', zehen: 'zehe', bund: 'bund', dose: 'dose', dosen: 'dose',
  päckchen: 'pck', pck: 'pck', 'pck.': 'pck', pkg: 'pck', stück: 'stk', stk: 'stk', 'stk.': 'stk',
  becher: 'becher', scheibe: 'scheibe', scheiben: 'scheibe', tasse: 'tasse', tassen: 'tasse', handvoll: 'handvoll',
  cup: 'tasse', cups: 'tasse', tbsp: 'el', tsp: 'tl', oz: 'oz', lb: 'lb',
};
const FRAC: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

function parseNumber(s: string): number | null {
  s = s.trim();
  if (FRAC[s]) return FRAC[s];
  const mixed = s.match(/^(\d+)\s*([½¼¾⅓⅔])$/);
  if (mixed) return Number(mixed[1]) + FRAC[mixed[2]];
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseLine(line: string): { q: number | null; u: string | null; name: string; note?: string; hintG?: number } {
  const full = clean(line);
  // Grammangabe in Klammern, z. B. „1 Dose Tomaten (800 g)“
  const hint = full.match(/\((?:ca\.\s*)?(\d+[.,]?\d*)\s*(g|ml)\)/i);
  let s = full.replace(/\(.*?\)/g, '').trim();
  const m = s.match(/^(\d+[.,]?\d*\s*[½¼¾⅓⅔]?|[½¼¾⅓⅔]|\d+\/\d+)(?:\s*[-–]\s*[\d.,]+)?\s*(\S+)?\s*(.*)$/);
  let q: number | null = null;
  let u: string | null = null;
  if (m) {
    q = parseNumber(m[1]);
    const unitWord = (m[2] ?? '').toLowerCase();
    if (UNIT_MAP[unitWord]) {
      u = UNIT_MAP[unitWord];
      s = m[3];
    } else {
      u = 'stk';
      s = `${m[2] ?? ''} ${m[3]}`.trim();
    }
  }
  const [name, ...rest] = s.split(',');
  const nm = name.replace(/^(etwas|n\. b\.|nach belieben|evtl\.|ggf\.)\s+/i, '').trim();
  // „2 Knoblauchzehen“ → Einheit Zehe
  if (u === 'stk' && /zehe/i.test(nm)) u = 'zehe';
  return {
    q, u, name: nm, note: rest.join(',').trim() || undefined,
    hintG: hint ? Number(hint[1].replace(',', '.')) : undefined,
  };
}

/** Allgemeine Begriffe aus Rezepten, die im Katalog anders heißen. `null` = ohne Nährwert überspringen. */
const ALIASES: [RegExp, string | null][] = [
  [/^wasser\b|eiswasser|^eiswürfel/i, null],
  [/fett für|^fett\b|^öl\b|speiseöl|pflanzenöl|bratöl|neutrales öl|sonnenblumenöl/i, 'rapsoel'],
  [/salz und pfeffer|salz, pfeffer|^salz\b/i, 'salz'],
  [/tomate.*(dose|geschält|gehackt|stückig|konserve)|(dose|geschält|gehackt|stückig).*tomate/i, 'tomaten_dose'],
  [/knoblauch/i, 'knoblauch'],
  [/brühe|fond\b|bouillon/i, 'gemuesebruehe'],
  [/^(gerieben\w*\s)?käse\b|reibekäse|käse,? gerieben/i, 'gouda'],
  [/^eier?\b|^eier\b/i, 'eier'],
];

function mapIngredient(name: string, unit?: string | null): string | null {
  const catalog = getCatalog();
  const n = name.toLowerCase();
  for (const [re, id] of ALIASES) if (re.test(n)) return id;
  const hit = matchIngredient(n, catalog);
  if (hit) {
    // Bei Dosenware die Konserven-Variante bevorzugen
    if (unit === 'dose' && !catalog[hit].units.dose) {
      const alt = Object.values(catalog).find((i) => i.units.dose && i.match?.some((w) => n.includes(w.split(' ')[0])));
      if (alt) return alt.id;
    }
    return hit;
  }
  const ing = ensureBlsIngredient(name);
  return ing?.id ?? null;
}

function convert(q: number | null, u: string | null): { q: number; u: string } {
  const qq = q ?? 1;
  switch (u) {
    case 'kg': return { q: qq * 1000, u: 'g' };
    case 'l': return { q: qq * 1000, u: 'ml' };
    case 'cl': return { q: qq * 10, u: 'ml' };
    case 'tasse': return { q: qq * 200, u: 'ml' };
    case 'handvoll': return { q: qq * 30, u: 'g' };
    case 'oz': return { q: qq * 28.35, u: 'g' };
    case 'lb': return { q: qq * 453.6, u: 'g' };
    case null: return { q: q == null ? 1 : qq, u: q == null ? 'prise' : 'stk' };
    default: return { q: qq, u };
  }
}

function heuristicIngredients(lines: string[]): RecipeIngredient[] {
  const out: RecipeIngredient[] = [];
  for (const line of lines) {
    const p = parseLine(line);
    if (!p.name) continue;
    const id = mapIngredient(p.name, p.u);
    if (!id) continue;
    const ing = getCatalog()[id];
    let { q, u } = convert(p.q, p.u);
    // Verpackungseinheit mit Grammangabe („1 Dose (800 g)“) → die genaue Grammangabe verwenden
    if (p.hintG && !['g', 'ml'].includes(u) && (['dose', 'pck', 'becher', 'glas'].includes(u) || !ing?.units[u])) {
      q = p.hintG * (p.q ?? 1);
      u = 'g';
    }
    out.push({ i: id, q, u, note: p.note, raw: clean(line) });
  }
  return out;
}

function fromStructured(s: StructuredRecipe): { ingredients: RecipeIngredient[]; steps: RecipeStep[] } {
  const catalog = getCatalog();
  const ingredients: RecipeIngredient[] = [];
  for (const x of s.ingredients) {
    let id = x.catalogId && catalog[x.catalogId] ? x.catalogId : null;
    id ??= mapIngredient(x.name, x.unit) ?? (x.blsQuery ? mapIngredient(x.blsQuery) : null);
    if (!id) continue;
    const ing = getCatalog()[id];
    let q = x.quantity ?? 1;
    let u: string = x.unit ?? 'g';
    // Unbekannte Einheit für diese Zutat → auf geschätzte Gramm ausweichen
    if (!['g', 'ml'].includes(u) && !ing.units[u] && x.grams) {
      q = x.grams;
      u = 'g';
    }
    ingredients.push({ i: id, q, u, note: x.note ?? undefined, raw: `${x.quantity ?? ''} ${x.unit ?? ''} ${x.name}`.trim() });
  }
  return { ingredients, steps: s.steps.map((t) => ({ t: t.text, min: t.minutes ?? undefined })) };
}

// ------------------------------------------------------------ Einstieg

export async function importRecipe(input: { url?: string; text?: string }): Promise<Recipe> {
  const sourceUrl = input.url?.trim() || undefined;
  let text = input.text?.trim() || '';
  let image: string | undefined;
  let title: string | undefined;

  if (sourceUrl) {
    const url = assertPublicUrl(sourceUrl);
    let html = '';
    try {
      html = await fetchHtml(url);
    } catch (e) {
      if (!text) throw e instanceof ImportError ? e : new ImportError('Die Seite konnte nicht geladen werden.', true);
    }
    if (html) {
      const $ = cheerio.load(html);
      image = $('meta[property="og:image"]').attr('content') || undefined;
      title = $('meta[property="og:title"]').attr('content') || $('title').text() || undefined;
      let ld: Json = null;
      $('script[type="application/ld+json"]').each((_, el) => {
        if (ld) return;
        try {
          ld = findRecipe(JSON.parse($(el).text()));
        } catch {
          /* defektes JSON-LD ignorieren */
        }
      });
      if (ld) {
        const r: Json = ld;
        const lines: string[] = (r.recipeIngredient ?? r.ingredients ?? []).map(String);
        const steps = stepsOf(r.recipeInstructions).map(clean);
        const servings = parseInt(String(Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield ?? '4'), 10) || 4;
        const time = isoMinutes(r.totalTime) ?? ((isoMinutes(r.prepTime) ?? 0) + (isoMinutes(r.cookTime) ?? 0) || 30);
        const recipeText = [
          `Titel: ${clean(String(r.name ?? title ?? ''))}`,
          `Beschreibung: ${clean(String(r.description ?? ''))}`,
          `Portionen: ${servings}`,
          `Zeit: ${time} Minuten`,
          'Zutaten:', ...lines.map((l) => `- ${clean(l)}`),
          'Zubereitung:', ...steps.map((s, i) => `${i + 1}. ${s}`),
        ].join('\n');
        if (claudeEnabled()) {
          return finish(await structureRecipe(recipeText, baseCatalogList()), sourceUrl, imageOf(r.image) ?? image);
        }
        return {
          id: `import-${slugify(String(r.name ?? 'rezept'))}-${uid().slice(-4)}`,
          title: clean(String(r.name ?? title ?? 'Importiertes Rezept')),
          teaser: shorten(clean(String(r.description ?? ''))),
          time,
          active: isoMinutes(r.prepTime),
          difficulty: 'leicht',
          servings,
          tags: [],
          image: imageOf(r.image) ?? image ?? null,
          imageCredit: url.hostname.replace(/^www\./, ''),
          ingredients: heuristicIngredients(lines),
          steps: steps.map((t) => ({ t })),
          source: 'import',
          sourceUrl,
          createdAt: new Date().toISOString(),
        };
      }
      // Kein strukturiertes Rezept (z. B. Instagram): Bildunterschrift / Seitentext verwenden
      const desc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
      $('script, style, noscript, nav, footer, header').remove();
      const body = $('main').text() || $('article').text() || $('body').text();
      text = [text, title, desc, body.replace(/\s+/g, ' ').slice(0, 15000)].filter(Boolean).join('\n\n');
    }
  }

  if (!text || text.length < 40) {
    throw new ImportError(
      'Auf der Seite wurde kein Rezept gefunden. Bei Instagram ist das Rezept oft nur im Video oder hinter dem Login – kopiere die Bildunterschrift und füge sie als Text ein.',
      true,
    );
  }
  if (!claudeEnabled()) {
    throw new ImportError(
      'Diese Seite enthält kein maschinenlesbares Rezept. Zum Auslesen von Fließtext (z. B. Instagram) wird die KI benötigt – bitte ANTHROPIC_API_KEY in der Datei .env eintragen.',
    );
  }
  return finish(await structureRecipe(text, baseCatalogList()), sourceUrl, image);
}

function finish(s: StructuredRecipe, sourceUrl: string | undefined, image?: string): Recipe {
  if (!s.isRecipe || !s.ingredients.length) {
    throw new ImportError('In diesem Inhalt wurde kein Rezept erkannt. Füge den Rezepttext (Zutaten und Schritte) direkt ein.', true);
  }
  const { ingredients, steps } = fromStructured(s);
  let host: string | undefined;
  try {
    host = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : undefined;
  } catch {
    host = undefined;
  }
  return {
    id: `import-${slugify(s.title)}-${uid().slice(-4)}`,
    title: s.title,
    teaser: s.teaser,
    time: Math.round(s.time) || 30,
    active: s.active ?? undefined,
    difficulty: s.difficulty,
    servings: Math.max(1, Math.round(s.servings) || 4),
    tags: s.tags.slice(0, 6),
    image: image ?? null,
    imageCredit: host,
    ingredients,
    steps,
    source: 'import',
    sourceUrl,
    createdAt: new Date().toISOString(),
  };
}
