import type { Ingredient, Offer } from './types';
import { isoDate, matchIngredient, parsePackGrams } from './logic';

type Seed = [market: string, title: string, price: number, quantity: string, regular?: number];

// Fiktive Beispielangebote zum Ausprobieren – werden in der App deutlich als „Beispiel“ markiert.
export const DEMO: Record<string, Seed[]> = {
  freiburg: [
    ['rewe', 'Hähnchenbrustfilet', 4.99, '600-g-Packung', 6.99],
    ['rewe', 'Rispentomaten', 0.99, '500 g', 1.49],
    ['rewe', 'Mozzarella', 0.59, '125 g', 0.89],
    ['rewe', 'Basmati Reis', 1.79, '1 kg', 2.49],
    ['rewe', 'Brokkoli', 0.99, 'Stück, ca. 500 g', 1.49],
    ['edeka', 'Lachsfilet, 2 Stück', 3.49, '250 g', 4.99],
    ['edeka', 'Gouda gerieben', 1.69, '250 g', 2.29],
    ['edeka', 'Champignons braun', 1.29, '400 g', 1.99],
    ['edeka', 'Freilandeier Größe M', 2.49, '10 Stück (550 g)', 2.99],
    ['edeka', 'Kokosmilch', 0.99, '400 ml', 1.49],
    ['lidl', 'Rinderhackfleisch', 3.79, '500 g', 4.49],
    ['lidl', 'Paprika Mix', 1.49, '500 g', 2.49],
    ['lidl', 'Spaghetti', 0.69, '500 g', 0.99],
    ['lidl', 'Salatgurke', 0.49, 'Stück (400 g)', 0.69],
    ['lidl', 'Feta', 1.29, '200 g', 1.79],
    ['aldi-sued', 'Speisekartoffeln festkochend', 1.99, '2,5 kg', 2.99],
    ['aldi-sued', 'Möhren', 0.69, '1 kg', 0.99],
    ['aldi-sued', 'Zucchini', 0.99, '500 g', 1.49],
    ['aldi-sued', 'Naturjoghurt mild 3,5 %', 0.65, '500 g', 0.79],
    ['aldi-sued', 'Tofu natur', 1.79, '400 g', 2.49],
    ['netto', 'Hackfleisch gemischt', 2.99, '500 g', 3.79],
    ['netto', 'Zwiebeln', 1.79, '2 kg', 2.99],
    ['netto', 'Gnocchi', 0.99, '500 g', 1.49],
    ['netto', 'Schlagsahne 30 %', 0.69, '200 g', 0.89],
    ['penny', 'Alaska-Seelachsfilet, tiefgefroren', 2.79, '400 g', 3.49],
    ['penny', 'Kidneybohnen', 0.55, 'Dose, 250 g abgetropft', 0.79],
    ['penny', 'Hokkaido-Kürbis', 1.49, 'Stück, ca. 1,2 kg', 2.49],
    ['penny', 'Emmentaler gerieben', 1.49, '200 g', 1.99],
    ['alnatura', 'Rote Linsen', 2.29, '500 g', 2.79],
    ['alnatura', 'Kichererbsen', 0.99, 'Dose, 240 g abgetropft', 1.29],
    ['alnatura', 'Vollkorn-Spaghetti', 1.29, '500 g', 1.59],
    ['alnatura', 'Couscous', 1.79, '500 g', 2.29],
    // Frühstück & Müsli
    ['aldi-sued', 'Kernige Haferflocken', 0.59, '500 g', 0.79],
    ['lidl', 'Leinsamen geschrotet', 1.19, '500 g', 1.49],
    ['lidl', 'Haselnusskerne naturbelassen', 1.99, '200 g', 2.69],
    ['lidl', 'Bananen', 0.99, '1 kg', 1.29],
    ['rewe', 'Cashewkerne ungesalzen', 2.29, '200 g', 2.99],
    ['rewe', 'Kiwis', 1.29, '500 g', 1.79],
    ['edeka', 'Kürbiskerne', 1.49, '200 g', 1.99],
    ['edeka', 'Heidelbeeren', 1.99, '250 g', 2.99],
    ['penny', 'Sonnenblumenkerne', 0.69, '200 g', 0.99],
    ['penny', 'Haferdrink ungesüßt', 0.79, '1 l', 0.99],
    ['netto', 'Nusskernmischung ungesalzen', 2.19, '200 g', 2.99],
    ['netto', 'Äpfel Elstar', 1.99, '1,5 kg', 2.79],
    ['alnatura', 'Chiasamen', 2.49, '200 g', 2.99],
    ['alnatura', 'Dinkelflocken', 1.29, '500 g', 1.59],
  ],
  toronto: [
    ['no-frills', 'Chicken breast, boneless skinless', 11.0, '1 kg', 16.5],
    ['no-frills', 'Red bell peppers, 3 pack', 2.99, '500 g', 4.49],
    ['no-frills', 'Spaghetti', 1.99, '900 g', 2.79],
    ['freshco', 'Broccoli crowns', 1.49, 'each, approx. 500 g', 2.49],
    ['freshco', 'Large eggs, dozen', 3.99, '12 Stück (660 g)', 4.99],
    ['metro', 'Atlantic salmon fillets', 9.99, '400 g', 13.99],
    ['metro', 'Basmati rice', 6.99, '2 kg', 8.99],
    ['tnt', 'Firm tofu', 1.99, '454 g', 2.79],
    // Breakfast & muesli
    ['no-frills', 'Large flake oats', 3.99, '1 kg', 5.49],
    ['no-frills', 'Bananas', 1.52, '1 kg', 1.74],
    ['no-frills', 'Unsalted roasted peanuts', 3.49, '400 g', 4.49],
    ['no-frills', 'Ground flaxseed', 3.99, '454 g', 5.49],
    ['freshco', 'Raw pumpkin seeds', 4.99, '300 g', 6.49],
    ['food-basics', 'Blueberries', 3.99, '340 g', 5.99],
    ['metro', 'Plain yogurt 2%', 3.49, '750 g', 4.99],
    ['tnt', 'Unsalted almonds', 6.99, '400 g', 8.99],
    ['loblaws', 'Oat beverage, unsweetened', 3.49, '1,75 l', 4.29],
  ],
};

/**
 * Legt die Beispielangebote an (gültig ab heute für 7 Tage). `only` filtert einzelne Einträge,
 * z. B. um nach einem Update nur neue Beispiele zu ergänzen.
 */
export function seedDemoOffers(
  catalog: Record<string, Ingredient>,
  opts: { only?: (cityId: string, marketId: string, title: string) => boolean; validFrom?: string; validTo?: string } = {},
): Offer[] {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 6);
  const out: Offer[] = [];
  for (const [cityId, seeds] of Object.entries(DEMO)) {
    for (const [marketId, title, price, quantity, regularPrice] of seeds) {
      if (opts.only && !opts.only(cityId, marketId, title)) continue;
      out.push({
        id: `demo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        cityId,
        marketId,
        title,
        price,
        quantity,
        packG: parsePackGrams(quantity),
        regularPrice,
        validFrom: opts.validFrom ?? isoDate(from),
        validTo: opts.validTo ?? isoDate(to),
        ingredientId: matchIngredient(title, catalog),
        source: 'demo',
        createdAt: new Date().toISOString(),
      });
    }
  }
  return out;
}
