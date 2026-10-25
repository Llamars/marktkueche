// Sofortige Sicherung von Hand: npm run backup (im Container: docker compose exec app npm run backup)
import 'dotenv/config';
import { runBackup } from './lib/backup';

console.log(`Sicherung geschrieben: ${runBackup()}`);
