import type { Offer, RecipeView } from '../../shared/types';
import { AiError, askAI, parseJson } from '../../shared/ai';
import { ideasTask, offersTask, readOffers, readRecipe, recipeTask } from '../../shared/aiTasks';
import { fitsPrefs, isoDate } from '../../shared/logic';
import { useStore } from '../store';

/** KI-Funktionen direkt in der App, mit dem auf dem Gerät hinterlegten Schlüssel (Gemini kostenlos, Claude oder OpenAI). */

function config() {
  const ai = useStore.getState().device.ai;
  if (!ai?.apiKey?.trim()) throw new AiError('Bitte zuerst unter Profil → KI einen Schlüssel eintragen.');
  return ai;
}

async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Handyfotos verkleinern: spart Übertragung und bleibt im Rahmen des kostenlosen Tarifs. */
async function shrinkImage(file: File, maxSide = 2000): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 3_000_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

/** Rezept von einer Webseite (Chefkoch, Instagram …) oder aus eingefügtem Text übernehmen. */
export async function importRecipe(input: { url?: string; text?: string }): Promise<RecipeView> {
  const cfg = config();
  const st = useStore.getState();
  const text = await askAI(cfg, recipeTask(st.catalog!, input));
  const res = readRecipe(parseJson(text), st.catalog!, { sourceUrl: input.url, source: 'import' });
  if (!res) {
    throw new AiError(input.url
      ? 'Auf der Seite wurde kein Rezept gefunden. Bei Instagram bitte die Bildunterschrift kopieren und als Text einfügen.'
      : 'Im Text wurde kein Rezept gefunden.');
  }
  if (res.newIngredients.length) st.addIngredients(res.newIngredients);
  st.upsertRecipes([res.recipe]);
  return useStore.getState().recipes!.find((r) => r.id === res.recipe.id)!;
}

/** Prospekt-Fotos oder ein PDF auslesen und als Angebote des gewählten Markts speichern. */
export async function readProspect(files: File[], marketId: string, validTo?: string): Promise<number> {
  const cfg = config();
  const st = useStore.getState();
  const city = st.cities!.find((c) => c.id === st.state!.settings.cityId)!;
  const market = [...city.markets, ...(st.state!.settings.customMarkets[city.id] ?? [])].find((m) => m.id === marketId);
  const parts = [];
  for (const f of files) {
    const blob = f.type.startsWith('image/') ? await shrinkImage(f) : f;
    if (blob.size > 15 * 1024 * 1024) throw new AiError(`„${f.name}“ ist zu groß. Bitte Fotos einzelner Seiten nehmen.`);
    parts.push({ mime: blob.type || f.type, base64: await toBase64(blob), name: f.name });
  }
  const today = isoDate(new Date());
  const text = await askAI(cfg, {
    ...offersTask({ market: market?.name ?? marketId, city: city.name, currency: city.currency, today, catalog: st.catalog! }),
    files: parts,
  });
  const found = readOffers(parseJson(text), st.catalog!);
  const now = new Date().toISOString();
  const offers: Offer[] = found.map((o, k) => ({
    ...o,
    id: `upload-${Date.now().toString(36)}-${k}`,
    cityId: city.id,
    marketId,
    validFrom: o.validFrom ?? today,
    validTo: validTo || o.validTo,
    source: 'upload',
    createdAt: now,
  }));
  st.setOffers([...(st.offers ?? []), ...offers]);
  return offers.length;
}

/** Neue Abendessen passend zu den aktuellen Angeboten und Vorlieben. */
export async function generateIdeas(count: number, wish?: string, offerTitles: string[] = []): Promise<RecipeView[]> {
  const cfg = config();
  const st = useStore.getState();
  const s = st.state!.settings;
  const text = await askAI(cfg, ideasTask({
    count,
    wish,
    offers: offerTitles.slice(0, 40),
    diet: s.diet,
    avoid: s.dislikes.map((id) => st.catalog![id]?.name ?? id),
    maxTime: s.maxTimeWeekday,
    kids: s.people.some((p) => p.age < 14),
    existing: (st.recipes ?? []).map((r) => r.title),
    catalog: st.catalog!,
  }));
  const list = (parseJson<{ recipes?: unknown[] }>(text).recipes ?? []).flatMap((x) => {
    const res = readRecipe(x, st.catalog!, { source: 'ki' });
    return res ? [res.recipe] : [];
  });
  st.upsertRecipes(list);
  const ids = new Set(list.map((r) => r.id));
  const views = useStore.getState().recipes!.filter((r) => ids.has(r.id));
  // Passt etwas nicht zu den Vorlieben (z. B. Allergie), gleich wieder entfernen
  for (const v of views) if (!fitsPrefs(v, s)) await st.removeRecipe(v.id);
  return views.filter((v) => fitsPrefs(v, s));
}
