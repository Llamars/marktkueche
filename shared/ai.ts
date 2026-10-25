import type Anthropic from '@anthropic-ai/sdk';

/**
 * KI-Anbindung für den Browser und für den wöchentlichen Abruf (GitHub Actions). Wählbar:
 * Gemini (Google, mit kostenlosem Tarif), Claude (Anthropic) oder OpenAI – jeweils mit eigenem API-Schlüssel.
 */
export type AiProvider = 'gemini' | 'anthropic' | 'openai';

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  /** leer = Standardmodell des Anbieters */
  model?: string;
}

export interface AiFile {
  mime: string;
  base64: string;
  name?: string;
}

export interface AiRequest {
  system: string;
  prompt: string;
  files?: AiFile[];
  /** Seite, die die KI selbst laden soll (Gemini: URL-Kontext, Claude: Web-Fetch) */
  url?: string;
  maxTokens?: number;
}

export const AI_PROVIDERS: Record<AiProvider, { label: string; defaultModel: string; free: boolean; keyUrl: string; loadsUrls: boolean }> = {
  gemini: { label: 'Gemini (Google)', defaultModel: 'gemini-3.6-flash', free: true, keyUrl: 'https://aistudio.google.com/apikey', loadsUrls: true },
  anthropic: { label: 'Claude (Anthropic)', defaultModel: 'claude-opus-5-5', free: false, keyUrl: 'https://platform.claude.com', loadsUrls: true },
  openai: { label: 'OpenAI', defaultModel: '', free: false, keyUrl: 'https://platform.openai.com/api-keys', loadsUrls: false },
};

/** retryable: vorübergehend (Auslastung, zu viele Anfragen) – später erneut versuchen lohnt sich */
export class AiError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
  }
}

const temporary = (status: number) => status === 429 || status >= 500;

/** Fragt die KI und gibt den Antworttext zurück. */
export async function askAI(cfg: AiConfig, req: AiRequest): Promise<string> {
  const model = cfg.model?.trim() || AI_PROVIDERS[cfg.provider].defaultModel;
  if (!cfg.apiKey.trim()) throw new AiError('Es ist kein KI-Schlüssel eingetragen.');
  if (!model) throw new AiError('Bitte ein Modell angeben (für OpenAI nötig).');
  if (cfg.provider === 'gemini') return gemini(cfg.apiKey.trim(), model, req);
  if (cfg.provider === 'anthropic') return claude(cfg.apiKey.trim(), model, req);
  return openai(cfg.apiKey.trim(), model, req);
}

/** Liest das erste JSON-Objekt aus einer KI-Antwort (auch wenn es in ```json … ``` steht). */
export function parseJson<T>(text: string): T {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AiError('Die KI-Antwort enthielt keine lesbaren Daten.');
  try {
    return JSON.parse(unfenced.slice(start, end + 1)) as T;
  } catch {
    throw new AiError('Die KI-Antwort war unvollständig – bitte noch einmal versuchen.');
  }
}

// ------------------------------------------------------------ Gemini (REST)

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

async function gemini(key: string, model: string, r: AiRequest): Promise<string> {
  const parts = [
    ...(r.files ?? []).map((f) => ({ inline_data: { mime_type: f.mime, data: f.base64 } })),
    { text: r.url ? `${r.prompt}\n\nSeite: ${r.url}` : r.prompt },
  ];
  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: r.system }] },
    contents: [{ role: 'user', parts }],
    // JSON-Modus lässt sich nicht mit Werkzeugen kombinieren; beim URL-Abruf steht das Format im Prompt
    generation_config: { max_output_tokens: r.maxTokens ?? 32768, ...(r.url ? {} : { response_mime_type: 'application/json' }) },
  };
  if (r.url) body.tools = [{ url_context: {} }];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) throw new AiError(`Gemini: ${data.error?.message ?? `Fehler ${res.status}`}`, temporary(res.status));
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new AiError(`Gemini hat keine Antwort geliefert (${cand?.finishReason ?? data.promptFeedback?.blockReason ?? 'leer'}).`);
  return text;
}

// ------------------------------------------------------------ Claude (Anthropic SDK)

async function claude(key: string, model: string, r: AiRequest): Promise<string> {
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  const client = new AnthropicSdk({ apiKey: key, dangerouslyAllowBrowser: true });
  const content: Anthropic.ContentBlockParam[] = (r.files ?? []).map((f) =>
    f.mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: f.mime as 'image/jpeg', data: f.base64 } },
  );
  content.push({ type: 'text', text: r.url ? `${r.prompt}\n\nSeite: ${r.url}` : r.prompt });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content }];
  const tools: Anthropic.ToolUnion[] | undefined = r.url ? [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 }] : undefined;
  // Ein Server-Werkzeug (Web-Fetch) kann die Runde pausieren – dann einfach fortsetzen
  for (let round = 0; round < 4; round++) {
    let msg: Anthropic.Message;
    try {
      msg = await client.messages.stream({ model, max_tokens: r.maxTokens ?? 32000, system: r.system, messages, tools }).finalMessage();
    } catch (e) {
      const status = (e as { status?: number }).status;
      throw new AiError(`Claude: ${e instanceof Error ? e.message : String(e)}`, !!status && temporary(status));
    }
    if (msg.stop_reason === 'refusal') throw new AiError('Claude hat die Anfrage abgelehnt.');
    if (msg.stop_reason === 'max_tokens') throw new AiError('Die Antwort war zu lang und wurde abgeschnitten.');
    if (msg.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: msg.content });
      continue;
    }
    return msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  }
  throw new AiError('Claude ist nicht rechtzeitig fertig geworden.');
}

// ------------------------------------------------------------ OpenAI (REST)

async function openai(key: string, model: string, r: AiRequest): Promise<string> {
  if (r.url) throw new AiError('Mit OpenAI kann die App Webseiten nicht selbst laden – bitte den Rezepttext einfügen.');
  const content = [
    ...(r.files ?? []).map((f) =>
      f.mime === 'application/pdf'
        ? { type: 'file', file: { filename: f.name ?? 'dokument.pdf', file_data: `data:application/pdf;base64,${f.base64}` } }
        : { type: 'image_url', image_url: { url: `data:${f.mime};base64,${f.base64}` } },
    ),
    { type: 'text', text: r.prompt },
  ];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: r.system }, { role: 'user', content }],
      response_format: { type: 'json_object' },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!res.ok) throw new AiError(`OpenAI: ${data.error?.message ?? `Fehler ${res.status}`}`, temporary(res.status));
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new AiError('OpenAI hat keine Antwort geliefert.');
  return text;
}
