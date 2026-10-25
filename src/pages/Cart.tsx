import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, FileText, Link2, Package, Plus, Share2, ShoppingCart, Trash2 } from 'lucide-react';
import { fmtMoney, type CartLine } from '../../shared/logic';
import { isBaseRecipe, toRecipe } from '../local/data';
import { customIngredientsOf, sendLink, shareUrl } from '../lib/share';
import { useCart, useCity, useRecipesById, useShopMarkets } from '../lib/derive';
import { useMyName, useStore } from '../store';
import { Button, Card, cx, EmptyState, Segmented, Sheet } from '../components/ui';
import { ShopFocusBar } from '../components/ShopFocusBar';

const AISLE: Record<string, string> = {
  gemuese: 'Obst & Gemüse', kuehl: 'Kühlregal', fleisch: 'Fleisch & Fisch', tk: 'Tiefkühl', trocken: 'Nudeln, Reis & Konserven',
  brot: 'Brot & Backwaren', gewuerze: 'Öl, Gewürze & Saucen', sonstiges: 'Sonstiges',
};
const AISLE_ORDER = Object.keys(AISLE);

function Row({ line, checked, onToggle, onRemove, currency, marketName, by }: {
  line: CartLine; checked: boolean; onToggle: () => void; onRemove?: () => void; currency: string; marketName?: string; by?: string;
}) {
  const from = [...line.recipes, ...(line.extra ? ['einzeln hinzugefügt'] : [])];
  return (
    <li className="flex items-center">
      <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left" aria-pressed={checked}>
        <span className={cx('grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors',
          checked ? 'border-brand bg-brand text-brand-ink' : 'border-line')}>
          {checked && <Check size={16} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx('block text-[15px] font-medium', checked && 'text-muted line-through')}>
            {line.name}
            {checked && by && <span className="ml-2 text-xs font-normal text-brand no-underline">✓ {by}</span>}
          </span>
          <span className="block truncate text-xs text-muted">
            {line.packs > 1 ? `${line.packs} × ` : ''}{line.packLabel}{line.recipes.length ? ` · benötigt ${line.need}` : ''}
            {from.length ? ` · ${from.join(', ')}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {line.price != null && <span className={cx('tabular block text-sm font-semibold', checked && 'text-muted')}>{fmtMoney(line.price, currency)}</span>}
          {line.offer && <span className="block text-[11px] font-semibold text-accent">{marketName ?? 'Angebot'}</span>}
        </span>
      </button>
      {onRemove ? (
        <button onClick={onRemove} className="px-3 text-muted" aria-label={`${line.name} entfernen`}><Trash2 size={16} /></button>
      ) : <span className="w-2" />}
    </li>
  );
}

export function Cart() {
  const st = useStore((s) => s.state)!;
  const toggleCheck = useStore((s) => s.toggleCheck);
  const clearChecked = useStore((s) => s.clearChecked);
  const setBuyAnyway = useStore((s) => s.setBuyAnyway);
  const setExtras = useStore((s) => s.setExtras);
  const toast = useStore((s) => s.toast);
  const city = useCity();
  const byId = useRecipesById();
  const myName = useMyName();
  const catalog = useStore((s) => s.catalog)!;
  const shop = useShopMarkets();
  const { plan, lines } = useCart();
  const [group, setGroup] = useState<'markt' | 'gang'>('markt');
  const [extra, setExtra] = useState('');
  const [showPantry, setShowPantry] = useState(false);
  const [sharing, setSharing] = useState(false);

  const buy = lines.filter((l) => !l.pantry);
  // Freitext-Einträge; Katalogzutaten (z. B. aus dem Müsli-Baukasten) stehen bei ihrem Markt
  const freeExtras = st.extras.filter((e) => !e.ingredientId);
  const pantry = lines.filter((l) => l.pantry);
  const marketName = (id: string | null) => (id ? city.markets.find((m) => m.id === id)?.name ?? id : null);

  const groups = useMemo(() => {
    const map = new Map<string, CartLine[]>();
    for (const l of buy) {
      const k = group === 'markt' ? l.marketId ?? '_any' : l.aisle;
      map.set(k, [...(map.get(k) ?? []), l]);
    }
    const keys = [...map.keys()].sort((a, b) =>
      group === 'markt' ? (a === '_any' ? 1 : b === '_any' ? -1 : a.localeCompare(b)) : AISLE_ORDER.indexOf(a) - AISLE_ORDER.indexOf(b));
    return keys.map((k) => ({
      key: k,
      title: group === 'markt'
        ? (k === '_any' ? (shop.length === 1 ? `Bei ${shop[0].name} (ohne Angebot)` : 'Überall erhältlich') : marketName(k)!)
        : AISLE[k] ?? k,
      lines: map.get(k)!.sort((a, b) => Number(!!st.checked[a.key]) - Number(!!st.checked[b.key])),
    }));
  }, [buy, group, st.checked]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = buy.reduce((a, l) => a + (l.price ?? 0), 0);
  const saving = buy.reduce((a, l) => a + l.saving, 0);
  const done = buy.filter((l) => st.checked[l.key]).length + freeExtras.filter((e) => st.checked[`x:${e.id}`]).length;
  const count = buy.length + freeExtras.length;
  const recipeTitles = [...new Set(plan.map((p) => byId[p.recipeId]?.title).filter(Boolean))];

  async function addExtra() {
    const name = extra.trim();
    if (!name) return;
    await setExtras([...st.extras, { id: Math.random().toString(36).slice(2, 9), name, by: myName }]);
    setExtra('');
  }

  /** Link zum Übernehmen: die geplanten Gerichte und die offenen Artikel */
  async function shareLink() {
    const open = buy.filter((l) => !st.checked[l.key]);
    const meals = plan.filter((p) => byId[p.recipeId]);
    const own = meals.map((p) => byId[p.recipeId]).filter((r) => !isBaseRecipe(r.id)).map(toRecipe);
    const url = await shareUrl({
      v: 1,
      kind: 'einkauf',
      from: myName || undefined,
      recipes: own,
      ingredients: customIngredientsOf(own, catalog),
      plan: meals.map((p) => ({ r: p.recipeId, d: p.date, s: p.slot, n: p.servings })),
      items: [
        ...open.map((l) => ({ i: l.ingredientId, name: l.name, packs: l.packs })),
        ...freeExtras.filter((e) => !st.checked[`x:${e.id}`]).map((e) => ({ name: e.name })),
      ],
    });
    const res = await sendLink(url, 'Einkaufsliste', `${myName || 'Ich'} teilt eine Einkaufsliste aus der Marktküche:`);
    if (res === 'kopiert') toast('Link kopiert – zum Beispiel in WhatsApp einfügen.');
    setSharing(false);
  }

  async function shareText() {
    const text = [
      'Einkaufsliste (Marktküche)',
      ...groups.flatMap((g) => [`\n${g.title}:`, ...g.lines.filter((l) => !st.checked[l.key]).map((l) => `☐ ${l.name} – ${l.packs > 1 ? `${l.packs} × ` : ''}${l.packLabel}`)]),
      ...(freeExtras.length ? ['\nSonstiges:', ...freeExtras.filter((e) => !st.checked[`x:${e.id}`]).map((e) => `☐ ${e.name}`)] : []),
    ].join('\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Einkaufsliste', text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Einkaufsliste kopiert.');
      }
    } catch {
      /* abgebrochen */
    }
    setSharing(false);
  }

  if (!plan.length && !st.extras.length) {
    return (
      <div className="px-4 pt-[max(env(safe-area-inset-top),1rem)]">
        <h1 className="font-display pt-2 text-[28px] font-semibold">Einkaufswagen</h1>
        <EmptyState icon={<ShoppingCart size={28} />} title="Noch leer"
          text="Wähle Rezepte aus – ihre Zutaten landen automatisch hier, zusammengefasst und nach Markt sortiert."
          action={<Link to="/"><Button>Rezepte entdecken</Button></Link>} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <div className="flex items-end justify-between gap-3 pt-2">
        <h1 className="font-display text-[28px] font-semibold">Einkaufswagen</h1>
        <button onClick={() => setSharing(true)} className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium text-brand"><Share2 size={16} /> Teilen</button>
      </div>
      <p className="mt-0.5 line-clamp-2 text-sm text-muted">
        {recipeTitles.length
          ? `Für ${recipeTitles.length} ${recipeTitles.length === 1 ? 'Gericht' : 'Gerichte'}: ${recipeTitles.join(', ')}`
          : 'Einzeln hinzugefügte Einkäufe'}
      </p>

      <div className="mt-3">
        <ShopFocusBar compact title="Wo kaufst du ein?" />
      </div>

      <Card className="mt-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="tabular text-2xl font-semibold">≈ {fmtMoney(total, city.currency)}</div>
            <div className="text-xs text-muted">für ganze Packungen{saving > 0.05 && <> · <span className="font-semibold text-accent">{fmtMoney(saving, city.currency)} gespart</span></>}</div>
          </div>
          <div className="text-right text-sm"><b className="tabular">{done}</b> / {count} erledigt</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${count ? (done / count) * 100 : 0}%` }} />
        </div>
      </Card>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1">
          <Segmented size="sm" value={group} onChange={setGroup} options={[{ value: 'markt', label: 'Nach Markt' }, { value: 'gang', label: 'Nach Gang' }]} />
        </div>
        {done > 0 && (
          <button onClick={clearChecked} className="inline-flex items-center gap-1 text-xs font-medium text-muted"><Trash2 size={14} /> Erledigte leeren</button>
        )}
      </div>

      {groups.map((g) => (
        <section key={g.key} className="mt-4">
          <h2 className="mb-1.5 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <span className={cx(group === 'markt' && g.key !== '_any' && 'text-accent')}>{g.title}</span>
            <span>{g.lines.filter((l) => !st.checked[l.key]).length} offen</span>
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-card)]">
            {g.lines.map((l) => (
              <Row key={l.key} line={l} checked={!!st.checked[l.key]} onToggle={() => toggleCheck(l.key)} currency={city.currency}
                onRemove={l.extra ? () => setExtras(st.extras.filter((e) => e.ingredientId !== l.ingredientId)) : undefined}
                by={st.checkedBy?.[l.key] && st.checkedBy[l.key] !== myName ? st.checkedBy[l.key] : undefined}
                marketName={group === 'gang' ? marketName(l.marketId) ?? undefined : undefined} />
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-4">
        <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted">Sonstiges</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-card)]">
          {freeExtras.map((e) => {
            const k = `x:${e.id}`;
            const c = !!st.checked[k];
            return (
              <li key={e.id} className="flex items-center">
                <button onClick={() => toggleCheck(k)} className="flex flex-1 items-center gap-3 px-4 py-3 text-left" aria-pressed={c}>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-full border-2', c ? 'border-brand bg-brand text-brand-ink' : 'border-line')}>
                    {c && <Check size={16} strokeWidth={3} />}
                  </span>
                  <span className={cx('text-[15px] font-medium', c && 'text-muted line-through')}>{e.name}</span>
                  {e.by && e.by !== myName && <span className="text-xs text-muted">von {e.by}</span>}
                </button>
                <button onClick={() => setExtras(st.extras.filter((x) => x.id !== e.id))} className="px-4 text-muted" aria-label={`${e.name} entfernen`}><Trash2 size={16} /></button>
              </li>
            );
          })}
          <li>
            <form onSubmit={(ev) => { ev.preventDefault(); addExtra(); }} className="flex items-center gap-2 px-3 py-2">
              <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Weiteres hinzufügen, z. B. Kaffee"
                className="h-10 flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-muted" />
              <button type="submit" className="grid size-9 place-items-center rounded-full bg-brand text-brand-ink disabled:opacity-40" disabled={!extra.trim()} aria-label="Hinzufügen"><Plus size={18} /></button>
            </form>
          </li>
        </ul>
      </section>

      {pantry.length > 0 && (
        <section className="mt-5">
          <button onClick={() => setShowPantry(!showPantry)} className="flex w-full items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-left text-sm" aria-expanded={showPantry}>
            <Package size={18} className="text-muted" />
            <span className="flex-1"><b>{pantry.length} Zutaten aus dem Vorrat</b> – nicht auf der Liste</span>
            <ChevronDown size={18} className={cx('transition-transform', showPantry && 'rotate-180')} />
          </button>
          {showPantry && (
            <ul className="mt-2 space-y-1">
              {pantry.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
                  <span>{l.name} <span className="text-muted">· {l.need}</span></span>
                  <button onClick={() => setBuyAnyway(l.ingredientId, true)} className="text-xs font-medium text-brand">Doch kaufen</button>
                </li>
              ))}
              <li className="px-2 pt-1 text-xs text-muted">Vorrat anpassen unter <Link to="/profil" className="text-brand">Profil → Vorratsschrank</Link>.</li>
            </ul>
          )}
        </section>
      )}
      <p className="mt-6 text-xs text-muted">
        Preise: Angebote aus deinen Märkten, sonst Richtpreise{city.priceFactor !== 1 ? ` (grob in ${city.currency} umgerechnet)` : ''}. Die Liste ist auf diesem Gerät gespeichert.
      </p>
      <Sheet open={sharing} onClose={() => setSharing(false)} title="Einkaufsliste teilen">
        <div className="space-y-2.5">
          <button onClick={shareLink} className="flex w-full items-start gap-3 rounded-2xl bg-surface-2 p-3.5 text-left">
            <Link2 size={20} className="mt-0.5 shrink-0 text-brand" />
            <span>
              <span className="block font-semibold">Link zum Übernehmen</span>
              <span className="text-sm text-muted">Wer ihn öffnet, kann die Gerichte in den eigenen Plan oder die Artikel in die eigene Einkaufsliste übernehmen.</span>
            </span>
          </button>
          <button onClick={shareText} className="flex w-full items-start gap-3 rounded-2xl bg-surface-2 p-3.5 text-left">
            <FileText size={20} className="mt-0.5 shrink-0 text-brand" />
            <span>
              <span className="block font-semibold">Als Text</span>
              <span className="text-sm text-muted">Zum Lesen und Abhaken, z. B. für jemanden ohne die App.</span>
            </span>
          </button>
        </div>
      </Sheet>
    </div>
  );
}
