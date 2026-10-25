import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ChefHat, Clock, ExternalLink, Flame, Heart, PiggyBank, Share2, ShoppingCart, ThumbsDown, ThumbsUp, Timer, Trash2,
} from 'lucide-react';
import { fmtAmount } from '../../shared/units';
import { famId, fmtMoney, isBreakfast, recipeCost, refPerKg } from '../../shared/logic';
import { isBaseRecipe, toRecipe } from '../local/data';
import { customIngredientsOf, sendLink, shareUrl } from '../lib/share';
import { useCity, useOfferMap, usePortions, useRecipesById } from '../lib/derive';
import { useMyName, useStore } from '../store';
import { AddToPlanSheet } from '../components/AddToPlanSheet';
import { NutritionPanel } from '../components/NutritionPanel';
import { DIET_LABEL } from '../components/RecipeCard';
import { FavoriteSheet } from '../components/FavoriteSheet';
import { Button, Card, cx, EmptyState, RecipeImage, Segmented, Stepper } from '../components/ui';

const ALLERGEN_LABEL: Record<string, string> = {
  gluten: 'Gluten', ei: 'Ei', fisch: 'Fisch', erdnuss: 'Erdnuss', soja: 'Soja', milch: 'Milch', schalenfruechte: 'Schalenfrüchte',
  sellerie: 'Sellerie', senf: 'Senf', sesam: 'Sesam', sulfite: 'Sulfite', lupinen: 'Lupinen', krebstiere: 'Krebstiere', weichtiere: 'Weichtiere',
};

export function RecipeDetail() {
  const { id } = useParams();
  const byId = useRecipesById();
  const r = id ? byId[id] : undefined;
  const catalog = useStore((s) => s.catalog)!;
  const st = useStore((s) => s.state)!;
  const rate = useStore((s) => s.rate);
  const removeRecipe = useStore((s) => s.removeRecipe);
  const toast = useStore((s) => s.toast);
  const myName = useMyName();
  const city = useCity();
  const offers = useOfferMap();
  const portions = usePortions();
  const nav = useNavigate();
  const [servings, setServings] = useState(Math.max(1, Math.round(portions * 2) / 2));
  const [tab, setTab] = useState<'zutaten' | 'naehrwerte' | 'zubereitung'>('zutaten');
  const [adding, setAdding] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const recipes = useStore((s) => s.recipes)!;
  const siblings = useMemo(() => (r?.family ? recipes.filter((x) => x.family === r.family) : []), [recipes, r?.family]);
  // Position der austauschbaren Zutat (dort unterscheiden sich die Varianten)
  const slotIdx = r ? r.ingredients.findIndex((x, k) => siblings.some((v) => v.ingredients[k]?.i !== x.i)) : -1;

  const cost = useMemo(() => (r ? recipeCost(r, servings, catalog, offers, city) : null), [r, servings, catalog, offers, city]);

  if (!r || !cost) {
    return <EmptyState icon={<ChefHat size={28} />} title="Rezept nicht gefunden" text="Vielleicht wurde es gelöscht." action={<Button onClick={() => nav('/')}>Zur Übersicht</Button>} />;
  }
  const f = servings / r.servings;
  const favCat = st.favCategories.find((c) => c.id === st.favorites[famId(r)]);
  const fav = !!st.favorites[famId(r)];
  const rating = st.ratings[r.id] ?? 0;
  const marketName = (mid: string) => city.markets.find((m) => m.id === mid)?.name ?? mid;

  /** Grundrezepte hat jede Marktküche – sie reisen nur als Kennung; eigene Rezepte vollständig. */
  async function share() {
    const url = await shareUrl({
      v: 1,
      kind: 'rezept',
      from: myName || undefined,
      recipes: isBaseRecipe(r!.id) ? [] : [toRecipe(r!)],
      plan: [{ r: r!.id, s: isBreakfast(r!) ? 'frueh' : 'abend', n: servings }],
      items: [],
      ingredients: customIngredientsOf([r!], catalog),
    });
    const res = await sendLink(url, r!.title, `${myName || 'Ich'} teilt ein Rezept aus der Marktküche: ${r!.title}`);
    if (res === 'kopiert') toast('Link kopiert – zum Beispiel in WhatsApp einfügen.');
  }

  return (
    <div className="pb-28">
      <div className="relative">
        <RecipeImage eager src={r.image} alt={r.title} diet={r.diet} w={1000} className="aspect-[4/3] w-full sm:aspect-[16/9] sm:rounded-b-3xl" />
        <div className="absolute inset-x-0 top-0 flex justify-between p-4 pt-[max(env(safe-area-inset-top),1rem)]">
          <button onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} className="grid size-10 place-items-center rounded-full bg-white/90 text-[#1f1d1a] shadow" aria-label="Zurück"><ArrowLeft size={20} /></button>
          <div className="flex gap-2">
            <button onClick={share} className="grid size-10 place-items-center rounded-full bg-white/90 text-[#1f1d1a] shadow" aria-label="Rezept teilen">
              <Share2 size={19} />
            </button>
            <button onClick={() => setFavOpen(true)} className={cx('grid size-10 place-items-center rounded-full bg-white/90 shadow', fav ? 'text-[#d9472b]' : 'text-[#1f1d1a]')}
              aria-label={fav ? `Favorit (${favCat?.name ?? ''}) bearbeiten` : 'Zu Favoriten'} aria-pressed={fav}>
              <Heart size={20} fill={fav ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
        {r.imageCredit && <span className="absolute bottom-2 right-3 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/90">Foto: {r.imageCredit}</span>}
      </div>

      <div className="relative -mt-6 rounded-t-3xl bg-bg px-4 pt-5">
        <h1 className="font-display text-[28px] font-semibold leading-tight">{r.title}</h1>
        {r.teaser && <p className="mt-1.5 text-[15px] text-muted">{r.teaser}</p>}

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-surface p-2.5 shadow-[var(--shadow-card)]">
            <Clock size={18} className="mx-auto text-brand" />
            <div className="mt-1 text-sm font-semibold">{r.time} Min</div>
            <div className="text-[11px] text-muted">{r.active ? `${r.active} Min aktiv` : 'gesamt'}</div>
          </div>
          <div className="rounded-2xl bg-surface p-2.5 shadow-[var(--shadow-card)]">
            <Flame size={18} className="mx-auto text-accent" />
            <div className="mt-1 text-sm font-semibold">{Math.round(r.perServing.kcal ?? 0)} kcal</div>
            <div className="text-[11px] text-muted">pro Portion</div>
          </div>
          <div className="rounded-2xl bg-surface p-2.5 shadow-[var(--shadow-card)]">
            <PiggyBank size={18} className="mx-auto text-good" />
            <div className="tabular mt-1 text-sm font-semibold">{fmtMoney(cost.perPortion, city.currency)}</div>
            <div className="text-[11px] text-muted">pro Portion</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-brand-soft px-2.5 py-1 font-medium text-brand">{DIET_LABEL[r.diet]}</span>
          {r.difficulty && <span className="rounded-full bg-surface-2 px-2.5 py-1">{r.difficulty}</span>}
          {r.tags.filter((t) => t !== 'schnell').slice(0, 4).map((t) => <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1">{t === 'kinder' ? 'kinderfreundlich' : t}</span>)}
          {r.source === 'ki' && <span className="rounded-full bg-surface-2 px-2.5 py-1">KI-Rezept</span>}
        </div>
        {siblings.length > 1 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Varianten – je nach Angebot</p>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {siblings.map((v) => {
                const onOffer = slotIdx >= 0 && offers.has(v.ingredients[slotIdx]?.i);
                return (
                  <Link key={v.id} to={`/rezept/${v.id}`} replace
                    className={cx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium',
                      v.id === r.id ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface')}>
                    {v.variantLabel}
                    {onOffer && <span className={cx('rounded-full px-1.5 text-[10px] font-bold', v.id === r.id ? 'bg-white/25' : 'bg-accent-soft text-accent')}>Angebot</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        {r.allergens.length > 0 && (
          <p className="mt-2 text-xs text-muted">Enthält: {r.allergens.map((a) => ALLERGEN_LABEL[a] ?? a).join(', ')}</p>
        )}

        <Card className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Portionen</div>
              <div className="text-xs text-muted">Haushalt ≈ {portions.toLocaleString('de-DE')}</div>
            </div>
            <Stepper value={servings} onChange={setServings} />
          </div>
          <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
            <div>
              <div className="tabular text-lg font-semibold">≈ {fmtMoney(cost.total, city.currency)}</div>
              <div className="text-xs text-muted">anteilige Kosten{cost.unknownPrice ? ' (einige Preise unbekannt)' : ''}</div>
            </div>
            {cost.saving > 0.05 && (
              <div className="text-right">
                <div className="tabular font-semibold text-accent">− {fmtMoney(cost.saving, city.currency)}</div>
                <div className="text-xs text-muted">durch {cost.offerIds.length} Angebote</div>
              </div>
            )}
          </div>
        </Card>

        <div className="sticky top-0 z-10 -mx-4 mt-5 bg-bg/95 px-4 py-2 backdrop-blur">
          <Segmented value={tab} onChange={setTab} options={[
            { value: 'zutaten', label: 'Zutaten' }, { value: 'naehrwerte', label: 'Nährwerte' }, { value: 'zubereitung', label: 'Zubereitung' },
          ]} />
        </div>

        {tab === 'zutaten' && (
          <ul className="mt-2 divide-y divide-line">
            {r.ingredients.map((x, k) => {
              const ing = catalog[x.i];
              const { amount, name } = fmtAmount(ing, x.q * f, x.u);
              const o = offers.get(x.i);
              const pantry = st.settings.pantry.includes(x.i);
              const ref = ing ? refPerKg(ing, city) : null;
              return (
                <li key={k} className="flex items-center gap-3 py-3">
                  <span className="tabular w-20 shrink-0 text-right text-sm font-semibold">{amount}</span>
                  <span className="flex-1 text-[15px]">
                    {name || x.raw}
                    {x.note && <span className="text-muted">, {x.note}</span>}
                  </span>
                  {o ? (
                    <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-right text-[11px] font-semibold leading-tight text-accent"
                      title={`${o.offer.title} ${o.offer.quantity ?? ''}${ref ? ` · sonst ca. ${fmtMoney(ref, city.currency)}/kg` : ''}`}>
                      {marketName(o.offer.marketId)}<br />{fmtMoney(o.offer.price, city.currency)}
                    </span>
                  ) : pantry ? (
                    <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted">Vorrat</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {tab === 'naehrwerte' && (
          <div className="mt-3">
            <NutritionPanel perServing={r.perServing} coverage={r.nutrientCoverage} />
          </div>
        )}

        {tab === 'zubereitung' && (
          <ol className="mt-3 space-y-3">
            {r.steps.map((s, k) => (
              <li key={k} className="flex gap-3.5 rounded-2xl bg-surface p-4 shadow-[var(--shadow-card)]">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-brand-ink">{k + 1}</span>
                <div className="flex-1">
                  <p className="text-[15px] leading-relaxed">{s.t}</p>
                  {s.min && <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand"><Timer size={13} /> {s.min} Min</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-8 flex items-center justify-between rounded-2xl bg-surface-2 p-3">
          <span className="text-sm">Wie hat’s geschmeckt?</span>
          <div className="flex gap-2">
            <button onClick={() => rate(r.id, rating === 1 ? 0 : 1)} aria-pressed={rating === 1}
              className={cx('grid size-10 place-items-center rounded-full', rating === 1 ? 'bg-brand text-brand-ink' : 'bg-surface')} aria-label="Lecker"><ThumbsUp size={18} /></button>
            <button onClick={() => rate(r.id, rating === -1 ? 0 : -1)} aria-pressed={rating === -1}
              className={cx('grid size-10 place-items-center rounded-full', rating === -1 ? 'bg-accent text-white' : 'bg-surface')} aria-label="Nicht so"><ThumbsDown size={18} /></button>
          </div>
        </div>

        {(r.sourceUrl || r.source !== 'basis') && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            {r.sourceUrl && (
              <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-brand">
                <ExternalLink size={15} /> Originalrezept
              </a>
            )}
            {r.source !== 'basis' && (
              <button className="inline-flex items-center gap-1.5 text-muted" onClick={async () => {
                if (confirm('Dieses Rezept löschen?')) {
                  await removeRecipe(r.id);
                  nav('/');
                }
              }}><Trash2 size={15} /> Rezept löschen</button>
            )}
          </div>
        )}
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={() => setAdding(true)}>
            <ShoppingCart size={18} /> Auswählen
          </Button>
          <Link to={`/kochen/${r.id}?p=${servings}`} className="flex-1">
            <Button full><ChefHat size={18} /> Kochmodus</Button>
          </Link>
        </div>
      </div>
      <AddToPlanSheet recipe={adding ? r : null} onClose={() => setAdding(false)} />
      <FavoriteSheet recipe={favOpen ? r : null} onClose={() => setFavOpen(false)} />
    </div>
  );
}
