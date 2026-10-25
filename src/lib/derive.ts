import { useMemo } from 'react';
import type { City, Market, RecipeView } from '../../shared/types';
import { bestOffers, buildCart, fitsPrefs, householdPortions, isoDate, scoreRecipes, weekDates } from '../../shared/logic';
import { useStore } from '../store';

export const today = () => isoDate(new Date());

export function useCity(): City {
  const cities = useStore((s) => s.cities)!;
  const settings = useStore((s) => s.state!.settings);
  return useMemo(() => {
    const c = cities.find((x) => x.id === settings.cityId) ?? cities[0];
    return { ...c, markets: [...c.markets, ...(settings.customMarkets[c.id] ?? [])] };
  }, [cities, settings.cityId, settings.customMarkets]);
}

export function useSelectedMarkets(): Market[] {
  const city = useCity();
  const ids = useStore((s) => s.state!.settings.marketIds[city.id]);
  return useMemo(() => city.markets.filter((m) => (ids ?? []).includes(m.id)), [city, ids]);
}

/** Märkte, in denen tatsächlich eingekauft wird („Einkaufen bei“); ohne Auswahl alle gewählten Märkte. */
export function useShopMarkets(): Market[] {
  const selected = useSelectedMarkets();
  const city = useCity();
  const focus = useStore((s) => s.state!.settings.shopFocus?.[city.id]);
  return useMemo(() => {
    const f = (focus ?? []).filter((id) => selected.some((m) => m.id === id));
    return f.length ? selected.filter((m) => f.includes(m.id)) : selected;
  }, [selected, focus]);
}

export function useOfferMap() {
  const offers = useStore((s) => s.offers)!;
  const catalog = useStore((s) => s.catalog)!;
  const city = useCity();
  const markets = useShopMarkets();
  return useMemo(
    () => bestOffers(offers, catalog, city.id, markets.map((m) => m.id), today()),
    [offers, catalog, city.id, markets],
  );
}

export function useRecipesById(): Record<string, RecipeView> {
  const recipes = useStore((s) => s.recipes)!;
  return useMemo(() => Object.fromEntries(recipes.map((r) => [r.id, r])), [recipes]);
}

export function useScored() {
  const recipes = useStore((s) => s.recipes)!;
  const st = useStore((s) => s.state)!;
  const catalog = useStore((s) => s.catalog)!;
  const offers = useOfferMap();
  const city = useCity();
  const seed = weekDates(0)[0];
  return useMemo(
    () => scoreRecipes(recipes.filter((r) => fitsPrefs(r, st.settings)), st, catalog, offers, city, seed),
    [recipes, st, catalog, offers, city, seed],
  );
}

export function usePortions() {
  const settings = useStore((s) => s.state!.settings);
  return useMemo(() => householdPortions(settings), [settings]);
}

/** Einkaufswagen: alle ausgewählten Rezepte ab heute */
export function useCart() {
  const st = useStore((s) => s.state)!;
  const catalog = useStore((s) => s.catalog)!;
  const byId = useRecipesById();
  const offers = useOfferMap();
  const city = useCity();
  return useMemo(() => {
    const plan = st.plan.filter((p) => p.date >= today());
    const lines = buildCart(plan, byId, catalog, offers, city, st.settings.pantry, st.buyAnyway, st.extras);
    return { plan, lines };
  }, [st, catalog, byId, offers, city]);
}

export function useCartCount() {
  const { lines } = useCart();
  const st = useStore((s) => s.state)!;
  return lines.filter((l) => !l.pantry && !st.checked[l.key]).length + st.extras.filter((e) => !e.ingredientId && !st.checked[`x:${e.id}`]).length;
}

export function unsplash(src: string | null | undefined, w: number) {
  if (!src) return undefined;
  if (src.startsWith('https://images.unsplash.com/')) return `${src}?auto=format&fit=crop&w=${w}&q=70`;
  return src;
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WDL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export function dayLabel(date: string, long = false) {
  const d = new Date(date + 'T12:00:00');
  const t = today();
  const tm = new Date();
  tm.setDate(tm.getDate() + 1);
  if (date === t) return 'Heute';
  if (date === isoDate(tm)) return 'Morgen';
  return `${(long ? WDL : WD)[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`;
}
export const shortDay = (date: string) => WD[new Date(date + 'T12:00:00').getDay()];
