import path from 'node:path';
import type { Ingredient } from '../../shared/types';
import { readJson, ROOT, storagePath, writeJson } from './store';
import { BLS_BY_CODE, searchBls } from './bls';

const base = readJson<{ items: Ingredient[] }>(path.join(ROOT, 'shared', 'data', 'ingredients.json'), { items: [] }).items;
const CUSTOM_FILE = storagePath('custom-ingredients.json');
let custom = readJson<Ingredient[]>(CUSTOM_FILE, []);

export function getCatalog(): Record<string, Ingredient> {
  const out: Record<string, Ingredient> = {};
  for (const i of base) out[i.id] = i;
  for (const i of custom) out[i.id] = i;
  return out;
}

export const baseCatalogList = () => base;

/** Legt (falls nötig) eine Zutat aus dem BLS an, z. B. für importierte Rezepte. */
export function ensureBlsIngredient(name: string, blsCode?: string | null): Ingredient | null {
  const food = blsCode ? BLS_BY_CODE.get(blsCode) : searchBls(name, 1)[0];
  if (!food) return null;
  const id = `bls-${food.code}`;
  const existing = custom.find((c) => c.id === id);
  if (existing) return existing;
  const ing: Ingredient = {
    id,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    bls: food.code,
    aisle: guessAisle(food.code),
    units: { stk: 100, el: 12, tl: 5, prise: 0.4 },
    pack: { g: 250, label: 'Packung', price: null },
    custom: true,
    animal: guessAnimal(food.code),
    allergens: [],
  };
  custom.push(ing);
  writeJson(CUSTOM_FILE, custom);
  return ing;
}

// Hauptgruppen des BLS-Schlüssels (1. Stelle)
function guessAisle(code: string): Ingredient['aisle'] {
  const c = code[0];
  if (code.startsWith('E1')) return 'kuehl';
  if ('GFK'.includes(c)) return 'gemuese';
  if ('MQ'.includes(c)) return 'kuehl';
  if ('UVWT'.includes(c)) return 'fleisch';
  if ('BCDE'.includes(c)) return c === 'B' ? 'brot' : 'trocken';
  if ('R'.includes(c)) return 'gewuerze';
  return 'sonstiges';
}

function guessAnimal(code: string): Ingredient['animal'] | undefined {
  const c = code[0];
  if ('UVW'.includes(c)) return 'meat';
  if (c === 'T') return 'fish';
  if (c === 'M') return 'dairy';
  if (c === 'E' && code.startsWith('E1')) return 'egg';
  return undefined;
}
