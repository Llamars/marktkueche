import type { Features, HouseholdState, Ingredient, Offer, Recipe, RecipeView } from '../../shared/types';
import type { AiConfig } from '../../shared/ai';
import ingredientsJson from '../../shared/data/ingredients.json';
import recipes1 from '../../shared/data/recipes.json';
import recipes2 from '../../shared/data/recipes-familien.json';
import recipes3 from '../../shared/data/recipes-mehr.json';
import recipes4 from '../../shared/data/recipes-fruehstueck.json';
import blsJson from '../../shared/data/bls-subset.json';
import { CITIES } from '../../shared/cities';
import { SOURCES } from '../../shared/references';
import { enrichRecipe, expandRecipe } from '../../shared/recipes';
import { freshState, normalizeState } from '../../shared/state';
import { seedDemoOffers } from '../../shared/demoOffers';
import { KEYS, load, save } from './storage';

/** Nur auf diesem Gerät: KI-Schlüssel und Familien-Schlüssel für die automatisch abgerufenen Angebote. */
export interface DeviceSettings {
  familyKey?: string;
  ai?: AiConfig;
}

/** Die Geräte-Version läuft ohne Server; KI gibt es, sobald auf dem Gerät ein Schlüssel eingetragen ist. */
export const featuresFor = (device: DeviceSettings): Features => ({
  claude: !!device.ai?.apiKey?.trim(), images: false, model: device.ai?.model || '', demoOffers: true, server: false,
});

export const CATALOG: Record<string, Ingredient> = Object.fromEntries(
  (ingredientsJson.items as unknown as Ingredient[]).map((i) => [i.id, i]),
);
export const PANTRY = Object.values(CATALOG).filter((i) => i.pantry).map((i) => i.id);
/** Grundkatalog plus eigene Zutaten aus importierten Rezepten */
export const withCustom = (custom: Ingredient[]): Record<string, Ingredient> => ({
  ...Object.fromEntries(custom.filter((i) => !CATALOG[i.id]).map((i) => [i.id, { ...i, custom: true }])),
  ...CATALOG,
});

const BLS = blsJson as unknown as { source: string; foods: Record<string, Record<string, number | null>> };
export const BLS_SOURCE = BLS.source;
const blsLookup = (code: string) => BLS.foods[code];

export const BASE_RECIPES: Recipe[] = [recipes1, recipes2, recipes3, recipes4]
  .flatMap((f) => (f as unknown as { recipes: Recipe[] }).recipes)
  .flatMap(expandRecipe)
  .map((r) => ({ ...r, source: 'basis' as const }));
const BASE_IDS = new Set(BASE_RECIPES.map((r) => r.id));
export const isBaseRecipe = (id: string) => BASE_IDS.has(id);

export const enrich = (r: Recipe, catalog: Record<string, Ingredient> = CATALOG): RecipeView => enrichRecipe(r, catalog, blsLookup);

/** Eigene bzw. übernommene Rezepte ohne die berechneten Felder speichern. */
export function toRecipe(r: RecipeView | Recipe): Recipe {
  const { diet, allergens, perServing, grams, nutrientCoverage, meatG, fishG, vegG, ...rest } = r as RecipeView;
  return rest;
}

export const emptyState = () => freshState('Ich', PANTRY);
export const normalize = (s: Partial<HouseholdState>) => normalizeState(s, PANTRY);

/** Liest alles aus dem Gerätespeicher; beim allerersten Start gibt es Beispielangebote zum Ausprobieren. */
export function loadAll() {
  const state = normalize(load<Partial<HouseholdState>>(KEYS.state, emptyState()));
  let offers = load<Offer[] | null>(KEYS.offers, null);
  if (!offers) {
    offers = seedDemoOffers(CATALOG);
    save(KEYS.offers, offers);
  }
  const own = load<Recipe[]>(KEYS.recipes, []).filter((r) => !isBaseRecipe(r.id));
  const device = load<DeviceSettings>(KEYS.device, {});
  const catalog = withCustom(load<Ingredient[]>(KEYS.ingredients, []));
  return {
    device,
    features: featuresFor(device),
    cities: CITIES,
    catalog,
    recipes: [...BASE_RECIPES, ...own].map((r) => enrich(r, catalog)),
    offers,
    state,
    sources: SOURCES,
    blsSource: BLS_SOURCE,
  };
}
