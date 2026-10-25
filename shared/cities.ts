import type { City } from './types';

export const CITIES: City[] = [
  {
    id: 'freiburg',
    name: 'Freiburg im Breisgau',
    plz: '79106',
    country: 'DE',
    currency: 'EUR',
    priceFactor: 1,
    reference: 'DGE',
    markets: [
      { id: 'rewe', name: 'REWE', kind: 'vollsortimenter' },
      { id: 'edeka', name: 'EDEKA', kind: 'vollsortimenter' },
      { id: 'lidl', name: 'Lidl', kind: 'discounter' },
      { id: 'aldi-sued', name: 'Aldi Süd', kind: 'discounter' },
      { id: 'netto', name: 'Netto', kind: 'discounter' },
      { id: 'penny', name: 'Penny', kind: 'discounter' },
      { id: 'alnatura', name: 'Alnatura', kind: 'bio' },
    ],
  },
  {
    id: 'muenchen',
    name: 'München',
    plz: '80331',
    country: 'DE',
    currency: 'EUR',
    priceFactor: 1,
    reference: 'DGE',
    note: 'Die meisten Prospekte gelten bundesweit bzw. für ganz Süddeutschland; regionale Abweichungen (z. B. EDEKA Südbayern) sind möglich.',
    markets: [
      { id: 'rewe', name: 'REWE', kind: 'vollsortimenter' },
      { id: 'edeka', name: 'EDEKA', kind: 'vollsortimenter' },
      { id: 'kaufland', name: 'Kaufland', kind: 'vollsortimenter' },
      { id: 'lidl', name: 'Lidl', kind: 'discounter' },
      { id: 'aldi-sued', name: 'Aldi Süd', kind: 'discounter' },
      { id: 'netto', name: 'Netto', kind: 'discounter' },
      { id: 'penny', name: 'Penny', kind: 'discounter' },
      { id: 'norma', name: 'Norma', kind: 'discounter' },
      { id: 'alnatura', name: 'Alnatura', kind: 'bio' },
      { id: 'denns', name: 'denn’s Biomarkt', kind: 'bio' },
    ],
  },
  {
    id: 'toronto',
    name: 'Toronto',
    plz: 'M5B 0E4',
    country: 'CA',
    currency: 'CAD',
    priceFactor: 1.8,
    reference: 'NASEM',
    note: 'Supermarktketten in der Nähe von M5B 0E4 (Downtown, Yonge & Dundas). Filialen bitte vor Ort prüfen.',
    markets: [
      { id: 'no-frills', name: 'No Frills', kind: 'discounter' },
      { id: 'freshco', name: 'FreshCo', kind: 'discounter' },
      { id: 'food-basics', name: 'Food Basics', kind: 'discounter' },
      { id: 'metro', name: 'Metro', kind: 'vollsortimenter' },
      { id: 'loblaws', name: 'Loblaws', kind: 'vollsortimenter' },
      { id: 'tnt', name: 'T&T Supermarket', kind: 'asiatisch' },
    ],
  },
  {
    id: 'zuerich',
    name: 'Zürich',
    plz: '',
    country: 'CH',
    currency: 'CHF',
    priceFactor: 1.8,
    reference: 'DGE',
    note: 'Märkte werden noch ergänzt. Nährwerte vorübergehend nach DGE/ÖGE (Schweizer BLV-Werte folgen).',
    markets: [],
    suggestions: ['Migros', 'Coop', 'Denner', 'Aldi Suisse', 'Lidl Schweiz'],
  },
];

export const CITY_BY_ID = Object.fromEntries(CITIES.map((c) => [c.id, c])) as Record<string, City>;

export const CURRENCY_LOCALE: Record<string, string> = { EUR: 'de-DE', CAD: 'de-DE', CHF: 'de-CH' };
