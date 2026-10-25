// Wöchentlicher Angebotsabruf (läuft montags als GitHub Action, siehe .github/workflows/seite.yml).
// Holt die offiziell veröffentlichten Prospekte, liest PDFs mit der KI aus und legt die Angebote
// verschlüsselt in public/daten/angebote.json ab. Ohne DATA_KEY bricht das Skript ab.
//
// Umgebung: DATA_KEY (Familien-Schlüssel), GEMINI_API_KEY (kostenlos) oder ANTHROPIC_API_KEY / OPENAI_API_KEY,
// optional AI_PROVIDER, AI_MODEL, AI_FALLBACK_MODEL (bei Auslastung), OUT_DIR (Standard public/daten),
// FORCE=1 (bekannte Prospekte neu auslesen).
import fs from 'node:fs';
import path from 'node:path';
import type { Ingredient, Offer } from '../shared/types';
import { AI_PROVIDERS, AiError, askAI, parseJson, type AiConfig, type AiProvider, type AiRequest } from '../shared/ai';
import { offersTask, readOffers } from '../shared/aiTasks';
import { isSealed, seal, unseal } from '../shared/crypto';
import { isoDate, matchIngredient } from '../shared/logic';
import { fetchAlnatura, findAldiSuedEditions, get, type SourceOffer } from '../server/lib/quellen';
import { splitPdf } from './pdf-teilen';

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
 * Im kostenlosen Tarif sind nur wenige Anfragen pro Minute erlaubt und die Modelle zeitweise ausgelastet:
 * warten und erneut versuchen, zuletzt mit dem Ersatzmodell.
 */
async function askWithRetry(ai: AiConfig, req: AiRequest): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await askAI(ai, req);
    } catch (e) {
      if (!isBusy(e) || attempt === 3) {
        const fallback = process.env.AI_FALLBACK_MODEL || FALLBACK_MODEL[ai.provider];
        if (isBusy(e) && fallback && fallback !== ai.model) {
          console.log(`  weiter mit Ersatzmodell ${fallback} …`);
          return askAI({ ...ai, model: fallback }, req);
        }
        throw e;
      }
      console.log(`  KI ausgelastet, warte ${30 * (attempt + 1)} s …`);
      await pause(30000 * (attempt + 1));
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
  const aldi: SourceReport = { id: 'aldi-sued-prospekt', label: 'Aldi Süd', cityId: 'freiburg', marketId: 'aldi-sued', ok: false, count: 0 };
  try {
    // Nur gültige Ausgaben und solche, die in den nächsten zwei Tagen beginnen (keine Vorschau-Prospekte Wochen im Voraus)
    const soon = isoDate(new Date(Date.now() + 2 * 864e5));
    const editions = (await findAldiSuedEditions()).filter((e) => (!e.validTo || e.validTo >= today) && (!e.validFrom || e.validFrom <= soon));
    if (!editions.length) throw new Error('Keine aktuelle Ausgabe gefunden.');
    for (const e of editions) {
      aldi.validFrom = e.validFrom;
      aldi.validTo = e.validTo;
      if (done(aldi.id, e.validFrom) && !FORCE) {
        aldi.ok = true;
        aldi.count += prev.filter((o) => o.sourceId === aldi.id && o.validFrom === e.validFrom).length;
        aldi.note = 'bereits ausgelesen';
        continue;
      }
      if (!ai) throw new Error('Kein KI-Schlüssel hinterlegt (GEMINI_API_KEY).');
      const pdf = new Uint8Array(await (await get(e.pdfUrl, 'application/pdf')).arrayBuffer());
      const parts = await splitPdf(pdf);
      console.log(`Aldi Süd ${e.key}: PDF ${(pdf.length / 1048576).toFixed(1)} MB in ${parts.length} Teilen → ${AI_PROVIDERS[ai.provider].label}`);
      const task = offersTask({ market: 'Aldi Süd', city: 'Freiburg im Breisgau', currency: 'EUR', today, catalog });
      const seen = new Set<string>();
      const offers: ReturnType<typeof readOffers> = [];
      const failed: number[] = [];
      let lastError = '';
      for (const [k, part] of parts.entries()) {
        if (k > 0) await pause(8000);
        try {
          const text = await askWithRetry(ai, {
            ...task,
            prompt: `Teil ${k + 1} von ${parts.length} des Prospekts.\n${task.prompt}`,
            files: [{ mime: 'application/pdf', base64: Buffer.from(part).toString('base64'), name: `${e.key}-${k + 1}.pdf` }],
          });
          for (const o of readOffers(parseJson(text), catalog)) {
            const id = `${o.title.toLowerCase()}|${o.price}`;
            if (!seen.has(id)) {
              seen.add(id);
              offers.push(o);
            }
          }
          console.log(`  Teil ${k + 1}/${parts.length}: ${offers.length} Angebote bisher`);
        } catch (err) {
          // Einzelne Teile dürfen scheitern – der Rest bleibt erhalten
          failed.push(k + 1);
          lastError = err instanceof Error ? err.message : String(err);
          console.log(`  Teil ${k + 1}/${parts.length} nicht lesbar: ${lastError}`);
        }
      }
      if (!offers.length) throw new Error(lastError || 'Die KI hat im Prospekt keine Angebote gefunden.');
      if (failed.length) {
        aldi.partial = true;
        aldi.note = `Teil ${failed.join(', ')} von ${parts.length} nicht lesbar – wird beim nächsten Lauf erneut versucht.`;
      }
      fresh.push(...offers.map((o) => ({
        ...o, cityId: 'freiburg', marketId: 'aldi-sued', source: 'auto' as const, sourceId: aldi.id,
        validFrom: o.validFrom ?? e.validFrom, validTo: o.validTo ?? e.validTo,
      })));
      aldi.ok = true;
      aldi.count += offers.length;
    }
  } catch (e) {
    aldi.note = e instanceof Error ? e.message : String(e);
  }
  reports.push(aldi);

  // Alnatura: Angebotsseite ohne KI lesen
  const aln: SourceReport = { id: 'alnatura-wochenangebote', label: 'Alnatura', cityId: 'freiburg', marketId: 'alnatura', ok: false, count: 0 };
  try {
    const { edition, offers } = await fetchAlnatura();
    if (!edition || !offers.length) throw new Error('Keine Angebote auf der Seite gefunden.');
    fresh.push(...offers.map((o) => ({ ...o, ingredientId: matchIngredient(o.title, catalog) })));
    Object.assign(aln, { ok: true, count: offers.length, validFrom: edition.validFrom, validTo: edition.validTo });
  } catch (e) {
    aln.note = e instanceof Error ? e.message : String(e);
  }
  reports.push(aln);

  // Neue Ausgaben ersetzen alte derselben Quelle; was nicht neu geladen werden konnte, bleibt bis zum Ablauf
  const replaced = new Set(fresh.map((o) => `${o.sourceId}|${o.validFrom}`));
  const freshSources = new Set(fresh.map((o) => o.sourceId));
  const kept = prev.filter((o) => (!o.validTo || o.validTo >= today) && !replaced.has(`${o.sourceId}|${o.validFrom}`) &&
    !(o.sourceId === 'alnatura-wochenangebote' && freshSources.has(o.sourceId)));
  const now = new Date().toISOString();
  const offers: Offer[] = [
    ...kept,
    ...fresh.map((o, k) => ({ ...o, id: `auto-${o.sourceId}-${o.validFrom ?? 'x'}-${k}`, createdAt: now })),
  ];

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
