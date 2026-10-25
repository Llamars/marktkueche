import path from 'node:path';
import type { Recipe, RecipeView } from '../../shared/types';
import { enrichRecipe, expandRecipe } from '../../shared/recipes';
import { readJson, ROOT } from './store';
import { getCatalog } from './catalog';
import { BLS_BY_CODE } from './bls';
import { db } from './db';

const BASE: Recipe[] = ['recipes.json', 'recipes-familien.json', 'recipes-mehr.json', 'recipes-fruehstueck.json']
  .flatMap((f) => readJson<{ recipes: Recipe[] }>(path.join(ROOT, 'shared', 'data', f), { recipes: [] }).recipes)
  .flatMap(expandRecipe)
  .map((r) => ({ ...r, source: 'basis' as const }));

const blsLookup = (code: string) => BLS_BY_CODE.get(code)?.n;

export function enrich(r: Recipe, catalog = getCatalog()): RecipeView {
  return enrichRecipe(r, catalog, blsLookup);
}

// ------------------------------------------------------------ Eigene Rezepte je Haushalt

function householdRecipes(householdId: string): Recipe[] {
  const rows = db.prepare('SELECT json FROM recipes WHERE household_id = ? ORDER BY created_at').all(householdId) as { json: string }[];
  return rows.map((r) => JSON.parse(r.json) as Recipe);
}

export function allRecipes(householdId: string): RecipeView[] {
  const catalog = getCatalog();
  return [...BASE, ...householdRecipes(householdId)].map((r) => enrich(r, catalog));
}

export function baseRecipeCount() {
  return { variants: BASE.length, families: new Set(BASE.map((r) => r.family ?? r.id)).size };
}

export function addRecipe(householdId: string, r: Recipe) {
  db.prepare('INSERT OR REPLACE INTO recipes (id, household_id, json, created_at) VALUES (?, ?, ?, ?)').run(
    r.id, householdId, JSON.stringify(r), r.createdAt ?? new Date().toISOString(),
  );
}

export function getHouseholdRecipe(householdId: string, id: string): Recipe | undefined {
  const row = db.prepare('SELECT json FROM recipes WHERE id = ? AND household_id = ?').get(id, householdId) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as Recipe) : undefined;
}

export function deleteRecipe(householdId: string, id: string): boolean {
  const res = db.prepare('DELETE FROM recipes WHERE id = ? AND household_id = ?').run(id, householdId);
  return Number(res.changes) > 0;
}
