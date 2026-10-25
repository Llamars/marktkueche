import { Link } from 'react-router-dom';
import { Clock, Heart, Plus, Sparkles, Tag } from 'lucide-react';
import type { RecipeView } from '../../shared/types';
import { famId, fmtMoney, type RecipeCost } from '../../shared/logic';
import { useCity } from '../lib/derive';
import { useStore } from '../store';
import { cx, RecipeImage } from './ui';

export const DIET_LABEL: Record<RecipeView['diet'], string> = {
  vegan: 'Vegan', vegetarisch: 'Vegetarisch', pescetarisch: 'Fisch', fleisch: 'Fleisch',
};

export function RecipeCard({ recipe, cost, onAdd, big }: {
  recipe: RecipeView; cost: RecipeCost; onAdd: () => void; big?: boolean;
}) {
  const city = useCity();
  const fav = useStore((s) => !!s.state!.favorites[famId(recipe)]);
  const planned = useStore((s) => s.state!.plan.some((p) => p.recipeId === recipe.id));
  const href = `/rezept/${recipe.id}`;
  return (
    <article className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">
      <div className={cx('relative overflow-hidden', big ? 'aspect-[16/10]' : 'aspect-[4/3]')}>
        <Link to={href} tabIndex={-1} aria-hidden className="block size-full">
          <RecipeImage src={recipe.image} alt="" diet={recipe.diet} w={big ? 900 : 480}
            className="size-full transition-transform duration-500 group-hover:scale-[1.03]" />
        </Link>
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          {cost.offerIds.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white shadow">
              <Tag size={12} /> {cost.offerIds.length} im Angebot
            </span>
          ) : <span />}
          {recipe.source === 'ki' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
              <Sparkles size={11} /> KI
            </span>
          ) : fav ? (
            <span className="grid size-7 place-items-center rounded-full bg-white/90 text-accent shadow">
              <Heart size={14} fill="currentColor" />
            </span>
          ) : null}
        </div>
        <button
          onClick={onAdd}
          className={cx(
            'absolute bottom-2.5 right-2.5 grid place-items-center rounded-full shadow-lg transition-transform active:scale-95',
            planned ? 'bg-surface text-brand ring-2 ring-brand' : 'bg-brand text-brand-ink',
            big ? 'size-12' : 'size-10',
          )}
          aria-label={`${recipe.title} auswählen`}
          title="Auswählen – Zutaten in den Einkaufswagen"
        >
          <Plus size={big ? 24 : 20} strokeWidth={2.5} />
        </button>
      </div>
      <Link to={href} className={cx('flex flex-1 flex-col', big ? 'p-4' : 'p-3')}>
        <h3 className={cx('font-display font-semibold leading-snug', big ? 'text-xl' : 'line-clamp-2 text-[15px]')}>{recipe.title}</h3>
        {big && <p className="mt-1 line-clamp-2 text-sm text-muted">{recipe.teaser}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Clock size={13} /> {recipe.time} Min</span>
          <span className="tabular font-semibold text-ink">
            {fmtMoney(cost.perPortion, city.currency)}<span className="font-normal text-muted">/Port.</span>
          </span>
          {big && <span>{Math.round(recipe.perServing.kcal ?? 0)} kcal</span>}
          {big && <span>{DIET_LABEL[recipe.diet]}</span>}
          {planned && <span className="font-medium text-brand">eingeplant</span>}
        </div>
      </Link>
    </article>
  );
}
