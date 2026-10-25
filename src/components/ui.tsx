import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, X } from 'lucide-react';
import type { Diet } from '../../shared/types';
import { unsplash } from '../lib/derive';
import { useStore } from '../store';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} aria-label="Schließen" />
      <div className="animate-sheet relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-surface-2 text-muted" aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-5 pt-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Chip({ active, onClick, children, className }: {
  active?: boolean; onClick?: () => void; children: ReactNode; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
        active ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface text-ink hover:bg-surface-2',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, size = 'md' }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md';
}) {
  return (
    <div className="flex rounded-full bg-surface-2 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 whitespace-nowrap rounded-full font-medium transition-all',
            size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm',
            o.value === value ? 'bg-raised text-ink shadow-sm' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0.5, max = 20, step = 0.5, format }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-surface-2 p-1">
      <button className="grid size-8 place-items-center rounded-full bg-raised shadow-sm disabled:opacity-40" disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))} aria-label="Weniger"><Minus size={16} /></button>
      <span className="tabular min-w-12 text-center text-sm font-semibold">{format ? format(value) : value.toLocaleString('de-DE')}</span>
      <button className="grid size-8 place-items-center rounded-full bg-raised shadow-sm disabled:opacity-40" disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))} aria-label="Mehr"><Plus size={16} /></button>
    </div>
  );
}

const DIET_STYLE: Record<Diet, { emoji: string; from: string; to: string }> = {
  vegan: { emoji: '🥦', from: '#cfe8c9', to: '#7fbf8a' },
  vegetarisch: { emoji: '🧀', from: '#fbe3b5', to: '#f0b86e' },
  pescetarisch: { emoji: '🐟', from: '#cfe3f1', to: '#7fb0d6' },
  fleisch: { emoji: '🍗', from: '#f6d2c4', to: '#e09173' },
};

export function RecipeImage({ src, alt, diet, w = 640, className, eager }: {
  src?: string | null; alt: string; diet: Diet; w?: number; className?: string; eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const url = unsplash(src, w);
  if (!url || failed) {
    const s = DIET_STYLE[diet];
    return (
      <div className={cx('grid place-items-center', className)} style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }} role="img" aria-label={alt}>
        <span className="text-5xl drop-shadow-sm">{s.emoji}</span>
      </div>
    );
  }
  return (
    <img src={url} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" {...({ fetchpriority: eager ? 'high' : 'auto' } as object)}
      onError={() => setFailed(true)} className={cx('bg-surface-2 object-cover', className)} />
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-brand-soft text-brand">{icon}</div>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-xs text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Button({ children, onClick, variant = 'primary', className, disabled, type = 'button', full }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'accent'; className?: string;
  disabled?: boolean; type?: 'button' | 'submit'; full?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50',
        variant === 'primary' && 'bg-brand text-brand-ink shadow-sm',
        variant === 'accent' && 'bg-accent text-white shadow-sm',
        variant === 'secondary' && 'border border-line bg-surface text-ink',
        variant === 'ghost' && 'text-brand',
        full && 'w-full',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-end justify-between gap-3">
      <h2 className="font-display text-xl font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)]', className)}>{children}</div>;
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="animate-toast pointer-events-auto flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-xl">
          <span className="flex-1">{t.text}</span>
          {t.action && (
            <Link to={t.action.to} onClick={() => dismiss(t.id)} className="font-semibold text-brand-soft underline-offset-2 hover:underline">
              {t.action.label}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-base outline-none transition-colors placeholder:text-muted focus:border-brand';
