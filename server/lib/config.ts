/** Betriebseinstellungen aus Umgebungsvariablen (siehe .env.example und DEPLOY.md). */

const env = process.env;
const production = env.NODE_ENV === 'production';

/** Express-„trust proxy“: Zahl (Anzahl Proxys), true/false oder Netzangaben wie „loopback, uniquelocal“. */
function trustProxy(v: string | undefined): boolean | number | string {
  if (!v) return 'loopback';
  if (v === 'true') return true;
  if (v === 'false') return false;
  return /^\d+$/.test(v) ? Number(v) : v;
}

export const config = {
  production,
  // API_PORT gilt immer; PORT (vom Hoster gesetzt) nur im Betrieb, damit es lokal nicht mit Vite kollidiert
  port: Number(env.API_PORT || (production ? env.PORT : '') || 8787),
  host: env.HOST || '127.0.0.1',
  trustProxy: trustProxy(env.TRUST_PROXY),
  /** „invite“: Konten nur mit Einladungscode (bzw. SIGNUP_CODE); das allererste Konto ist immer möglich */
  registration: (env.REGISTRATION === 'invite' ? 'invite' : 'open') as 'open' | 'invite',
  /** Code für einen neuen, eigenen Haushalt bei REGISTRATION=invite (nur Buchstaben und Ziffern) */
  signupCode: env.SIGNUP_CODE?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
  /** Fiktive Beispielangebote anlegen und anbieten */
  demoOffers: env.DEMO_OFFERS !== 'false',
  /** Tägliche Sicherung der Datenbank (standardmäßig nur im Betrieb) */
  backups: env.BACKUPS ? env.BACKUPS !== 'false' : production,
  backupKeep: Math.max(1, Number(env.BACKUP_KEEP) || 14),
};
