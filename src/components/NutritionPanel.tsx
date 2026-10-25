import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Info } from 'lucide-react';
import type { Nutrients, Person } from '../../shared/types';
import { labelNeeds, NUTRIENTS, personNeeds, portionFactor, type Needs } from '../../shared/references';
import { scaleNutrients } from '../../shared/logic';
import { useCity } from '../lib/derive';
import { useStore } from '../store';
import { cx } from './ui';

export function fmtVal(v: number, decimals: number) {
  return v.toLocaleString('de-DE', { maximumFractionDigits: v < 10 ? Math.max(decimals, v < 1 ? 1 : 0) : decimals });
}

/** Farbe eines Balkens: Obergrenzen werden warm, wenn eine Mahlzeit mehr als ihren Anteil verbraucht. */
function barTone(kind: string, pct: number, share: number) {
  if (kind === 'limit') return pct > share * 1.5 ? 'bg-accent' : pct > share ? 'bg-warn' : 'bg-good';
  if (kind === 'guide') return 'bg-muted';
  return pct >= share ? 'bg-good' : 'bg-brand';
}

export function NutrientRows({ values, needs, share, keys, shareLabel }: {
  values: Nutrients; needs: Needs; share: number; keys: string[]; shareLabel?: string;
}) {
  return (
    <ul className="space-y-3">
      {NUTRIENTS.filter((n) => keys.includes(n.key) && needs[n.key]).map((n) => {
        const need = needs[n.key]!;
        const v = values[n.key] ?? 0;
        const pct = need.value ? (v / need.value) * 100 : 0;
        return (
          <li key={n.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">
                {n.label}
                {need.kind === 'limit' && <span className="ml-1.5 text-[11px] font-normal text-muted">max.</span>}
              </span>
              <span className="tabular text-muted">
                {fmtVal(v, n.decimals)} {n.unit}
                <span className={cx('ml-2 inline-block w-12 whitespace-nowrap text-right font-semibold', need.kind === 'limit' && pct > share * 150 ? 'text-accent' : 'text-ink')}>
                  {Math.round(pct)} %
                </span>
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-surface-2" title={`${n.hint} Referenz: ${fmtVal(need.value, n.decimals)} ${n.unit} (${need.source})`}>
              <div className={cx('h-full rounded-full transition-all', barTone(need.kind, pct, share * 100))} style={{ width: `${Math.min(100, pct)}%` }} />
              <div className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${share * 100}%` }} aria-hidden />
            </div>
          </li>
        );
      })}
      {shareLabel && (
        <li className="flex items-center gap-2 pt-1 text-xs text-muted">
          <span className="inline-block h-3 w-px bg-ink/40" /> {shareLabel}
        </li>
      )}
    </ul>
  );
}

const BASIS = ['kcal', 'protein', 'fat', 'satFat', 'carbs', 'sugar', 'freeSugar', 'fiber', 'salt'];
const MIKRO = ['vitD', 'folate', 'vitB12', 'vitC', 'vitA', 'iodine', 'iron', 'calcium', 'magnesium', 'potassium', 'zinc', 'ala', 'epaDha'];

export function NutritionPanel({ perServing, coverage }: { perServing: Nutrients; coverage: number }) {
  const settings = useStore((s) => s.state!.settings);
  const city = useCity();
  const people = settings.people;
  const [who, setWho] = useState<string>(settings.nutrientRef === 'label' ? 'label' : people[0]?.id ?? 'label');
  const [more, setMore] = useState(false);
  const person: Person | undefined = people.find((p) => p.id === who);
  const factor = person ? portionFactor(person) : 1;
  const needs = person ? personNeeds(person, city.reference) : labelNeeds(city.country);
  const values = scaleNutrients(perServing, factor);
  const share = 1 / Math.max(1, settings.mealsPerDay);

  return (
    <div>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {people.map((p) => (
          <button key={p.id} onClick={() => setWho(p.id)}
            className={cx('flex shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm', who === p.id ? 'border-brand bg-brand-soft' : 'border-line')}>
            <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-base">{p.emoji ?? '🙂'}</span>
            <span className="font-medium">{p.name}</span>
          </button>
        ))}
        <button onClick={() => setWho('label')}
          className={cx('shrink-0 rounded-full border px-3.5 py-1.5 text-sm', who === 'label' ? 'border-brand bg-brand-soft font-medium' : 'border-line')}>
          Etikett (2000 kcal)
        </button>
      </div>

      <p className="mb-4 text-sm text-muted">
        {person
          ? <>Portion für <b className="text-ink">{person.name}</b>: {factor.toLocaleString('de-DE')} × Standardportion. Prozent vom persönlichen Tagesbedarf ({city.reference === 'NASEM' ? 'NASEM/Health Canada' : 'DGE/ÖGE'}).</>
          : <>Eine Standardportion im Verhältnis zur {city.country === 'CA' ? 'kanadischen Daily Value' : 'EU-Referenzmenge'} – wie auf Verpackungen.</>}
      </p>

      <NutrientRows values={values} needs={needs} share={share} keys={BASIS}
        shareLabel={`Strich = Anteil einer Mahlzeit bei ${settings.mealsPerDay} Mahlzeiten am Tag (≈ ${Math.round(share * 100)} %)`} />

      <button onClick={() => setMore(!more)} className="mt-5 flex w-full items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-sm font-medium" aria-expanded={more}>
        Vitamine, Mineralstoffe & Omega-3
        <ChevronDown size={18} className={cx('transition-transform', more && 'rotate-180')} />
      </button>
      {more && (
        <div className="mt-4">
          <NutrientRows values={values} needs={needs} share={share} keys={MIKRO} />
          <p className="mt-3 text-xs text-muted">
            Vitamin D bildet der Körper vor allem selbst durch Sonnenlicht – über das Essen ist der Wert kaum erreichbar.
          </p>
        </div>
      )}

      <p className="mt-5 flex gap-2 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Berechnet aus dem Bundeslebensmittelschlüssel 4.0 (Max Rubner-Institut) für {Math.round(coverage * 100)} % der Zutatenmenge.
          Gewürze ohne Nährwertdaten sind nicht enthalten. <Link to="/quellen" className="font-medium text-brand underline-offset-2 hover:underline">Quellen & Methodik</Link>
        </span>
      </p>
    </div>
  );
}
