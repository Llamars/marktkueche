import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, ListPlus, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import type { CartExtra, PlanEntry, RecipeView } from '../../shared/types';
import { SLOT_LABEL } from '../../shared/logic';
import { enrich } from '../local/data';
import { dayLabel, today } from '../lib/derive';
import { useStore } from '../store';
import { AddToPlanSheet } from './AddToPlanSheet';
import { Button, RecipeImage, Sheet } from './ui';

const newId = () => Math.random().toString(36).slice(2, 9);

/** Vorschau eines geteilten Links: Rezept ansehen/einplanen oder Einkaufsliste bzw. Gerichte übernehmen. */
export function ShareImportSheet() {
  const pkg = useStore((s) => s.incoming);
  const setIncoming = useStore((s) => s.setIncoming);
  const recipes = useStore((s) => s.recipes)!;
  const catalog = useStore((s) => s.catalog)!;
  const extras = useStore((s) => s.state!.extras);
  const upsertRecipes = useStore((s) => s.upsertRecipes);
  const addIngredients = useStore((s) => s.addIngredients);
  const addToPlan = useStore((s) => s.addToPlan);
  const setExtras = useStore((s) => s.setExtras);
  const toast = useStore((s) => s.toast);
  const nav = useNavigate();
  const [planning, setPlanning] = useState<RecipeView | null>(null);

  // Geteilte eigene Rezepte gehen vor; Grundrezepte kommen aus der eigenen App
  const byId = useMemo(() => {
    const map = new Map(recipes.map((r) => [r.id, r]));
    for (const r of pkg?.recipes ?? []) if (!map.has(r.id)) map.set(r.id, enrich(r));
    return map;
  }, [recipes, pkg]);

  if (!pkg) return null;
  if (planning) {
    return <AddToPlanSheet recipe={planning} onClose={() => { setPlanning(null); setIncoming(null); }} />;
  }

  const close = () => setIncoming(null);
  const meals = pkg.plan.map((m) => ({ m, r: byId.get(m.r) })).filter((x): x is { m: typeof x.m; r: RecipeView } => !!x.r);
  const missing = pkg.plan.length - meals.length;
  const from = pkg.from || 'Jemand';
  /** Nur Rezepte speichern, die man noch nicht hat (geteilte eigene Rezepte) */
  const keepRecipes = (ids: string[]) => {
    const fresh = pkg.recipes.filter((r) => ids.includes(r.id) && !recipes.some((x) => x.id === r.id));
    const unknown = (pkg.ingredients ?? []).filter((i) => !catalog[i.id]);
    if (unknown.length) addIngredients(unknown);
    if (fresh.length) upsertRecipes(fresh);
  };

  function openRecipe(r: RecipeView) {
    keepRecipes([r.id]);
    close();
    nav(`/rezept/${r.id}`);
  }

  function planRecipe(r: RecipeView) {
    keepRecipes([r.id]);
    setPlanning(r);
  }

  async function takeMeals() {
    keepRecipes(meals.map((x) => x.r.id));
    const t = today();
    const entries: PlanEntry[] = meals.map(({ m, r }) => {
      const date = m.d && m.d >= t ? m.d : t;
      return { id: `${date}-${m.s}-${r.id}`, date, slot: m.s, recipeId: r.id, servings: m.n };
    });
    await addToPlan(entries);
    close();
    toast(`${entries.length} ${entries.length === 1 ? 'Gericht' : 'Gerichte'} übernommen – die Zutaten stehen in deinem Einkaufswagen.`, { label: 'Ansehen', to: '/einkauf' });
  }

  async function takeItems() {
    const next: CartExtra[] = extras.map((e) => ({ ...e }));
    for (const it of pkg!.items) {
      const ing = it.i ? catalog[it.i] : undefined;
      if (ing) {
        const same = next.find((e) => e.ingredientId === ing.id);
        if (same) same.packs = (same.packs ?? 1) + (it.packs ?? 1);
        else next.push({ id: newId(), name: ing.name, ingredientId: ing.id, packs: it.packs ?? 1, by: pkg!.from });
      } else if (!next.some((e) => !e.ingredientId && e.name.toLowerCase() === it.name.toLowerCase())) {
        next.push({ id: newId(), name: it.name, by: pkg!.from });
      }
    }
    await setExtras(next);
    close();
    toast(`${pkg!.items.length} Artikel in deinen Einkaufswagen übernommen.`, { label: 'Ansehen', to: '/einkauf' });
  }

  // ---------------------------------------------------------- Ein Rezept
  if (pkg.kind === 'rezept') {
    const r = meals[0]?.r;
    return (
      <Sheet open onClose={close} title={`${from} teilt ein Rezept`}
        footer={r ? (
          <div className="flex gap-2">
            <Button variant="secondary" full onClick={() => openRecipe(r)}><UtensilsCrossed size={17} /> Ansehen</Button>
            <Button full onClick={() => planRecipe(r)}><CalendarPlus size={17} /> Einplanen</Button>
          </div>
        ) : <Button full variant="secondary" onClick={close}>Schließen</Button>}>
        {r ? (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2">
            <RecipeImage src={r.image} alt="" diet={r.diet} w={200} className="size-16 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{r.title}</p>
              <p className="text-xs text-muted">{r.time} Min · {r.teaser}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Dieses Rezept gibt es in deiner Marktküche nicht. Vielleicht ist deine App auf einem älteren Stand.</p>
        )}
      </Sheet>
    );
  }

  // ---------------------------------------------------------- Einkaufsliste mit Gerichten
  return (
    <Sheet open onClose={close} title={`${from} teilt eine Einkaufsliste`}
      footer={
        <div className="space-y-2">
          {meals.length > 0 && (
            <Button full onClick={takeMeals}><CalendarPlus size={17} /> {meals.length} {meals.length === 1 ? 'Gericht' : 'Gerichte'} in meinen Plan</Button>
          )}
          {pkg.items.length > 0 && (
            <Button full variant={meals.length ? 'secondary' : 'primary'} onClick={takeItems}><ListPlus size={17} /> Nur die Artikel übernehmen</Button>
          )}
        </div>
      }>
      {meals.length > 0 && (
        <>
          <p className="mb-2 text-sm text-muted">
            <b className="text-ink">Gerichte übernehmen:</b> Sie landen in deinem Wochenplan, die Einkaufsliste entsteht daraus mit deinen Märkten und Vorräten.
          </p>
          <ul className="mb-4 space-y-1.5">
            {meals.map(({ m, r }, k) => (
              <li key={k} className="flex items-center gap-2.5 rounded-xl bg-surface-2 p-1.5 text-sm">
                <RecipeImage src={r.image} alt="" diet={r.diet} w={120} className="size-10 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 font-medium">{r.title}</span>
                  <span className="text-xs text-muted">{m.d ? dayLabel(m.d) : 'ohne Datum'} · {SLOT_LABEL[m.s]} · {m.n.toLocaleString('de-DE')} Port.</span>
                </span>
              </li>
            ))}
          </ul>
          {missing > 0 && <p className="-mt-2 mb-4 text-xs text-warn">{missing} Gericht(e) gibt es in deiner App nicht und werden übersprungen.</p>}
        </>
      )}
      {pkg.items.length > 0 && (
        <>
          <p className="mb-2 text-sm text-muted"><b className="text-ink">Nur die Artikel:</b> genau diese Liste kommt zu deinem Einkaufswagen dazu.</p>
          <ul className="divide-y divide-line rounded-2xl bg-surface-2 text-sm">
            {pkg.items.map((it, k) => (
              <li key={k} className="flex items-center gap-2 px-3 py-2">
                <ShoppingCart size={14} className="shrink-0 text-muted" />
                <span className="flex-1">{(it.i && catalog[it.i]?.name) || it.name}</span>
                {it.packs && it.packs > 1 && <span className="tabular text-xs text-muted">{it.packs} ×</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
