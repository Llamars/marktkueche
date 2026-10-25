import type { Ingredient, MealSlot, Recipe } from '../../shared/types';

/**
 * Teilen ohne Server: Rezepte und Einkaufslisten stecken komprimiert im Link (hinter „#“, damit sie nie an einen
 * Webserver gehen). Wer den Link öffnet, sieht eine Vorschau und übernimmt, was er möchte, in die eigenen Daten.
 */
export interface SharePackage {
  v: 1;
  kind: 'rezept' | 'einkauf';
  /** Name der Person, die teilt */
  from?: string;
  /** Eigene Rezepte vollständig; Grundrezepte hat jede Marktküche selbst und reisen nur als Kennung mit */
  recipes: Recipe[];
  plan: SharedMeal[];
  items: SharedItem[];
  /** eigene Zutaten (aus importierten Rezepten), die in den geteilten Rezepten vorkommen */
  ingredients?: Ingredient[];
}

/** Ein geplantes Gericht: Rezept-ID, Datum (optional), Mahlzeit und Portionen */
export interface SharedMeal {
  r: string;
  d?: string;
  s: MealSlot;
  n: number;
}

/** Ein Artikel der Einkaufsliste: Katalogzutat (i) mit Packungen oder freier Text */
export interface SharedItem {
  i?: string;
  name: string;
  packs?: number;
}

const PARAM = 'teilen';

function toB64url(bytes: Uint8Array) {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** „z…“ = komprimiert, „j…“ = unkomprimiert (Browser ohne CompressionStream). */
export async function encodeShare(p: SharePackage): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(p));
  if (typeof CompressionStream !== 'undefined') return 'z' + toB64url(await pipe(raw, new CompressionStream('deflate-raw')));
  return 'j' + toB64url(raw);
}

export async function decodeShare(code: string): Promise<SharePackage | null> {
  try {
    const bytes = fromB64url(code.slice(1));
    const raw = code[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    return sanitize(JSON.parse(new TextDecoder().decode(raw)));
  } catch {
    return null;
  }
}

export async function shareUrl(p: SharePackage): Promise<string> {
  return `${location.origin}${import.meta.env.BASE_URL}#${PARAM}=${await encodeShare(p)}`;
}

/** Findet den Code in einem eingefügten Link (oder nimmt den Code selbst). */
export function extractShareCode(text: string): string | null {
  const t = text.trim();
  const m = t.match(new RegExp(`[#&?]${PARAM}=([zj][A-Za-z0-9_-]+)`));
  if (m) return m[1];
  return /^[zj][A-Za-z0-9_-]{16,}$/.test(t) ? t : null;
}

/** Über das Teilen-Menü des Handys senden, sonst in die Zwischenablage kopieren. */
export async function sendLink(url: string, title: string, text: string): Promise<'geteilt' | 'kopiert' | 'abgebrochen'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'geteilt';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'abgebrochen';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'kopiert';
  } catch {
    // Ohne Zugriff auf die Zwischenablage: Link zum Kopieren anzeigen
    prompt('Link kopieren und weiterschicken:', url);
    return 'abgebrochen';
  }
}

// ------------------------------------------------------------ Prüfen, was ankommt (Links können verändert sein)

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);
const SLOTS: MealSlot[] = ['frueh', 'mittag', 'abend'];

function sanitizeRecipe(x: unknown): Recipe | null {
  const r = x as Recipe;
  if (!r || !str(r.id) || !str(r.title) || !Array.isArray(r.ingredients) || !Array.isArray(r.steps)) return null;
  return {
    id: str(r.id, 120)!,
    title: str(r.title, 160)!,
    teaser: str(r.teaser, 400) ?? '',
    time: num(r.time, 1, 1440) ?? 30,
    active: num(r.active, 0, 1440),
    servings: num(r.servings, 1, 50) ?? 4,
    tags: Array.isArray(r.tags) ? r.tags.map((t) => str(t, 40)).filter((t): t is string => !!t).slice(0, 10) : [],
    category: str(r.category, 40),
    // Nur sichere Bildadressen übernehmen
    image: typeof r.image === 'string' && r.image.startsWith('https://') ? r.image : null,
    imageCredit: str(r.imageCredit, 80),
    ingredients: r.ingredients.slice(0, 60).map((i) => ({ i: str(i.i, 80) ?? '', q: num(i.q, 0, 100000) ?? 0, u: str(i.u, 20) ?? 'g', note: str(i.note, 200), raw: str(i.raw, 200) })),
    steps: r.steps.slice(0, 40).map((s) => ({ t: str(s.t, 1000) ?? '', min: num(s.min, 0, 1440) })),
    source: r.source === 'ki' ? 'ki' : 'import',
    sourceUrl: typeof r.sourceUrl === 'string' && r.sourceUrl.startsWith('https://') ? r.sourceUrl : undefined,
  };
}

function sanitizeIngredient(x: unknown): Ingredient | null {
  const i = x as Ingredient;
  if (!str(i?.id)?.startsWith('eigen-') || !str(i.name)) return null;
  return {
    id: str(i.id, 80)!, name: str(i.name, 80)!, bls: null, aisle: 'sonstiges',
    units: { stk: 100, el: 12, tl: 5, prise: 0.4 }, pack: { g: 250, label: 'Packung', price: null }, custom: true,
  };
}

function sanitize(x: unknown): SharePackage | null {
  const p = x as SharePackage;
  if (!p || p.v !== 1 || (p.kind !== 'rezept' && p.kind !== 'einkauf')) return null;
  return {
    v: 1,
    kind: p.kind,
    from: str(p.from, 60),
    recipes: (Array.isArray(p.recipes) ? p.recipes : []).slice(0, 30).map(sanitizeRecipe).filter((r): r is Recipe => !!r),
    plan: (Array.isArray(p.plan) ? p.plan : []).slice(0, 60).flatMap((m) =>
      str(m?.r) ? [{ r: str(m.r, 120)!, d: /^\d{4}-\d{2}-\d{2}$/.test(m.d ?? '') ? m.d : undefined, s: SLOTS.includes(m.s) ? m.s : 'abend', n: num(m.n, 0.5, 50) ?? 2 }] : [],
    ),
    items: (Array.isArray(p.items) ? p.items : []).slice(0, 150).flatMap((it) =>
      str(it?.name) ? [{ i: str(it.i, 80), name: str(it.name, 120)!, packs: num(it.packs, 1, 50) }] : [],
    ),
    ingredients: (Array.isArray(p.ingredients) ? p.ingredients : []).slice(0, 100).map(sanitizeIngredient).filter((i): i is Ingredient => !!i),
  };
}

/** Eigene Zutaten, die in diesen Rezepten vorkommen (für den Empfänger, der sie noch nicht kennt). */
export function customIngredientsOf(recipes: Recipe[], catalog: Record<string, Ingredient>): Ingredient[] {
  const ids = new Set(recipes.flatMap((r) => r.ingredients.map((x) => x.i)));
  return [...ids].map((id) => catalog[id]).filter((i): i is Ingredient => !!i?.custom);
}
