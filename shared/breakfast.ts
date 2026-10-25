/** Müsli-Baukasten: Zutatengruppen fürs Frühstück, deren Angebote gesondert gezeigt werden. */
export interface MuesliGroup {
  id: string;
  label: string;
  emoji: string;
  items: string[];
}

export const MUESLI_GROUPS: MuesliGroup[] = [
  { id: 'flocken', label: 'Flocken & Basis-Müsli', emoji: '🌾', items: ['haferflocken', 'dinkelflocken', 'basismuesli'] },
  { id: 'nuesse', label: 'Nüsse – ungesalzen', emoji: '🌰', items: ['haselnuesse', 'mandeln', 'walnuesse', 'cashews', 'erdnuesse', 'nussmischung'] },
  { id: 'kerne', label: 'Samen & Kerne', emoji: '🌻', items: ['leinsamen', 'kuerbiskerne', 'sonnenblumenkerne', 'chiasamen'] },
  { id: 'obst', label: 'Obst', emoji: '🍎', items: ['apfel', 'banane', 'birne', 'trauben', 'kiwi', 'heidelbeeren', 'clementine', 'orange', 'beeren_tk'] },
  { id: 'trockenobst', label: 'Trockenobst', emoji: '🍇', items: ['rosinen', 'aprikosen_getr', 'datteln'] },
  { id: 'milch', label: 'Milch, Joghurt & Drinks', emoji: '🥛', items: ['joghurt', 'magerquark', 'milch', 'haferdrink'] },
];

/** Kurzer Hinweis, wofür sich die Zutat lohnt (Werte je 100 g laut BLS 4.0). */
export const MUESLI_HINTS: Record<string, string> = {
  haferflocken: 'Ballaststoffe, Eisen, Zink',
  dinkelflocken: 'Ballaststoffe, Eiweiß',
  basismuesli: 'Auf „ohne Zuckerzusatz“ achten',
  haselnuesse: 'Vitamin E, Calcium',
  mandeln: 'Vitamin E, Magnesium',
  walnuesse: 'Omega-3 (ALA)',
  cashews: 'Eisen, Zink, Magnesium',
  erdnuesse: 'Eiweiß, Folat',
  nussmischung: 'Nur ungesalzen kaufen',
  leinsamen: 'Omega-3 (ALA), Ballaststoffe – geschrotet besser verwertbar',
  kuerbiskerne: 'Eiweiß, Zink, Magnesium',
  sonnenblumenkerne: 'Vitamin E, Folat, Magnesium',
  chiasamen: 'Omega-3 (ALA), Calcium, Ballaststoffe',
  kiwi: 'Vitamin C',
  heidelbeeren: 'Vitamin C, Ballaststoffe',
  rosinen: 'Süßt ohne Zuckerzusatz – sparsam verwenden',
  aprikosen_getr: 'Süßt ohne Zuckerzusatz – sparsam verwenden',
  datteln: 'Süßt ohne Zuckerzusatz – sparsam verwenden',
  joghurt: 'Calcium, Jod',
  magerquark: 'Viel Eiweiß',
  milch: 'Calcium, Jod',
  haferdrink: 'Angereicherte Sorte wählen (Calcium, Jod)',
};

export const MUESLI_ITEMS = MUESLI_GROUPS.flatMap((g) => g.items);
