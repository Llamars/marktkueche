import type { Offer, RecipeView } from '../../shared/types';
import { AiError, askAI, parseJson, type AiConfig, type AiFile, type AiRequest } from '../../shared/ai';
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
  return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
}

function bytesToBase64(bytes: Uint8Array): string {
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

const PART_BYTES = 9 * 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bei Auslastung (kostenloser Tarif) kurz warten und erneut versuchen. */
async function askPatiently(cfg: AiConfig, req: AiRequest, onProgress?: (text: string) => void): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await askAI(cfg, req);
    } catch (e) {
      const busy = e instanceof AiError && (e.retryable || /high demand|overloaded|try again|429|quota/i.test(e.message));
      if (!busy || attempt === 3) throw e;
      onProgress?.(`KI ausgelastet – neuer Versuch in ${20 * attempt} s …`);
      await sleep(20000 * attempt);
    }
  }
}

/**
 * Prospekt-Fotos oder ganze Prospekt-PDFs auslesen und als Angebote des gewählten Markts speichern.
 * Große PDFs werden auf dem Gerät in Teile zerlegt, Fotos zu Paketen gebündelt; jedes Paket ist eine KI-Anfrage.
 */
export async function readProspect(files: File[], marketId: string, validTo?: string, onProgress?: (text: string) => void): Promise<number> {
  const cfg = config();
  const st = useStore.getState();
  const city = st.cities!.find((c) => c.id === st.state!.settings.cityId)!;
  const market = [...city.markets, ...(st.state!.settings.customMarkets[city.id] ?? [])].find((m) => m.id === marketId);
  const batches: AiFile[][] = [];
  let group: AiFile[] = [];
  let groupBytes = 0;
  for (const f of files) {
    if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      onProgress?.(bytes.length > PART_BYTES ? 'Prospekt wird in Teile zerlegt …' : 'Prospekt wird gelesen …');
      const pieces = bytes.length > PART_BYTES ? await (await import('../../shared/pdfSplit')).splitPdf(bytes, PART_BYTES) : [bytes];
      for (const p of pieces) batches.push([{ mime: 'application/pdf', base64: bytesToBase64(p), name: f.name }]);
    } else {
      const blob = await shrinkImage(f);
      if (group.length && groupBytes + blob.size > PART_BYTES) {
        batches.push(group);
        group = [];
        groupBytes = 0;
      }
      group.push({ mime: blob.type || f.type, base64: await toBase64(blob), name: f.name });
      groupBytes += blob.size;
    }
  }
  if (group.length) batches.push(group);

  const today = isoDate(new Date());
  const task = offersTask({ market: market?.name ?? marketId, city: city.name, currency: city.currency, today, catalog: st.catalog! });
  const seen = new Set<string>();
  const found: ReturnType<typeof readOffers> = [];
  let lastError: unknown = null;
  for (const [k, files] of batches.entries()) {
    onProgress?.(batches.length > 1 ? `Teil ${k + 1} von ${batches.length} wird gelesen …` : 'Angebote werden gelesen …');
    try {
      const text = await askPatiently(cfg, { ...task, prompt: batches.length > 1 ? `Teil ${k + 1} von ${batches.length}.\n${task.prompt}` : task.prompt, files }, onProgress);
      for (const o of readOffers(parseJson(text), st.catalog!)) {
        const id = `${o.title.toLowerCase()}|${o.price}`;
        if (!seen.has(id)) {
          seen.add(id);
          found.push(o);
        }
      }
    } catch (e) {
      // Ein gescheiterter Teil soll die übrigen nicht verwerfen
      lastError = e;
    }
  }
  if (!found.length && lastError) throw lastError;
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
