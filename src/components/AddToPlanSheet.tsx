import { useEffect, useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import type { MealSlot, RecipeView } from '../../shared/types';
import { isBreakfast, isoDate } from '../../shared/logic';
import { dayLabel, usePortions } from '../lib/derive';
import { useStore } from '../store';
import { Button, Chip, Segmented, Sheet, Stepper } from './ui';

export function AddToPlanSheet({ recipe, onClose, presetDate, presetSlot }: {
  recipe: RecipeView | null; onClose: () => void; presetDate?: string; presetSlot?: MealSlot;
}) {
  const portions = usePortions();
  const plan = useStore((s) => s.state!.plan);
  const addToPlan = useStore((s) => s.addToPlan);
  const toast = useStore((s) => s.toast);
  const days = useMemo(() => {
    const out: string[] = [];
    const d = new Date();
    for (let i = 0; i < 14; i++) {
      out.push(isoDate(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, []);
  const slotFor = (r: RecipeView | null): MealSlot => presetSlot ?? (r && isBreakfast(r) ? 'frueh' : 'abend');
  const firstFree = (s: MealSlot) => days.find((d) => !plan.some((p) => p.date === d && p.slot === s)) ?? days[0];
  const [slot, setSlot] = useState<MealSlot>(slotFor(recipe));
  const [dates, setDates] = useState<string[]>([presetDate ?? firstFree(slotFor(recipe))]);
  const [servings, setServings] = useState(Math.max(1, Math.round(portions * 2) / 2));

  useEffect(() => {
    if (recipe) {
      const s = slotFor(recipe);
      setSlot(s);
      setDates([presetDate ?? firstFree(s)]);
      setServings(Math.max(1, Math.round(portions * 2) / 2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id]);

  if (!recipe) return null;
  // Frühstück gibt es oft mehrere Tage gleich – dann lassen sich mehrere Tage antippen
  const multi = slot === 'frueh';
  const taken = plan.filter((p) => dates.includes(p.date) && p.slot === slot);

  function pickDay(d: string) {
    if (!multi) return setDates([d]);
    setDates(dates.includes(d) ? (dates.length > 1 ? dates.filter((x) => x !== d) : dates) : [...dates, d].sort());
  }

  function changeSlot(s: MealSlot) {
    setSlot(s);
    if (s !== 'frueh' && dates.length > 1) setDates([dates[0]]);
  }

  async function add() {
    if (!recipe) return;
    await addToPlan(dates.map((date) => ({ id: `${date}-${slot}-${recipe.id}`, date, slot, recipeId: recipe.id, servings })));
    toast(
      dates.length > 1
        ? `„${recipe.title}“ ist für ${dates.length} Tage eingeplant – die Zutaten liegen im Einkaufswagen.`
        : `„${recipe.title}“ ist eingeplant – die Zutaten liegen im Einkaufswagen.`,
      { label: 'Ansehen', to: '/einkauf' },
    );
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Wann gibt’s das?"
      footer={
        <Button full onClick={add}>
          <ShoppingCart size={18} /> {dates.length > 1 ? `Für ${dates.length} Tage auswählen` : 'Auswählen & in den Einkaufswagen'}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted">{recipe.title}</p>
      <div className="mb-4">
        <Segmented value={slot} onChange={changeSlot}
          options={[{ value: 'frueh', label: 'Frühstück' }, { value: 'mittag', label: 'Mittag' }, { value: 'abend', label: 'Abend' }]} />
      </div>
      <div className="no-scrollbar -mx-5 mb-2 flex gap-2 overflow-x-auto px-5">
        {days.map((d) => {
          const busy = plan.some((p) => p.date === d && p.slot === slot);
          return (
            <Chip key={d} active={dates.includes(d)} onClick={() => pickDay(d)}>
              {dayLabel(d)}
              {busy && <span className="size-1.5 rounded-full bg-accent" aria-label="schon belegt" />}
            </Chip>
          );
        })}
      </div>
      <p className="mb-4 text-xs text-muted">{multi ? 'Mehrere Tage antippen – z. B. dasselbe Müsli für die ganze Woche.' : ' '}</p>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3">
        <div>
          <div className="text-sm font-medium">Portionen</div>
          <div className="text-xs text-muted">Haushalt ≈ {portions.toLocaleString('de-DE')} Erwachsenenportionen</div>
        </div>
        <Stepper value={servings} onChange={setServings} />
      </div>
      {taken.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          {dates.length > 1 ? 'An manchen dieser Tage' : 'An diesem Tag'} ist schon etwas geplant – das neue Rezept kommt zusätzlich dazu.
        </p>
      )}
    </Sheet>
  );
}
