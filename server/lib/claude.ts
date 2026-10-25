import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import type { Ingredient } from '../../shared/types';

export const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

export function claudeEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
function getClient() {
  if (!claudeEnabled()) throw new Error('Kein ANTHROPIC_API_KEY konfiguriert (Datei .env).');
  client ??= new Anthropic();
  return client;
}

type Content = Anthropic.Beta.Messages.BetaContentBlockParam[];

/** Strukturierte Ausgabe mit Zod-Schema. Bei einer Sicherheitsablehnung springt serverseitig ein Ersatzmodell ein. */
async function structured<T extends z.ZodType>(
  schema: T,
  system: string,
  content: Content,
  effort: 'low' | 'medium' | 'high' = 'medium',
): Promise<z.infer<T>> {
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: { effort, format: betaZodOutputFormat(schema) },
    messages: [{ role: 'user', content }],
  });
  if (res.stop_reason === 'refusal') throw new Error('Die KI hat die Anfrage abgelehnt.');
  if (res.stop_reason === 'max_tokens') throw new Error('Die Antwort der KI war zu lang und wurde abgeschnitten.');
  if (!res.parsed_output) throw new Error('Die KI-Antwort konnte nicht gelesen werden.');
  return res.parsed_output as z.infer<T>;
}

export function catalogPrompt(list: Ingredient[]) {
  return list
    .map((i) => {
      const u = Object.entries(i.units).map(([k, g]) => `${k}=${g}g`).join(', ');
      return `${i.id}: ${i.name}${u ? ` (${u})` : ''}`;
    })
    .join('\n');
}

// ------------------------------------------------------------ Prospekte auslesen

const OfferSchema = z.object({
  offers: z.array(
    z.object({
      title: z.string().describe('Produktname wie im Prospekt, ohne Werbesprüche'),
      brand: z.string().nullable(),
      price: z.number().describe('Angebotspreis in der Landeswährung'),
      regularPrice: z.number().nullable().describe('Streichpreis/Normalpreis, falls angegeben'),
      quantity: z.string().nullable().describe('Packungsangabe, z. B. "500 g" oder "6 x 125 g"'),
      packGrams: z.number().nullable().describe('Packungsinhalt in Gramm bzw. Milliliter'),
      perKg: z.number().nullable().describe('Grundpreis je kg oder Liter'),
      validFrom: z.string().nullable().describe('JJJJ-MM-TT'),
      validTo: z.string().nullable().describe('JJJJ-MM-TT'),
      ingredientId: z.string().nullable().describe('passende ID aus dem Zutatenkatalog oder null'),
    }),
  ),
});
export type ExtractedOffer = z.infer<typeof OfferSchema>['offers'][number];

export async function extractOffers(
  files: { mime: string; base64: string }[],
  ctx: { market: string; city: string; currency: string; today: string; catalog: Ingredient[] },
): Promise<ExtractedOffer[]> {
  const content: Content = files.map((f) =>
    f.mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: f.mime as 'image/jpeg', data: f.base64 } },
  );
  content.push({
    type: 'text',
    text:
      `Das ist der aktuelle Angebotsprospekt von ${ctx.market} in ${ctx.city} (Währung ${ctx.currency}, heute ist ${ctx.today}).\n` +
      'Lies alle Lebensmittel-Angebote aus, die sich zum Kochen eignen (Obst, Gemüse, Fleisch, Fisch, Milchprodukte, Nudeln, Reis, Konserven, Öl, Gewürze usw.). ' +
      'Getränke, Süßigkeiten, Drogerie- und Non-Food-Artikel bitte weglassen. Preise als Zahl. ' +
      'Ordne jedes Angebot der passenden Zutat im Katalog zu (ingredientId), sonst null.\n\nZutatenkatalog:\n' +
      catalogPrompt(ctx.catalog),
  });
  const out = await structured(OfferSchema, 'Du liest Supermarktprospekte präzise aus. Erfinde nichts, was nicht im Prospekt steht.', content, 'medium');
  return out.offers;
}

// ------------------------------------------------------------ Rezepte aus Text strukturieren

const UNITS = ['g', 'ml', 'stk', 'el', 'tl', 'prise', 'zehe', 'bund', 'dose', 'pck', 'scheibe', 'becher'] as const;

const RecipeSchema = z.object({
  isRecipe: z.boolean().describe('false, wenn der Text kein Rezept enthält'),
  title: z.string(),
  teaser: z.string().describe('ein appetitlicher Satz auf Deutsch'),
  servings: z.number(),
  time: z.number().describe('Gesamtzeit in Minuten'),
  active: z.number().nullable().describe('aktive Arbeitszeit in Minuten'),
  difficulty: z.enum(['leicht', 'mittel', 'anspruchsvoll']),
  tags: z.array(z.string()),
  ingredients: z.array(
    z.object({
      name: z.string().describe('Zutat auf Deutsch, z. B. "Zwiebel"'),
      quantity: z.number().nullable(),
      unit: z.enum(UNITS).nullable(),
      grams: z.number().nullable().describe('geschätzte Gesamtmenge in Gramm'),
      catalogId: z.string().nullable().describe('ID aus dem Zutatenkatalog, falls passend'),
      blsQuery: z.string().nullable().describe('allgemeiner deutscher Lebensmittelname für die Nährwertsuche, z. B. "Hähnchen Brustfilet roh"'),
      note: z.string().nullable(),
    }),
  ),
  steps: z.array(z.object({ text: z.string(), minutes: z.number().nullable() })),
});
export type StructuredRecipe = z.infer<typeof RecipeSchema>;

export async function structureRecipe(text: string, catalog: Ingredient[]): Promise<StructuredRecipe> {
  return structured(
    RecipeSchema,
    'Du wandelst Rezepttexte (Webseiten, Instagram-Bildunterschriften) in ein sauberes deutsches Rezept um. ' +
      'Übersetze bei Bedarf ins Deutsche, nutze metrische Mengen und schreibe einfache, nummerierbare Arbeitsschritte. Erfinde keine Zutaten.',
    [
      {
        type: 'text',
        text: `Rezepttext:\n"""\n${text.slice(0, 20000)}\n"""\n\nOrdne Zutaten nach Möglichkeit diesem Katalog zu (catalogId) und gib Mengen in den dort genannten Einheiten an:\n${catalogPrompt(catalog)}`,
      },
    ],
    'medium',
  );
}

// ------------------------------------------------------------ Neue Rezepte aus Angeboten

const GenSchema = z.object({
  recipes: z.array(
    z.object({
      title: z.string(),
      teaser: z.string(),
      time: z.number(),
      active: z.number(),
      difficulty: z.enum(['leicht', 'mittel']),
      tags: z.array(z.string()),
      ingredients: z.array(z.object({ catalogId: z.string(), quantity: z.number(), unit: z.enum(UNITS) })),
      steps: z.array(z.object({ text: z.string(), minutes: z.number().nullable() })),
      imagePrompt: z.string().describe('englische Bildbeschreibung des angerichteten Gerichts für ein Food-Foto'),
    }),
  ),
});
export type GeneratedRecipe = z.infer<typeof GenSchema>['recipes'][number];

export async function generateRecipes(ctx: {
  count: number;
  offers: string[];
  diet: string;
  avoid: string[];
  maxTime: number;
  kids: boolean;
  existing: string[];
  catalog: Ingredient[];
  wish?: string;
}): Promise<GeneratedRecipe[]> {
  const out = await structured(
    GenSchema,
    'Du bist eine erfahrene Familienköchin. Du entwickelst alltagstaugliche, ausgewogene Rezepte mit klaren Schritten auf Deutsch.',
    [
      {
        type: 'text',
        text:
          `Entwickle ${ctx.count} neue Abendessen für 4 Erwachsenenportionen, die möglichst viele dieser aktuellen Angebote nutzen:\n` +
          ctx.offers.map((o) => `- ${o}`).join('\n') +
          `\n\nErnährungsform: ${ctx.diet}. Höchstens ${ctx.maxTime} Minuten Gesamtzeit.` +
          (ctx.kids ? ' Kinder essen mit – bitte mild würzen.' : '') +
          (ctx.avoid.length ? ` Nicht verwenden: ${ctx.avoid.join(', ')}.` : '') +
          (ctx.wish ? ` Wunsch: ${ctx.wish}.` : '') +
          `\nBitte keine Doppelungen zu diesen vorhandenen Rezepten: ${ctx.existing.join(', ')}.` +
          '\nViel Gemüse, Vollkorn wo passend, wenig Salz. Verwende ausschließlich Zutaten aus diesem Katalog (catalogId) mit den dort genannten Einheiten:\n' +
          catalogPrompt(ctx.catalog),
      },
    ],
    'medium',
  );
  return out.recipes;
}
