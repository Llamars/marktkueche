import type { Ingredient } from './types';

const BASE: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000 };

export const UNIT_LABEL: Record<string, [string, string]> = {
  g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['l', 'l'],
  stk: ['', ''], el: ['EL', 'EL'], tl: ['TL', 'TL'], prise: ['Prise', 'Prisen'],
  zehe: ['Zehe', 'Zehen'], bund: ['Bund', 'Bund'], dose: ['Dose', 'Dosen'], pck: ['Päckchen', 'Päckchen'],
  scheibe: ['Scheibe', 'Scheiben'], kugel: ['Kugel', 'Kugeln'], stange: ['Stange', 'Stangen'], topf: ['Topf', 'Töpfe'],
  becher: ['Becher', 'Becher'], schale: ['Schale', 'Schalen'], stueck: ['Stück', 'Stück'], platte: ['Platte', 'Platten'],
  nest: ['Nest', 'Nester'], knolle: ['Knolle', 'Knollen'],
};

/** Grobe Gramm-Werte, falls für eine Zutat keine eigene Umrechnung hinterlegt ist. */
export const GENERIC_G: Record<string, number> = {
  stk: 100, el: 12, tl: 5, prise: 0.4, zehe: 4, bund: 30, dose: 400, pck: 10, becher: 200, scheibe: 40,
  kugel: 125, stange: 250, topf: 25, schale: 250, stueck: 50, platte: 20, nest: 60, knolle: 50,
};

/** Gramm für eine Mengenangabe. Unbekannte Einheiten → null. */
export function toGrams(ing: Ingredient | undefined, q: number, u: string): number | null {
  if (!ing) return BASE[u] != null ? q * BASE[u] : null;
  const per = ing.units[u] ?? (u === 'l' && ing.units.ml ? ing.units.ml * 1000 : undefined) ?? BASE[u] ?? GENERIC_G[u];
  return per != null ? q * per : null;
}

const FRACTIONS: [number, string][] = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];

export function fmtNumber(q: number): string {
  if (q >= 10) return String(Math.round(q));
  const whole = Math.floor(q);
  const frac = q - whole;
  for (const [v, s] of FRACTIONS) {
    if (Math.abs(frac - v) < 0.06) return whole ? `${whole}${s}` : s;
  }
  if (frac < 0.06) return String(whole || (q > 0 ? '<1' : 0));
  if (frac > 0.94) return String(whole + 1);
  return q.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

function roundNice(g: number): number {
  if (g >= 1000) return Math.round(g / 50) * 50;
  if (g >= 200) return Math.round(g / 10) * 10;
  if (g >= 50) return Math.round(g / 5) * 5;
  return Math.round(g);
}

/** Formatiert eine (skalierte) Mengenangabe, z. B. „2 Zwiebeln“, „400 g“, „1½ EL“. */
export function fmtAmount(ing: Ingredient | undefined, q: number, u: string): { amount: string; name: string } {
  const name = ing ? ing.name : '';
  if (u === 'g' || u === 'ml') {
    const v = roundNice(q);
    if (v >= 1000) return { amount: `${(v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${u === 'g' ? 'kg' : 'l'}`, name };
    return { amount: `${v} ${u}`, name };
  }
  if (u === 'stk') {
    const n = fmtNumber(q);
    const single = q <= 1 && ing?.one;
    return { amount: n, name: single ? ing!.one! : name };
  }
  const lab = UNIT_LABEL[u] ?? [u, u];
  return { amount: `${fmtNumber(q)} ${q > 1 ? lab[1] : lab[0]}`.trim(), name };
}

export function fmtGrams(g: number): string {
  if (g >= 1000) return `${(g / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg`;
  return `${roundNice(g)} g`;
}
