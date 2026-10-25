import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { generateIdeas } from '../lib/aiActions';
import { useOfferMap } from '../lib/derive';
import { useStore } from '../store';
import { Button, Field, inputCls, Segmented, Sheet } from './ui';

export function GenerateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const features = useStore((s) => s.features!);
  const catalog = useStore((s) => s.catalog!);
  const toast = useStore((s) => s.toast);
  const offerMap = useOfferMap();
  const [count, setCount] = useState(3);
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const titles = [...offerMap.values()].map(({ offer }) => catalog[offer.ingredientId!]?.name ?? offer.title);
      const list = await generateIdeas(count, wish.trim() || undefined, titles);
      toast(list.length ? `${list.length} neue KI-Rezepte sind da.` : 'Keine passenden Rezepte entstanden – versuch es nochmal.');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Neue Ideen aus den Angeboten"
      footer={features.claude ? (
        <Button full onClick={run} disabled={busy}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {busy ? 'Rezepte werden entwickelt …' : 'Rezepte erstellen'}
        </Button>
      ) : undefined}>
      {!features.claude ? (
        <div className="space-y-3 text-sm text-muted">
          <p>Die KI entwickelt neue Rezepte, die genau zu den Angeboten dieser Woche, deinen Vorlieben und eurer Kochzeit passen.</p>
          <p>Dafür unter Profil → KI einen Schlüssel eintragen – mit Gemini von Google geht das kostenlos.</p>
        </div>
      ) : (
        <>
          <Field label="Wie viele Rezepte?">
            <Segmented value={count} onChange={setCount} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
          </Field>
          <Field label="Besonderer Wunsch (optional)" hint="z. B. „etwas mit Kürbis“, „Ofengericht“, „scharf für Erwachsene“">
            <input className={inputCls} value={wish} onChange={(e) => setWish(e.target.value)} placeholder="Wunsch …" />
          </Field>
          <p className="text-xs text-muted">
            Nährwerte werden anschließend aus dem Bundeslebensmittelschlüssel berechnet, nicht von der KI geschätzt.
            {' '}Die neuen Rezepte bekommen eine farbige Platzhalterkachel statt eines Fotos.
          </p>
          {error && <p className="mt-3 rounded-xl bg-accent-soft p-3 text-sm text-accent">{error}</p>}
        </>
      )}
    </Sheet>
  );
}
