import { PDFDocument } from 'pdf-lib';

/** Teilt ein großes Prospekt-PDF in Stücke, die in eine KI-Anfrage passen (Prospekte haben oft 40–50 MB). Läuft in Node und im Browser. */
export async function splitPdf(bytes: Uint8Array, maxBytes = 10 * 1024 * 1024): Promise<Uint8Array[]> {
  if (bytes.length <= maxBytes) return [bytes];
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const guess = Math.max(1, Math.floor((total * maxBytes * 0.7) / bytes.length));
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < total; ) {
    let size = Math.min(guess, total - start);
    for (;;) {
      const doc = await PDFDocument.create();
      const pages = await doc.copyPages(src, Array.from({ length: size }, (_, k) => start + k));
      pages.forEach((p) => doc.addPage(p));
      const out = await doc.save();
      if (out.length <= maxBytes || size === 1) {
        chunks.push(out);
        break;
      }
      size = Math.max(1, Math.floor(size / 2));
    }
    start += size;
  }
  return chunks;
}
