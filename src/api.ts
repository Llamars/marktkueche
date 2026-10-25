import type { Offer, RecipeView } from '../shared/types';

/**
 * Funktionen, die einen Marktküche-Server bzw. die KI brauchen. In der Geräte-Version gibt es beides nicht;
 * die Oberfläche blendet die Knöpfe dafür aus (features.server / features.claude).
 */
export class ApiError extends Error {
  constructor(message: string, public status: number, public needsText = false) {
    super(message);
  }
}

const unavailable = <T>(): Promise<T> =>
  Promise.reject(new ApiError('Diese Funktion braucht den Marktküche-Server und ist in der Geräte-Version nicht verfügbar.', 0));

export const api = {
  uploadOffers: (_fd: FormData) => unavailable<{ created: number; offers: Offer[] }>(),
  importRecipe: (_input: { url?: string; text?: string }) => unavailable<RecipeView>(),
  generate: (_count: number, _wish?: string) => unavailable<RecipeView[]>(),
};
