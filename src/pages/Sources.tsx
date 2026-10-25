import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { NUTRIENTS, personNeeds } from '../../shared/references';
import { useCity } from '../lib/derive';
import { useStore } from '../store';
import { Card, SectionTitle } from '../components/ui';
import { fmtVal } from '../components/NutritionPanel';

const KIND: Record<string, string> = { target: 'Empfehlung', min: 'mindestens', limit: 'höchstens', guide: 'Richtwert' };

export function Sources() {
  const sources = useStore((s) => s.sources)!;
  const people = useStore((s) => s.state!.settings.people);
  const city = useCity();
  const nav = useNavigate();

  return (
    <div className="px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <button onClick={() => nav(-1)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-muted"><ArrowLeft size={16} /> Zurück</button>
      <h1 className="font-display mt-2 text-[28px] font-semibold">Quellen & Methodik</h1>

      <div className="mt-4 space-y-3 text-[15px] leading-relaxed">
        <p>
          <b>Woher die Nährwerte kommen:</b> Jede Zutat ist einem Lebensmittel im <i>Bundeslebensmittelschlüssel 4.0</i> des Max Rubner-Instituts
          zugeordnet – der offiziellen deutschen Nährstoffdatenbank. Die App rechnet aus den Mengen im Rezept die Werte pro Portion aus.
          Die KI schätzt keine Nährwerte, sie hilft nur beim Zuordnen und Umrechnen von Mengen.
        </p>
        <p>
          <b>Was „% Tagesbedarf“ bedeutet:</b> Für jede Person im Haushalt werden die Referenzwerte passend zu Alter, Geschlecht und Aktivität
          verwendet – in Deutschland und Österreich die DGE/ÖGE-Referenzwerte, in Kanada die DRI-Werte der National Academies (von Health Canada genutzt).
          Kinder bekommen kleinere Portionen; ihr Anteil richtet sich nach ihrem Energiebedarf. Die alternative Ansicht „Etikett“ nutzt die
          EU-Referenzmengen für 2000 kcal, so wie sie auf Verpackungen stehen.
        </p>
        <p>
          <b>Warum diese Nährstoffe:</b> Neben den acht Angaben der Nährwerttabelle (Energie, Fett, gesättigte Fettsäuren, Kohlenhydrate,
          Zucker, Eiweiß, Ballaststoffe, Salz) zeigt die App freien Zucker (WHO-Obergrenze) und die Nährstoffe, bei denen viele Menschen in Deutschland zu wenig aufnehmen:
          Vitamin D, Folat, Jod, Eisen (v. a. Frauen vor der Menopause), Calcium. Dazu Vitamin B12 (wichtig bei pflanzlicher Ernährung), Vitamin C, Vitamin A,
          Magnesium, Kalium, Zink sowie Omega-3-Fettsäuren (ALA aus Pflanzenöl, EPA+DHA aus Fisch).
        </p>
        <p>
          <b>Obergrenzen statt Ziele:</b> Bei Salz, gesättigten Fettsäuren und Zucker ist weniger besser – diese Balken werden orange bzw. rot,
          wenn eine einzelne Mahlzeit mehr als ihren Anteil am Tag verbraucht.
        </p>
        <p>
          <b>Wochenbilanz:</b> Eine einzelne Mahlzeit muss nicht alles abdecken. Deshalb bilanziert der Wochenplan, was die geplanten Gerichte im Schnitt liefern,
          und prüft die lebensmittelbezogenen DGE-Empfehlungen 2024 (höchstens 300 g Fleisch pro Woche, Fisch 1–2-mal pro Woche).
        </p>
        <p className="text-sm text-muted">
          Grenzen: Referenzwerte gelten für gesunde Menschen; für Schwangerschaft, Stillzeit, Krankheiten oder Säuglinge sind sie nicht gedacht.
          Gewürze ohne Datenbankeintrag gehen nicht in die Berechnung ein; Garverluste von Vitaminen werden nicht abgezogen (Werte für rohe Zutaten).
        </p>
      </div>

      {people[0] && (
        <>
          <SectionTitle>Euer Tagesbedarf</SectionTitle>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="p-3 font-medium">Nährstoff</th>
                  {people.map((p) => <th key={p.id} className="p-3 text-right font-medium">{p.emoji} {p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {NUTRIENTS.map((n) => (
                  <tr key={n.key} className="border-b border-line last:border-0">
                    <td className="p-3">{n.label} <span className="text-xs text-muted">({n.unit})</span></td>
                    {people.map((p) => {
                      const need = personNeeds(p, city.reference)[n.key];
                      return (
                        <td key={p.id} className="tabular p-3 text-right">
                          {need ? <>{need.kind === 'limit' ? '≤ ' : need.kind === 'min' ? '≥ ' : ''}{fmtVal(need.value, n.decimals)}</> : '–'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-muted">≥ = {KIND.min}, ≤ = {KIND.limit}. Basis: {city.reference === 'NASEM' ? 'NASEM-DRI (Health Canada)' : 'DGE/ÖGE'}, ergänzt um WHO, EFSA und SACN (siehe unten).</p>
        </>
      )}

      <SectionTitle>Literatur</SectionTitle>
      <ul className="space-y-2.5 pb-6">
        {sources.map((s) => (
          <li key={s.id}>
            <Card className="p-3.5">
              <a href={s.url} target="_blank" rel="noreferrer" className="group block">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand">{s.org} · {s.year}</span>
                <span className="mt-0.5 flex items-start gap-1.5 font-medium group-hover:underline">{s.title} <ExternalLink size={13} className="mt-1 shrink-0 text-muted" /></span>
                <span className="mt-1 block text-sm text-muted">{s.use}</span>
              </a>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
