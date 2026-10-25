/** Alle Daten bleiben im Browser dieses Geräts (localStorage) – es gibt keinen Server. */
const PREFIX = 'marktkueche:';

export const KEYS = { state: 'state', offers: 'offers', recipes: 'recipes', ingredients: 'ingredients', device: 'device' } as const;
type Key = (typeof KEYS)[keyof typeof KEYS];

export function load<T>(key: Key, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** false, wenn der Browser das Speichern verweigert (Speicher voll oder privates Fenster). */
export function save(key: Key, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const isOwnKey = (storageKey: string | null) => !!storageKey?.startsWith(PREFIX);

/** Bittet den Browser, die Daten nicht automatisch zu löschen (z. B. bei Speicherknappheit). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
