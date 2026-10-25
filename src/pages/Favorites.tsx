import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Heart, Pencil, Trash2, X } from 'lucide-react';
import type { FavCategory, RecipeView } from '../../shared/types';
import { famId } from '../../shared/logic';
import { useScored } from '../lib/derive';
import { useStore } from '../store';
import { RecipeCard } from '../components/RecipeCard';
import { AddToPlanSheet } from '../components/AddToPlanSheet';
import { Button, Chip, cx, EmptyState, inputCls, Sheet } from '../components/ui';

function ManageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const st = useStore((s) => s.state)!;
  const setFavCategories = useStore((s) => s.setFavCategories);
  const [cats, setCats] = useState<FavCategory[]>(st.favCategories);
  const count = (id: string) => Object.values(st.favorites).filter((c) => c === id).length;
  return (
    <Sheet open={open} onClose={onClose} title="Kategorien verwalten"
      footer={<Button full onClick={async () => { await setFavCategories(cats); onClose(); }}><Check size={18} /> Speichern</Button>}>
      <p className="mb-3 text-xs text-muted">Favoriten aus gelöschten Kategorien wandern in die letzte Kategorie der Liste.</p>
      <ul className="space-y-2">
        {cats.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2">
            <input className={`${inputCls} w-14 text-center`} value={c.emoji} maxLength={4}
              onChange={(e) => setCats(cats.map((x, k) => (k === i ? { ...x, emoji: e.target.value } : x)))} aria-label="Symbol" />
            <input className={inputCls} value={c.name} onChange={(e) => setCats(cats.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} aria-label="Name" />
            <span className="w-6 text-center text-xs text-muted">{count(c.id)}</span>
            <button onClick={() => setCats(cats.filter((_, k) => k !== i))} disabled={cats.length <= 1}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 disabled:opacity-30" aria-label={`${c.name} löschen`}><Trash2 size={16} /></button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" full className="mt-3" onClick={() => setCats([...cats, { id: `c-${Date.now().toString(36)}`, name: 'Neue Kategorie', emoji: '⭐' }])}>
        Kategorie hinzufügen
      </Button>
    </Sheet>
  );
}

export function Favorites() {
  const st = useStore((s) => s.state)!;
  const scored = useScored();
  const nav = useNavigate();
  const [filter, setFilter] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [adding, setAdding] = useState<RecipeView | null>(null);

  // Je Familie die aktuell beste Variante (z. B. die mit Gemüse im Angebot)
  const favs = useMemo(() => {
    const seen = new Set<string>();
    return scored.filter(({ recipe }) => {
      const f = famId(recipe);
      if (!st.favorites[f] || seen.has(f)) return false;
      seen.add(f);
      return true;
    });
  }, [scored, st.favorites]);

  const groups = st.favCategories
    .map((c) => ({ c, items: favs.filter(({ recipe }) => st.favorites[famId(recipe)] === c.id) }))
    .filter((g) => g.items.length && (!filter || g.c.id === filter));

  return (
    <div className="px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <div className="flex items-center justify-between pt-2">
        <button onClick={() => nav(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted"><ArrowLeft size={16} /> Zurück</button>
        <button onClick={() => setManage(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand"><Pencil size={15} /> Kategorien</button>
      </div>
      <h1 className="font-display mt-2 text-[28px] font-semibold">Favoriten</h1>
      <p className="text-sm text-muted">{favs.length} {favs.length === 1 ? 'Rezept' : 'Rezepte'} · für den ganzen Haushalt</p>

      {favs.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
          <Chip active={!filter} onClick={() => setFilter(null)}>Alle</Chip>
          {st.favCategories.map((c) => {
            const n = favs.filter(({ recipe }) => st.favorites[famId(recipe)] === c.id).length;
            if (!n) return null;
            return (
              <Chip key={c.id} active={filter === c.id} onClick={() => setFilter(filter === c.id ? null : c.id)}>
                {c.emoji} {c.name} <span className={cx('text-xs', filter === c.id ? 'opacity-80' : 'text-muted')}>{n}</span>
              </Chip>
            );
          })}
          {filter && <button onClick={() => setFilter(null)} className="text-muted" aria-label="Filter aufheben"><X size={18} /></button>}
        </div>
      )}

      {!favs.length ? (
        <EmptyState icon={<Heart size={28} />} title="Noch keine Favoriten"
          text="Tippe bei einem Rezept auf das Herz und ordne es einer Kategorie zu – z. B. „Kinderlieblinge“ oder „Schnell unter der Woche“."
          action={<Button onClick={() => nav('/')}>Rezepte entdecken</Button>} />
      ) : (
        groups.map(({ c, items }) => (
          <section key={c.id} className="mt-6">
            <h2 className="font-display mb-3 flex items-center gap-2 text-xl font-semibold">
              <span>{c.emoji}</span> {c.name} <span className="text-sm font-normal text-muted">{items.length}</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map(({ recipe, cost }) => <RecipeCard key={recipe.id} recipe={recipe} cost={cost} onAdd={() => setAdding(recipe)} />)}
            </div>
          </section>
        ))
      )}
      <ManageSheet key={String(manage)} open={manage} onClose={() => setManage(false)} />
      <AddToPlanSheet recipe={adding} onClose={() => setAdding(null)} />
    </div>
  );
}
