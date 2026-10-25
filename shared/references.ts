import type { NutrientKey, Person } from './types';

/**
 * Referenzwerte für die Nährstoffzufuhr.
 * Quellen und Stand: siehe SOURCES unten und die Seite „Quellen & Methodik“ in der App.
 */

export type NeedKind = 'target' | 'min' | 'limit' | 'guide';

export interface NutrientMeta {
  key: NutrientKey;
  label: string;
  unit: 'kcal' | 'g' | 'mg' | 'µg';
  group: 'basis' | 'mikro';
  decimals: number;
  /** Warum der Wert wichtig ist – kurzer Hinweis für die App */
  hint: string;
}

export const NUTRIENTS: NutrientMeta[] = [
  { key: 'kcal', label: 'Energie', unit: 'kcal', group: 'basis', decimals: 0, hint: 'Richtwert abhängig von Alter, Geschlecht und Aktivität (PAL).' },
  { key: 'protein', label: 'Eiweiß', unit: 'g', group: 'basis', decimals: 0, hint: 'Empfohlene Zufuhr; ab 65 Jahren höher (Schätzwert).' },
  { key: 'fat', label: 'Fett', unit: 'g', group: 'basis', decimals: 0, hint: 'Richtwert als Anteil an der Energiezufuhr.' },
  { key: 'satFat', label: 'gesättigte Fettsäuren', unit: 'g', group: 'basis', decimals: 0, hint: 'Obergrenze: höchstens 10 % der Energie.' },
  { key: 'carbs', label: 'Kohlenhydrate', unit: 'g', group: 'basis', decimals: 0, hint: 'Richtwert: mehr als 50 % der Energie (DGE).' },
  { key: 'sugar', label: 'Zucker gesamt', unit: 'g', group: 'basis', decimals: 0, hint: 'Orientierung an der EU-Referenzmenge (90 g bei 2000 kcal), inkl. natürlichem Zucker aus Obst, Gemüse und Milch.' },
  { key: 'freeSugar', label: 'freier Zucker', unit: 'g', group: 'basis', decimals: 0, hint: 'Zugesetzter Zucker, Honig, Sirup, Saft – Obergrenze 10 % der Energie (WHO).' },
  { key: 'fiber', label: 'Ballaststoffe', unit: 'g', group: 'basis', decimals: 0, hint: 'Erwachsene mindestens 30 g/Tag; Kinder ca. 14,6 g je 1000 kcal.' },
  { key: 'salt', label: 'Salz', unit: 'g', group: 'basis', decimals: 1, hint: 'Obergrenze: Erwachsene höchstens 6 g/Tag (DGE), Kinder weniger.' },
  { key: 'vitD', label: 'Vitamin D', unit: 'µg', group: 'mikro', decimals: 1, hint: 'Wird überwiegend über Sonnenlicht in der Haut gebildet; Nahrung liefert meist nur 2–4 µg/Tag.' },
  { key: 'folate', label: 'Folat', unit: 'µg', group: 'mikro', decimals: 0, hint: 'Grünes Gemüse, Hülsenfrüchte, Vollkorn. In Deutschland oft knapp.' },
  { key: 'vitB12', label: 'Vitamin B12', unit: 'µg', group: 'mikro', decimals: 1, hint: 'Nur in tierischen Lebensmitteln – bei veganer Ernährung supplementieren.' },
  { key: 'vitC', label: 'Vitamin C', unit: 'mg', group: 'mikro', decimals: 0, hint: 'Paprika, Brokkoli, Kohl, Zitrusfrüchte.' },
  { key: 'vitA', label: 'Vitamin A', unit: 'µg', group: 'mikro', decimals: 0, hint: 'Retinolaktivitätsäquivalente (RAE) – Möhren, Kürbis, Süßkartoffel, Spinat.' },
  { key: 'iodine', label: 'Jod', unit: 'µg', group: 'mikro', decimals: 0, hint: 'Jodsalz, Fisch, Milch. Viele Menschen in Deutschland sind knapp versorgt.' },
  { key: 'iron', label: 'Eisen', unit: 'mg', group: 'mikro', decimals: 1, hint: 'Frauen vor der Menopause haben einen höheren Bedarf.' },
  { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'mikro', decimals: 0, hint: 'Milchprodukte, Käse, grünes Gemüse, calciumreiches Wasser.' },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'mikro', decimals: 0, hint: 'Vollkorn, Hülsenfrüchte, Nüsse.' },
  { key: 'potassium', label: 'Kalium', unit: 'mg', group: 'mikro', decimals: 0, hint: 'Gemüse, Kartoffeln, Hülsenfrüchte.' },
  { key: 'zinc', label: 'Zink', unit: 'mg', group: 'mikro', decimals: 1, hint: 'Erwachsene: Wert für mittlere Phytatzufuhr.' },
  { key: 'ala', label: 'Omega-3 (ALA)', unit: 'g', group: 'mikro', decimals: 1, hint: 'Pflanzliche Omega-3-Fettsäure aus Raps-, Lein- und Walnussöl (0,5 % der Energie).' },
  { key: 'epaDha', label: 'Omega-3 (EPA+DHA)', unit: 'mg', group: 'mikro', decimals: 0, hint: 'Langkettige Omega-3-Fettsäuren aus fettem Seefisch; EFSA: 250 mg/Tag.' },
];

export const NUTRIENT_BY_KEY = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n])) as Record<NutrientKey, NutrientMeta>;

export interface Need {
  value: number;
  kind: NeedKind;
  source: string;
}
export type Needs = Partial<Record<NutrientKey, Need>>;

// ---------- DGE/ÖGE (Deutschland, Österreich) ----------
// Altersgruppen: 1–<4, 4–<7, 7–<10, 10–<13, 13–<15, 15–<19, 19–<25, 25–<51, 51–<65, ≥65
const DGE_AGE = [1, 4, 7, 10, 13, 15, 19, 25, 51, 65];
type MW = { m: number[]; w: number[] };
const same = (a: number[]): MW => ({ m: a, w: a });

const DGE = {
  energy: {
    1.4: { m: [1200, 1400, 1700, 1900, 2300, 2600, 2400, 2300, 2200, 2100], w: [1100, 1300, 1500, 1700, 1900, 2000, 1900, 1800, 1700, 1700] },
    1.6: { m: [1300, 1600, 1900, 2200, 2600, 3000, 2800, 2700, 2500, 2500], w: [1200, 1500, 1800, 2000, 2200, 2300, 2200, 2100, 2000, 1900] },
    // 1–<4 Jahre: für PAL 1,8 kein Wert angegeben → PAL 1,6
    1.8: { m: [1300, 1800, 2100, 2400, 2900, 3400, 3100, 3000, 2800, 2800], w: [1200, 1700, 2000, 2200, 2500, 2600, 2500, 2400, 2200, 2100] },
  } as Record<string, MW>,
  proteinG: { m: [14, 18, 26, 37, 50, 62, 57, 57, 55, 67], w: [14, 18, 26, 38, 49, 48, 48, 48, 47, 57] } as MW,
  proteinPerKg: { m: [1.0, 0.9, 0.9, 0.9, 0.9, 0.9, 0.8, 0.8, 0.8, 1.0], w: [1.0, 0.9, 0.9, 0.9, 0.9, 0.8, 0.8, 0.8, 0.8, 1.0] } as MW,
  fatPct: [[30, 40], [30, 35], [30, 35], [30, 35], [30, 35], [30, 30], [30, 30], [30, 30], [30, 30], [30, 30]],
  vitD: same([20, 20, 20, 20, 20, 20, 20, 20, 20, 20]),
  folate: same([120, 140, 180, 240, 300, 300, 300, 300, 300, 300]),
  vitB12: same([1.5, 2.0, 2.5, 3.5, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0]),
  vitC: { m: [20, 30, 45, 65, 85, 105, 110, 110, 110, 110], w: [20, 30, 45, 65, 85, 90, 95, 95, 95, 95] },
  vitA: { m: [300, 350, 450, 600, 800, 950, 850, 850, 850, 800], w: [300, 350, 450, 600, 700, 800, 700, 700, 700, 700] },
  iodine: same([90, 90, 120, 120, 150, 150, 150, 150, 150, 150]),
  // Frauen 51+: Wert für postmenopausale Frauen (14 mg); prämenopausal 16 mg
  iron: { m: [7, 7, 10, 14, 11, 11, 11, 11, 11, 11], w: [7, 7, 10, 14, 16, 16, 16, 16, 14, 14] },
  calcium: same([600, 750, 900, 1100, 1200, 1200, 1000, 1000, 1000, 1000]),
  magnesium: { m: [170, 190, 240, 260, 280, 330, 350, 350, 350, 350], w: [170, 190, 240, 230, 240, 260, 300, 300, 300, 300] },
  potassium: same([1100, 1300, 2000, 2900, 3600, 4000, 4000, 4000, 4000, 4000]),
  // Erwachsene: Wert bei mittlerer Phytatzufuhr
  zinc: { m: [3, 4, 6, 9, 12, 14, 14, 14, 14, 14], w: [3, 4, 6, 8, 10, 11, 8, 8, 8, 8] },
};

// ---------- NASEM-DRI (von Health Canada verwendet) ----------
// Altersgruppen: 1–3, 4–8, 9–13, 14–18, 19–30, 31–50, 51–70, >70
const DRI_AGE = [1, 4, 9, 14, 19, 31, 51, 71];
const DRI = {
  proteinG: { m: [13, 19, 34, 52, 56, 56, 56, 56], w: [13, 19, 34, 46, 46, 46, 46, 46] },
  fiber: { m: [19, 25, 31, 38, 38, 38, 30, 30], w: [19, 25, 26, 26, 25, 25, 21, 21] },
  ala: { m: [0.7, 0.9, 1.2, 1.6, 1.6, 1.6, 1.6, 1.6], w: [0.7, 0.9, 1.0, 1.1, 1.1, 1.1, 1.1, 1.1] },
  fatPct: [[30, 40], [25, 35], [25, 35], [25, 35], [20, 35], [20, 35], [20, 35], [20, 35]],
  vitA: { m: [300, 400, 600, 900, 900, 900, 900, 900], w: [300, 400, 600, 700, 700, 700, 700, 700] },
  vitC: { m: [15, 25, 45, 75, 90, 90, 90, 90], w: [15, 25, 45, 65, 75, 75, 75, 75] },
  vitD: same([15, 15, 15, 15, 15, 15, 15, 20]),
  folate: same([150, 200, 300, 400, 400, 400, 400, 400]),
  vitB12: same([0.9, 1.2, 1.8, 2.4, 2.4, 2.4, 2.4, 2.4]),
  calcium: { m: [700, 1000, 1300, 1300, 1000, 1000, 1000, 1200], w: [700, 1000, 1300, 1300, 1000, 1000, 1200, 1200] },
  iodine: same([90, 90, 120, 150, 150, 150, 150, 150]),
  iron: { m: [7, 10, 8, 11, 8, 8, 8, 8], w: [7, 10, 8, 15, 18, 18, 8, 8] },
  magnesium: { m: [80, 130, 240, 410, 400, 420, 420, 420], w: [80, 130, 240, 360, 310, 320, 320, 320] },
  zinc: { m: [3, 5, 8, 11, 11, 11, 11, 11], w: [3, 5, 8, 9, 8, 8, 8, 8] },
  potassium: { m: [2000, 2300, 2500, 3000, 3400, 3400, 3400, 3400], w: [2000, 2300, 2300, 2300, 2600, 2600, 2600, 2600] },
  // Chronic Disease Risk Reduction Intake (Natrium, mg) → als Salz-Obergrenze
  sodiumCdrr: same([1200, 1500, 1800, 2300, 2300, 2300, 2300, 2300]),
};

function idx(ages: number[], age: number) {
  let i = 0;
  for (let k = 0; k < ages.length; k++) if (age >= ages[k]) i = k;
  return i;
}
const pick = (t: MW, sex: 'm' | 'w', i: number) => t[sex][i];

export function energyGuide(p: Person): number {
  const i = idx(DGE_AGE, p.age);
  return DGE.energy[String(p.pal)][p.sex][i];
}

/** Standardportion = Erwachsenenportion (ca. 2200 kcal/Tag). Kinder bekommen anteilig weniger. */
export function portionFactor(p: Person): number {
  const f = energyGuide(p) / 2200;
  return Math.min(1.5, Math.max(0.25, Math.round(f * 4) / 4));
}

/** Salz-Obergrenze für Kinder nach SACN (UK), Erwachsene 6 g (DGE). */
function saltLimit(age: number): number {
  if (age < 4) return 2;
  if (age < 7) return 3;
  if (age < 11) return 5;
  return 6;
}

const S = {
  dge: 'DGE/ÖGE-Referenzwerte',
  dgeFat: 'DGE-Richtwert Fett',
  who: 'WHO-Leitlinie',
  efsa: 'EFSA (Adequate Intake)',
  eu: 'EU-Referenzmenge (LMIV)',
  sacn: 'SACN (UK) Salz-Zielwerte für Kinder',
  dgeSalt: 'DGE-Orientierungswert Salz',
  nasem: 'NASEM-DRI (Health Canada)',
};

export function personNeeds(p: Person, system: 'DGE' | 'NASEM' = 'DGE'): Needs {
  const kcal = energyGuide(p);
  const sex = p.sex;
  const n: Needs = {};
  n.kcal = { value: kcal, kind: 'guide', source: S.dge };
  // Gemeinsame Werte (gelten in beiden Systemen)
  n.satFat = { value: (0.1 * kcal) / 9, kind: 'limit', source: S.who };
  n.freeSugar = { value: (0.1 * kcal) / 4, kind: 'limit', source: S.who };
  n.sugar = { value: (90 * kcal) / 2000, kind: 'limit', source: S.eu };
  n.epaDha = { value: p.age >= 2 ? 250 : 100, kind: 'target', source: S.efsa };

  if (system === 'NASEM') {
    const i = idx(DRI_AGE, p.age);
    const [fl, fh] = DRI.fatPct[i];
    n.protein = { value: p.weightKg && p.age >= 19 ? 0.8 * p.weightKg : pick(DRI.proteinG, sex, i), kind: 'target', source: S.nasem };
    n.fat = { value: (((fl + fh) / 2) / 100 * kcal) / 9, kind: 'guide', source: S.nasem };
    n.carbs = { value: (0.45 * kcal) / 4, kind: 'min', source: S.nasem };
    n.fiber = { value: pick(DRI.fiber, sex, i), kind: 'min', source: S.nasem };
    n.salt = { value: (pick(DRI.sodiumCdrr, sex, i) * 2.5) / 1000, kind: 'limit', source: S.nasem };
    n.ala = { value: pick(DRI.ala, sex, i), kind: 'target', source: S.nasem };
    for (const k of ['vitA', 'vitC', 'vitD', 'folate', 'vitB12', 'calcium', 'iodine', 'iron', 'magnesium', 'zinc', 'potassium'] as const) {
      n[k] = { value: pick((DRI as any)[k], sex, i), kind: 'target', source: S.nasem };
    }
    return n;
  }

  const i = idx(DGE_AGE, p.age);
  const [fl, fh] = DGE.fatPct[i];
  n.protein = {
    value: p.weightKg ? pick(DGE.proteinPerKg, sex, i) * p.weightKg : pick(DGE.proteinG, sex, i),
    kind: 'target',
    source: S.dge,
  };
  n.fat = { value: (((fl + fh) / 2) / 100 * kcal) / 9, kind: 'guide', source: S.dgeFat };
  n.carbs = { value: (0.5 * kcal) / 4, kind: 'min', source: S.dge };
  n.fiber = { value: p.age >= 19 ? 30 : (14.6 * kcal) / 1000, kind: 'min', source: S.dge };
  n.salt = { value: saltLimit(p.age), kind: 'limit', source: p.age >= 11 ? S.dgeSalt : S.sacn };
  n.ala = { value: (0.005 * kcal) / 9, kind: 'target', source: S.dge };
  for (const k of ['vitD', 'folate', 'vitB12', 'vitC', 'vitA', 'iodine', 'iron', 'calcium', 'magnesium', 'potassium', 'zinc'] as const) {
    n[k] = { value: pick((DGE as any)[k], sex, i), kind: 'target', source: S.dge };
  }
  return n;
}

/** Etikett-Referenz: wie auf Verpackungen (Erwachsene, 2000 kcal) */
export function labelNeeds(country: 'DE' | 'CA' | 'CH'): Needs {
  if (country === 'CA') {
    const s = 'Health Canada Daily Value (2022)';
    return {
      kcal: { value: 2000, kind: 'guide', source: s },
      fat: { value: 75, kind: 'guide', source: s },
      satFat: { value: 20, kind: 'limit', source: s },
      sugar: { value: 100, kind: 'limit', source: s },
      fiber: { value: 28, kind: 'min', source: s },
      salt: { value: 2.3 * 2.5, kind: 'limit', source: s },
      potassium: { value: 3400, kind: 'target', source: s },
      calcium: { value: 1300, kind: 'target', source: s },
      iron: { value: 18, kind: 'target', source: s },
      vitA: { value: 900, kind: 'target', source: s },
      vitC: { value: 90, kind: 'target', source: s },
      vitD: { value: 20, kind: 'target', source: s },
      folate: { value: 400, kind: 'target', source: s },
      vitB12: { value: 2.4, kind: 'target', source: s },
      magnesium: { value: 420, kind: 'target', source: s },
      zinc: { value: 11, kind: 'target', source: s },
      iodine: { value: 150, kind: 'target', source: s },
    };
  }
  const s = 'EU-Referenzmenge (LMIV, Anhang XIII)';
  return {
    kcal: { value: 2000, kind: 'guide', source: s },
    protein: { value: 50, kind: 'target', source: s },
    fat: { value: 70, kind: 'guide', source: s },
    satFat: { value: 20, kind: 'limit', source: s },
    carbs: { value: 260, kind: 'guide', source: s },
    sugar: { value: 90, kind: 'limit', source: s },
    salt: { value: 6, kind: 'limit', source: s },
    vitA: { value: 800, kind: 'target', source: s },
    vitD: { value: 5, kind: 'target', source: s },
    vitC: { value: 80, kind: 'target', source: s },
    folate: { value: 200, kind: 'target', source: s },
    vitB12: { value: 2.5, kind: 'target', source: s },
    potassium: { value: 2000, kind: 'target', source: s },
    calcium: { value: 800, kind: 'target', source: s },
    magnesium: { value: 375, kind: 'target', source: s },
    iron: { value: 14, kind: 'target', source: s },
    zinc: { value: 10, kind: 'target', source: s },
    iodine: { value: 150, kind: 'target', source: s },
  };
}

export interface SourceRef {
  id: string;
  title: string;
  org: string;
  year: string;
  url: string;
  use: string;
}

export const SOURCES: SourceRef[] = [
  { id: 'dge', org: 'Deutsche Gesellschaft für Ernährung (DGE) / ÖGE', title: 'Referenzwerte für die Nährstoffzufuhr, 3. Auflage', year: '2025 (Jod und Vitamin E neu; Eisen 2024; Folat und B12 2019; Vitamin A 2020)', url: 'https://www.dge.de/wissenschaft/referenzwerte/', use: 'Persönlicher Tagesbedarf für Deutschland und Österreich – Energie, Eiweiß, Fett, Kohlenhydrate, Ballaststoffe, Vitamine, Mineralstoffe' },
  { id: 'dge-fbdg', org: 'DGE', title: 'Gut essen und trinken – DGE-Empfehlungen und DGE-Ernährungskreis', year: '2024', url: 'https://www.dge.de/gesunde-ernaehrung/gut-essen-und-trinken/dge-empfehlungen/', use: 'Wochenbilanz: höchstens 300 g Fleisch und Wurst pro Woche, Fisch 1–2-mal pro Woche, mehr als ¾ pflanzliche Lebensmittel' },
  { id: 'who-sugar', org: 'Weltgesundheitsorganisation (WHO)', title: 'Guideline: Sugars intake for adults and children', year: '2015', url: 'https://www.who.int/publications/i/item/9789241549028', use: 'Freier Zucker unter 10 % der Energie (besser unter 5 %)' },
  { id: 'who-fat', org: 'WHO', title: 'Saturated fatty acid and trans-fatty acid intake for adults and children', year: '2023', url: 'https://www.who.int/publications/i/item/9789240073630', use: 'Gesättigte Fettsäuren höchstens 10 % der Energie' },
  { id: 'who-salt', org: 'WHO', title: 'Guideline: Sodium intake for adults and children', year: '2012', url: 'https://www.who.int/publications/i/item/9789241504836', use: 'Erwachsene unter 5 g Salz/Tag; für Kinder nach Energiebedarf abwärts anpassen' },
  { id: 'dge-salt', org: 'DGE', title: 'Speisesalzzufuhr in Deutschland – Stellungnahme (Ernährungs Umschau 63(03): 62–70)', year: '2016', url: 'https://www.dge.de/wissenschaft/stellungnahmen-und-positionspapiere/stellungnahmen/speisesalzzufuhr-in-deutschland/', use: 'Orientierungswert: höchstens 6 g Salz pro Tag für Erwachsene' },
  { id: 'sacn', org: 'Scientific Advisory Committee on Nutrition (UK)', title: 'Salt and Health', year: '2003', url: 'https://www.gov.uk/government/publications/sacn-salt-and-health-report', use: 'Salz-Zielwerte für Kinder: 1–3 J. 2 g, 4–6 J. 3 g, 7–10 J. 5 g, ab 11 J. 6 g' },
  { id: 'efsa', org: 'Europäische Behörde für Lebensmittelsicherheit (EFSA)', title: 'Scientific Opinion on Dietary Reference Values for fats', year: '2010', url: 'https://www.efsa.europa.eu/en/efsajournal/pub/1461', use: 'EPA+DHA: 250 mg/Tag (ab 2 Jahren)' },
  { id: 'lmiv', org: 'Europäische Union', title: 'Verordnung (EU) Nr. 1169/2011 (LMIV), Anhang XIII', year: '2011', url: 'https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32011R1169', use: 'Etikett-Referenzmengen (2000 kcal): Fett 70 g, gesättigte FS 20 g, Kohlenhydrate 260 g, Zucker 90 g, Eiweiß 50 g, Salz 6 g, Vitamine und Mineralstoffe' },
  { id: 'hc-dv', org: 'Health Canada', title: 'Nutrition labelling – Table of daily values', year: '2022', url: 'https://www.canada.ca/en/health-canada/services/technical-documents-labelling-requirements/table-daily-values/nutrition-labelling.html', use: 'Etikett-Referenz Kanada (u. a. Ballaststoffe 28 g, Natrium 2300 mg)' },
  { id: 'hc-dri', org: 'Health Canada / National Academies (NASEM)', title: 'Dietary Reference Intakes Tables', year: '2005–2019', url: 'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables.html', use: 'Persönlicher Bedarf für Kanada (RDA/AI, Natrium-CDRR 2019)' },
  { id: 'blv', org: 'Bundesamt für Lebensmittelsicherheit und Veterinärwesen (BLV, Schweiz)', title: 'Schweizer Referenzwerte für die Nährstoffzufuhr', year: '2025', url: 'https://www.blv.admin.ch/de/naehrstoffzufuhr', use: 'Für die Schweiz noch nicht hinterlegt – vorübergehend werden die DGE/ÖGE-Werte verwendet' },
  { id: 'bls', org: 'Max Rubner-Institut (MRI)', title: 'Bundeslebensmittelschlüssel (BLS) 4.0 – Deutsche Nährstoffdatenbank, DOI 10.25826/Data20251217-134202-0, Lizenz CC BY 4.0', year: '2025', url: 'https://blsdb.de/', use: 'Nährstoffgehalte aller Zutaten (je 100 g)' },
];
