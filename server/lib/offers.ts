import fs from 'node:fs';
import type { Offer } from '../../shared/types';
import { matchIngredient, parsePackGrams } from '../../shared/logic';
import { seedDemoOffers } from '../../shared/demoOffers';
import { readJson, storagePath, uid, writeJson } from './store';
import { getCatalog } from './catalog';
import { config } from './config';

const FILE = storagePath('offers.json');

const seedDemo = (only?: (cityId: string, marketId: string, title: string) => boolean, validFrom?: string, validTo?: string) =>
  seedDemoOffers(getCatalog(), { only, validFrom, validTo });

let offers: Offer[] = fs.existsSync(FILE) ? readJson<Offer[]>(FILE, []) : config.demoOffers ? seedDemo() : [];
if (!fs.existsSync(FILE)) writeJson(FILE, offers);
upgradeStoredOffers();

/**
 * Nach Katalog-Erweiterungen: noch nicht zugeordnete Angebote erneut zuordnen und neue Beispielangebote
 * ergänzen (nur, solange die Beispielangebote nicht entfernt wurden). Mit DEMO_OFFERS=false werden sie entfernt.
 */
function upgradeStoredOffers() {
  const catalog = getCatalog();
  let changed = false;
  for (const o of offers) {
    if (o.ingredientId) continue;
    const id = matchIngredient(`${o.title} ${o.brand ?? ''}`, catalog);
    if (id) {
      o.ingredientId = id;
      changed = true;
    }
  }
  const demo = offers.filter((o) => o.source === 'demo');
  if (!config.demoOffers && demo.length) {
    // Im öffentlichen Betrieb keine erfundenen Angebote zeigen
    offers = offers.filter((o) => o.source !== 'demo');
    changed = true;
  } else if (demo.length) {
    const have = new Set(demo.map((o) => `${o.cityId}|${o.marketId}|${o.title}`));
    const added = seedDemo((c, m, t) => !have.has(`${c}|${m}|${t}`), demo[0].validFrom, demo[0].validTo);
    if (added.length) {
      offers = [...offers, ...added];
      changed = true;
    }
  }
  if (changed) writeJson(FILE, offers);
}

export const getOffers = () => offers;

export function addOffers(list: Omit<Offer, 'id' | 'createdAt'>[]): Offer[] {
  const catalog = getCatalog();
  const created = list.map((o) => ({
    ...o,
    id: uid('o-'),
    packG: o.packG ?? parsePackGrams(o.quantity) ?? parsePackGrams(o.title),
    ingredientId: o.ingredientId && catalog[o.ingredientId] ? o.ingredientId : matchIngredient(`${o.title} ${o.brand ?? ''}`, catalog),
    createdAt: new Date().toISOString(),
  }));
  offers = [...offers, ...created];
  writeJson(FILE, offers);
  return created;
}

export function removeOffers(pred: (o: Offer) => boolean): number {
  const before = offers.length;
  offers = offers.filter((o) => !pred(o));
  writeJson(FILE, offers);
  return before - offers.length;
}

export function updateOffer(id: string, patch: Partial<Offer>): Offer | null {
  const o = offers.find((x) => x.id === id);
  if (!o) return null;
  Object.assign(o, patch);
  writeJson(FILE, offers);
  return o;
}

export function restoreDemo() {
  removeOffers((o) => o.source === 'demo');
  offers = [...offers, ...seedDemo()];
  writeJson(FILE, offers);
}
