import type { Offer } from '../../shared/types';
import { isoDate } from '../../shared/logic';
import { fetchAlnatura, findAldiSuedEditions, get, type Edition } from './quellen';
import { readJson, storagePath, writeJson } from './store';
import { addOffers, removeOffers } from './offers';
import { claudeEnabled, extractOffers } from './claude';
import { baseCatalogList } from './catalog';

/**
 * Automatischer Angebotsabruf – nur aus offiziell und frei zugänglich veröffentlichten Quellen der Märkte
 * (kein Login, keine Schlüssel, keine Umgehung von Bot-Schutz). Abruf höchstens alle 6 Stunden, Prospekte nur bei neuer Ausgabe.
 */

const FILE = storagePath('sources.json');

export interface SourceStatus {
  id: string;
  cityId: string;
  marketId: string;
  label: string;
  method: string;
  needsAI: boolean;
  lastCheck?: string;
  lastImport?: string;
  lastKey?: string;
  count?: number;
  validFrom?: string;
  validTo?: string;
  error?: string;
  waiting?: string;
}

interface Source {
  id: string;
  cityId: string;
  marketId: string;
  label: string;
  method: string;
  needsAI: boolean;
  discover(): Promise<Edition[]>;
  load(e: Edition): Promise<Omit<Offer, 'id' | 'createdAt'>[]>;
}

// ------------------------------------------------------------ Aldi Süd: offizieller Wochenprospekt (PDF), ausgelesen mit Claude

const aldiPdf = new Map<string, string>();

const aldiSued: Source = {
  id: 'aldi-sued-prospekt',
  cityId: 'freiburg',
  marketId: 'aldi-sued',
  label: 'Aldi Süd – Wochenprospekt',
  method: 'Offizieller Online-Prospekt (PDF) von prospekt.aldi-sued.de, ausgelesen mit KI',
  needsAI: true,
  async discover() {
    const editions = await findAldiSuedEditions();
    for (const e of editions) aldiPdf.set(e.key, e.pdfUrl);
    return editions;
  },
  async load(e) {
    const url = aldiPdf.get(e.key);
    if (!url) throw new Error('Prospekt-PDF nicht gefunden.');
    const res = await get(url, 'application/pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 32 * 1024 * 1024) throw new Error('Prospekt-PDF ist zu groß für die KI.');
    const extracted = await extractOffers([{ mime: 'application/pdf', base64: buf.toString('base64') }], {
      market: 'Aldi Süd', city: 'Freiburg im Breisgau', currency: 'EUR', today: isoDate(new Date()), catalog: baseCatalogList(),
    });
    return extracted
      .filter((o) => o.title && o.price > 0)
      .map((o) => ({
        cityId: 'freiburg', marketId: 'aldi-sued', title: o.title, brand: o.brand ?? undefined, price: o.price,
        regularPrice: o.regularPrice ?? undefined, quantity: o.quantity ?? undefined, packG: o.packGrams ?? undefined,
        perKg: o.perKg ?? undefined, validFrom: o.validFrom ?? e.validFrom, validTo: o.validTo ?? e.validTo,
        ingredientId: o.ingredientId, source: 'auto' as const, sourceId: 'aldi-sued-prospekt',
      }));
  },
};

// ------------------------------------------------------------ Alnatura: Wochenangebote-Seite (ohne KI)

let alnaturaOffers: Omit<Offer, 'id' | 'createdAt'>[] = [];

const alnatura: Source = {
  id: 'alnatura-wochenangebote',
  cityId: 'freiburg',
  marketId: 'alnatura',
  label: 'Alnatura – Wochenangebote',
  method: 'Öffentliche Angebotsseite alnatura.de/de-de/angebote',
  needsAI: false,
  async discover() {
    const { edition, offers } = await fetchAlnatura();
    alnaturaOffers = offers;
    return edition ? [edition] : [];
  },
  async load() {
    return alnaturaOffers;
  },
};

export const AUTO_SOURCES: Source[] = [aldiSued, alnatura];

// ------------------------------------------------------------ Ausführen & Status

let status = readJson<Record<string, SourceStatus>>(FILE, {});
const save = () => writeJson(FILE, status);

export function sourceStatus(): SourceStatus[] {
  return AUTO_SOURCES.map((s) => ({
    ...status[s.id],
    id: s.id, cityId: s.cityId, marketId: s.marketId, label: s.label, method: s.method, needsAI: s.needsAI,
  }));
}

export async function runSource(id: string, force = false) {
  const s = AUTO_SOURCES.find((x) => x.id === id);
  if (!s) throw new Error('Unbekannte Quelle.');
  const st: SourceStatus = { ...(status[id] ?? {}), id, cityId: s.cityId, marketId: s.marketId, label: s.label, method: s.method, needsAI: s.needsAI };
  st.lastCheck = new Date().toISOString();
  st.error = undefined;
  st.waiting = undefined;
  try {
    const editions = (await s.discover()).filter((e) => !e.validTo || e.validTo >= isoDate(new Date()));
    if (!editions.length) throw new Error('Keine aktuelle Ausgabe gefunden.');
    if (s.needsAI && !claudeEnabled()) {
      st.waiting = `Neue Ausgabe gefunden (${editions.map((e) => e.key).join(', ')}). Zum Auslesen wird ANTHROPIC_API_KEY benötigt.`;
    } else {
      const done = new Set((st.lastKey ?? '').split('|').filter(Boolean));
      let imported = 0;
      for (const e of editions) {
        if (done.has(e.key) && !force) continue;
        const offers = await s.load(e);
        removeOffers((o) => o.sourceId === s.id && o.validFrom === e.validFrom);
        addOffers(offers);
        imported += offers.length;
        done.add(e.key);
        st.validFrom = e.validFrom;
        st.validTo = e.validTo;
      }
      st.lastKey = [...done].slice(-6).join('|');
      if (imported) {
        st.lastImport = new Date().toISOString();
        st.count = imported;
      }
    }
  } catch (e) {
    st.error = e instanceof Error ? e.message : String(e);
  }
  status[id] = st;
  save();
  return st;
}

export function startScheduler(onChange: () => void) {
  const tick = async () => {
    for (const s of AUTO_SOURCES) {
      const before = status[s.id]?.lastImport;
      await runSource(s.id);
      if (status[s.id]?.lastImport !== before) onChange();
    }
  };
  setTimeout(tick, 5000);
  setInterval(tick, 6 * 60 * 60 * 1000);
}
