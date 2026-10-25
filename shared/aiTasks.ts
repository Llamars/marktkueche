import type { Aisle, Ingredient, Offer, Recipe } from './types';
import { offerIngredient, parsePackGrams } from './logic';
import type { AiRequest } from './ai';

/** Aufgaben für die KI (Prospekt auslesen, Rezept importieren, neue Ideen) – Anbieter-unabhängig, Antwort als JSON. */

export function catalogLines(list: Ingredient[]) {
  return list
    .filter((i) => !i.custom)
    .map((i) => {
      const u = Object.entries(i.units).map(([k, g]) => `${k}=${g}g`).join(', ');
      return `${i.id}: ${i.name}${u ? ` (${u})` : ''}`;
    })
    .join('\n');
}

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

// ------------------------------------------------------------ Prospekte auslesen

export interface OfferContext {
  market: string;
  city: string;
  currency: string;
  today: string;
  catalog: Record<string, Ingredient>;
}

export function offersTask(ctx: OfferContext): Pick<AiRequest, 'system' | 'prompt'> {
  return {
    system: 'Du liest Supermarktprospekte präzise aus. Erfinde nichts, was nicht im Prospekt steht. Antworte nur mit JSON.',
    prompt:
      `Das ist der aktuelle Angebotsprospekt von ${ctx.market} in ${ctx.city} (Währung ${ctx.currency}, heute ist ${ctx.today}).\n` +
      'Lies alle Lebensmittel-Angebote aus, die sich zum Kochen oder fürs Frühstück eignen (Obst, Gemüse, Fleisch, Fisch, Milchprodukte, ' +
      'Nudeln, Reis, Flocken, Nüsse, Kerne, Konserven, Öl, Gewürze usw.). Getränke, Süßigkeiten, Drogerie- und Non-Food-Artikel weglassen.\n' +
      'Antworte als JSON in genau dieser Form:\n' +
      '{"offers":[{"title":"Produktname ohne Werbesprüche","brand":null,"price":1.99,"regularPrice":null,"quantity":"500 g",' +
      '"packGrams":500,"perKg":3.98,"validFrom":"JJJJ-MM-TT","validTo":"JJJJ-MM-TT","ingredientId":null}]}\n' +
      'Preise als Zahl. ingredientId = passende ID aus diesem Zutatenkatalog, sonst null:\n' +
      catalogLines(Object.values(ctx.catalog)),
  };
}

export type NewOffer = Omit<Offer, 'id' | 'createdAt' | 'cityId' | 'marketId' | 'source'>;

export function readOffers(json: unknown, catalog: Record<string, Ingredient>): NewOffer[] {
  const list = (json as { offers?: unknown[] })?.offers;
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) => {
    const o = x as Record<string, unknown>;
    const title = str(o.title, 160);
    const price = num(o.price);
    if (!title || !price || price <= 0 || price > 500) return [];
    const quantity = str(o.quantity, 60);
    const id = str(o.ingredientId, 80);
    return [{
      title,
      brand: str(o.brand, 60),
      price,
      regularPrice: num(o.regularPrice),
      quantity,
      packG: num(o.packGrams) ?? parsePackGrams(quantity) ?? parsePackGrams(title),
      perKg: num(o.perKg),
      validFrom: date(o.validFrom),
      validTo: date(o.validTo),
      ingredientId: offerIngredient(`${title} ${str(o.brand) ?? ''}`, id, catalog),
    }];
  });
}

// ------------------------------------------------------------ Rezept importieren

const UNITS = ['g', 'ml', 'stk', 'el', 'tl', 'prise', 'zehe', 'bund', 'dose', 'pck', 'scheibe', 'becher'];
const UNIT_G: Record<string, number> = { stk: 100, el: 12, tl: 5, prise: 0.4, zehe: 4, bund: 30, dose: 400, pck: 10, scheibe: 40, becher: 200 };

export function recipeTask(catalog: Record<string, Ingredient>, input: { url?: string; text?: string }): Pick<AiRequest, 'system' | 'prompt' | 'url'> {
  return {
    system:
      'Du wandelst Rezepte (Webseiten, Instagram-Beiträge, Texte) in ein sauberes deutsches Rezept um. Übersetze bei Bedarf ins Deutsche, ' +
      'nutze metrische Mengen und schreibe einfache Arbeitsschritte. Erfinde keine Zutaten. Antworte nur mit JSON.',
    prompt:
      (input.url ? 'Lies das Rezept auf dieser Seite.\n' : `Rezepttext:\n"""\n${(input.text ?? '').slice(0, 20000)}\n"""\n`) +
      'Antworte als JSON in genau dieser Form (isRecipe=false, wenn es kein Rezept ist):\n' +
      '{"isRecipe":true,"title":"","teaser":"ein appetitlicher Satz","servings":4,"time":30,"active":20,"difficulty":"leicht|mittel|anspruchsvoll",' +
      '"tags":["…"],"ingredients":[{"name":"Zwiebel","quantity":2,"unit":"stk","catalogId":"zwiebel","note":null}],' +
      '"steps":[{"text":"…","minutes":null}]}\n' +
      `Erlaubte Einheiten: ${UNITS.join(', ')}. Ordne Zutaten nach Möglichkeit diesem Katalog zu (catalogId, sonst null) und nutze die dort genannten Einheiten:\n` +
      catalogLines(Object.values(catalog)),
    url: input.url,
  };
}

const slug = (s: string) =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

/** Macht aus der KI-Antwort ein Rezept. Unbekannte Zutaten werden als eigene Zutat (ohne Nährwerte und Preis) angelegt. */
export function readRecipe(
  json: unknown,
  catalog: Record<string, Ingredient>,
  meta: { sourceUrl?: string; source: Recipe['source'] },
): { recipe: Recipe; newIngredients: Ingredient[] } | null {
  const r = json as Record<string, unknown>;
  if (!r || r.isRecipe === false || !str(r.title) || !Array.isArray(r.ingredients) || !Array.isArray(r.steps)) return null;
  const newIngredients: Ingredient[] = [];
  const ingredients = (r.ingredients as Record<string, unknown>[]).slice(0, 50).flatMap((x) => {
    const name = str(x.name, 80);
    if (!name) return [];
    const q = num(x.quantity) ?? 1;
    let unit = typeof x.unit === 'string' && UNITS.includes(x.unit) ? x.unit : 'stk';
    const cid = str(x.catalogId, 80);
    const known = cid ? catalog[cid] : undefined;
    if (known) {
      // Einheit, die für die Zutat nicht hinterlegt ist, in Gramm umrechnen
      if (!['g', 'ml'].includes(unit) && !known.units[unit]) return [{ i: known.id, q: Math.round(q * (UNIT_G[unit] ?? 100)), u: 'g', note: str(x.note) }];
      return [{ i: known.id, q, u: unit, note: str(x.note) }];
    }
    const id = `eigen-${slug(name)}`;
    if (!catalog[id] && !newIngredients.some((n) => n.id === id)) {
      newIngredients.push({
        id, name: name.charAt(0).toUpperCase() + name.slice(1), bls: null, aisle: 'sonstiges' as Aisle,
        units: { stk: 100, el: 12, tl: 5, prise: 0.4 }, pack: { g: 250, label: 'Packung', price: null }, custom: true,
      });
    }
    if (!['g', 'ml', 'stk', 'el', 'tl', 'prise'].includes(unit)) unit = 'stk';
    return [{ i: id, q, u: unit, note: str(x.note), raw: `${q} ${x.unit ?? ''} ${name}`.trim() }];
  });
  const title = str(r.title, 160)!;
  const recipe: Recipe = {
    id: `${meta.source === 'ki' ? 'ki' : 'import'}-${slug(title)}-${Date.now().toString(36).slice(-4)}`,
    title,
    teaser: str(r.teaser, 300) ?? '',
    servings: Math.min(20, Math.max(1, num(r.servings) ?? 4)),
    time: Math.min(600, Math.max(5, num(r.time) ?? 30)),
    active: num(r.active),
    difficulty: r.difficulty === 'mittel' || r.difficulty === 'anspruchsvoll' ? r.difficulty : 'leicht',
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map((t) => str(t, 30)).filter((t): t is string => !!t).slice(0, 6) : [],
    image: null,
    ingredients,
    steps: (r.steps as Record<string, unknown>[]).slice(0, 30).flatMap((s) => (str(s.text, 800) ? [{ t: str(s.text, 800)!, min: num(s.minutes) }] : [])),
    source: meta.source,
    sourceUrl: meta.sourceUrl,
    createdAt: new Date().toISOString(),
  };
  return { recipe, newIngredients };
}

// ------------------------------------------------------------ Neue Ideen aus den Angeboten

export function ideasTask(ctx: {
  count: number; offers: string[]; diet: string; avoid: string[]; maxTime: number; kids: boolean; existing: string[]; wish?: string;
  catalog: Record<string, Ingredient>;
}): Pick<AiRequest, 'system' | 'prompt'> {
  return {
    system: 'Du bist eine erfahrene Familienköchin und entwickelst alltagstaugliche, ausgewogene Rezepte mit klaren Schritten auf Deutsch. Antworte nur mit JSON.',
    prompt:
      `Entwickle ${ctx.count} neue Abendessen für 4 Erwachsenenportionen, die möglichst viele dieser aktuellen Angebote nutzen:\n` +
      ctx.offers.map((o) => `- ${o}`).join('\n') +
      `\n\nErnährungsform: ${ctx.diet}. Höchstens ${ctx.maxTime} Minuten.` +
      (ctx.kids ? ' Kinder essen mit – bitte mild würzen.' : '') +
      (ctx.avoid.length ? ` Nicht verwenden: ${ctx.avoid.join(', ')}.` : '') +
      (ctx.wish ? ` Wunsch: ${ctx.wish}.` : '') +
      `\nKeine Doppelungen zu: ${ctx.existing.slice(0, 80).join(', ')}.` +
      '\nViel Gemüse, Vollkorn wo passend, wenig Salz. Antworte als JSON:\n' +
      '{"recipes":[{"isRecipe":true,"title":"","teaser":"","servings":4,"time":30,"active":20,"difficulty":"leicht","tags":[],' +
      '"ingredients":[{"name":"","quantity":1,"unit":"g","catalogId":"…","note":null}],"steps":[{"text":"","minutes":null}]}]}\n' +
      'Verwende ausschließlich Zutaten aus diesem Katalog (catalogId) mit den dort genannten Einheiten:\n' +
      catalogLines(Object.values(ctx.catalog)),
  };
}
