import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus, ChevronRight, Coffee, Heart, Link2, MapPin, Search, Sparkles, Tag, UserRoundCog, X } from 'lucide-react';
import type { RecipeView } from '../../shared/types';
import { autoPlan, autoPlanBreakfast, bestPerFamily, famId, fmtMoney, isBreakfast, weekDates } from '../../shared/logic';
import { useCity, useOfferMap, useRecipesById, useScored, useSelectedMarkets, today } from '../lib/derive';
import { useStore } from '../store';
import { RecipeCard } from '../components/RecipeCard';
import { AddToPlanSheet } from '../components/AddToPlanSheet';
import { ImportSheet } from '../components/ImportSheet';
import { GenerateSheet } from '../components/GenerateSheet';
import { Button, Card, Chip, cx, EmptyState, SectionTitle, Segmented } from '../components/ui';
import { ShopFocusBar } from '../components/ShopFocusBar';
import { MuesliOffers } from '../components/MuesliOffers';

type Filter = 'vegetarisch' | 'vegan' | 'fisch' | 'fleisch' | 'kinder' | 'mealprep' | 'favoriten' | 'eigene' | 'angebot';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'angebot', label: 'Mit Angeboten' },
  { id: 'vegetarisch', label: 'Vegetarisch' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'fisch', label: 'Fisch' },
  { id: 'fleisch', label: 'Fleisch' },
  { id: 'kinder', label: 'Kinderliebling' },
  { id: 'mealprep', label: 'Meal Prep' },
  { id: 'favoriten', label: 'Favoriten' },
  { id: 'eigene', label: 'Meine Rezepte' },
];

const TIMES = [20, 30, 45, 60, 999];
// Beim Frühstück sind Fisch, Fleisch und Meal Prep keine sinnvollen Filter
const BREAKFAST_HIDDEN: Filter[] = ['fisch', 'fleisch', 'mealprep'];

function matches(r: RecipeView, f: Filter, fav: Record<string, string>, offerCount: number) {
  switch (f) {
    case 'vegetarisch': return r.diet === 'vegetarisch' || r.diet === 'vegan';
    case 'vegan': return r.diet === 'vegan';
    case 'fisch': return r.diet === 'pescetarisch';
    case 'fleisch': return r.diet === 'fleisch';
    case 'kinder': return r.tags.includes('kinder');
    case 'mealprep': return r.tags.includes('mealprep');
    case 'favoriten': return !!fav[famId(r)];
    case 'eigene': return r.source === 'import' || r.source === 'ki';
    case 'angebot': return offerCount > 0;
  }
}

export function Discover() {
  const st = useStore((s) => s.state)!;
  const catalog = useStore((s) => s.catalog)!;
  const features = useStore((s) => s.features)!;
  const setPlan = useStore((s) => s.setPlan);
  const toast = useStore((s) => s.toast);
  const city = useCity();
  const markets = useSelectedMarkets();
  const offerMap = useOfferMap();
  const scored = useScored();
  const byId = useRecipesById();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const breakfast = params.get('m') === 'frueh';

  const [maxTime, setMaxTime] = useState(999);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [query, setQuery] = useState('');
  const [offerIng, setOfferIng] = useState<string | null>(null);
  const [adding, setAdding] = useState<RecipeView | null>(null);
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Varianten: nur die beste je Grundrezept zeigen (meist die mit Zutat im Angebot)
    return bestPerFamily(scored.filter(({ recipe: r, cost }) => {
      if (isBreakfast(r) !== breakfast) return false;
      if (r.time > maxTime) return false;
      if (!filters.every((f) => matches(r, f, st.favorites, cost.offerIds.length))) return false;
      if (offerIng && !r.ingredients.some((x) => x.i === offerIng)) return false;
      if (q && !r.title.toLowerCase().includes(q) && !r.ingredients.some((x) => catalog[x.i]?.name.toLowerCase().includes(q))) return false;
      return true;
    }));
  }, [scored, breakfast, maxTime, filters, query, offerIng, st.favorites, catalog]);

  const offerHighlights = useMemo(() => {
    const used = new Map<string, number>();
    for (const s of bestPerFamily(scored.filter((x) => !isBreakfast(x.recipe)))) for (const id of s.cost.offerIds) used.set(id, (used.get(id) ?? 0) + 1);
    return [...offerMap.values()]
      .map((o) => ({ ...o, uses: used.get(o.offer.ingredientId!) ?? 0 }))
      .filter((o) => o.uses > 0)
      .sort((a, b) => b.uses - a.uses);
  }, [offerMap, scored]);

  // Rollierend: die nächsten 7 Tage ab heute
  const week = [...weekDates(0), ...weekDates(1)].filter((d) => d >= today()).slice(0, 7);
  const freeDays = week.filter((d) => !st.plan.some((p) => p.date === d && p.slot !== 'frueh'));
  const freeMornings = week.filter((d) => !st.plan.some((p) => p.date === d && p.slot === 'frueh'));
  const marketName = (id: string) => city.markets.find((m) => m.id === id)?.name ?? id;

  async function planWeek() {
    const entries = autoPlan(freeDays, scored, st, byId, catalog);
    if (!entries.length) return toast('Keine passenden Rezepte für die freien Tage gefunden.');
    await setPlan([...st.plan, ...entries]);
    toast(`${entries.length} ${entries.length === 1 ? 'Gericht' : 'Gerichte'} eingeplant – Zutaten liegen im Einkaufswagen.`, { label: 'Einkaufswagen', to: '/einkauf' });
    nav('/plan');
  }

  async function planBreakfast() {
    const entries = autoPlanBreakfast(freeMornings, scored, st);
    if (!entries.length) return toast('Keine passenden Frühstücksrezepte gefunden.');
    await setPlan([...st.plan, ...entries]);
    toast(`Frühstück für ${entries.length} ${entries.length === 1 ? 'Tag' : 'Tage'} eingeplant – Zutaten liegen im Einkaufswagen.`, { label: 'Einkaufswagen', to: '/einkauf' });
    nav('/plan');
  }

  function setMeal(m: 'haupt' | 'frueh') {
    setParams(m === 'frueh' ? { m: 'frueh' } : {}, { replace: true });
    setOfferIng(null);
    setFilters((f) => (m === 'frueh' ? f.filter((x) => !BREAKFAST_HIDDEN.includes(x)) : f));
  }

  const [top, ...rest] = list;

  return (
    <div className="px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <header className="flex items-start justify-between gap-3 pt-2">
        <div>
          <Link to="/profil" className="inline-flex items-center gap-1 text-xs font-medium text-muted">
            <MapPin size={13} /> {city.name} · {markets.length} {markets.length === 1 ? 'Markt' : 'Märkte'}
          </Link>
          <h1 className="font-display mt-1 text-[28px] font-semibold leading-tight">{breakfast ? 'Was gibt’s zum Frühstück?' : 'Was kochen wir?'}</h1>
        </div>
        <div className="flex gap-2 pt-1">
          <Link to="/favoriten" className="grid size-11 place-items-center rounded-full bg-surface text-accent shadow-[var(--shadow-card)]" aria-label="Favoriten" title="Favoriten">
            <Heart size={20} />
          </Link>
          {features.claude && (
            <button onClick={() => setImporting(true)} className="grid size-11 place-items-center rounded-full bg-surface shadow-[var(--shadow-card)]" aria-label="Rezept per Link hinzufügen" title="Rezept per Link hinzufügen">
              <Link2 size={20} />
            </button>
          )}
          {features.claude && (
            <button onClick={() => setGenerating(true)} className="grid size-11 place-items-center rounded-full bg-surface text-brand shadow-[var(--shadow-card)]" aria-label="KI-Ideen" title="Neue Ideen aus den Angeboten">
              <Sparkles size={20} />
            </button>
          )}
        </div>
      </header>

      {!st.settings.onboarded && (
        <Link to="/profil" className="mt-4 flex items-center gap-3 rounded-2xl bg-brand-soft p-3.5 text-sm">
          <UserRoundCog className="shrink-0 text-brand" size={22} />
          <span className="flex-1"><b>Haushalt einrichten:</b> Wer isst mit? Daraus berechnen wir Portionen und den Nährstoffbedarf jeder Person.</span>
          <ChevronRight size={18} className="text-muted" />
        </Link>
      )}

      <div className="mt-4">
        <Segmented value={breakfast ? 'frueh' : 'haupt'} onChange={setMeal}
          options={[{ value: 'haupt', label: 'Mittag & Abend' }, { value: 'frueh', label: <span className="inline-flex items-center gap-1.5"><Coffee size={15} /> Frühstück</span> }]} />
      </div>

      <ShopFocusBar />

      <div className="relative mt-4">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rezept oder Zutat suchen"
          className="h-12 w-full rounded-2xl border border-line bg-surface pl-11 pr-10 text-base outline-none focus:border-brand" />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-label="Suche leeren"><X size={18} /></button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs font-medium text-muted">Zeit</span>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {TIMES.map((t) => (
            <Chip key={t} active={maxTime === t} onClick={() => setMaxTime(t)} className="h-8 px-3 text-[13px]">
              {t === 999 ? 'Alle' : `≤ ${t} Min`}
            </Chip>
          ))}
        </div>
      </div>
      <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
        {FILTERS.filter((f) => !breakfast || !BREAKFAST_HIDDEN.includes(f.id)).map((f) => (
          <Chip key={f.id} active={filters.includes(f.id)} className="h-8 px-3 text-[13px]"
            onClick={() => setFilters(filters.includes(f.id) ? filters.filter((x) => x !== f.id) : [...filters, f.id])}>
            {f.label}
          </Chip>
        ))}
      </div>

      {breakfast && <MuesliOffers />}

      {breakfast && freeMornings.length > 0 && (
        <Card className="mt-6 flex items-center gap-3.5">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"><Coffee size={24} /></div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold leading-snug">Frühstück planen</div>
            <div className="text-xs text-muted">
              {freeMornings.length} {freeMornings.length === 1 ? 'Tag' : 'Tage'} füllen – wenige Rezepte im Wechsel, damit Packungen leer werden
            </div>
          </div>
          <Button onClick={planBreakfast} className="h-10 px-4">Planen</Button>
        </Card>
      )}

      {!breakfast && offerHighlights.length > 0 && (
        <>
          <SectionTitle action={<Link to="/angebote" className="text-sm font-medium text-brand">Alle</Link>}>Diese Woche im Angebot</SectionTitle>
          <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {offerHighlights.slice(0, 12).map(({ offer, uses }) => {
              const active = offerIng === offer.ingredientId;
              return (
                <button key={offer.id} onClick={() => setOfferIng(active ? null : offer.ingredientId!)}
                  className={cx('flex w-40 shrink-0 flex-col rounded-2xl border p-3 text-left transition-colors',
                    active ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">{marketName(offer.marketId)}</span>
                  <span className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug">{catalog[offer.ingredientId!]?.name}</span>
                  <span className="mt-auto flex items-baseline gap-1.5 pt-1.5">
                    <span className="tabular font-semibold">{fmtMoney(offer.price, city.currency)}</span>
                    {offer.regularPrice && <span className="tabular text-xs text-muted line-through">{fmtMoney(offer.regularPrice, city.currency)}</span>}
                  </span>
                  <span className="text-[11px] text-muted">in {uses} {uses === 1 ? 'Rezept' : 'Rezepten'}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {!breakfast && freeDays.length > 0 && (
        <Card className="mt-6 flex items-center gap-3.5">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"><CalendarPlus size={24} /></div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold leading-snug">Woche planen</div>
            <div className="text-xs text-muted">
              {freeDays.length} freie {freeDays.length === 1 ? 'Tag' : 'Tage'} automatisch füllen – passend zu Angeboten & Zeit
            </div>
          </div>
          <Button onClick={planWeek} className="h-10 px-4">Planen</Button>
        </Card>
      )}

      <SectionTitle action={<span className="text-xs text-muted">{list.length} Rezepte</span>}>{offerIng ? `Rezepte mit ${catalog[offerIng]?.name}` : breakfast ? 'Frühstücksideen' : 'Vorschläge für euch'}</SectionTitle>
      {!list.length ? (
        <EmptyState icon={<Search size={28} />} title="Nichts gefunden" text="Lockere die Filter oder erhöhe die Kochzeit."
          action={<Button variant="secondary" onClick={() => { setFilters([]); setMaxTime(999); setQuery(''); setOfferIng(null); }}>Filter zurücksetzen</Button>} />
      ) : (
        <>
          {top && <RecipeCard big recipe={top.recipe} cost={top.cost} onAdd={() => setAdding(top.recipe)} />}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {rest.map(({ recipe, cost }) => (
              <RecipeCard key={recipe.id} recipe={recipe} cost={cost} onAdd={() => setAdding(recipe)} />
            ))}
          </div>
        </>
      )}

      {!features.claude && (
        <p className="mt-8 flex items-start gap-2 text-xs text-muted">
          <Tag size={14} className="mt-0.5 shrink-0" />
          Preise: Angebotspreise aus deinen Märkten, sonst Richtpreise{city.priceFactor !== 1 ? ` (grob umgerechnet in ${city.currency})` : ''}.
        </p>
      )}

      <AddToPlanSheet recipe={adding} onClose={() => setAdding(null)} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
      <GenerateSheet open={generating} onClose={() => setGenerating(false)} />
    </div>
  );
}
