import type { FavCategory, Recipe } from './types';

/** Standard-Kategorien für Favoriten. Haushalte können eigene ergänzen oder umbenennen. */
export const DEFAULT_CATEGORIES: FavCategory[] = [
  { id: 'pasta', name: 'Pasta & Nudeln', emoji: '🍝' },
  { id: 'curry', name: 'Currys & Bowls', emoji: '🍛' },
  { id: 'pfanne', name: 'Pfanne & Wok', emoji: '🍳' },
  { id: 'ofen', name: 'Aus dem Ofen', emoji: '🔥' },
  { id: 'suppe', name: 'Suppen & Eintöpfe', emoji: '🍲' },
  { id: 'salat', name: 'Salate & Leichtes', emoji: '🥗' },
  { id: 'fleisch', name: 'Fleisch & Fisch', emoji: '🍗' },
  { id: 'hausmannskost', name: 'Hausmannskost', emoji: '🥔' },
  { id: 'suess', name: 'Süßes & Frühstück', emoji: '🥞' },
  { id: 'sonstiges', name: 'Sonstiges', emoji: '🍽️' },
];

const PASTA = ['spaghetti', 'nudeln', 'vollkornnudeln', 'lasagneplatten', 'gnocchi', 'spaetzle', 'mie_nudeln'];

/** Kategorie eines Rezepts: ausdrücklich gesetzt oder aus Tags, Titel und Zutaten abgeleitet. */
export function recipeCategory(r: Pick<Recipe, 'category' | 'tags' | 'title' | 'ingredients'>): string {
  if (r.category) return r.category;
  const t = r.title.toLowerCase();
  const has = (id: string) => r.ingredients.some((x) => x.i === id);
  if (r.tags.includes('suess') || r.tags.includes('fruehstueck') || /pfannkuchen|waffel|kuchen|porridge|müsli/.test(t)) return 'suess';
  if (r.tags.includes('suppe') || /suppe|eintopf/.test(t)) return 'suppe';
  if (/salat/.test(t)) return 'salat';
  if (PASTA.some(has) || /pasta|nudel|spaghetti|lasagne|gnocchi|spätzle/.test(t)) return 'pasta';
  if (/curry|dal|bowl|chili/.test(t)) return 'curry';
  if (r.tags.includes('ofen') || /ofen|auflauf|gratin|blech/.test(t)) return 'ofen';
  if (r.tags.includes('hausmannskost')) return 'hausmannskost';
  if (/pfanne|wok|gebraten|rührei|omelett|shakshuka/.test(t)) return 'pfanne';
  return 'sonstiges';
}
