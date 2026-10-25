import type { Allergen, Diet, Ingredient, Nutrients, Recipe, RecipeView } from './types';
import { toGrams } from './units';
import { recipeCategory } from './categories';

/** Nährwerte je 100 g zu einem BLS-Code (Bundeslebensmittelschlüssel 4.0). */
export type BlsLookup = (code: string) => Record<string, number | null> | undefined;

/** Grundrezepte mit Varianten werden in einzelne Rezepte „ausgerollt“, eines je austauschbarer Zutat. */
export function expandRecipe(r: Recipe): Recipe[] {
  if (!r.variants) return [r];
  const { slot, options } = r.variants;
  return options.map((o) => {
    const fill = (s: string) => s.replaceAll('{v}', o.label);
    const ingredients = r.ingredients.map((x, k) => (k === slot ? { i: o.i, q: o.q, u: o.u } : x));
    const { variants, ...rest } = r;
    return {
      ...rest,
      id: `${r.id}~${o.key}`,
      family: r.id,
      variantKey: o.key,
      variantLabel: o.label,
      title: fill(r.title),
      teaser: fill(r.teaser),
      time: r.time + (o.extraMin ?? 0),
      ingredients,
      steps: r.steps.map((s) => ({ ...s, t: fill(s.t) })),
    };
  });
}

// BLS-Schlüssel → App-Nährstoffe (je 100 g)
const DIRECT: (keyof Nutrients)[] = [
  'kcal', 'protein', 'fat', 'satFat', 'carbs', 'sugar', 'fiber', 'salt', 'vitD', 'folate', 'vitB12', 'vitC', 'vitA',
  'iodine', 'iron', 'calcium', 'magnesium', 'potassium', 'zinc', 'ala',
];

function nutrientsFor(ing: Ingredient, grams: number, bls: BlsLookup): Nutrients {
  const n = ing.bls ? bls(ing.bls) : undefined;
  if (!n) return {};
  const f = grams / 100;
  const out: Nutrients = {};
  for (const k of DIRECT) {
    const v = n[k as string];
    if (typeof v === 'number') out[k] = v * f;
  }
  out.epaDha = ((n.epa ?? 0) + (n.dha ?? 0)) * 1000 * f; // g → mg
  out.freeSugar = ing.freeSugar ? (n.sugar ?? 0) * f : 0;
  return out;
}

/** Ergänzt Kategorie, Ernährungsform, Allergene und Nährwerte je Portion. */
export function enrichRecipe(r: Recipe, catalog: Record<string, Ingredient>, bls: BlsLookup): RecipeView {
  const total: Nutrients = {};
  const grams: number[] = [];
  let knownG = 0;
  let allG = 0;
  let meatG = 0;
  let fishG = 0;
  let vegG = 0;
  const animals = new Set<string>();
  const allergens = new Set<Allergen>();
  for (const x of r.ingredients) {
    const ing = catalog[x.i];
    const g = toGrams(ing, x.q, x.u) ?? 0;
    grams.push(g);
    if (!ing) continue;
    allG += g;
    if (ing.bls) knownG += g;
    if (ing.animal) animals.add(ing.animal);
    ing.allergens?.forEach((a) => allergens.add(a));
    if (ing.animal === 'meat') meatG += g;
    if (ing.animal === 'fish') fishG += g;
    if (ing.aisle === 'gemuese' || (ing.aisle === 'tk' && !ing.animal)) vegG += g;
    const n = nutrientsFor(ing, g, bls);
    for (const k in n) total[k as keyof Nutrients] = (total[k as keyof Nutrients] ?? 0) + (n[k as keyof Nutrients] ?? 0);
  }
  const perServing: Nutrients = {};
  for (const k in total) perServing[k as keyof Nutrients] = (total[k as keyof Nutrients] ?? 0) / r.servings;
  const diet: Diet = animals.has('meat')
    ? 'fleisch'
    : animals.has('fish')
      ? 'pescetarisch'
      : animals.size
        ? 'vegetarisch'
        : 'vegan';
  return {
    ...r,
    category: recipeCategory(r),
    source: r.source ?? 'basis',
    diet,
    allergens: [...allergens],
    perServing,
    grams,
    nutrientCoverage: allG ? knownG / allG : 0,
    meatG: meatG / r.servings,
    fishG: fishG / r.servings,
    vegG: vegG / r.servings,
  };
}
