export type NutrientKey =
  | 'kcal' | 'protein' | 'fat' | 'satFat' | 'carbs' | 'sugar' | 'freeSugar' | 'fiber' | 'salt'
  | 'vitD' | 'folate' | 'vitB12' | 'vitC' | 'vitA' | 'iodine' | 'iron' | 'calcium'
  | 'magnesium' | 'potassium' | 'zinc' | 'omega3' | 'ala' | 'epaDha';

export type Nutrients = Partial<Record<NutrientKey, number>>;

export type Aisle = 'gemuese' | 'kuehl' | 'fleisch' | 'trocken' | 'tk' | 'gewuerze' | 'brot' | 'sonstiges';

export type Allergen =
  | 'gluten' | 'krebstiere' | 'ei' | 'fisch' | 'erdnuss' | 'soja' | 'milch' | 'schalenfruechte'
  | 'sellerie' | 'senf' | 'sesam' | 'sulfite' | 'lupinen' | 'weichtiere';

export interface Ingredient {
  id: string;
  name: string;
  one?: string;
  bls: string | null;
  aisle: Aisle;
  /** Gramm je Einheit, z. B. { stk: 80, el: 12 } */
  units: Record<string, number>;
  pack: { g: number; label: string; price: number | null };
  pantry?: boolean;
  freeSugar?: boolean;
  animal?: 'meat' | 'fish' | 'dairy' | 'egg' | 'honey';
  allergens?: Allergen[];
  display?: string;
  match?: string[];
  noMatch?: string[];
  /** true für Zutaten, die beim Import aus dem BLS angelegt wurden */
  custom?: boolean;
}

export interface RecipeIngredient {
  i: string;
  q: number;
  u: string;
  note?: string;
  /** Originaltext beim Import */
  raw?: string;
}

export interface RecipeStep {
  t: string;
  min?: number;
}

export type Diet = 'vegan' | 'vegetarisch' | 'pescetarisch' | 'fleisch';
export type RecipeSource = 'basis' | 'import' | 'ki';

/** Austauschbare Zutat eines Grundrezepts: Die App wählt die Option, die gerade im Angebot ist. */
export interface RecipeVariants {
  /** Position der austauschbaren Zutat in `ingredients` */
  slot: number;
  /** Bezeichnung der Gruppe, z. B. „Gemüse“ */
  label: string;
  options: { key: string; label: string; i: string; q: number; u: string; extraMin?: number }[];
}

export interface Recipe {
  id: string;
  title: string;
  teaser: string;
  time: number;
  active?: number;
  difficulty?: 'leicht' | 'mittel' | 'anspruchsvoll';
  servings: number;
  tags: string[];
  /** Kategorie, z. B. „pasta“ (siehe shared/categories.ts) */
  category?: string;
  image?: string | null;
  imageCredit?: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  source?: RecipeSource;
  sourceUrl?: string;
  createdAt?: string;
  /** Nur in Grundrezepten mit Varianten; Platzhalter {v} in Titel/Teaser/Schritten */
  variants?: RecipeVariants;
  /** Gesetzt bei ausgerollten Varianten */
  family?: string;
  variantKey?: string;
  variantLabel?: string;
}

/** Vom Server angereichertes Rezept */
export interface RecipeView extends Recipe {
  diet: Diet;
  allergens: Allergen[];
  /** Nährwerte je Standardportion (1 Erwachsenenportion) */
  perServing: Nutrients;
  /** Gramm je Zutat für das ganze Rezept (Reihenfolge wie ingredients) */
  grams: number[];
  /** Anteil der Zutaten (nach Gewicht) mit BLS-Nährwerten, 0–1 */
  nutrientCoverage: number;
  /** Fleisch- und Fischmenge je Portion (für Wochenbilanz) */
  meatG: number;
  fishG: number;
  vegG: number;
}

export interface Market {
  id: string;
  name: string;
  kind?: 'discounter' | 'vollsortimenter' | 'bio' | 'asiatisch' | 'sonstiges';
  note?: string;
  custom?: boolean;
}

export interface City {
  id: string;
  name: string;
  plz: string;
  country: 'DE' | 'CA' | 'CH';
  currency: 'EUR' | 'CAD' | 'CHF';
  /** grober Preisfaktor gegenüber deutschen Richtpreisen in EUR */
  priceFactor: number;
  reference: 'DGE' | 'NASEM';
  markets: Market[];
  suggestions?: string[];
  note?: string;
}

export interface Offer {
  id: string;
  cityId: string;
  marketId: string;
  title: string;
  brand?: string;
  price: number;
  /** z. B. "500-g-Packung" */
  quantity?: string;
  /** Packungsinhalt in Gramm (falls bekannt) */
  packG?: number;
  /** Grundpreis je kg/l (falls bekannt) */
  perKg?: number;
  regularPrice?: number;
  validFrom?: string;
  validTo?: string;
  ingredientId?: string | null;
  source: 'upload' | 'manual' | 'demo' | 'auto';
  /** Kennung der automatischen Quelle (z. B. „aldi-sued-prospekt“) */
  sourceId?: string;
  createdAt: string;
}

export type Sex = 'm' | 'w';

export interface Person {
  id: string;
  name: string;
  sex: Sex;
  age: number;
  /** PAL-Wert: 1.4 überwiegend sitzend, 1.6 mäßig aktiv, 1.8 aktiv */
  pal: 1.4 | 1.6 | 1.8;
  weightKg?: number;
  emoji?: string;
}

export type DietPref = 'alles' | 'flexitarisch' | 'pescetarisch' | 'vegetarisch' | 'vegan';

export interface Settings {
  cityId: string;
  marketIds: Record<string, string[]>;
  /** „Einkaufen bei“: Teilmenge der Märkte je Stadt, deren Angebote zählen (leer = alle) */
  shopFocus?: Record<string, string[]>;
  customMarkets: Record<string, Market[]>;
  people: Person[];
  diet: DietPref;
  allergies: Allergen[];
  dislikes: string[];
  maxTimeWeekday: number;
  maxTimeWeekend: number;
  pantry: string[];
  nutrientRef: 'person' | 'label';
  mealsPerDay: number;
  onboarded: boolean;
}

export type MealSlot = 'frueh' | 'mittag' | 'abend';

export interface PlanEntry {
  id: string;
  /** ISO-Datum JJJJ-MM-TT */
  date: string;
  slot: MealSlot;
  recipeId: string;
  servings: number;
}

export interface CartExtra {
  id: string;
  name: string;
  qty?: string;
  /** Name der Person, die den Eintrag hinzugefügt hat */
  by?: string;
  /** Katalogzutat (z. B. aus dem Müsli-Baukasten): wird mit Angebotspreis in die Einkaufsliste übernommen */
  ingredientId?: string;
  /** Anzahl Packungen bei Katalogzutaten */
  packs?: number;
}

export interface FavCategory {
  id: string;
  name: string;
  emoji: string;
}

export interface HouseholdState {
  settings: Settings;
  plan: PlanEntry[];
  /** abgehakte Einkaufswagen-Positionen (Schlüssel → true) */
  checked: Record<string, boolean>;
  /** wer eine Position abgehakt hat (Schlüssel → Name) */
  checkedBy: Record<string, string>;
  /** Vorratsartikel, die trotzdem gekauft werden sollen */
  buyAnyway: Record<string, boolean>;
  extras: CartExtra[];
  /** Favoriten: Rezept- bzw. Familien-ID → Kategorie-ID */
  favorites: Record<string, string>;
  favCategories: FavCategory[];
  ratings: Record<string, 1 | -1>;
  cooked: Record<string, string>;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  emoji: string;
}

export interface HouseholdMember {
  id: string;
  name: string;
  emoji: string;
  role: 'owner' | 'member';
}

export interface HouseholdInfo {
  id: string;
  name: string;
  inviteCode: string;
  role: 'owner' | 'member';
  members: HouseholdMember[];
}

export interface Me {
  user: User;
  households: HouseholdInfo[];
  activeHouseholdId: string;
}

export interface Features {
  claude: boolean;
  images: boolean;
  model: string;
  /** fiktive Beispielangebote erlaubt (im öffentlichen Betrieb meist aus) */
  demoOffers: boolean;
  /** Marktküche-Server erreichbar (Rezept-Import per Link, automatischer Angebotsabruf) */
  server: boolean;
}

/** Öffentliche Serverangaben für den Anmeldebildschirm */
export interface AuthConfig {
  registration: 'open' | 'invite';
  /** noch kein Konto auf diesem Server – das erste ist ohne Einladung möglich */
  firstUser: boolean;
}
