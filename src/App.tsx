import { useEffect } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarDays, ChefHat, Percent, ShoppingCart, UserRound } from 'lucide-react';
import { useStore } from './store';
import { useCartCount } from './lib/derive';
import { cx, Toasts } from './components/ui';
import { Discover } from './pages/Discover';
import { RecipeDetail } from './pages/RecipeDetail';
import { CookMode } from './pages/CookMode';
import { Plan } from './pages/Plan';
import { Cart } from './pages/Cart';
import { Offers } from './pages/Offers';
import { Profile } from './pages/Profile';
import { Sources } from './pages/Sources';
import { Favorites } from './pages/Favorites';
import { ShareImportSheet } from './components/ShareImportSheet';
import { decodeShare, extractShareCode } from './lib/share';

function Nav() {
  const count = useCartCount();
  const items = [
    { to: '/', label: 'Entdecken', icon: ChefHat, end: true },
    { to: '/plan', label: 'Wochenplan', icon: CalendarDays },
    { to: '/einkauf', label: 'Einkaufswagen', icon: ShoppingCart, badge: count },
    { to: '/angebote', label: 'Angebote', icon: Percent },
    { to: '/profil', label: 'Profil', icon: UserRound },
  ];
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-lg" aria-label="Hauptnavigation">
      <ul className="mx-auto flex max-w-2xl">
        {items.map(({ to, label, icon: Icon, end, badge }) => (
          <li key={to} className="flex-1">
            <NavLink to={to} end={end}
              className={({ isActive }) => cx('flex flex-col items-center gap-0.5 pt-2 text-[11px] font-medium', isActive ? 'text-brand' : 'text-muted')}>
              {({ isActive }) => (
                <>
                  <span className={cx('relative grid h-8 w-14 place-items-center rounded-full transition-colors', isActive && 'bg-brand-soft')}>
                    <Icon size={21} strokeWidth={isActive ? 2.4 : 2} />
                    {!!badge && (
                      <span className="tabular absolute -right-0.5 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  <span className="max-[360px]:hidden">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function App() {
  const ready = useStore((s) => s.ready);
  const start = useStore((s) => s.start);
  const setIncoming = useStore((s) => s.setIncoming);
  const toast = useStore((s) => s.toast);
  const loc = useLocation();
  const immersive = loc.pathname.startsWith('/kochen/') || loc.pathname.startsWith('/rezept/');

  useEffect(() => {
    start();
  }, [start]);

  // Geöffneter Teilen-Link (#teilen=…): Vorschau zeigen und den Code aus der Adresse entfernen
  useEffect(() => {
    if (!ready) return;
    const read = async () => {
      // Einladungslink mit Familien-Schlüssel (#schluessel=…)
      const key = location.hash.match(/[#&]schluessel=([^&]+)/)?.[1];
      if (key) {
        history.replaceState(null, '', location.pathname + location.search);
        useStore.getState().setDevice({ familyKey: decodeURIComponent(key) });
        await useStore.getState().syncRemote();
        const r = useStore.getState().remote;
        toast(r.state === 'ok' ? `Familien-Schlüssel gespeichert – ${r.count ?? 0} Angebote geladen.` : 'Familien-Schlüssel gespeichert.');
        return;
      }
      const code = extractShareCode(location.hash);
      if (!code) return;
      history.replaceState(null, '', location.pathname + location.search);
      const pkg = await decodeShare(code);
      if (pkg) setIncoming(pkg);
      else toast('Der geteilte Link ist unvollständig oder beschädigt.');
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [ready, setIncoming, toast]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <ChefHat className="animate-pulse text-brand" size={40} />
          <span className="text-sm">Marktküche lädt …</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cx('mx-auto min-h-dvh max-w-2xl', !immersive && 'pb-24')}>
      <Routes>
        <Route path="/" element={<Discover />} />
        <Route path="/rezept/:id" element={<RecipeDetail />} />
        <Route path="/kochen/:id" element={<CookMode />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/einkauf" element={<Cart />} />
        <Route path="/angebote" element={<Offers />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/quellen" element={<Sources />} />
        <Route path="/favoriten" element={<Favorites />} />
        <Route path="*" element={<Discover />} />
      </Routes>
      {!immersive && <Nav />}
      <ShareImportSheet />
      <Toasts />
    </div>
  );
}
