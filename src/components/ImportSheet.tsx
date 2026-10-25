import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Loader2, Sparkles } from 'lucide-react';
import { AI_PROVIDERS } from '../../shared/ai';
import { importRecipe } from '../lib/aiActions';
import { useStore } from '../store';
import { Button, Field, inputCls, Sheet } from './ui';

export function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [showText, setShowText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useStore((s) => s.toast);
  const ai = useStore((s) => s.device.ai);
  const nav = useNavigate();
  const loadsUrls = ai ? AI_PROVIDERS[ai.provider].loadsUrls : false;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await importRecipe({ url: text.trim() ? undefined : url.trim() || undefined, text: text.trim() || undefined });
      toast(`„${r.title}“ wurde importiert.`);
      onClose();
      setUrl('');
      setText('');
      nav(`/rezept/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setShowText(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Rezept per Link hinzufügen"
      footer={
        <Button full onClick={submit} disabled={busy || (!url.trim() && !text.trim())}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />} {busy ? 'Rezept wird gelesen …' : 'Importieren'}
        </Button>
      }>
      <Field label="Link zum Rezept" hint="z. B. chefkoch.de, lecker.de, Blogs – oder ein Instagram-Reel">
        <input className={inputCls} type="url" inputMode="url" placeholder="https://www.chefkoch.de/rezepte/…" value={url}
          onChange={(e) => setUrl(e.target.value)} autoFocus />
      </Field>
      {!showText ? (
        <button className="mb-3 text-sm font-medium text-brand" onClick={() => setShowText(true)}>Oder Rezepttext einfügen</button>
      ) : (
        <Field label="Rezepttext (optional)" hint="Bei Instagram: Bildunterschrift kopieren und hier einfügen.">
          <textarea className={`${inputCls} h-36 py-2.5`} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Zutaten und Zubereitung …" />
        </Field>
      )}
      {error && <p className="mb-3 rounded-xl bg-accent-soft p-3 text-sm text-accent">{error}</p>}
      <div className="rounded-2xl bg-surface-2 p-3.5 text-xs leading-relaxed text-muted">
        <p className="flex gap-1.5">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-brand" />
          <span>
            <b className="text-ink">So funktioniert’s:</b> {ai ? AI_PROVIDERS[ai.provider].label : 'Die KI'} liest das Rezept, übersetzt bei Bedarf
            und ordnet die Zutaten dem Nährwertkatalog zu.
            {!loadsUrls && ' Mit OpenAI bitte den Rezepttext einfügen – Links kann es hier nicht selbst öffnen.'}
            {' '}Instagram-Beiträge sind oft nur angemeldet sichtbar – dann die Bildunterschrift als Text einfügen.
          </span>
        </p>
      </div>
    </Sheet>
  );
}
