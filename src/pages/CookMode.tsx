import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, ThumbsDown, ThumbsUp, Timer, X } from 'lucide-react';
import { fmtAmount } from '../../shared/units';
import { useRecipesById } from '../lib/derive';
import { useStore } from '../store';
import { Button, cx } from '../components/ui';

function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const req = () => nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    req();
    const onVis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, []);
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch {
    /* kein Audio verfügbar */
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

function StepTimer({ minutes }: { minutes: number }) {
  const [left, setLeft] = useState(minutes * 60);
  const [running, setRunning] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    setLeft(minutes * 60);
    setRunning(false);
    done.current = false;
  }, [minutes]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (left === 0 && running && !done.current) {
      done.current = true;
      setRunning(false);
      beep();
    }
  }, [left, running]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className={cx('mt-8 flex items-center gap-4 rounded-3xl p-4', left === 0 ? 'bg-accent text-white' : 'bg-surface-2')}>
      <Timer size={28} className={left === 0 ? '' : 'text-brand'} />
      <span className="tabular flex-1 text-4xl font-semibold">{left === 0 ? 'Fertig!' : `${mm}:${ss}`}</span>
      <button onClick={() => setRunning(!running)} disabled={left === 0}
        className="grid size-14 place-items-center rounded-full bg-brand text-brand-ink disabled:opacity-40" aria-label={running ? 'Pause' : 'Timer starten'}>
        {running ? <Pause size={24} /> : <Play size={24} />}
      </button>
      <button onClick={() => { setLeft(minutes * 60); setRunning(false); done.current = false; }}
        className="grid size-11 place-items-center rounded-full bg-surface" aria-label="Zurücksetzen"><RotateCcw size={18} /></button>
    </div>
  );
}

export function CookMode() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const r = useRecipesById()[id ?? ''];
  const catalog = useStore((s) => s.catalog)!;
  const markCooked = useStore((s) => s.markCooked);
  const rate = useStore((s) => s.rate);
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [have, setHave] = useState<Record<number, boolean>>({});
  useWakeLock();

  if (!r) return null;
  const servings = Number(params.get('p')) || r.servings;
  const f = servings / r.servings;
  const total = r.steps.length + 2; // Zutaten + Schritte + Fertig
  const isIngredients = step === 0;
  const isDone = step === total - 1;
  const s = r.steps[step - 1];

  return (
    <div className="flex min-h-dvh flex-col bg-bg px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-[max(env(safe-area-inset-top),1rem)]">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="grid size-10 place-items-center rounded-full bg-surface-2" aria-label="Kochmodus beenden"><X size={20} /></button>
        <div className="flex flex-1 gap-1" aria-label={`Schritt ${step + 1} von ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-brand' : 'bg-line')} />
          ))}
        </div>
      </header>
      <p className="mt-4 text-sm font-medium text-muted">{r.title}</p>

      <main className="flex-1 py-4">
        {isIngredients && (
          <>
            <h1 className="font-display text-3xl font-semibold">Alles bereit?</h1>
            <p className="mt-1 text-muted">{servings.toLocaleString('de-DE')} Portionen – hake ab, was schon auf der Arbeitsfläche liegt.</p>
            <ul className="mt-5 space-y-1.5">
              {r.ingredients.map((x, k) => {
                const { amount, name } = fmtAmount(catalog[x.i], x.q * f, x.u);
                return (
                  <li key={k}>
                    <button onClick={() => setHave({ ...have, [k]: !have[k] })}
                      className={cx('flex w-full items-center gap-3 rounded-2xl p-3 text-left text-lg', have[k] ? 'bg-brand-soft' : 'bg-surface')}>
                      <span className={cx('grid size-7 shrink-0 place-items-center rounded-full border-2', have[k] ? 'border-brand bg-brand text-brand-ink' : 'border-line')}>
                        {have[k] && <Check size={16} strokeWidth={3} />}
                      </span>
                      <span className={cx('flex-1', have[k] && 'text-muted line-through')}>
                        <b className="tabular font-semibold">{amount}</b> {name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {s && (
          <>
            <span className="text-sm font-semibold uppercase tracking-wider text-brand">Schritt {step} von {r.steps.length}</span>
            <p className="font-display mt-3 text-[28px] font-medium leading-snug sm:text-4xl">{s.t}</p>
            {s.min && <StepTimer key={step} minutes={s.min} />}
          </>
        )}
        {isDone && (
          <div className="flex flex-col items-center pt-10 text-center">
            <span className="text-6xl">🍽️</span>
            <h1 className="font-display mt-4 text-3xl font-semibold">Guten Appetit!</h1>
            <p className="mt-2 text-muted">Wie hat es euch geschmeckt?</p>
            <div className="mt-5 flex gap-3">
              <Button variant="secondary" onClick={() => { rate(r.id, 1); markCooked(r.id); nav(`/rezept/${r.id}`); }}><ThumbsUp size={18} /> Lecker</Button>
              <Button variant="secondary" onClick={() => { rate(r.id, -1); markCooked(r.id); nav(`/rezept/${r.id}`); }}><ThumbsDown size={18} /> Nicht so</Button>
            </div>
          </div>
        )}
      </main>

      {!isDone && (
        <footer className="flex gap-3">
          <Button variant="secondary" className="h-14 w-16" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="Zurück">
            <ChevronLeft size={24} />
          </Button>
          <Button className="h-14 flex-1 text-base" onClick={() => setStep(step + 1)}>
            {isIngredients ? 'Los geht’s' : step === r.steps.length ? 'Fertig' : 'Weiter'} <ChevronRight size={22} />
          </Button>
        </footer>
      )}
    </div>
  );
}
