import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
/** Datenordner (Datenbank, Angebote, Bilder, Sicherungen); im Container per DATA_DIR auf ein Volume gelegt */
export const STORAGE = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'server', 'storage');
export const IMAGES = path.join(STORAGE, 'images');
fs.mkdirSync(IMAGES, { recursive: true });

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

/** Schreibt atomar (temporäre Datei + rename), damit nichts halb geschrieben wird. */
export function writeJson(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

export const storagePath = (name: string) => path.join(STORAGE, name);

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
