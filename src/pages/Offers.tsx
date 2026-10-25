import { useMemo, useState } from 'react';
import { Camera, FileUp, Info, KeyRound, Loader2, PenLine, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Offer } from '../../shared/types';
import { fmtMoney, isOfferValid, offerPerKg } from '../../shared/logic';
import { readProspect } from '../lib/aiActions';
import { today, useCity, useSelectedMarkets } from '../lib/derive';
import { useStore } from '../store';
import { Button, Card, Chip, cx, EmptyState, Field, inputCls, Sheet } from '../components/ui';

function UploadSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const city = useCity();
  const markets = useSelectedMarkets();
  const claude = useStore((s) => s.features!.claude);
  const toast = useStore((s) => s.toast);
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [validTo, setValidTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setProgress('');
    setError(null);
    try {
      const created = await readProspect(files, marketId, validTo || undefined, setProgress);
      toast(created ? `${created} Angebote erkannt und übernommen.` : 'Auf den Seiten wurden keine Lebensmittel-Angebote gefunden.');
      setFiles([]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Prospekt auslesen"
      footer={claude ? (
        <Button full onClick={submit} disabled={busy || !files.length || !marketId}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />} {busy ? progress || 'Prospekt wird gelesen …' : 'Angebote auslesen'}
        </Button>
      ) : undefined}>
      {!claude ? (
        <p className="text-sm text-muted">
          Zum Auslesen von Prospekten wird die KI benötigt. Trag unter <Link to="/profil" className="font-medium text-brand">Profil → KI</Link> einen
          Schlüssel ein – mit Gemini von Google kostenlos. Bis dahin kannst du Angebote selbst eintragen.
        </p>
      ) : (
        <>
          <Field label="Markt">
            <div className="flex flex-wrap gap-2">
              {markets.map((m) => <Chip key={m.id} active={m.id === marketId} onClick={() => setMarketId(m.id)}>{m.name}</Chip>)}
            </div>
          </Field>
          <Field label="Fotos, Bildschirmfotos oder ganzes Prospekt-PDF" hint="Große PDFs werden in Teile zerlegt und nacheinander gelesen – das kann ein paar Minuten dauern.">
            <input type="file" accept="application/pdf,image/*" multiple capture={undefined}
              onChange={(e) => setFiles([...(e.target.files ?? [])])}
              className="block w-full rounded-xl border border-dashed border-line p-4 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-ink" />
          </Field>
          {files.length > 0 && <p className="-mt-1 mb-3 text-xs text-muted">{files.length} Datei(en): {files.map((f) => f.name).join(', ')}</p>}
          <Field label="Gültig bis (optional)" hint="Wird sonst aus dem Prospekt gelesen.">
            <input type="date" className={inputCls} value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </Field>
          {error && <p className="rounded-xl bg-accent-soft p-3 text-sm text-accent">{error}</p>}
          <p className="mt-2 flex gap-2 text-xs text-muted"><Camera size={14} className="shrink-0" /> Tipp: Am Handy kannst du die Prospektseiten direkt fotografieren.</p>
        </>
      )}
    </Sheet>
  );
}

function ManualSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const city = useCity();
  const markets = useSelectedMarkets();
  const catalog = useStore((s) => s.catalog)!;
  const addOffer = useStore((s) => s.addOffer);
  const [o, setO] = useState<Partial<Offer>>({ marketId: markets[0]?.id });
  const [error, setError] = useState<string | null>(null);
  const ingredients = useMemo(() => Object.values(catalog).filter((i) => !i.custom).sort((a, b) => a.name.localeCompare(b.name, 'de')), [catalog]);

  function save() {
    setError(null);
    const price = Number(String(o.price).replace(',', '.'));
    if (!(price > 0)) return setError('Bitte einen gültigen Preis eingeben, z. B. 3,99.');
    addOffer({ ...o, cityId: city.id, price });
    setO({ marketId: o.marketId });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Angebot eintragen" footer={<Button full onClick={save} disabled={!o.title || !o.price || !o.marketId}>Speichern</Button>}>
      <Field label="Markt">
        <div className="flex flex-wrap gap-2">
          {markets.map((m) => <Chip key={m.id} active={m.id === o.marketId} onClick={() => setO({ ...o, marketId: m.id })}>{m.name}</Chip>)}
        </div>
      </Field>
      <Field label="Produkt"><input className={inputCls} value={o.title ?? ''} onChange={(e) => setO({ ...o, title: e.target.value })} placeholder="z. B. Hähnchenbrustfilet" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Preis (${city.currency})`}><input className={inputCls} inputMode="decimal" value={o.price ?? ''} onChange={(e) => setO({ ...o, price: e.target.value as unknown as number })} placeholder="3,99" /></Field>
        <Field label="Menge"><input className={inputCls} value={o.quantity ?? ''} onChange={(e) => setO({ ...o, quantity: e.target.value })} placeholder="500 g" /></Field>
      </div>
      <Field label="Gültig bis"><input type="date" className={inputCls} value={o.validTo ?? ''} onChange={(e) => setO({ ...o, validTo: e.target.value })} /></Field>
      <Field label="Zutat" hint="Leer lassen = automatisch erkennen">
        <select className={inputCls} value={o.ingredientId ?? ''} onChange={(e) => setO({ ...o, ingredientId: e.target.value || null })}>
          <option value="">Automatisch</option>
          {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </Field>
      {error && <p className="rounded-xl bg-accent-soft p-3 text-sm text-accent">{error}</p>}
    </Sheet>
  );
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Stand des wöchentlichen Abrufs (samstagabends per GitHub Action) – und ob der Familien-Schlüssel fehlt. */
function AutoFetchCard() {
  const remote = useStore((s) => s.remote);
  const city = useCity();
  if (remote.state === 'none' || remote.state === 'loading' || !remote.status) return null;
  const sources = remote.status.sources.filter((x) => x.cityId === city.id || x.cityIds?.includes(city.id));
  return (
    <Card className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <Wifi size={18} className="text-brand" />
        <p className="font-semibold">Automatischer Abruf</p>
        <span className="ml-auto text-xs text-muted">{fmtWhen(remote.status.updatedAt)}</span>
      </div>
      {remote.state !== 'ok' ? (
        <Link to="/profil" className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm">
          <KeyRound size={16} className="mt-0.5 shrink-0 text-warn" />
          <span>
            {remote.state === 'wrong' ? 'Der Familien-Schlüssel passt nicht.' : 'Die Angebote sind verschlüsselt.'} Unter <b>Profil → Familien-Schlüssel</b>{' '}
            eintragen oder den Einladungslink öffnen.
          </span>
        </Link>
      ) : sources.length ? (
        <ul className="space-y-1.5 text-sm">
          {sources.map((x) => (
            <li key={x.id} className="flex items-start gap-2">
              <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', x.ok ? 'bg-good' : 'bg-accent')} />
              <span><b>{x.label}</b>: {x.ok ? `${x.count} Angebote` : x.note ?? 'nicht abrufbar'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Für {city.name} gibt es noch keinen automatischen Abruf – Prospektfotos auslesen oder Angebote eintragen.</p>
      )}
      <p className="mt-2 text-[11px] text-muted">Jeden Samstagabend (kanadische Prospekte zusätzlich donnerstags) aus veröffentlichten Prospekten{remote.status.provider ? `, ausgelesen mit ${remote.status.provider}` : ''}.</p>
    </Card>
  );
}

export function Offers() {
  const offers = useStore((s) => s.offers)!;
  const catalog = useStore((s) => s.catalog)!;
  const recipes = useStore((s) => s.recipes)!;
  const deleteOffer = useStore((s) => s.deleteOffer);
  const clearOffers = useStore((s) => s.clearOffers);
  const loadDemoOffers = useStore((s) => s.loadDemoOffers);
  const demoAllowed = useStore((s) => s.features!.demoOffers);
  const claude = useStore((s) => s.features!.claude);
  const city = useCity();
  const markets = useSelectedMarkets();
  const [market, setMarket] = useState<string | null>(null);
  const [upload, setUpload] = useState(false);
  const [manual, setManual] = useState(false);
  const t = today();

  const list = offers.filter((o) => o.cityId === city.id && markets.some((m) => m.id === o.marketId) && isOfferValid(o, t) && (!market || o.marketId === market));
  const demoCount = offers.filter((o) => o.source === 'demo' && o.cityId === city.id).length;
  const uses = (id?: string | null) => (id ? recipes.filter((r) => r.ingredients.some((x) => x.i === id)).length : 0);
  const byMarket = markets.map((m) => ({ m, items: list.filter((o) => o.marketId === m.id) })).filter((g) => g.items.length);


  return (
    <div className="px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <h1 className="font-display pt-2 text-[28px] font-semibold">Angebote</h1>
      <p className="mt-0.5 text-sm text-muted">{city.name}{city.plz ? ` (${city.plz})` : ''} · {list.length} gültige Angebote</p>

      {demoCount > 0 && (
        <div className="mt-4 rounded-2xl border border-warn/30 bg-warn-soft p-3.5 text-sm">
          <p><b>Beispielangebote:</b> {demoCount} erfundene Angebote zum Ausprobieren. Trag echte Angebote ein und entferne die Beispiele.</p>
          <button className="mt-2 font-semibold text-warn" onClick={() => clearOffers({ source: 'demo', cityId: city.id })}>
            Beispiele entfernen
          </button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Button variant="primary" onClick={() => setUpload(true)}><Camera size={18} /> Prospekt-Foto</Button>
        <Button variant="secondary" onClick={() => setManual(true)}><PenLine size={18} /> Eintragen</Button>
      </div>
      <p className="mt-2 flex items-start gap-2 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        {claude
          ? 'Prospektseiten abfotografieren – die KI liest die Angebote aus. Oder einzelne Angebote selbst eintragen.'
          : 'Angebote selbst eintragen – oder unter Profil → KI einen kostenlosen Gemini-Schlüssel hinterlegen, dann liest die App Prospektfotos aus.'}
      </p>

      <AutoFetchCard />

      {markets.length > 1 && (
        <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4">
          <Chip active={!market} onClick={() => setMarket(null)}>Alle</Chip>
          {markets.map((m) => <Chip key={m.id} active={market === m.id} onClick={() => setMarket(m.id)}>{m.name}</Chip>)}
        </div>
      )}

      {!markets.length ? (
        <EmptyState icon={<Info size={28} />} title="Noch keine Märkte" text={`Für ${city.name} sind noch keine Märkte ausgewählt. Lege sie im Profil an.`} />
      ) : !list.length ? (
        <EmptyState icon={<FileUp size={28} />} title="Keine aktuellen Angebote" text="Trag Angebote ein – die Rezeptvorschläge richten sich danach."
          action={demoAllowed && demoCount === 0 && city.id !== 'zuerich' ? <Button variant="secondary" onClick={loadDemoOffers}><RefreshCw size={16} /> Beispiele laden</Button> : undefined} />
      ) : (
        byMarket.map(({ m, items }) => (
          <section key={m.id} className="mt-5">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-accent">{m.name}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-card)]">
              {items.map((o) => {
                const ing = o.ingredientId ? catalog[o.ingredientId] : undefined;
                const perKg = offerPerKg(o, ing);
                const n = uses(o.ingredientId);
                return (
                  <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium">{o.title}{o.brand ? <span className="text-muted"> · {o.brand}</span> : null}</p>
                      <p className="text-xs text-muted">
                        {o.quantity}{perKg ? ` · ${fmtMoney(perKg, city.currency)}/kg` : ''}{o.validTo ? ` · bis ${new Date(o.validTo + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}` : ''}
                        {o.source === 'demo' && ' · Beispiel'}
                      </p>
                      <p className={cx('mt-0.5 text-xs', ing ? 'text-brand' : 'text-warn')}>
                        {ing ? `→ ${ing.name}${n ? ` · in ${n} Rezepten` : ''}` : 'Keiner Zutat zugeordnet'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="tabular font-semibold">{fmtMoney(o.price, city.currency)}</div>
                      {o.regularPrice && <div className="tabular text-xs text-muted line-through">{fmtMoney(o.regularPrice, city.currency)}</div>}
                    </div>
                    <button onClick={() => deleteOffer(o.id)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label={`${o.title} löschen`}><Trash2 size={15} /></button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <UploadSheet open={upload} onClose={() => setUpload(false)} />
      <ManualSheet open={manual} onClose={() => setManual(false)} />
    </div>
  );
}
