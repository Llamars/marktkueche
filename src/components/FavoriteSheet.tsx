import { useEffect, useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import type { RecipeView } from '../../shared/types';
import { famId } from '../../shared/logic';
import { useStore } from '../store';
import { Button, Chip, inputCls, Sheet } from './ui';

const EMOJIS = ['⭐', '❤️', '👶', '⚡', '🎉', '🥦', '🍖', '🐟', '🌶️', '🍰', '📦', '🏕️'];

/** Favorit speichern und einer Kategorie zuordnen (Varianten gelten als ein Rezept). */
export function FavoriteSheet({ recipe, onClose }: { recipe: RecipeView | null; onClose: () => void }) {
  const st = useStore((s) => s.state)!;
  const setFavorite = useStore((s) => s.setFavorite);
  const setFavCategories = useStore((s) => s.setFavCategories);
  const toast = useStore((s) => s.toast);
  const key = recipe ? famId(recipe) : '';
  const current = recipe ? st.favorites[key] : undefined;
  const [cat, setCat] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState(EMOJIS[0]);

  useEffect(() => {
    if (!recipe) return;
    const auto = st.favCategories.find((c) => c.id === recipe.category) ? recipe.category! : st.favCategories[0]?.id;
    setCat(current ?? auto ?? 'sonstiges');
    setAdding(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id]);

  if (!recipe) return null;

  async function save() {
    let categoryId = cat;
    if (adding && newName.trim()) {
      categoryId = `c-${Date.now().toString(36)}`;
      await setFavCategories([...st.favCategories, { id: categoryId, name: newName.trim(), emoji: newEmoji }]);
    }
    await setFavorite(key, categoryId);
    const c = st.favCategories.find((x) => x.id === categoryId);
    toast(`In den Favoriten${c ? ` unter „${c.name}“` : ''} gespeichert.`, { label: 'Ansehen', to: '/favoriten' });
    onClose();
  }

  async function remove() {
    await setFavorite(key, null);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={current ? 'Favorit bearbeiten' : 'Zu Favoriten'}
      footer={
        <div className="flex gap-2">
          {current && <Button variant="secondary" onClick={remove}>Entfernen</Button>}
          <Button full onClick={save} disabled={adding && !newName.trim()}><Heart size={18} /> Speichern</Button>
        </div>
      }>
      <p className="mb-3 text-sm text-muted">{recipe.family ? recipe.title.replace(recipe.variantLabel ?? '', '…') : recipe.title}</p>
      <p className="mb-2 text-sm font-medium">Kategorie</p>
      <div className="flex flex-wrap gap-2">
        {st.favCategories.map((c) => (
          <Chip key={c.id} active={!adding && cat === c.id} onClick={() => { setCat(c.id); setAdding(false); }}>
            <span>{c.emoji}</span> {c.name}
          </Chip>
        ))}
        <Chip active={adding} onClick={() => setAdding(true)}><Plus size={14} /> Neue Kategorie</Chip>
      </div>
      {adding && (
        <div className="mt-4 rounded-2xl bg-surface-2 p-3">
          <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z. B. Für Gäste" autoFocus />
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setNewEmoji(e)} className={`grid size-9 shrink-0 place-items-center rounded-full text-lg ${newEmoji === e ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface'}`}>{e}</button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
