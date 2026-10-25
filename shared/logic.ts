import type {
  CartExtra, City, HouseholdState, Ingredient, MealSlot, NutrientKey, Nutrients, Offer, PlanEntry, RecipeView, Settings,
} from './types';
import { portionFactor } from './references';
import { fmtGrams } from './units';

export type Catalog = Record<string, Ingredient>;

// ---------------------------------------------------------------- Angebote

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// Verneinte Angaben vereinheitlichen, damit „ungesalzen“ nicht am Ausschlusswort „gesalzen“ hängen bleibt
const UNSALTED = /\b(?:un|nicht )gesalzen\b|ohne (?:zugesetztes |zusatz von )?salz(?:zusatz)?|\bunsalted\b|\bno salt(?: added)?\b|\bsalt[- ]free\b/g;
const UNSWEETENED = /\b(?:un|nicht )gesüßt|\bungezuckert\b|ohne (?:zugesetzten |zusatz von )?zucker(?:zusatz)?|\bzuckerfrei\b|\bunsweetened\b|\bno sugar(?: added)?\b|\bsugar[- ]free\b/g;
const FROZEN = /\b(?:tk|tiefgefroren|tiefgekühlt|frozen)\b/;

/** Ordnet einen Angebotstitel einer Katalogzutat zu (längster passender Suchbegriff gewinnt). */
export function matchIngredient(title: string, catalog: Catalog): string | null {
  const t = norm(title).replace(UNSALTED, ' ohne-s ').replace(UNSWEETENED, ' ohne-z ');
  const frozen = FROZEN.test(t);
  let best: { id: string; score: number } | null = null;
  for (const ing of Object.values(catalog)) {
    if (!ing.match?.length) continue;
    if (ing.noMatch?.some((w) => t.includes(w))) continue;
    // „Heidelbeeren“ frisch → Frischware, „Heidelbeeren, tiefgefroren“ → TK-Ware
    const bonus = ing.aisle === 'tk' ? (frozen ? 4 : -1) : 0;
    for (const w of ing.match) {
      if (t.includes(w) && (!best || w.length + bonus > best.score)) best = { id: ing.id, score: w.length + bonus };
    }
  }
  return best?.id ?? null;
}

/** Liest Packungsgrößen wie „500 g“, „1,5 kg“, „6 x 125 g“, „1 l“ aus einem Text. */
export function parsePackGrams(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase().replace(/,/g, '.');
  const multi = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
  if (multi) return Number(multi[1]) * Number(multi[2]) * (multi[3] === 'kg' || multi[3] === 'l' ? 1000 : 1);
  const single = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
  if (single) return Number(single[1]) * (single[2] === 'kg' || single[2] === 'l' ? 1000 : 1);
  return undefined;
}

export function offerPerKg(o: Offer, ing?: Ingredient): number | null {
  if (o.perKg) return o.perKg;
  const g = o.packG ?? parsePackGrams(o.quantity) ?? parsePackGrams(o.title);
  if (g) return (o.price / g) * 1000;
  if (ing && /st(ü|ue)ck|stk/i.test(o.quantity ?? '') && ing.units.stk) return (o.price / ing.units.stk) * 1000;
  return null;
}

/** Gilt heute (Prospekte für kommende Wochen zählen erst ab ihrem ersten Tag). */
export function isOfferValid(o: Offer, today: string): boolean {
  if (o.validTo && o.validTo < today) return false;
  if (o.validFrom && o.validFrom > today) return false;
  return true;
}

/** Günstigstes gültiges Angebot je Zutat in den gewählten Märkten. */
export function bestOffers(offers: Offer[], catalog: Catalog, cityId: string, marketIds: string[], today: string) {
  const map = new Map<string, { offer: Offer; perKg: number }>();
  for (const o of offers) {
    if (o.cityId !== cityId || !marketIds.includes(o.marketId) || !isOfferValid(o, today)) continue;
    const id = o.ingredientId;
    if (!id || !catalog[id]) continue;
    const perKg = offerPerKg(o, catalog[id]);
    if (perKg == null) continue;
    const cur = map.get(id);
    if (!cur || perKg < cur.perKg) map.set(id, { offer: o, perKg });
  }
  return map;
}
export type OfferMap = ReturnType<typeof bestOffers>;

// ---------------------------------------------------------------- Preise

export function refPerKg(ing: Ingredient, city: City): number | null {
  if (ing.pack.price == null) return null;
  return (ing.pack.price * city.priceFactor) / ing.pack.g * 1000;
}

export interface RecipeCost {
  total: number;
  perPortion: number;
  saving: number;
  offerIds: string[];
  unknownPrice: boolean;
}

export function recipeCost(r: RecipeView, servings: number, catalog: Catalog, offers: OfferMap, city: City): RecipeCost {
  const f = servings / r.servings;
  let total = 0;
  let saving = 0;
  let unknownPrice = false;
  const offerIds: string[] = [];
  r.ingredients.forEach((x, k) => {
    const ing = catalog[x.i];
    const g = (r.grams[k] || 0) * f;
    if (!ing || !g) return;
    const ref = refPerKg(ing, city);
    const o = offers.get(ing.id);
    if (o) {
      total += (g / 1000) * o.perKg;
      if (ref != null && ref > o.perKg) saving += (g / 1000) * (ref - o.perKg);
      offerIds.push(ing.id);
    } else if (ref != null) {
      total += (g / 1000) * ref;
    } else unknownPrice = true;
  });
  return { total, perPortion: total / servings, saving, offerIds, unknownPrice };
}

export function fmtMoney(v: number, currency = 'EUR') {
  return v.toLocaleString(currency === 'CHF' ? 'de-CH' : 'de-DE', { style: 'currency', currency });
}

// ---------------------------------------------------------------- Präferenzen

export function householdPortions(s: Settings): number {
  if (!s.people.length) return 2;
  return s.people.reduce((a, p) => a + portionFactor(p), 0);
}

export function dietAllows(pref: Settings['diet'], diet: RecipeView['diet']): boolean {
  switch (pref) {
    case 'vegan': return diet === 'vegan';
    case 'vegetarisch': return diet === 'vegan' || diet === 'vegetarisch';
    case 'pescetarisch': return diet !== 'fleisch';
    default: return true;
  }
}

export function fitsPrefs(r: RecipeView, s: Settings): boolean {
  if (!dietAllows(s.diet, r.diet)) return false;
  if (s.allergies.some((a) => r.allergens.includes(a))) return false;
  if (s.dislikes.some((d) => r.ingredients.some((x) => x.i === d))) return false;
  return true;
}

// ---------------------------------------------------------------- Vorschläge

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** Rezeptfamilie: Varianten eines Grundrezepts teilen sich diese ID. */
export const famId = (r: { id: string; family?: string }) => r.family ?? r.id;

/** Frühstücksrezepte (Müsli, Porridge, …) werden getrennt von Mittag- und Abendessen vorgeschlagen und geplant. */
export const isBreakfast = (r: { tags: string[] }) => r.tags.includes('fruehstueck');

export const SLOT_ORDER: Record<MealSlot, number> = { frueh: 0, mittag: 1, abend: 2 };
export const SLOT_LABEL: Record<MealSlot, string> = { frueh: 'Frühstück', mittag: 'Mittag', abend: 'Abend' };

/** Nur die beste Variante je Rezeptfamilie behalten (Liste muss nach Score sortiert sein). */
export function bestPerFamily<T extends { recipe: RecipeView }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const f = famId(s.recipe);
    if (seen.has(f)) return false;
    seen.add(f);
    return true;
  });
}

export interface Scored {
  recipe: RecipeView;
  cost: RecipeCost;
  score: number;
}

export function scoreRecipes(
  recipes: RecipeView[], st: HouseholdState, catalog: Catalog, offers: OfferMap, city: City, seed: string,
): Scored[] {
  const portions = householdPortions(st.settings);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const inPlan = new Set(st.plan.map((p) => famId(byId.get(p.recipeId) ?? { id: p.recipeId })));
  const now = Date.now();
  return recipes
    .map((r) => {
      const cost = recipeCost(r, portions, catalog, offers, city);
      let score = cost.offerIds.length * 3 + cost.saving * 1.5 - cost.perPortion * 0.6;
      if (st.favorites[famId(r)] || st.favorites[r.id]) score += 2;
      score += (st.ratings[r.id] ?? st.ratings[famId(r)] ?? 0) * 3;
      const cooked = st.cooked[r.id] ?? st.cooked[famId(r)];
      if (cooked && now - Date.parse(cooked) < 14 * 864e5) score -= 4;
      if (inPlan.has(famId(r))) score -= 6;
      if (r.tags.includes('saisonal')) score += 1;
      score += hash(r.id + seed) * 1.5;
      return { recipe: r, cost, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** Füllt freie Tage mit passenden, abwechslungsreichen Rezepten. */
export function autoPlan(
  dates: string[], scored: Scored[], st: HouseholdState, recipesById: Record<string, RecipeView>, catalog: Catalog,
): PlanEntry[] {
  const portions = Math.max(1, Math.round(householdPortions(st.settings) * 2) / 2);
  const chosen: RecipeView[] = st.plan.filter((p) => p.slot !== 'frueh').map((p) => recipesById[p.recipeId]).filter(Boolean);
  const out: PlanEntry[] = [];
  const meatBudget = 300 * Math.max(1, st.settings.people.filter((p) => p.age >= 15).length || 1);
  let meat = chosen.reduce((a, r) => a + r.meatG * portions, 0);
  for (const date of dates) {
    const weekend = [0, 6].includes(new Date(date + 'T12:00:00').getDay());
    const maxT = weekend ? st.settings.maxTimeWeekend : st.settings.maxTimeWeekday;
    const perishables = new Set(
      chosen.flatMap((r) => r.ingredients.map((x) => x.i)).filter((id) => ['gemuese', 'kuehl'].includes(catalog[id]?.aisle)),
    );
    let best: { s: Scored; v: number } | null = null;
    for (const s of scored) {
      const r = s.recipe;
      if (isBreakfast(r) || r.time > maxT || chosen.some((c) => famId(c) === famId(r)) || !fitsPrefs(r, st.settings)) continue;
      let v = s.score;
      const shared = r.ingredients.filter((x) => perishables.has(x.i)).length;
      v += Math.min(shared, 3) * 0.8; // angebrochene Packungen weiterverwenden
      const last = chosen[chosen.length - 1];
      if (last && last.diet === r.diet && r.diet !== 'vegetarisch') v -= 1.5;
      if (last && r.tags.some((t) => last.tags.includes(t) && ['italienisch', 'asiatisch', 'suppe'].includes(t))) v -= 1;
      if (r.meatG > 0 && meat + r.meatG * portions > meatBudget) v -= 4;
      if (!best || v > best.v) best = { s, v };
    }
    if (!best) continue;
    chosen.push(best.s.recipe);
    meat += best.s.recipe.meatG * portions;
    out.push({ id: `${date}-abend-${best.s.recipe.id}`, date, slot: 'abend', recipeId: best.s.recipe.id, servings: portions });
  }
  return out;
}

/**
 * Frühstück für freie Tage: wechselt zwischen wenigen Rezepten, damit angebrochene Packungen
 * (Flocken, Nüsse, Kerne) aufgebraucht werden, statt jeden Tag etwas Neues zu kaufen.
 */
export function autoPlanBreakfast(dates: string[], scored: Scored[], st: HouseholdState): PlanEntry[] {
  const portions = Math.max(1, Math.round(householdPortions(st.settings) * 2) / 2);
  const out: PlanEntry[] = [];
  const uses = new Map<string, number>();
  let prev: string | null = null;
  for (const date of dates) {
    if (st.plan.some((p) => p.date === date && p.slot === 'frueh')) continue;
    const weekend = [0, 6].includes(new Date(date + 'T12:00:00').getDay());
    const maxT = weekend ? 45 : 15;
    let best: { s: Scored; v: number } | null = null;
    for (const s of scored) {
      const r = s.recipe;
      if (!isBreakfast(r) || r.time > maxT || !fitsPrefs(r, st.settings)) continue;
      const f = famId(r);
      const n = uses.get(f) ?? 0;
      const v = s.score - (f === prev ? 5 : 0) - (n === 0 && uses.size >= 3 ? 4 : n * 1.5);
      if (!best || v > best.v) best = { s, v };
    }
    if (!best) continue;
    const f = famId(best.s.recipe);
    uses.set(f, (uses.get(f) ?? 0) + 1);
    prev = f;
    out.push({ id: `${date}-frueh-${best.s.recipe.id}`, date, slot: 'frueh', recipeId: best.s.recipe.id, servings: portions });
  }
  return out;
}

// ---------------------------------------------------------------- Einkaufswagen

export interface CartLine {
  key: string;
  ingredientId: string;
  name: string;
  grams: number;
  /** benötigte Menge zum Anzeigen, z. B. „320 g“ oder „400 ml“ */
  need: string;
  packs: number;
  packLabel: string;
  price: number | null;
  saving: number;
  marketId: string | null;
  offer?: Offer;
  aisle: string;
  recipes: string[];
  /** enthält Packungen, die ohne Rezept hinzugefügt wurden */
  extra: boolean;
  pantry: boolean;
}

/** Bleibt ein Zusatzeintrag nach „Erledigte leeren“ auf der Liste? */
export const keepExtra = (e: CartExtra, checked: Record<string, boolean>) =>
  !checked[`x:${e.id}`] && !(e.ingredientId && checked[e.ingredientId]);

export function buildCart(
  plan: PlanEntry[], recipesById: Record<string, RecipeView>, catalog: Catalog, offers: OfferMap, city: City,
  pantry: string[], buyAnyway: Record<string, boolean>, extras: CartExtra[] = [],
): CartLine[] {
  const acc = new Map<string, { g: number; recipes: Set<string>; extraPacks: number }>();
  const packGrams = (id: string) => {
    const o = offers.get(id);
    return o?.offer.packG ?? parsePackGrams(o?.offer.quantity) ?? catalog[id].pack.g;
  };
  for (const p of plan) {
    const r = recipesById[p.recipeId];
    if (!r) continue;
    const f = p.servings / r.servings;
    r.ingredients.forEach((x, k) => {
      const g = (r.grams[k] || 0) * f;
      const cur = acc.get(x.i) ?? { g: 0, recipes: new Set<string>(), extraPacks: 0 };
      cur.g += g;
      cur.recipes.add(r.title);
      acc.set(x.i, cur);
    });
  }
  // Einzelne Packungen ohne Rezept, z. B. aus dem Müsli-Baukasten
  for (const e of extras) {
    if (!e.ingredientId || !catalog[e.ingredientId]) continue;
    const cur = acc.get(e.ingredientId) ?? { g: 0, recipes: new Set<string>(), extraPacks: 0 };
    cur.extraPacks += Math.max(1, e.packs ?? 1);
    acc.set(e.ingredientId, cur);
  }
  const lines: CartLine[] = [];
  for (const [id, { g, recipes, extraPacks }] of acc) {
    const ing = catalog[id];
    if (!ing) continue;
    const extra = extraPacks > 0;
    const isPantry = pantry.includes(id) && !buyAnyway[id] && !extra;
    const o = offers.get(id);
    const packG = packGrams(id);
    // Einzeln hinzugefügte Packungen decken den Rezeptbedarf mit ab, solange er hineinpasst
    const packs = Math.max(1, extraPacks, Math.ceil((g - 0.001) / packG));
    const unit = o ? o.offer.price : ing.pack.price != null ? ing.pack.price * city.priceFactor : null;
    const ref = refPerKg(ing, city);
    const saving = o && ref != null && ref > o.perKg ? ((ref - o.perKg) * packs * packG) / 1000 : 0;
    lines.push({
      key: id,
      ingredientId: id,
      name: ing.name,
      grams: g,
      need: ing.display === 'ml' ? `${Math.round(g / (ing.units.ml ?? 1) / 10) * 10} ml` : fmtGrams(g),
      packs,
      packLabel: o?.offer.quantity || ing.pack.label,
      price: unit != null ? unit * packs : null,
      saving,
      marketId: o?.offer.marketId ?? null,
      offer: o?.offer,
      aisle: ing.aisle,
      recipes: [...recipes],
      extra,
      pantry: isPantry,
    });
  }
  return lines.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// ---------------------------------------------------------------- Nährwerte

export function scaleNutrients(n: Nutrients, f: number): Nutrients {
  const out: Nutrients = {};
  for (const k in n) out[k as NutrientKey] = (n[k as NutrientKey] ?? 0) * f;
  return out;
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  const out: Nutrients = { ...a };
  for (const k in b) out[k as NutrientKey] = (out[k as NutrientKey] ?? 0) + (b[k as NutrientKey] ?? 0);
  return out;
}

export function isoDate(d: Date): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function weekDates(offsetWeeks = 0, from = new Date()): string[] {
  const d = new Date(from);
  const day = (d.getDay() + 6) % 7; // Montag = 0
  d.setDate(d.getDate() - day + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return isoDate(x);
  });
}
