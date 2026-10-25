import * as cheerio from 'cheerio';
import type { Offer } from '../../shared/types';
import { parsePackGrams } from '../../shared/logic';

/**
 * Offizielle, frei zugängliche Angebotsquellen der Märkte (kein Login, keine Schlüssel, keine Umgehung von Bot-Schutz).
 * Ohne Nebenwirkungen – genutzt vom Server und vom wöchentlichen Abruf (scripts/angebote-abrufen.ts).
 */

export const UA = 'Marktkueche/0.3 (private Rezept-App; woechentlicher Angebotsabruf)';

export async function get(url: string, accept = 'text/html'): Promise<Response> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'de-DE' }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} antwortet mit ${res.status}`);
  return res;
}

export interface Edition {
  key: string;
  validFrom?: string;
  validTo?: string;
}

const deDate = (s: string) => {
  const [d, m, y] = s.split('.');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

/** Montag und Samstag einer ISO-Kalenderwoche */
export function isoWeek(week: number, year: number): { from: string; to: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);
  return { from: monday.toISOString().slice(0, 10), to: saturday.toISOString().slice(0, 10) };
}

export function currentIsoWeek(d = new Date()): { week: number; year: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((t.getTime() - y0.getTime()) / 864e5 + 1) / 7), year: t.getUTCFullYear() };
}

// ------------------------------------------------------------ Aldi Süd: offizieller Wochenprospekt (PDF im Prospekt-Viewer)

export interface AldiEdition extends Edition {
  pdfUrl: string;
}

export async function findAldiSuedEditions(): Promise<AldiEdition[]> {
  // Diese und nächste Woche (der neue Prospekt erscheint oft schon am Wochenende)
  const next = new Date();
  next.setDate(next.getDate() + 7);
  const candidates = ['https://prospekt.aldi-sued.de/'];
  for (const { week, year } of [currentIsoWeek(), currentIsoWeek(next)]) {
    const yy = String(year).slice(-2);
    candidates.push(`https://prospekt.aldi-sued.de/kw${week}-${yy}-op-mp`, `https://prospekt.aldi-sued.de/kw${week}-${yy}-op`);
  }
  const editions: AldiEdition[] = [];
  for (const url of candidates) {
    try {
      const res = await get(url);
      const html = await res.text();
      const slug = new URL(res.url).pathname.replace(/\//g, '') || html.match(/"slug":"([a-z0-9-]+)"/)?.[1];
      const pdf = html.match(/https:\/\/view\.publitas\.com\/[^"'\s\\]+\.pdf[^"'\s\\]*/)?.[0];
      const kw = slug?.match(/kw(\d{1,2})-(\d{2})/);
      if (!slug || !pdf || !kw || editions.some((e) => e.key === slug)) continue;
      const { from, to } = isoWeek(Number(kw[1]), 2000 + Number(kw[2]));
      // Denselben Wochenprospekt gibt es in zwei Fassungen (…-op-mp und …-op) – eine reicht
      if (editions.some((e) => e.validFrom === from)) continue;
      editions.push({ key: slug, validFrom: from, validTo: to, pdfUrl: pdf.replace(/&amp;/g, '&') });
    } catch {
      /* Kandidat existiert nicht */
    }
  }
  return editions;
}

// ------------------------------------------------------------ Alnatura: Wochenangebote-Seite (HTML, ohne KI lesbar)

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

export type SourceOffer = Omit<Offer, 'id' | 'createdAt'>;

export async function fetchAlnatura(): Promise<{ edition: Edition | null; offers: SourceOffer[] }> {
  const html = await (await get('https://www.alnatura.de/de-de/angebote/')).text();
  const $ = cheerio.load(html);
  const m = $.text().match(/vom\s+(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–]\s*(\d{1,2}\.\d{1,2}\.\d{4})/);
  if (!m) return { edition: null, offers: [] };
  const edition = { key: `${m[1]}-${m[2]}`, validFrom: deDate(m[1]), validTo: deDate(m[2]) };
  const offers: SourceOffer[] = [];
  const seen = new Set<string>();
  $('article[data-slot="product-card"]').each((_, el) => {
    const card = $(el);
    const title = card.find('[id^="product-title-"]').text().trim();
    const weight = card.find('[id^="weight-slot-"]').text().replace(/\s+/g, ' ').trim();
    const price = card.find('[id^="price-slot-"]').text().match(/(\d+,\d{2})\s*€/);
    // Die Seite zeigt manche Karten doppelt (z. B. Karussell und Liste)
    if (!title || !price || seen.has(`${title}|${price[1]}`)) return;
    seen.add(`${title}|${price[1]}`);
    const perKg = weight.match(/1\s*(kg|l)\s*=\s*(\d+,\d{2})\s*€/i);
    const loose = /je\s*kg/i.test(weight);
    offers.push({
      cityId: 'freiburg', marketId: 'alnatura', title, price: num(price[1]),
      quantity: weight || undefined,
      packG: loose ? 1000 : parsePackGrams(title) ?? parsePackGrams(weight),
      perKg: perKg ? num(perKg[2]) : loose ? num(price[1]) : undefined,
      validFrom: edition.validFrom, validTo: edition.validTo, source: 'auto', sourceId: 'alnatura-wochenangebote',
    });
  });
  return { edition, offers };
}

// ------------------------------------------------------------ discounto.de: Prospekte vieler Märkte als PDF
// robots.txt erlaubt /Prospekte/ ausdrücklich (Stand Oktober 2026); abgerufen wird höchstens einmal pro Woche und Markt,
// mit Pausen zwischen den Seiten (crawl-delay 2 s).

const DISCOUNTO = 'https://www.discounto.de';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wochenprospekte eines Markts auf discounto (z. B. „REWE“, „lidl“, „penny_markt“, „Netto-Marken-Discount“):
 * laufende und nächste Woche, ohne Monats- und Sonderkataloge.
 */
export async function findDiscountoEditions(slug: string, today = new Date()): Promise<AldiEdition[]> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const soon = iso(new Date(today.getTime() + 2 * 864e5));
  const now = iso(today);
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const detail = new RegExp(`/Prospekte/(${esc}-(\\d{4}-\\d{2}-\\d{2})_(\\d{4}-\\d{2}-\\d{2})_\\d+)/`, 'g');
  const pdfRe = /\/\/src\.discounto\.de\/Prospekt\/[^"'\s]+\.pdf/;
  const found = new Map<string, AldiEdition>();

  for (const page of [`${DISCOUNTO}/Prospekte/Anbieter:${slug}/naechste-woche/`, `${DISCOUNTO}/Prospekte/Anbieter:${slug}/`]) {
    await wait(3000);
    let html: string;
    try {
      html = await (await get(page)).text();
    } catch {
      continue;
    }
    for (const m of html.matchAll(detail)) {
      const [, key, from, to] = m;
      const days = (Date.parse(to) - Date.parse(from)) / 864e5;
      // Nur Wochenprospekte, die gerade gelten oder in den nächsten zwei Tagen beginnen
      if (days > 8 || to < now || from > soon || found.has(key)) continue;
      found.set(key, { key, validFrom: from, validTo: to, pdfUrl: '' });
    }
    // Die Seite „nächste Woche“ zeigt das PDF manchmal direkt, ohne Detailseite
    const direct = html.match(pdfRe)?.[0];
    const until = html.match(/gültig bis zum <strong>[^<]*?(\d{2})\.(\d{2})\.(\d{4})/);
    const from = direct?.match(/\/(\d{4}-\d{2}-\d{2})(?:-\d+)?\//)?.[1];
    if (direct && from && until) {
      const to = `${until[3]}-${until[2]}-${until[1]}`;
      const key = `${slug}-${from}_${to}`;
      const known = [...found.values()].some((e) => e.validFrom === from);
      if (!known && to >= now && from <= soon) found.set(key, { key, validFrom: from, validTo: to, pdfUrl: `https:${direct}` });
    }
  }

  // Nur die neueste Ausgabe (bei mehreren Prospekten derselben Woche höchstens zwei), PDF-Adresse von der Detailseite holen
  const newest = [...found.values()].reduce((m, e) => ((e.validFrom ?? '') > m ? e.validFrom ?? '' : m), '');
  const editions: AldiEdition[] = [];
  for (const e of [...found.values()].filter((x) => x.validFrom === newest).slice(0, 2)) {
    if (!e.pdfUrl) {
      await wait(3000);
      try {
        const pdf = (await (await get(`${DISCOUNTO}/Prospekte/${e.key}/`)).text()).match(pdfRe)?.[0];
        if (pdf) e.pdfUrl = `https:${pdf}`;
      } catch {
        /* Detailseite nicht erreichbar */
      }
    }
    if (e.pdfUrl) editions.push(e);
  }
  return editions;
}
