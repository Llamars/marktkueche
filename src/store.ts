import { create } from 'zustand';
import type { CartExtra, City, FavCategory, Features, HouseholdState, Ingredient, Offer, PlanEntry, Recipe, RecipeView, Settings } from '../shared/types';
import type { SourceRef } from '../shared/references';
import { fitToWeek, keepExtra, matchIngredient, offerIngredient, parsePackGrams } from '../shared/logic';
import { seedDemoOffers } from '../shared/demoOffers';
import { isSealed, unseal } from '../shared/crypto';
import { enrich, featuresFor, isBaseRecipe, loadAll, normalize, toRecipe, withCustom, type DeviceSettings } from './local/data';
import { isOwnKey, KEYS, load, requestPersistence, save } from './local/storage';
import type { SharePackage } from './lib/share';

/** Stand des wöchentlichen Abrufs (scripts/angebote-abrufen.ts), liegt als daten/status.json neben der App */
export interface FetchStatus {
  updatedAt: string;
  provider: string | null;
  sources: {
    id: string; label: string; cityId: string; cityIds?: string[]; marketId: string; ok: boolean; count: number;
    validFrom?: string; validTo?: string; note?: string;
  }[];
}

export interface RemoteOffers {
  /** none = kein automatischer Abruf eingerichtet, locked = Familien-Schlüssel fehlt, wrong = Schlüssel passt nicht */
  state: 'loading' | 'none' | 'locked' | 'wrong' | 'ok';
  status?: FetchStatus;
  count?: number;
}

interface Toast {
  id: number;
  text: string;
  action?: { label: string; to: string };
}

/** Komplette Datensicherung eines Geräts (Datei-Export/-Import). */
export interface Backup {
  app: 'marktkueche';
  version: 1;
  exportedAt: string;
  state: HouseholdState;
  offers: Offer[];
  recipes: Recipe[];
  /** eigene Zutaten aus importierten Rezepten */
  ingredients?: Ingredient[];
}

interface Store {
  ready: boolean;
  device: DeviceSettings;
  remote: RemoteOffers;
  features?: Features;
  cities?: City[];
  catalog?: Record<string, Ingredient>;
  recipes?: RecipeView[];
  offers?: Offer[];
  state?: HouseholdState;
  sources?: SourceRef[];
  blsSource?: string;
  toasts: Toast[];
  /** Geteiltes Paket aus einem Link, das gerade zum Übernehmen angeboten wird */
  incoming: SharePackage | null;
  start: () => void;
  toast: (text: string, action?: Toast['action']) => void;
  dismissToast: (id: number) => void;
  setSettings: (patch: Partial<Settings>) => Promise<void>;
  setPlan: (plan: PlanEntry[]) => Promise<void>;
  addToPlan: (entries: PlanEntry[]) => Promise<void>;
  removeFromPlan: (id: string) => Promise<void>;
  toggleCheck: (key: string) => Promise<void>;
  clearChecked: () => Promise<void>;
  setBuyAnyway: (id: string, value: boolean) => Promise<void>;
  setExtras: (x: CartExtra[]) => Promise<void>;
  setFavorite: (id: string, categoryId: string | null) => Promise<void>;
  setFavCategories: (c: FavCategory[]) => Promise<void>;
  rate: (id: string, value: 1 | -1 | 0) => Promise<void>;
  markCooked: (id: string) => Promise<void>;
  setOffers: (o: Offer[]) => void;
  addOffer: (o: Partial<Offer>) => Offer;
  deleteOffer: (id: string) => void;
  clearOffers: (f: { source?: Offer['source']; cityId?: string }) => void;
  loadDemoOffers: () => void;
  upsertRecipes: (r: (RecipeView | Recipe)[]) => void;
  removeRecipe: (id: string) => Promise<void>;
  exportBackup: () => Backup;
  restoreBackup: (b: Backup) => void;
  setIncoming: (p: SharePackage | null) => void;
  setDevice: (patch: Partial<DeviceSettings>) => void;
  syncRemote: () => Promise<void>;
  addIngredients: (list: Ingredient[]) => void;
}

let toastId = 0;

export const useStore = create<Store>((set, get) => {
  function warnIfNotSaved(ok: boolean) {
    if (!ok) get().toast('Speichern auf diesem Gerät fehlgeschlagen – ist der Speicher voll oder ein privates Fenster offen?');
  }

  /** Ändert den Zustand und speichert ihn sofort auf dem Gerät. */
  async function mutate(fn: (s: HouseholdState) => HouseholdState) {
    const prev = get().state;
    if (!prev) return;
    const next = { ...fn(structuredClone(prev)), updatedAt: new Date().toISOString() };
    set({ state: next });
    warnIfNotSaved(save(KEYS.state, next));
  }

  function storeOffers(offers: Offer[]) {
    set({ offers });
    warnIfNotSaved(save(KEYS.offers, offers));
  }

  function storeOwnRecipes(recipes: RecipeView[]) {
    set({ recipes });
    warnIfNotSaved(save(KEYS.recipes, recipes.filter((r) => !isBaseRecipe(r.id)).map(toRecipe)));
  }

  const myName = () => get().state?.settings.people[0]?.name ?? '';

  return {
    ready: false,
    device: {},
    remote: { state: 'loading' },
    toasts: [],
    incoming: null,

    start() {
      set({ ...loadAll(), ready: true });
      requestPersistence();
      get().syncRemote();
      // Mehrere offene Tabs auf demselben Gerät aktuell halten
      window.addEventListener('storage', (e) => {
        if (isOwnKey(e.key)) set({ ...loadAll() });
      });
    },

    toast(text, action) {
      const id = ++toastId;
      set({ toasts: [...get().toasts, { id, text, action }] });
      setTimeout(() => get().dismissToast(id), 4200);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    setSettings: (patch) => mutate((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    setPlan: (plan) => mutate((s) => ({ ...s, plan })),
    addToPlan: (entries) => {
      const plan = [...get().state!.plan.filter((p) => !entries.some((e) => e.id === p.id)), ...entries];
      return get().setPlan(plan);
    },
    removeFromPlan: (id) => get().setPlan(get().state!.plan.filter((p) => p.id !== id)),
    toggleCheck: (key) =>
      mutate((s) => {
        if (s.checked[key]) {
          delete s.checked[key];
          delete s.checkedBy[key];
        } else {
          s.checked[key] = true;
          s.checkedBy[key] = myName();
        }
        return s;
      }),
    clearChecked: () => mutate((s) => ({ ...s, extras: s.extras.filter((e) => keepExtra(e, s.checked)), checked: {}, checkedBy: {} })),
    setBuyAnyway: (id, value) =>
      mutate((s) => {
        if (value) s.buyAnyway[id] = true;
        else delete s.buyAnyway[id];
        return s;
      }),
    setExtras: (x) => mutate((s) => ({ ...s, extras: x })),
    setFavorite: (id, categoryId) =>
      mutate((s) => {
        if (categoryId) s.favorites[id] = categoryId;
        else delete s.favorites[id];
        return s;
      }),
    setFavCategories: (c) => mutate((s) => ({ ...s, favCategories: c })),
    rate: (id, value) =>
      mutate((s) => {
        if (value) s.ratings[id] = value;
        else delete s.ratings[id];
        return s;
      }),
    markCooked: (id) => mutate((s) => ({ ...s, cooked: { ...s.cooked, [id]: new Date().toISOString() } })),

    setOffers: storeOffers,
    addOffer(o) {
      const title = o.title?.trim() ?? '';
      const created: Offer = {
        id: `o-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        cityId: o.cityId ?? get().state!.settings.cityId,
        marketId: o.marketId ?? '',
        title,
        price: Number(o.price) || 0,
        quantity: o.quantity?.trim() || undefined,
        packG: o.packG ?? parsePackGrams(o.quantity) ?? parsePackGrams(title),
        regularPrice: o.regularPrice,
        validFrom: o.validFrom,
        validTo: o.validTo || undefined,
        ingredientId: o.ingredientId && get().catalog![o.ingredientId] ? o.ingredientId : matchIngredient(title, get().catalog!),
        source: 'manual',
        createdAt: new Date().toISOString(),
      };
      storeOffers([...(get().offers ?? []), created]);
      return created;
    },
    deleteOffer: (id) => storeOffers((get().offers ?? []).filter((o) => o.id !== id)),
    clearOffers: ({ source, cityId }) =>
      storeOffers((get().offers ?? []).filter((o) => !((!source || o.source === source) && (!cityId || o.cityId === cityId)))),
    loadDemoOffers: () => storeOffers([...(get().offers ?? []).filter((o) => o.source !== 'demo'), ...seedDemoOffers(get().catalog!)]),

    upsertRecipes(list) {
      const views = list.map((r) => enrich(toRecipe(r), get().catalog));
      const ids = new Set(views.map((r) => r.id));
      storeOwnRecipes([...(get().recipes ?? []).filter((r) => !ids.has(r.id)), ...views]);
    },
    async removeRecipe(id) {
      storeOwnRecipes((get().recipes ?? []).filter((r) => r.id !== id));
      const plan = get().state!.plan.filter((p) => p.recipeId !== id);
      if (plan.length !== get().state!.plan.length) await get().setPlan(plan);
    },

    exportBackup: () => ({
      app: 'marktkueche',
      version: 1,
      exportedAt: new Date().toISOString(),
      state: get().state!,
      offers: get().offers ?? [],
      recipes: (get().recipes ?? []).filter((r) => !isBaseRecipe(r.id)).map(toRecipe),
      ingredients: load<Ingredient[]>(KEYS.ingredients, []),
    }),
    restoreBackup(b) {
      const ok = save(KEYS.state, normalize(b.state)) && save(KEYS.offers, b.offers ?? []) && save(KEYS.recipes, b.recipes ?? []) &&
        save(KEYS.ingredients, b.ingredients ?? []);
      warnIfNotSaved(ok);
      set({ ...loadAll() });
    },

    setIncoming: (incoming) => set({ incoming }),

    setDevice(patch) {
      const device = { ...get().device, ...patch };
      set({ device, features: featuresFor(device) });
      warnIfNotSaved(save(KEYS.device, device));
    },

    /** Holt die verschlüsselten Angebote des wöchentlichen Abrufs und ersetzt damit die bisherigen automatischen Angebote. */
    async syncRemote() {
      const base = import.meta.env.BASE_URL;
      let status: FetchStatus | undefined;
      try {
        const res = await fetch(`${base}daten/status.json`, { cache: 'no-cache' });
        if (res.ok && res.headers.get('content-type')?.includes('json')) status = (await res.json()) as FetchStatus;
      } catch {
        /* offline oder kein Abruf eingerichtet */
      }
      if (!status) return set({ remote: { state: 'none' } });
      const key = get().device.familyKey;
      if (!key) return set({ remote: { state: 'locked', status } });
      try {
        const box = await (await fetch(`${base}daten/angebote.json`, { cache: 'no-cache' })).json();
        if (!isSealed(box)) throw new Error();
        const catalog = get().catalog!;
        // Zuordnung und Gültigkeit hier noch einmal prüfen – so wirken Verbesserungen auch für bereits veröffentlichte Angebote
        const list = (await unseal<Offer[]>(box, key)).map((o) => {
          const src = status!.sources.find((x) => x.id === o.sourceId);
          return fitToWeek({ ...o, ingredientId: offerIngredient(`${o.title} ${o.brand ?? ''}`, o.ingredientId, catalog) }, src ?? {});
        });
        // Sobald echte Angebote für eine Stadt da sind, verschwinden dort die erfundenen Beispiele
        const real = new Set(list.map((o) => o.cityId));
        storeOffers([...(get().offers ?? []).filter((o) => o.source !== 'auto' && !(o.source === 'demo' && real.has(o.cityId))), ...list]);
        set({ remote: { state: 'ok', status, count: list.length } });
      } catch {
        set({ remote: { state: 'wrong', status } });
      }
    },

    addIngredients(list) {
      const custom = [...load<Ingredient[]>(KEYS.ingredients, []).filter((i) => !list.some((n) => n.id === i.id)), ...list];
      warnIfNotSaved(save(KEYS.ingredients, custom));
      set({ catalog: withCustom(custom) });
    },
  };
});

/** Für Hinweise wie „abgehakt von …“ und als Absender geteilter Links. */
export const useMyName = () => useStore((s) => s.state?.settings.people[0]?.name ?? '');
