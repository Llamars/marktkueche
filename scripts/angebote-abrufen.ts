// Wöchentlicher Angebotsabruf (läuft samstags um 22 Uhr MEZ als GitHub Action, siehe .github/workflows/seite.yml).
// Holt die Prospekte (Aldi Süd und Alnatura von deren Seiten, REWE, Lidl, Netto, Penny sowie für München Kaufland und
// Norma über discounto.de, No Frills und T&T für Toronto über flyers-on-line.com),
// liest PDFs mit der KI aus und legt die Angebote verschlüsselt in public/daten/angebote.json ab.
// Ohne DATA_KEY bricht das Skript ab.
//
// Umgebung: DATA_KEY (Familien-Schlüssel), GEMINI_API_KEY (kostenlos) oder ANTHROPIC_API_KEY / OPENAI_API_KEY,
// optional AI_PROVIDER, AI_MODEL, AI_FALLBACK_MODEL (bei Auslastung), OUT_DIR (Standard public/daten),
// FORCE=1 (bekannte Prospekte neu auslesen).
import fs from 'node:fs';
import path from 'node:path';
import type { Ingredient, Offer } from '../shared/types';
import { AI_PROVIDERS, AiError, askAI, parseJson, type AiConfig, type AiFile, type AiProvider, type AiRequest } from '../shared/ai';
import { offersTask, readOffers } from '../shared/aiTasks';
import { isSealed, seal, unseal } from '../shared/crypto';
import { fitToWeek, isoDate, matchIngredient } from '../shared/logic';
import {
  fetchAlnatura, findAldiSuedEditions, findDiscountoEditions, findFlyersOnlineEditions, get, type AldiEdition, type ImageEdition, type SourceOffer,
} from '../server/lib/quellen';
import { splitPdf } from '../shared/pdfSplit';

export interface SourceReport {
  id: string;
  label: string;
  cityId: string;
  marketId: string;
  ok: boolean;
  count: number;
  validFrom?: string;
  validTo?: string;
  note?: string;
  /** nicht alle Teile des Prospekts lesbar – beim nächsten Lauf erneut versuchen */
  partial?: boolean;
  /** weitere Städte, für die dieselben (bundesweiten) Angebote gelten */
  cityIds?: string[];
}

export interface FetchStatus {
  updatedAt: string;
  provider: string | null;
  sources: SourceReport[];
}

const OUT = process.env.OUT_DIR ?? path.join('public', 'daten');
const KEY = process.env.DATA_KEY ?? '';
const FORCE = process.env.FORCE === '1';
const today = isoDate(new Date());
const catalog: Record<string, Ingredient> = Object.fromEntries(
  (JSON.parse(fs.readFileSync('shared/data/ingredients.json', 'utf8')).items as Ingredient[]).map((i) => [i.id, i]),
);

function aiFromEnv(): AiConfig | null {
  const keys: Record<AiProvider, string | undefined> = {
    gemini: process.env.GEMINI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };
  const wanted = process.env.AI_PROVIDER as AiProvider | undefined;
  const provider = wanted && keys[wanted] ? wanted : (['gemini', 'anthropic', 'openai'] as const).find((p) => keys[p]);
  return provider ? { provider, apiKey: keys[provider]!, model: process.env.AI_MODEL } : null;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Zweites kostenloses Modell, falls das erste gerade überlastet ist
const FALLBACK_MODEL: Partial<Record<AiProvider, string>> = { gemini: 'gemini-3.5-flash-lite' };

const isBusy = (e: unknown) =>
  e instanceof AiError && (e.retryable || /429|quota|RESOURCE_EXHAUSTED|rate limit|overloaded|high demand|unavailable|try again/i.test(e.message));

/**
 * Im kostenlosen Tarif sind nur wenige Anfragen pro Minute erlaubt und die Modelle zeitweise ausgelastet.
 * Der Abruf läuft nachts und hat Zeit: geduldig warten (1, 2, 3, 4, 5 Minuten), erst dann das Ersatzmodell.
 */
const ATTEMPTS = 6;

async function askWithRetry(ai: AiConfig, req: AiRequest): Promise<string> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      return await askAI(ai, req);
    } catch (e) {
      if (!isBusy(e) || attempt === ATTEMPTS - 1) {
        const fallback = process.env.AI_FALLBACK_MODEL || FALLBACK_MODEL[ai.provider];
        if (isBusy(e) && fallback && fallback !== ai.model) {
          console.log(`  weiter mit Ersatzmodell ${fallback} …`);
          return askAI({ ...ai, model: fallback }, req);
        }
        throw e;
      }
      console.log(`  KI ausgelastet, warte ${attempt + 1} min …`);
      await pause(60000 * (attempt + 1));
    }
  }
  throw new AiError('Die KI ist zurzeit nicht erreichbar.');
}

function previousStatus(): FetchStatus | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT, 'status.json'), 'utf8')) as FetchStatus;
  } catch {
    return null;
  }
}

async function previousOffers(): Promise<Offer[]> {
  try {
    const box = JSON.parse(fs.readFileSync(path.join(OUT, 'angebote.json'), 'utf8'));
    return isSealed(box) ? await unseal<Offer[]>(box, KEY) : [];
  } catch {
    return [];
  }
}

type Prospect = AldiEdition | ImageEdition;

interface ProspectSource {
  id: string;
  label: string;
  marketId: string;
  cityId: string;
  city: string;
  currency: string;
  find: () => Promise<Prospect[]>;
}

const FREIBURG = { cityId: 'freiburg', city: 'Freiburg im Breisgau', currency: 'EUR' };
const MUENCHEN = { cityId: 'muenchen', city: 'München', currency: 'EUR' };
const TORONTO = { cityId: 'toronto', city: 'Toronto', currency: 'CAD' };

/**
 * Bundesweite bzw. süddeutsche Prospekte gelten auch in München: Sie werden einmal gelesen (für Freiburg) und
 * für die weiteren Städte kopiert – ohne zusätzliche KI-Anfragen.
 */
const ALSO_FOR: Record<string, string[]> = {
  'aldi-sued-prospekt': ['muenchen'],
  'discounto-rewe': ['muenchen'],
  'discounto-lidl': ['muenchen'],
  'discounto-netto': ['muenchen'],
  'discounto-penny': ['muenchen'],
  'alnatura-wochenangebote': ['muenchen'],
};

const PROSPECT_SOURCES: ProspectSource[] = [
  { id: 'aldi-sued-prospekt', label: 'Aldi Süd', marketId: 'aldi-sued', ...FREIBURG, find: () => findAldiSuedEditions() },
  { id: 'discounto-rewe', label: 'REWE', marketId: 'rewe', ...FREIBURG, find: () => findDiscountoEditions('REWE') },
  { id: 'discounto-lidl', label: 'Lidl', marketId: 'lidl', ...FREIBURG, find: () => findDiscountoEditions('lidl') },
  { id: 'discounto-netto', label: 'Netto', marketId: 'netto', ...FREIBURG, find: () => findDiscountoEditions('Netto-Marken-Discount') },
  { id: 'discounto-penny', label: 'Penny', marketId: 'penny', ...FREIBURG, find: () => findDiscountoEditions('penny_markt') },
  { id: 'discounto-kaufland', label: 'Kaufland', marketId: 'kaufland', ...MUENCHEN, find: () => findDiscountoEditions('Kaufland') },
  { id: 'discounto-norma', label: 'Norma', marketId: 'norma', ...MUENCHEN, find: () => findDiscountoEditions('norma') },
  // Kanadische Prospekte laufen Donnerstag bis Mittwoch (deshalb zusätzlich ein Abruf donnerstags)
  { id: 'fol-no-frills', label: 'No Frills', marketId: 'no-frills', ...TORONTO, find: () => findFlyersOnlineEditions('no-frills/ontario') },
  // T&T ist dort gelistet, zeigt aber nicht jede Woche Prospektseiten – dann meldet der Status „keine aktuelle Ausgabe“
  { id: 'fol-tnt', label: 'T&T', marketId: 'tnt', ...TORONTO, find: () => findFlyersOnlineEditions('t-t-supermarket/ontario') },
];

const IMAGE_BATCH_BYTES = 7 * 1024 * 1024;

/** Prospekt als Pakete für die KI: PDFs in Teile zerlegt, Bildseiten zu Paketen gebündelt. */
async function prospectParts(e: Prospect): Promise<{ files: AiFile[]; label: string }[]> {
  if ('pdfUrl' in e) {
    const pdf = new Uint8Array(await (await get(e.pdfUrl, 'application/pdf')).arrayBuffer());
    const parts = await splitPdf(pdf);
    console.log(`  PDF ${(pdf.length / 1048576).toFixed(1)} MB in ${parts.length} Teilen`);
    return parts.map((p, k) => ({ files: [{ mime: 'application/pdf', base64: Buffer.from(p).toString('base64'), name: `${e.key}-${k + 1}.pdf` }], label: `Teil ${k + 1} von ${parts.length}` }));
  }
  const batches: { files: AiFile[]; label: string }[] = [];
  let files: AiFile[] = [];
  let bytes = 0;
  let first = 1;
  for (const [k, url] of e.imageUrls.entries()) {
    await pause(2000);
    const res = await get(url, 'image/*');
    const buf = Buffer.from(await res.arrayBuffer());
    if (files.length && bytes + buf.length > IMAGE_BATCH_BYTES) {
      batches.push({ files, label: `Seiten ${first}–${k} von ${e.imageUrls.length}` });
      files = [];
      bytes = 0;
      first = k + 1;
    }
    files.push({ mime: res.headers.get('content-type')?.split(';')[0] || 'image/jpeg', base64: buf.toString('base64'), name: `${e.key}-${k + 1}` });
    bytes += buf.length;
  }
  if (files.length) batches.push({ files, label: `Seiten ${first}–${e.imageUrls.length} von ${e.imageUrls.length}` });
  console.log(`  ${e.imageUrls.length} Bildseiten in ${batches.length} Paketen`);
  return batches;
}

/** Lässt die KI jedes Paket eines Prospekts auslesen. Einzelne Pakete dürfen scheitern. */
async function readProspect(ai: AiConfig, src: ProspectSource, e: Prospect, report: SourceReport) {
  console.log(`${src.label} ${e.key} → ${AI_PROVIDERS[ai.provider].label}`);
  const parts = await prospectParts(e);
  const task = offersTask({ market: src.label, city: src.city, currency: src.currency, today, catalog });
  const seen = new Set<string>();
  const offers: ReturnType<typeof readOffers> = [];
  const failed: number[] = [];
  let lastError = '';
  for (const [k, part] of parts.entries()) {
    // Abstand zwischen den Anfragen, damit das Minutenkontingent des Gratis-Tarifs reicht
    await pause(15000);
    try {
      const text = await askWithRetry(ai, { ...task, prompt: `${part.label} des Prospekts.\n${task.prompt}`, files: part.files });
      for (const o of readOffers(parseJson(text), catalog)) {
        const id = `${o.title.toLowerCase()}|${o.price}`;
        if (!seen.has(id)) {
          seen.add(id);
          offers.push(o);
        }
      }
      console.log(`  Teil ${k + 1}/${parts.length}: ${offers.length} Angebote bisher`);
    } catch (err) {
      failed.push(k + 1);
      lastError = err instanceof Error ? err.message : String(err);
      console.log(`  Teil ${k + 1}/${parts.length} nicht lesbar: ${lastError}`);
    }
  }
  if (!offers.length) throw new Error(lastError || 'Die KI hat im Prospekt keine Angebote gefunden.');
  if (failed.length) {
    report.partial = true;
    report.note = `Teil ${failed.join(', ')} von ${parts.length} nicht lesbar – wird beim nächsten Lauf erneut versucht.`;
  }
  return offers;
}

async function main() {
  if (!KEY) throw new Error('DATA_KEY fehlt – ohne Familien-Schlüssel werden keine Angebote veröffentlicht.');
  const ai = aiFromEnv();
  const prev = await previousOffers();
  const prevStatus = previousStatus();
  const fresh: SourceOffer[] = [];
  const reports: SourceReport[] = [];
  // Fertig ist eine Ausgabe nur, wenn sie beim letzten Mal vollständig gelesen wurde
  const done = (sourceId: string, validFrom?: string) => {
    const last = prevStatus?.sources.find((x) => x.id === sourceId && x.validFrom === validFrom);
    return !!last?.ok && !last.partial && prev.some((o) => o.sourceId === sourceId && o.validFrom === validFrom);
  };

  // Aldi Süd: Prospekt-PDF mit der KI auslesen
  // Prospekte mit der KI auslesen: Aldi Süd von der eigenen Seite, REWE/Lidl/Netto/Penny über discounto.de,
  // No Frills (Toronto) über flyers-on-line.com
  const soon = isoDate(new Date(Date.now() + 2 * 864e5));
  for (const src of PROSPECT_SOURCES) {
    const report: SourceReport = { id: src.id, label: src.label, cityId: src.cityId, cityIds: ALSO_FOR[src.id], marketId: src.marketId, ok: false, count: 0 };
    reports.push(report);
    try {
      // Ausgaben, die morgen noch gelten (am Samstagabend also nicht mehr die auslaufende Woche) und spätestens
      // übermorgen beginnen (keine Vorschau-Prospekte Wochen im Voraus)
      const editions = (await src.find()).filter((e) => (!e.validTo || e.validTo > today) && (!e.validFrom || e.validFrom <= soon));
      if (!editions.length) throw new Error('Keine aktuelle Ausgabe gefunden.');
      for (const e of editions) {
        report.validFrom = e.validFrom;
        report.validTo = e.validTo;
        if (done(src.id, e.validFrom) && !FORCE) {
          report.ok = true;
          // Auch Angebote mitzählen, die erst später in der Woche beginnen (z. B. ab Donnerstag)
          report.count += prev.filter((o) => o.sourceId === src.id && o.cityId === src.cityId && (!o.validTo || o.validTo >= today)).length;
          report.note = 'bereits ausgelesen';
          continue;
        }
        if (!ai) throw new Error('Kein KI-Schlüssel hinterlegt (GEMINI_API_KEY).');
        // Mehrere Prospekte derselben Woche können dieselben Angebote enthalten
        const known = new Set(fresh.filter((o) => o.sourceId === src.id).map((o) => `${o.title.toLowerCase()}|${o.price}`));
        const offers = (await readProspect(ai, src, e, report)).filter((o) => !known.has(`${o.title.toLowerCase()}|${o.price}`));
        fresh.push(...offers.map((o) => fitToWeek({
          ...o, cityId: src.cityId, marketId: src.marketId, source: 'auto' as const, sourceId: src.id,
        }, e)));
        report.ok = true;
        report.count += offers.length;
      }
    } catch (e) {
      report.note = e instanceof Error ? e.message : String(e);
    }
  }

  // Alnatura: Angebotsseite ohne KI lesen
  const aln: SourceReport = {
    id: 'alnatura-wochenangebote', label: 'Alnatura', cityId: 'freiburg', cityIds: ALSO_FOR['alnatura-wochenangebote'], marketId: 'alnatura', ok: false, count: 0,
  };
  try {
    const { edition, offers } = await fetchAlnatura();
    if (!edition || !offers.length) throw new Error('Keine Angebote auf der Seite gefunden.');
    fresh.push(...offers.map((o) => ({ ...o, ingredientId: matchIngredient(o.title, catalog) })));
    Object.assign(aln, { ok: true, count: offers.length, validFrom: edition.validFrom, validTo: edition.validTo });
  } catch (e) {
    aln.note = e instanceof Error ? e.message : String(e);
  }
  reports.push(aln);

  // Neu gelesene Quellen ersetzen ihre bisherigen Angebote ganz (auch solche, die erst ab Donnerstag gelten);
  // was diesmal nicht geladen werden konnte, bleibt bis zum Ablauf erhalten
  const freshSources = new Set(fresh.map((o) => o.sourceId));
  // Kopien für weitere Städte werden jedes Mal neu aus den Angeboten der Hauptstadt erzeugt
  const copied = new Set(Object.keys(ALSO_FOR));
  const kept = prev.filter((o) => (!o.validTo || o.validTo >= today) && !freshSources.has(o.sourceId) && !(copied.has(o.sourceId ?? '') && o.id.includes('@')));
  const now = new Date().toISOString();
  const primary: Offer[] = [
    ...kept,
    ...fresh.map((o, k) => ({ ...o, id: `auto-${o.sourceId}-${o.validFrom ?? 'x'}-${k}`, createdAt: now })),
  ];
  const offers: Offer[] = primary.flatMap((o) => [o, ...(ALSO_FOR[o.sourceId ?? ''] ?? []).map((cityId) => ({ ...o, id: `${o.id}@${cityId}`, cityId }))]);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'angebote.json'), JSON.stringify(await seal(offers, KEY)) + '\n');
  const status: FetchStatus = { updatedAt: now, provider: ai ? AI_PROVIDERS[ai.provider].label : null, sources: reports };
  fs.writeFileSync(path.join(OUT, 'status.json'), JSON.stringify(status, null, 1) + '\n');
  for (const r of reports) console.log(`${r.ok ? '✓' : '✗'} ${r.label}: ${r.count} Angebote${r.note ? ` (${r.note})` : ''}`);
  console.log(`${offers.length} Angebote verschlüsselt gespeichert.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
