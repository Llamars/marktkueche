// Schreibt die Nährwerte aller Katalog-Zutaten aus dem BLS 4.0 in eine kleine Datei für die App im Browser.
// Aufruf: npm run data:bls (nach Änderungen an shared/data/ingredients.json)
import fs from 'node:fs';

const bls = JSON.parse(fs.readFileSync('server/data/bls_4_0_compact.json', 'utf8'));
const items = JSON.parse(fs.readFileSync('shared/data/ingredients.json', 'utf8')).items;
const codes = new Set(items.map((i) => i.bls).filter(Boolean));
const foods = {};
for (const f of bls.foods) if (codes.has(f.code)) foods[f.code] = f.n;
const missing = [...codes].filter((c) => !foods[c]);
fs.writeFileSync('shared/data/bls-subset.json', JSON.stringify({ source: bls.source, per: bls.per, foods }) + '\n');
console.log(`${Object.keys(foods).length} Lebensmittel geschrieben${missing.length ? `, fehlend: ${missing.join(', ')}` : ''}`);
