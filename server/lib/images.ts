import fs from 'node:fs';
import path from 'node:path';
import { IMAGES } from './store';

/**
 * Bild-KI für neue Rezepte (Claude selbst erzeugt keine Bilder).
 * Unterstützt die OpenAI-Images-API; Modell über OPENAI_IMAGE_MODEL einstellbar.
 */
export function imagesEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function generateFoodImage(id: string, description: string): Promise<string | null> {
  if (!imagesEnabled()) return null;
  const prompt =
    `Appetizing overhead food photograph of ${description}. Home-cooked, served on a ceramic plate on a light wooden table, ` +
    'soft natural daylight, shallow depth of field, vibrant fresh colors, no text, no hands, no logos.';
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
      prompt,
      size: '1536x1024',
      quality: process.env.OPENAI_IMAGE_QUALITY || 'medium',
      n: 1,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    console.warn('Bild-KI fehlgeschlagen:', res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const item = data.data?.[0];
  if (item?.b64_json) {
    const file = `${id}.png`;
    fs.writeFileSync(path.join(IMAGES, file), Buffer.from(item.b64_json, 'base64'));
    return `/images/${file}`;
  }
  return item?.url ?? null;
}
