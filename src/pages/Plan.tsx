import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Coffee, Fish, Leaf, Beef, Plus, Trash2, Wand2 } from 'lucide-react';
import type { Nutrients, PlanEntry, RecipeView } from '../../shared/types';
import {
  addNutrients, autoPlan, autoPlanBreakfast, bestPerFamily, fitsPrefs, fmtMoney, isBreakfast, recipeCost, scaleNutrients, SLOT_LABEL, SLOT_ORDER, weekDates,
} from '../../shared/logic';
import { personNeeds, portionFactor } from '../../shared/references';
import { dayLabel, today, useCity, useOfferMap, useRecipesById, useScored } from '../lib/derive';
import { useStore } from '../store';
import { AddToPlanSheet } from '../components/AddToPlanSheet';
import { ShopFocusBar } from '../components/ShopFocusBar';
import { NutrientRows } from '../components/NutritionPanel';
import { Button, Card, cx, RecipeImage, SectionTitle, Segmented, Sheet } from '../components/ui';

function PickSheet({ pick, onClose }: { pick: { date: string; breakfast: boolean } | null; onClose: () => void }) {
  const scored = useScored();
  const st = useStore((s) => s.state)!;
  const [chosen, setChosen] = useState<RecipeView | null>(null);
  const city = useCity();
  if (!pick) return null;
  const { date, breakfast } = pick;
  const weekend = [0, 6].includes(new Date(date + 'T12:00:00').getDay());
  const maxT = weekend ? st.settings.maxTimeWeekend : st.settings.maxTimeWeekday;
  const list = bestPerFamily(scored.filter((s) => isBreakfast(s.recipe) === breakfast && s.recipe.time <= maxT)).slice(0, 12);
  if (chosen) {
    return <AddToPlanSheet recipe={chosen} presetDate={date} presetSlot={breakfast ? 'frueh' : undefined} onClose={() => { setChosen(null); onClose(); }} />;
  }
  return (
    <Sheet open onClose={onClose} title={`${breakfast ? 'Frühstück' : 'Rezept'} für ${dayLabel(date, true)}`}>
      <p className="mb-3 text-sm text-muted">Passend zu Angeboten und höchstens {maxT} Minuten.</p>
      <ul className="space-y-2">
        {list.map(({ recipe, cost }) => (
          <li key={recipe.id}>
            <button onClick={() => setChosen(recipe)} className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 p-2 text-left">
              <RecipeImage src={recipe.image} alt="" diet={recipe.diet} w={160} className="size-14 shrink-0 rounded-xl" />
              <span className="flex-1">
                <span className="line-clamp-1 text-sm font-semibold">{recipe.title}</span>
                <span className="text-xs text-muted">{recipe.time} Min · {fmtMoney(cost.perPortion, city.currency)}/Port.{cost.offerIds.length ? ` · ${cost.offerIds.length} Angebote` : ''}</span>
              </span>
              <Plus size={18} className="mr-2 text-brand" />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function WeekBalance({ entries, byId }: { entries: PlanEntry[]; byId: Record<string, RecipeView> }) {
  const people = useStore((s) => s.state!.settings.people);
  const mealsPerDay = useStore((s) => s.state!.settings.mealsPerDay);
  const city = useCity();
  const [who, setWho] = useState(people[0]?.id);
  const p = people.find((x) => x.id === who) ?? people[0];
  if (!p || !entries.length) return null;
  const pf = portionFactor(p);
  const days = new Set(entries.map((e) => e.date)).size;
  let sum: Nutrients = {};
  let meat = 0;
  let fishMeals = 0;
  let plantMeals = 0;
  let mainMeals = 0;
  for (const e of entries) {
    const r = byId[e.recipeId];
    if (!r) continue;
    sum = addNutrients(sum, scaleNutrients(r.perServing, pf));
    meat += r.meatG * pf;
    if (e.slot === 'frueh') continue;
    mainMeals++;
    if (r.fishG > 0) fishMeals++;
    if (r.diet === 'vegan' || r.diet === 'vegetarisch') plantMeals++;
  }
  const perDay = scaleNutrients(sum, 1 / days);
  const needs = personNeeds(p, city.reference);
  const meatLimit = p.age >= 15 ? 300 : Math.round(300 * pf);
  return (
    <Card className="mt-3">
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {people.map((x) => (
          <button key={x.id} onClick={() => setWho(x.id)}
            className={cx('shrink-0 rounded-full border px-3 py-1.5 text-sm', x.id === p.id ? 'border-brand bg-brand-soft font-medium' : 'border-line')}>
            {x.emoji} {x.name}
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className={cx('rounded-2xl p-2.5', meat > meatLimit ? 'bg-accent-soft' : 'bg-surface-2')}>
          <Beef size={18} className={cx('mx-auto', meat > meatLimit ? 'text-accent' : 'text-muted')} />
          <div className="tabular mt-1 text-sm font-semibold">{Math.round(meat)} g</div>
          <div className="text-muted">Fleisch (max. {meatLimit} g)</div>
        </div>
        <div className={cx('rounded-2xl p-2.5', fishMeals >= 1 ? 'bg-brand-soft' : 'bg-surface-2')}>
          <Fish size={18} className={cx('mx-auto', fishMeals >= 1 ? 'text-brand' : 'text-muted')} />
          <div className="mt-1 text-sm font-semibold">{fishMeals}×</div>
          <div className="text-muted">Fisch (Ziel 1–2×)</div>
        </div>
        <div className="rounded-2xl bg-surface-2 p-2.5">
          <Leaf size={18} className="mx-auto text-good" />
          <div className="mt-1 text-sm font-semibold">{plantMeals} von {mainMeals}</div>
          <div className="text-muted">pflanzlich</div>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted">
        Durchschnitt pro geplantem Tag aus diesen Gerichten – im Verhältnis zum Tagesbedarf von {p.name}. Der Rest kommt aus den übrigen Mahlzeiten.
      </p>
      <NutrientRows values={perDay} needs={needs} share={(entries.length / days) / Math.max(1, mealsPerDay)}
        keys={['kcal', 'protein', 'fiber', 'salt', 'satFat', 'vitC', 'folate', 'iron', 'calcium', 'iodine', 'epaDha']}
        shareLabel="Strich = erwarteter Anteil dieser Mahlzeiten am Tag" />
      <p className="mt-3 text-[11px] text-muted">Fleisch und Fisch: DGE-Empfehlungen 2024. Nährstoffe: {city.reference === 'NASEM' ? 'NASEM-DRI' : 'DGE/ÖGE-Referenzwerte'}.</p>
    </Card>
  );
}

export function Plan() {
  const st = useStore((s) => s.state)!;
  const catalog = useStore((s) => s.catalog)!;
  const setPlan = useStore((s) => s.setPlan);
  const removeFromPlan = useStore((s) => s.removeFromPlan);
  const toast = useStore((s) => s.toast);
  const byId = useRecipesById();
  const offers = useOfferMap();
  const city = useCity();
  const scored = useScored();
  const [week, setWeek] = useState(0);
  const [pick, setPick] = useState<{ date: string; breakfast: boolean } | null>(null);
  const dates = weekDates(week);
  const t = today();
  const entries = st.plan.filter((p) => dates.includes(p.date)).sort((a, b) => a.date.localeCompare(b.date) || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);

  const summary = useMemo(() => {
    let total = 0;
    let saving = 0;
    let time = 0;
    for (const e of entries) {
      const r = byId[e.recipeId];
      if (!r) continue;
      const c = recipeCost(r, e.servings, catalog, offers, city);
      total += c.total;
      saving += c.saving;
      time += r.time;
    }
    return { total, saving, time: entries.length ? Math.round(time / entries.length) : 0 };
  }, [entries, byId, catalog, offers, city]);

  const free = dates.filter((d) => d >= t && !st.plan.some((p) => p.date === d && p.slot !== 'frueh'));
  const freeMornings = dates.filter((d) => d >= t && !st.plan.some((p) => p.date === d && p.slot === 'frueh'));

  async function fill() {
    const add = autoPlan(free, scored.filter((s) => fitsPrefs(s.recipe, st.settings)), st, byId, catalog);
    if (!add.length) return toast('Keine passenden Rezepte gefunden.');
    await setPlan([...st.plan, ...add]);
    toast(`${add.length} ${add.length === 1 ? 'Gericht' : 'Gerichte'} eingeplant.`, { label: 'Einkaufswagen', to: '/einkauf' });
  }

  async function fillBreakfast() {
    const add = autoPlanBreakfast(freeMornings, scored, st);
    if (!add.length) return toast('Keine passenden Frühstücksrezepte gefunden.');
    await setPlan([...st.plan, ...add]);
    toast(`Frühstück für ${add.length} ${add.length === 1 ? 'Tag' : 'Tage'} eingeplant.`, { label: 'Einkaufswagen', to: '/einkauf' });
  }

  return (
    <div className="px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <h1 className="font-display pt-2 text-[28px] font-semibold">Wochenplan</h1>
      <div className="mt-3">
        <Segmented value={week} onChange={setWeek} options={[{ value: 0, label: 'Diese Woche' }, { value: 1, label: 'Nächste Woche' }]} />
      </div>

      <Card className="mt-4">
        <div className="grid grid-cols-3 divide-x divide-line text-center">
          <div><div className="text-lg font-semibold">{entries.length}</div><div className="text-xs text-muted">Gerichte</div></div>
          <div><div className="tabular text-lg font-semibold">{fmtMoney(summary.total, city.currency)}</div><div className="text-xs text-muted">anteilig</div></div>
          <div><div className="tabular text-lg font-semibold text-accent">{fmtMoney(summary.saving, city.currency)}</div><div className="text-xs text-muted">gespart</div></div>
        </div>
        {(free.length > 0 || freeMornings.length > 0) && <ShopFocusBar title="Planen mit Angeboten von" />}
        {free.length > 0 && (
          <Button full variant="secondary" className="mt-4" onClick={fill}>
            <Wand2 size={18} /> {free.length} freie {free.length === 1 ? 'Tag' : 'Tage'} automatisch füllen
          </Button>
        )}
        {freeMornings.length > 0 && (
          <Button full variant="ghost" className="mt-2" onClick={fillBreakfast}>
            <Coffee size={18} /> Frühstück für {freeMornings.length} {freeMornings.length === 1 ? 'Tag' : 'Tage'} planen
          </Button>
        )}
      </Card>

      <ul className="mt-5 space-y-3">
        {dates.filter((d) => d >= t || entries.some((e) => e.date === d)).map((d) => {
          const items = entries.filter((e) => e.date === d);
          const past = d < t;
          const hasMain = items.some((e) => e.slot !== 'frueh');
          const hasBreakfast = items.some((e) => e.slot === 'frueh');
          return (
            <li key={d} className={cx(past && 'opacity-55')}>
              <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                <span className={cx(d === t && 'rounded-full bg-brand px-2 py-0.5 text-brand-ink')}>{dayLabel(d, true)}</span>
              </div>
              <div className="space-y-2">
                {items.map((e) => {
                  const r = byId[e.recipeId];
                  if (!r) return null;
                  return (
                    <div key={e.id} className="flex items-center gap-3 rounded-2xl bg-surface p-2 shadow-[var(--shadow-card)]">
                      <Link to={`/rezept/${r.id}`} className="flex flex-1 items-center gap-3">
                        <RecipeImage src={r.image} alt="" diet={r.diet} w={200} className="size-16 shrink-0 rounded-xl" />
                        <span className="flex-1">
                          <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{r.title}</span>
                          <span className="text-xs text-muted">{SLOT_LABEL[e.slot]} · {r.time} Min · {e.servings.toLocaleString('de-DE')} Port.</span>
                        </span>
                      </Link>
                      <button onClick={() => removeFromPlan(e.id)} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label={`${r.title} entfernen`}>
                        <Trash2 size={17} />
                      </button>
                    </div>
                  );
                })}
                {!past && (
                  <div className="flex gap-2">
                    <button onClick={() => setPick({ date: d, breakfast: false })} className="flex flex-1 items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-3 text-sm font-medium text-muted hover:border-brand hover:text-brand">
                      <Plus size={18} /> {hasMain ? 'Weiteres Gericht' : 'Rezept wählen'}
                    </button>
                    {!hasBreakfast && (
                      <button onClick={() => setPick({ date: d, breakfast: true })} className="flex items-center gap-1.5 rounded-2xl border-2 border-dashed border-line px-3.5 py-3 text-sm font-medium text-muted hover:border-brand hover:text-brand">
                        <Coffee size={17} /> Frühstück
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {entries.length > 0 && (
        <>
          <SectionTitle>Wochenbilanz</SectionTitle>
          <WeekBalance entries={entries} byId={byId} />
        </>
      )}
      {!entries.length && (
        <p className="mt-6 flex items-start gap-2 text-sm text-muted">
          <CalendarDays size={16} className="mt-0.5 shrink-0" />
          <span>Tipp: Mit „automatisch füllen“ entsteht ein Plan aus den Angeboten der gewählten Märkte.</span>
        </p>
      )}
      <PickSheet pick={pick} onClose={() => setPick(null)} />
    </div>
  );
}
