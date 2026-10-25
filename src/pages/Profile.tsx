import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, ChevronRight, Heart, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { Allergen, DietPref, Person } from '../../shared/types';
import { energyGuide, portionFactor } from '../../shared/references';
import { householdPortions } from '../../shared/logic';
import { useCity } from '../lib/derive';
import { useStore } from '../store';
import { Button, Card, Chip, cx, Field, inputCls, SectionTitle, Segmented, Sheet } from '../components/ui';
import { DataSection } from '../components/DataSection';
import { AiSection } from '../components/AiSection';

const ALLERGENS: { id: Allergen; label: string }[] = [
  { id: 'gluten', label: 'Gluten' }, { id: 'milch', label: 'Milch/Laktose' }, { id: 'ei', label: 'Ei' }, { id: 'erdnuss', label: 'Erdnuss' },
  { id: 'schalenfruechte', label: 'Schalenfrüchte' }, { id: 'soja', label: 'Soja' }, { id: 'fisch', label: 'Fisch' }, { id: 'krebstiere', label: 'Krebstiere' },
  { id: 'weichtiere', label: 'Weichtiere' }, { id: 'sellerie', label: 'Sellerie' }, { id: 'senf', label: 'Senf' }, { id: 'sesam', label: 'Sesam' },
  { id: 'sulfite', label: 'Sulfite' }, { id: 'lupinen', label: 'Lupinen' },
];
const DIETS: { value: DietPref; label: string }[] = [
  { value: 'alles', label: 'Alles' }, { value: 'pescetarisch', label: 'Pesce' }, { value: 'vegetarisch', label: 'Veggie' }, { value: 'vegan', label: 'Vegan' },
];
const EMOJI = ['🧑', '👩', '👨', '🧓', '👵', '👴', '🧒', '👧', '👦', '👶'];
const PAL: { value: 1.4 | 1.6 | 1.8; label: string; hint: string }[] = [
  { value: 1.4, label: 'wenig', hint: 'überwiegend sitzend' },
  { value: 1.6, label: 'mittel', hint: 'sitzend mit Bewegung, Kinder normal aktiv' },
  { value: 1.8, label: 'viel', hint: 'stehend/gehend, regelmäßig Sport' },
];

function PersonSheet({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const settings = useStore((s) => s.state!.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [p, setP] = useState<Person | null>(person);
  if (!person || !p) return null;
  const isNew = !settings.people.some((x) => x.id === p.id);
  async function save() {
    const people = isNew ? [...settings.people, p!] : settings.people.map((x) => (x.id === p!.id ? p! : x));
    await setSettings({ people, onboarded: true });
    onClose();
  }
  async function remove() {
    await setSettings({ people: settings.people.filter((x) => x.id !== p!.id), onboarded: true });
    onClose();
  }
  return (
    <Sheet open onClose={onClose} title={isNew ? 'Person hinzufügen' : 'Person bearbeiten'}
      footer={<div className="flex gap-2">{!isNew && <Button variant="secondary" onClick={remove}><Trash2 size={16} /></Button>}<Button full onClick={save} disabled={!p.name.trim()}>Speichern</Button></div>}>
      <div className="no-scrollbar -mx-5 mb-3 flex gap-1.5 overflow-x-auto px-5">
        {EMOJI.map((e) => (
          <button key={e} onClick={() => setP({ ...p, emoji: e })} className={cx('grid size-11 shrink-0 place-items-center rounded-full text-2xl', p.emoji === e ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface-2')}>{e}</button>
        ))}
      </div>
      <Field label="Name"><input className={inputCls} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Alter (Jahre)"><input className={inputCls} type="number" min={1} max={110} value={p.age} onChange={(e) => setP({ ...p, age: Math.max(1, Number(e.target.value) || 1) })} /></Field>
        <Field label="Gewicht (kg, optional)"><input className={inputCls} type="number" min={5} max={250} value={p.weightKg ?? ''} onChange={(e) => setP({ ...p, weightKg: e.target.value ? Number(e.target.value) : undefined })} /></Field>
      </div>
      <Field label="Referenzwerte für" hint="Die Fachgesellschaften geben Referenzwerte getrennt nach männlich/weiblich an.">
        <Segmented value={p.sex} onChange={(v) => setP({ ...p, sex: v })} options={[{ value: 'w', label: 'weiblich' }, { value: 'm', label: 'männlich' }]} />
      </Field>
      <Field label="Körperliche Aktivität" hint={PAL.find((x) => x.value === p.pal)?.hint}>
        <Segmented value={p.pal} onChange={(v) => setP({ ...p, pal: v })} options={PAL.map((x) => ({ value: x.value, label: x.label }))} />
      </Field>
      <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
        Richtwert Energie: <b className="text-ink">{energyGuide(p).toLocaleString('de-DE')} kcal/Tag</b> · Portion: {portionFactor(p).toLocaleString('de-DE')} × Erwachsenenportion.
        {p.age < 1 && ' Für Säuglinge gelten eigene Empfehlungen – bitte nicht über die App planen.'}
      </p>
    </Sheet>
  );
}

export function Profile() {
  const st = useStore((s) => s.state)!;
  const cities = useStore((s) => s.cities)!;
  const catalog = useStore((s) => s.catalog)!;
  const features = useStore((s) => s.features)!;
  const setSettings = useStore((s) => s.setSettings);
  const s = st.settings;
  const city = useCity();
  const [editing, setEditing] = useState<Person | null>(null);
  const [newMarket, setNewMarket] = useState('');
  const [dislikeQuery, setDislikeQuery] = useState('');
  const [pantryQuery, setPantryQuery] = useState('');

  const selected = s.marketIds[city.id] ?? [];
  const ingredients = useMemo(() => Object.values(catalog).filter((i) => !i.custom).sort((a, b) => a.name.localeCompare(b.name, 'de')), [catalog]);

  function toggleMarket(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSettings({ marketIds: { ...s.marketIds, [city.id]: next } });
  }
  function addMarket(name: string) {
    const n = name.trim();
    if (!n) return;
    const id = `custom-${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const list = [...(s.customMarkets[city.id] ?? []).filter((m) => m.id !== id), { id, name: n, custom: true }];
    setSettings({ customMarkets: { ...s.customMarkets, [city.id]: list }, marketIds: { ...s.marketIds, [city.id]: [...new Set([...selected, id])] } });
    setNewMarket('');
  }
  function removeMarket(id: string) {
    setSettings({
      customMarkets: { ...s.customMarkets, [city.id]: (s.customMarkets[city.id] ?? []).filter((m) => m.id !== id) },
      marketIds: { ...s.marketIds, [city.id]: selected.filter((x) => x !== id) },
    });
  }

  const portions = householdPortions(s);

  return (
    <div className="px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <h1 className="font-display pt-2 text-[28px] font-semibold">Profil</h1>

      <SectionTitle action={<span className="text-xs text-muted">≈ {portions.toLocaleString('de-DE')} {portions === 1 ? 'Portion' : 'Portionen'}</span>}>Wer isst mit?</SectionTitle>
      <p className="-mt-1 mb-3 text-xs text-muted">Für Portionen und den Nährstoffbedarf. Der erste Name erscheint als Absender, wenn du etwas teilst.</p>
      <div className="space-y-2">
        {s.people.map((p) => (
          <button key={p.id} onClick={() => setEditing(p)} className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-[var(--shadow-card)]">
            <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-2xl">{p.emoji ?? '🙂'}</span>
            <span className="flex-1">
              <span className="block font-semibold">{p.name}</span>
              <span className="text-xs text-muted">{p.age} J. · {p.sex === 'w' ? 'w' : 'm'} · Aktivität {PAL.find((x) => x.value === p.pal)?.label} · {energyGuide(p).toLocaleString('de-DE')} kcal</span>
            </span>
            <ChevronRight size={18} className="text-muted" />
          </button>
        ))}
        <Button variant="secondary" full onClick={() => setEditing({ id: `p${Date.now()}`, name: '', sex: 'w', age: 30, pal: 1.6, emoji: '🧑' })}>
          <Plus size={18} /> Person hinzufügen
        </Button>
        {!s.onboarded && (
          <Button full onClick={() => setSettings({ onboarded: true })}><Check size={18} /> Haushalt passt so</Button>
        )}
      </div>

      <SectionTitle>Ernährung</SectionTitle>
      <Card>
        <Field label="Ernährungsform">
          <Segmented value={s.diet === 'flexitarisch' ? 'alles' : s.diet} onChange={(v) => setSettings({ diet: v })} options={DIETS} />
        </Field>
        <Field label="Allergien & Unverträglichkeiten" hint="Rezepte mit diesen Allergenen werden ausgeblendet (14 Hauptallergene nach LMIV).">
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => (
              <Chip key={a.id} className="h-8 px-3 text-[13px]" active={s.allergies.includes(a.id)}
                onClick={() => setSettings({ allergies: s.allergies.includes(a.id) ? s.allergies.filter((x) => x !== a.id) : [...s.allergies, a.id] })}>
                {a.label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Mag ich nicht">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {s.dislikes.map((d) => (
              <span key={d} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-sm text-accent">
                {catalog[d]?.name ?? d}
                <button onClick={() => setSettings({ dislikes: s.dislikes.filter((x) => x !== d) })} aria-label="Entfernen"><X size={14} /></button>
              </span>
            ))}
          </div>
          <input className={inputCls} value={dislikeQuery} onChange={(e) => setDislikeQuery(e.target.value)} placeholder="Zutat suchen, z. B. Pilze" />
          {dislikeQuery && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ingredients.filter((i) => i.name.toLowerCase().includes(dislikeQuery.toLowerCase()) && !s.dislikes.includes(i.id)).slice(0, 8).map((i) => (
                <Chip key={i.id} className="h-8 text-[13px]" onClick={() => { setSettings({ dislikes: [...s.dislikes, i.id] }); setDislikeQuery(''); }}>+ {i.name}</Chip>
              ))}
            </div>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Werktags: max. ${s.maxTimeWeekday} Min`}>
            <input type="range" min={15} max={90} step={5} value={s.maxTimeWeekday} onChange={(e) => setSettings({ maxTimeWeekday: Number(e.target.value) })} className="w-full accent-[var(--color-brand)]" />
          </Field>
          <Field label={`Wochenende: max. ${s.maxTimeWeekend} Min`}>
            <input type="range" min={15} max={150} step={5} value={s.maxTimeWeekend} onChange={(e) => setSettings({ maxTimeWeekend: Number(e.target.value) })} className="w-full accent-[var(--color-brand)]" />
          </Field>
        </div>
      </Card>

      <SectionTitle>Ort & Märkte</SectionTitle>
      <Card>
        <Field label="Stadt">
          <div className="flex flex-wrap gap-2">
            {cities.map((c) => <Chip key={c.id} active={c.id === s.cityId} onClick={() => setSettings({ cityId: c.id })}>{c.name}</Chip>)}
          </div>
        </Field>
        {city.note && <p className="-mt-1 mb-3 text-xs text-muted">{city.note}</p>}
        <Field label="Meine Märkte">
          <div className="flex flex-wrap gap-2">
            {city.markets.map((m) => (
              <span key={m.id} className="inline-flex items-center">
                <Chip active={selected.includes(m.id)} onClick={() => toggleMarket(m.id)}>{selected.includes(m.id) && <Check size={14} />}{m.name}</Chip>
                {m.custom && <button onClick={() => removeMarket(m.id)} className="ml-0.5 text-muted" aria-label={`${m.name} entfernen`}><X size={14} /></button>}
              </span>
            ))}
            {!city.markets.length && <span className="text-sm text-muted">Noch keine Märkte.</span>}
          </div>
        </Field>
        {city.suggestions && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {city.suggestions.filter((n) => !city.markets.some((m) => m.name === n)).map((n) => (
              <Chip key={n} className="h-8 text-[13px]" onClick={() => addMarket(n)}>+ {n}</Chip>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); addMarket(newMarket); }} className="flex gap-2">
          <input className={inputCls} value={newMarket} onChange={(e) => setNewMarket(e.target.value)} placeholder="Weiteren Markt hinzufügen" />
          <Button type="submit" variant="secondary" disabled={!newMarket.trim()}><Plus size={18} /></Button>
        </form>
      </Card>

      <SectionTitle>Vorratsschrank</SectionTitle>
      <Card>
        <p className="mb-3 text-sm text-muted">Was du immer da hast, kommt nicht auf die Einkaufsliste.</p>
        <div className="flex flex-wrap gap-1.5">
          {s.pantry.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm">
              {catalog[id]?.name ?? id}
              <button onClick={() => setSettings({ pantry: s.pantry.filter((x) => x !== id) })} aria-label="Entfernen" className="text-muted"><X size={14} /></button>
            </span>
          ))}
        </div>
        <input className={`${inputCls} mt-3`} value={pantryQuery} onChange={(e) => setPantryQuery(e.target.value)} placeholder="Vorrat ergänzen, z. B. Reis" />
        {pantryQuery && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ingredients.filter((i) => i.name.toLowerCase().includes(pantryQuery.toLowerCase()) && !s.pantry.includes(i.id)).slice(0, 8).map((i) => (
              <Chip key={i.id} className="h-8 text-[13px]" onClick={() => { setSettings({ pantry: [...s.pantry, i.id] }); setPantryQuery(''); }}>+ {i.name}</Chip>
            ))}
          </div>
        )}
      </Card>

      <SectionTitle>Nährwerte</SectionTitle>
      <Card>
        <Field label="Prozentangaben bezogen auf">
          <Segmented value={s.nutrientRef} onChange={(v) => setSettings({ nutrientRef: v })}
            options={[{ value: 'person', label: 'Persönlicher Bedarf' }, { value: 'label', label: 'Etikett (2000 kcal)' }]} />
        </Field>
        <Field label="Mahlzeiten pro Tag" hint="Bestimmt die Orientierungslinie: welcher Anteil des Tagesbedarfs auf eine Mahlzeit entfällt.">
          <Segmented value={s.mealsPerDay} onChange={(v) => setSettings({ mealsPerDay: v })} options={[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
        </Field>
        <Link to="/quellen" className="mt-1 flex items-center gap-2 text-sm font-medium text-brand"><BookOpen size={16} /> Quellen & Methodik</Link>
        <Link to="/favoriten" className="mt-3 flex items-center gap-2 text-sm font-medium text-brand"><Heart size={16} /> Favoriten</Link>
      </Card>

      <AiSection />
      <DataSection />

      {features.server && (
        <>
          <SectionTitle>KI & Dienste</SectionTitle>
          <Card className="space-y-2 text-sm">
            <p className="flex items-start gap-2"><Sparkles size={16} className={cx('mt-0.5 shrink-0', features.claude ? 'text-brand' : 'text-muted')} />
              <span><b>Claude:</b> {features.claude ? `aktiv (${features.model}) – Prospekte auslesen, Instagram-Import, neue Rezepte` : 'nicht eingerichtet'}</span></p>
            <p className="flex items-start gap-2"><Sparkles size={16} className={cx('mt-0.5 shrink-0', features.images ? 'text-brand' : 'text-muted')} />
              <span><b>Bild-KI:</b> {features.images ? 'aktiv – Fotos für neue KI-Rezepte' : 'nicht eingerichtet'}</span></p>
          </Card>
        </>
      )}
      <p className="mt-6 pb-4 text-center text-xs text-muted">
        Marktküche · Nährwertdaten: Max Rubner-Institut, BLS 4.0 (CC BY 4.0) · Fotos der Grundrezepte: Unsplash
      </p>
      <PersonSheet key={editing?.id} person={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
