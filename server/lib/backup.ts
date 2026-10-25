import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { db } from './db';
import { STORAGE } from './store';

/** Sicherungen liegen im Datenordner; vom Server zusätzlich nach außen kopieren (siehe DEPLOY.md). */
export const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(STORAGE, 'backups');
const FILES = ['offers.json', 'sources.json', 'custom-ingredients.json'];
const STAMP = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/;

/**
 * Schreibt eine vollständige Kopie der Datenbank (VACUUM INTO – konsistent, auch während der Server läuft)
 * plus die JSON-Dateien in einen Ordner mit Zeitstempel und löscht ältere Sicherungen.
 */
export function runBackup(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const dir = path.join(BACKUP_DIR, stamp);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'marktkueche.db');
  fs.rmSync(target, { force: true });
  db.prepare('VACUUM INTO ?').run(target);
  for (const f of FILES) {
    const src = path.join(STORAGE, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f));
  }
  const all = fs.readdirSync(BACKUP_DIR).filter((d) => STAMP.test(d)).sort();
  for (const old of all.slice(0, -config.backupKeep)) fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true });
  return dir;
}

/** Tägliche Sicherung, erstmals eine Minute nach dem Start. */
export function startBackups() {
  if (!config.backups) return;
  const run = () => {
    try {
      console.log(`Sicherung geschrieben: ${runBackup()}`);
    } catch (e) {
      console.error('Sicherung fehlgeschlagen:', e);
    }
  };
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, 24 * 3600 * 1000).unref();
}
