import type { HouseholdState, Settings } from './types';
import { CITIES } from './cities';
import { DEFAULT_CATEGORIES } from './categories';

/** Startzustand; `pantry` sind die Zutaten, die man meist im Vorrat hat. */
export function defaultSettings(ownerName: string, pantry: string[]): Settings {
  return {
    cityId: 'freiburg',
    marketIds: Object.fromEntries(CITIES.map((c) => [c.id, c.markets.map((m) => m.id)])),
    customMarkets: {},
    shopFocus: {},
    people: [{ id: 'p1', name: ownerName, sex: 'w', age: 35, pal: 1.6, emoji: '🧑' }],
    diet: 'alles',
    allergies: [],
    dislikes: [],
    maxTimeWeekday: 35,
    maxTimeWeekend: 90,
    pantry,
    nutrientRef: 'person',
    mealsPerDay: 3,
    onboarded: false,
  };
}

export function freshState(ownerName: string, pantry: string[]): HouseholdState {
  return {
    settings: defaultSettings(ownerName, pantry),
    plan: [],
    checked: {},
    checkedBy: {},
    buyAnyway: {},
    extras: [],
    favorites: {},
    favCategories: DEFAULT_CATEGORIES,
    ratings: {},
    cooked: {},
    updatedAt: new Date().toISOString(),
  };
}

/** Ergänzt Felder, die ältere gespeicherte Zustände noch nicht haben. */
export function normalizeState(s: Partial<HouseholdState> & { favorites?: unknown }, pantry: string[]): HouseholdState {
  const f = freshState(s.settings?.people?.[0]?.name ?? 'Ich', pantry);
  const favorites = Array.isArray(s.favorites)
    ? Object.fromEntries((s.favorites as string[]).map((id) => [id, 'sonstiges']))
    : ((s.favorites as Record<string, string>) ?? {});
  return { ...f, ...s, favorites, settings: { ...f.settings, ...s.settings } } as HouseholdState;
}
