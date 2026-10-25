import { useState } from 'react';
import { Check, ExternalLink, KeyRound, Share2, Sparkles } from 'lucide-react';
import { AI_PROVIDERS, type AiProvider } from '../../shared/ai';
import { sendLink } from '../lib/share';
import { useStore } from '../store';
import { Button, Card, Chip, Field, inputCls, SectionTitle } from './ui';

/** KI-Schlüssel (für Rezept-Import, Prospektfotos, Ideen) und Familien-Schlüssel (für die automatisch abgerufenen Angebote). */
export function AiSection() {
  const device = useStore((s) => s.device);
  const remote = useStore((s) => s.remote);
  const setDevice = useStore((s) => s.setDevice);
  const syncRemote = useStore((s) => s.syncRemote);
  const toast = useStore((s) => s.toast);
  const [provider, setProvider] = useState<AiProvider>(device.ai?.provider ?? 'gemini');
  const [apiKey, setApiKey] = useState(device.ai?.apiKey ?? '');
  const [model, setModel] = useState(device.ai?.model ?? '');
  const [familyKey, setFamilyKey] = useState(device.familyKey ?? '');
  const info = AI_PROVIDERS[provider];
  const aiSaved = !!device.ai?.apiKey && device.ai.apiKey === apiKey.trim() && device.ai.provider === provider && (device.ai.model ?? '') === model.trim();

  function saveAi() {
    setDevice({ ai: apiKey.trim() ? { provider, apiKey: apiKey.trim(), model: model.trim() || undefined } : undefined });
    toast(apiKey.trim() ? 'KI-Schlüssel gespeichert – nur auf diesem Gerät.' : 'KI-Schlüssel entfernt.');
  }

  async function saveFamilyKey() {
    setDevice({ familyKey: familyKey.trim() || undefined });
    await syncRemote();
    const r = useStore.getState().remote;
    toast(r.state === 'ok' ? `Familien-Schlüssel passt – ${r.count ?? 0} Angebote geladen.` : r.state === 'wrong' ? 'Dieser Schlüssel passt nicht.' : 'Familien-Schlüssel gespeichert.');
  }

  async function invite() {
    const url = `${location.origin}${import.meta.env.BASE_URL}#schluessel=${encodeURIComponent(device.familyKey!)}`;
    const res = await sendLink(url, 'Marktküche', 'Mit diesem Link bekommst du die wöchentlichen Angebote in deiner Marktküche:');
    if (res === 'kopiert') toast('Einladungslink kopiert.');
  }

  return (
    <>
      <SectionTitle>KI (optional)</SectionTitle>
      <Card>
        <p className="mb-3 flex items-start gap-2 text-sm text-muted">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-brand" />
          <span>Für Rezept-Import per Link, Prospektfotos und neue Ideen. Mit Gemini von Google ist das kostenlos. Der Schlüssel bleibt auf diesem Gerät.</span>
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(AI_PROVIDERS) as AiProvider[]).map((p) => (
            <Chip key={p} active={p === provider} onClick={() => setProvider(p)} className="h-8 px-3 text-[13px]">
              {AI_PROVIDERS[p].label}{AI_PROVIDERS[p].free ? ' · kostenlos' : ''}
            </Chip>
          ))}
        </div>
        <Field label="API-Schlüssel" hint={provider === 'gemini' ? 'Kostenlos mit Google-Konto erstellen. Im Gratis-Tarif darf Google die Anfragen zur Verbesserung nutzen.' : 'Wird nach Verbrauch abgerechnet (meist wenige Cent pro Vorgang).'}>
          <input className={inputCls} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Schlüssel einfügen" />
        </Field>
        <a href={info.keyUrl} target="_blank" rel="noreferrer" className="-mt-1 mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
          <ExternalLink size={15} /> Schlüssel bei {info.label} erstellen
        </a>
        <Field label={`Modell${info.defaultModel ? ' (optional)' : ''}`} hint={info.defaultModel ? `Leer = ${info.defaultModel}` : 'Bei OpenAI bitte ein Modell angeben, das PDFs und Bilder lesen kann.'}>
          <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder={info.defaultModel || 'Modellname'} />
        </Field>
        <Button full variant={aiSaved ? 'secondary' : 'primary'} onClick={saveAi} disabled={aiSaved}>
          {aiSaved ? <><Check size={17} /> Gespeichert</> : 'Speichern'}
        </Button>
      </Card>

      <SectionTitle>Familien-Schlüssel</SectionTitle>
      <Card>
        <p className="mb-3 flex items-start gap-2 text-sm text-muted">
          <KeyRound size={16} className="mt-0.5 shrink-0 text-brand" />
          <span>
            Die samstagabends abgerufenen Angebote liegen verschlüsselt auf der Webseite. Mit dem Familien-Schlüssel kann deine Marktküche sie lesen.
            {remote.state === 'ok' && <b className="text-good"> Aktiv – {remote.count} Angebote geladen.</b>}
            {remote.state === 'wrong' && <b className="text-accent"> Der eingetragene Schlüssel passt nicht.</b>}
            {remote.state === 'none' && ' Auf dieser Adresse ist noch kein automatischer Abruf eingerichtet.'}
          </span>
        </p>
        <div className="flex gap-2">
          <input className={`${inputCls} flex-1`} type="password" autoComplete="off" value={familyKey} onChange={(e) => setFamilyKey(e.target.value)} placeholder="Schlüssel eintragen" />
          <Button onClick={saveFamilyKey} disabled={(device.familyKey ?? '') === familyKey.trim()} className="px-4">Speichern</Button>
        </div>
        {device.familyKey && (
          <button onClick={invite} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
            <Share2 size={16} /> Familie einladen (Link mit Schlüssel)
          </button>
        )}
      </Card>
    </>
  );
}
