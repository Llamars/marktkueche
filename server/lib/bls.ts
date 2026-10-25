import path from 'node:path';
import { readJson, ROOT } from './store';

export interface BlsFood {
  code: string;
  de: string;
  en: string;
  n: Record<string, number | null>;
}

const data = readJson<{ source: string; foods: BlsFood[] }>(path.join(ROOT, 'server', 'data', 'bls_4_0_compact.json'), {
  source: '',
  foods: [],
});

export const BLS_SOURCE = data.source;
export const BLS_BY_CODE = new Map(data.foods.map((f) => [f.code, f]));

const PROCESSED = ['getrocknet', 'pulver', 'konserve', 'gebraten', 'gekocht', 'gegrillt', 'gebacken', 'gedünstet', 'geschmort', 'frittiert', 'tiefgefroren', 'saft', 'gesäuert'];
// Hauptgruppen, die selten gemeint sind, wenn ein Rezept eine einfache Zutat nennt
const UNLIKELY = /^[XYWSDPN]/; // Gerichte, Wurst, Süßwaren, Kuchen, Getränke
const STOP = new Set(['und', 'oder', 'mit', 'für', 'die', 'der', 'das', 'frisch', 'frische', 'frischer', 'gehackt', 'gerieben', 'geriebener', 'klein', 'große', 'groß', 'bio']);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Einfache Suche im BLS. Bevorzugt rohe Einzellebensmittel; Wörter müssen am Wortanfang passen. */
export function searchBls(query: string, limit = 8): BlsFood[] {
  const q = query.toLowerCase().replace(/[()\d.,%]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = q.split(' ').filter((t) => t.length >= 3 && !STOP.has(t));
  if (!tokens.length) return [];
  const res = tokens.map((t) => new RegExp(`(^|[\\s,/(-])${esc(t)}`));
  const scored: { f: BlsFood; s: number }[] = [];
  for (const f of data.foods) {
    const name = f.de.toLowerCase();
    const hits = res.filter((r) => r.test(name)).length;
    if (!hits) continue;
    let s = (hits / tokens.length) * 10;
    if (name.startsWith(tokens[0])) s += 2;
    if (/\broh\b/.test(name)) s += 2.5;
    if (UNLIKELY.test(f.code)) s -= 4;
    for (const p of PROCESSED) if (name.includes(p) && !q.includes(p)) s -= 1.5;
    s -= name.length / 40;
    scored.push({ f, s });
  }
  return scored
    .filter((x) => x.s >= 6)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f);
}
