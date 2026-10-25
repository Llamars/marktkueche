import { Check, Store } from 'lucide-react';
import { useCity, useSelectedMarkets, useShopMarkets } from '../lib/derive';
import { useStore } from '../store';
import { Chip, cx } from './ui';

/**
 * „Einkaufen bei“: Nur die Angebote dieser Märkte zählen für Vorschläge, Wochenplan und Einkaufswagen.
 * Gedacht für „Ich habe keine Zeit, vier Supermärkte abzuklappern“.
 */
export function ShopFocusBar({ compact, title = 'Einkaufen bei' }: { compact?: boolean; title?: string }) {
  const city = useCity();
  const selected = useSelectedMarkets();
  const shop = useShopMarkets();
  const settings = useStore((s) => s.state!.settings);
  const setSettings = useStore((s) => s.setSettings);
  const all = shop.length === selected.length;
  if (selected.length < 2) return null;

  function set(ids: string[]) {
    setSettings({ shopFocus: { ...(settings.shopFocus ?? {}), [city.id]: ids.length === selected.length ? [] : ids } });
  }
  function toggle(id: string) {
    if (all) return set([id]); // erster Tipp: nur dieser Markt
    const ids = shop.map((m) => m.id);
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    set(next.length ? next : selected.map((m) => m.id));
  }

  return (
    <div className={cx(!compact && 'mt-4')}>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
        <Store size={13} /> {title}
        {!all && <span className="text-brand">· nur Angebote von {shop.map((m) => m.name).join(', ')}</span>}
      </div>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        <Chip active={all} onClick={() => set([])} className="h-8 px-3 text-[13px]">Alle Märkte</Chip>
        {selected.map((m) => {
          const on = !all && shop.some((x) => x.id === m.id);
          return (
            <Chip key={m.id} active={on} onClick={() => toggle(m.id)} className="h-8 px-3 text-[13px]">
              {on && <Check size={13} />} {m.name}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
