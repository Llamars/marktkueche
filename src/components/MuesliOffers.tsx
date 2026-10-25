import { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { MUESLI_GROUPS, MUESLI_HINTS } from '../../shared/breakfast';
import { fmtMoney } from '../../shared/logic';
import { useCity, useOfferMap, useSelectedMarkets, useShopMarkets } from '../lib/derive';
import { useMyName, useStore } from '../store';
import { Chip, cx } from './ui';

/**
 * Müsli-Baukasten: aktuelle Angebote für Frühstückszutaten (Flocken, ungesalzene Nüsse, Kerne, Obst …).
 * Einzelne Packungen landen ohne Rezept im Einkaufswagen.
 */
export function MuesliOffers() {
  const catalog = useStore((s) => s.catalog)!;
  const st = useStore((s) => s.state)!;
  const setExtras = useStore((s) => s.setExtras);
  const toast = useStore((s) => s.toast);
  const myName = useMyName();
  const offers = useOfferMap();
  const city = useCity();
  const shop = useShopMarkets();
  const selected = useSelectedMarkets();
  const marketName = (id: string) => city.markets.find((m) => m.id === id)?.name ?? id;

  const groups = useMemo(() => {
    const { allergies, diet } = st.settings;
    // Nur Zutaten zeigen, die zu Allergien und Ernährungsweise passen
    const fits = (id: string) => {
      const ing = catalog[id];
      return !!ing && !ing.allergens?.some((a) => allergies.includes(a)) && !(diet === 'vegan' && ing.animal);
    };
    return MUESLI_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(fits).map((id) => ({ id, ing: catalog[id], best: offers.get(id) }))
        .sort((a, b) => Number(!!b.best) - Number(!!a.best)),
    }));
  }, [catalog, offers, st.settings]);
  const count = groups.reduce((a, g) => a + g.items.filter((x) => x.best).length, 0);
  const [onlyOffers, setOnlyOffers] = useState(count > 0);

  const inCart = (id: string) => st.extras.find((e) => e.ingredientId === id);
  async function toggle(id: string) {
    const ex = inCart(id);
    if (ex) return setExtras(st.extras.filter((e) => e.id !== ex.id));
    await setExtras([...st.extras, { id: Math.random().toString(36).slice(2, 9), name: catalog[id].name, ingredientId: id, packs: 1, by: myName }]);
    toast(`${catalog[id].name} liegt im Einkaufswagen.`, { label: 'Ansehen', to: '/einkauf' });
  }

  return (
    <section className="mt-6">
      <div className="mb-1 flex items-end justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">Müsli-Baukasten</h2>
        <Chip active={onlyOffers} onClick={() => setOnlyOffers(!onlyOffers)} className="h-8 px-3 text-[13px]">Nur Angebote</Chip>
      </div>
      <p className="mb-3 text-sm text-muted">
        {count} {count === 1 ? 'Zutat' : 'Zutaten'} diese Woche im Angebot
        {shop.length < selected.length ? ` bei ${shop.map((m) => m.name).join(', ')}` : ''}. Nüsse und Kerne nur ungesalzen.
      </p>
      <div className="space-y-3">
        {groups.map((g) => {
          const items = onlyOffers ? g.items.filter((x) => x.best) : g.items;
          return (
            <div key={g.id}>
              <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted">{g.emoji} {g.label}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-card)]">
                {!items.length && <li className="px-4 py-3 text-sm text-muted">Diese Woche kein Angebot.</li>}
                {items.map(({ id, ing, best }) => {
                  const added = !!inCart(id);
                  const per = ing.display === 'ml' ? '/l' : '/kg';
                  const ref = ing.pack.price != null ? ing.pack.price * city.priceFactor : null;
                  return (
                    <li key={id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-medium leading-snug">{ing.name}</div>
                        {best ? (
                          <div className="text-xs text-muted">
                            <span className="font-semibold text-accent">{marketName(best.offer.marketId)}</span>
                            {best.offer.quantity ? ` · ${best.offer.quantity}` : ''} · {fmtMoney(best.perKg, city.currency)}{per}
                          </div>
                        ) : (
                          <div className="text-xs text-muted">Kein Angebot{ref != null ? ` · Richtpreis ${ing.pack.label} ≈ ${fmtMoney(ref, city.currency)}` : ''}</div>
                        )}
                        {MUESLI_HINTS[id] && <div className="text-[11px] text-muted">{MUESLI_HINTS[id]}</div>}
                      </div>
                      {best && (
                        <div className="shrink-0 text-right">
                          <div className="tabular text-sm font-semibold">{fmtMoney(best.offer.price, city.currency)}</div>
                          {best.offer.regularPrice && <div className="tabular text-[11px] text-muted line-through">{fmtMoney(best.offer.regularPrice, city.currency)}</div>}
                        </div>
                      )}
                      <button onClick={() => toggle(id)} aria-pressed={added}
                        aria-label={added ? `${ing.name} aus dem Einkaufswagen nehmen` : `${ing.name} in den Einkaufswagen`}
                        className={cx('grid size-9 shrink-0 place-items-center rounded-full transition-colors',
                          added ? 'bg-brand text-brand-ink' : 'border border-line text-brand hover:bg-surface-2')}>
                        {added ? <Check size={17} strokeWidth={3} /> : <Plus size={18} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
