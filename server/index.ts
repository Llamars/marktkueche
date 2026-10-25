import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import type { AuthConfig, CartExtra, FavCategory, Me, Offer, PlanEntry, Recipe, Settings } from '../shared/types';
import { CITY_BY_ID, CITIES } from '../shared/cities';
import { SOURCES } from '../shared/references';
import { bestOffers, fitsPrefs, isoDate, keepExtra } from '../shared/logic';
import { baseCatalogList, getCatalog } from './lib/catalog';
import { addRecipe, allRecipes, deleteRecipe, enrich, getHouseholdRecipe } from './lib/recipes';
import {
  addMember, createHousehold, getState, householdByCode, householdsForUser, isMember, leaveHousehold, regenerateInvite,
  renameHousehold, updateState,
} from './lib/state';
import { addOffers, getOffers, removeOffers, restoreDemo, updateOffer } from './lib/offers';
import { claudeEnabled, extractOffers, generateRecipes, MODEL } from './lib/claude';
import { importRecipe, ImportError } from './lib/importRecipe';
import { generateFoodImage, imagesEnabled } from './lib/images';
import { searchBls, BLS_SOURCE } from './lib/bls';
import { IMAGES, ROOT, slugify, uid } from './lib/store';
import { db } from './lib/db';
import {
  clearAttempts, createSession, endSession, getUser, getUserByEmail, hashPassword, noteFailedAttempt, publicUser,
  purgeExpiredSessions, requireAuth, sessionUser, tooManyAttempts, verifyPassword, type AuthedRequest,
} from './lib/auth';
import { publish, publishAll, subscribe } from './lib/events';
import { runSource, sourceStatus, startScheduler } from './lib/sources';
import { config } from './lib/config';
import { startBackups } from './lib/backup';

const app = express();
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 12 } });

const features = () => ({ claude: claudeEnabled(), images: imagesEnabled(), model: MODEL, demoOffers: config.demoOffers, server: true });
// Grobe Grammwerte, falls die KI eine Einheit nutzt, die für die Zutat nicht hinterlegt ist
const UNIT_FALLBACK_G: Record<string, number> = { stk: 100, el: 12, tl: 5, prise: 0.4, zehe: 4, bund: 30, dose: 400, pck: 10, scheibe: 40, becher: 200 };
const today = () => isoDate(new Date());
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type H = (req: AuthedRequest, res: Response, next: NextFunction) => unknown;
/** Route mit Anmeldung: req.user und req.householdId sind gesetzt. */
const authed = (h: H) => [requireAuth, (req: Request, res: Response, next: NextFunction) => h(req as AuthedRequest, res, next)];

function me(userId: string): Me {
  const user = getUser(userId)!;
  const households = householdsForUser(userId);
  const active = households.find((h) => h.id === user.active_household_id) ?? households[0];
  return { user: publicUser(user), households, activeHouseholdId: active?.id ?? '' };
}

// ------------------------------------------------------------ Betrieb

app.get('/api/health', (_req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true });
});

// ------------------------------------------------------------ Konto

const userCount = () => (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
const sameCode = (a: string, b: string) =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

app.get('/api/auth/config', (_req, res) => {
  res.json({ registration: config.registration, firstUser: userCount() === 0 } satisfies AuthConfig);
});

app.get('/api/auth/me', (req, res) => {
  const u = sessionUser(req);
  if (!u) return res.status(401).json({ error: 'Nicht angemeldet.' });
  res.json(me(u.id));
});

app.get('/api/auth/invite/:code', (req, res) => {
  const key = `invite|${req.ip}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: 'Zu viele Versuche – bitte in 15 Minuten erneut probieren.' });
  const h = householdByCode(req.params.code);
  if (!h) {
    noteFailedAttempt(key);
    return res.status(404).json({ error: 'Einladungscode unbekannt.' });
  }
  res.json({ name: h.name });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, inviteCode } = req.body as { name?: string; email?: string; password?: string; inviteCode?: string };
  if (!name?.trim() || !email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Bitte Name und gültige E-Mail angeben.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Das Passwort braucht mindestens 8 Zeichen.' });
  const key = `signup|${req.ip}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: 'Zu viele Versuche – bitte in 15 Minuten erneut probieren.' });
  if (getUserByEmail(email)) return res.status(409).json({ error: 'Für diese E-Mail gibt es schon ein Konto.' });
  const code = inviteCode?.trim().toUpperCase() ?? '';
  // Mit SIGNUP_CODE darf jemand ohne Einladung einen eigenen Haushalt anlegen
  const ownHousehold = !!code && !!config.signupCode && sameCode(code, config.signupCode);
  const invited = code && !ownHousehold ? householdByCode(code) : undefined;
  if (code && !ownHousehold && !invited) {
    noteFailedAttempt(key);
    return res.status(404).json({ error: 'Der Einladungscode ist ungültig.' });
  }
  if (config.registration === 'invite' && !code && userCount() > 0) {
    return res.status(403).json({ error: 'Diese Marktküche ist privat – ein Konto gibt es nur mit Einladungscode.' });
  }
  const id = uid('u-');
  db.prepare('INSERT INTO users (id, email, name, emoji, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, email.trim(), name.trim(), '🙂', hashPassword(password), new Date().toISOString(),
  );
  if (invited) {
    addMember(invited.id, id, 'member');
    publish(invited.id, 'members', {});
  } else createHousehold(`Haushalt ${name.trim()}`, id, name.trim());
  createSession(res, id);
  res.json(me(id));
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  const key = `${req.ip}|${(email ?? '').toLowerCase()}`;
  if (tooManyAttempts(key)) return res.status(429).json({ error: 'Zu viele Versuche – bitte in 15 Minuten erneut probieren.' });
  const u = email ? getUserByEmail(email) : undefined;
  if (!u || !password || !verifyPassword(password, u.password_hash)) {
    noteFailedAttempt(key);
    return res.status(401).json({ error: 'E-Mail oder Passwort stimmt nicht.' });
  }
  clearAttempts(key);
  createSession(res, u.id);
  res.json(me(u.id));
});

app.post('/api/auth/logout', (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

app.patch('/api/auth/profile', (req, res) => {
  const u = sessionUser(req);
  if (!u) return res.status(401).json({ error: 'Bitte anmelden.' });
  const { name, emoji, currentPassword, newPassword } = req.body as { name?: string; emoji?: string; currentPassword?: string; newPassword?: string };
  if (name?.trim()) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), u.id);
  if (emoji) db.prepare('UPDATE users SET emoji = ? WHERE id = ?').run(emoji.slice(0, 8), u.id);
  if (newPassword) {
    if (!currentPassword || !verifyPassword(currentPassword, u.password_hash)) return res.status(403).json({ error: 'Das aktuelle Passwort stimmt nicht.' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Das neue Passwort braucht mindestens 8 Zeichen.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), u.id);
  }
  for (const h of householdsForUser(u.id)) publish(h.id, 'members', {});
  res.json(me(u.id));
});

// ------------------------------------------------------------ Haushalte

app.post('/api/households', (req, res) => {
  const u = sessionUser(req);
  if (!u) return res.status(401).json({ error: 'Bitte anmelden.' });
  const { name } = req.body as { name?: string };
  createHousehold(name?.trim() || `Haushalt ${u.name}`, u.id, u.name);
  res.json(me(u.id));
});

app.post('/api/households/join', (req, res) => {
  const u = sessionUser(req);
  if (!u) return res.status(401).json({ error: 'Bitte anmelden.' });
  const h = householdByCode(String((req.body as { code?: string }).code ?? ''));
  if (!h) return res.status(404).json({ error: 'Der Einladungscode ist ungültig.' });
  addMember(h.id, u.id, 'member');
  publish(h.id, 'members', {});
  res.json(me(u.id));
});

app.post('/api/households/:id/activate', (req, res) => {
  const u = sessionUser(req);
  if (!u || !isMember(u.id, req.params.id)) return res.status(403).json({ error: 'Kein Zugriff auf diesen Haushalt.' });
  db.prepare('UPDATE users SET active_household_id = ? WHERE id = ?').run(req.params.id, u.id);
  res.json(me(u.id));
});

app.patch('/api/households/:id', (req, res) => {
  const u = sessionUser(req);
  if (!u || !isMember(u.id, req.params.id)) return res.status(403).json({ error: 'Kein Zugriff auf diesen Haushalt.' });
  const { name } = req.body as { name?: string };
  if (name?.trim()) renameHousehold(req.params.id, name.trim());
  publish(req.params.id, 'members', {});
  res.json(me(u.id));
});

app.post('/api/households/:id/invite', (req, res) => {
  const u = sessionUser(req);
  if (!u || !isMember(u.id, req.params.id)) return res.status(403).json({ error: 'Kein Zugriff auf diesen Haushalt.' });
  regenerateInvite(req.params.id);
  res.json(me(u.id));
});

app.post('/api/households/:id/leave', (req, res) => {
  const u = sessionUser(req);
  if (!u || !isMember(u.id, req.params.id)) return res.status(403).json({ error: 'Kein Zugriff auf diesen Haushalt.' });
  leaveHousehold(u.id, req.params.id);
  publish(req.params.id, 'members', {});
  // Ohne Haushalt geht nichts – dann einen neuen anlegen
  if (!householdsForUser(u.id).length) createHousehold(`Haushalt ${u.name}`, u.id, u.name);
  res.json(me(u.id));
});

// ------------------------------------------------------------ Lesen

app.get('/api/bootstrap', ...authed((req, res) => {
  res.json({
    features: features(),
    cities: CITIES,
    catalog: getCatalog(),
    recipes: allRecipes(req.householdId),
    offers: getOffers(),
    state: getState(req.householdId),
    sources: SOURCES,
    blsSource: BLS_SOURCE,
    me: me(req.user.id),
    autoSources: sourceStatus(),
  });
}));

app.get('/api/events', ...authed((req, res) => subscribe(req.householdId, res)));
app.get('/api/state', ...authed((req, res) => res.json(getState(req.householdId))));
app.get('/api/recipes', ...authed((req, res) => res.json(allRecipes(req.householdId))));
app.get('/api/offers', ...authed((_req, res) => res.json(getOffers())));
app.get('/api/foods/search', ...authed((req, res) => res.json(searchBls(String(req.query.q ?? ''), 10))));

// ------------------------------------------------------------ Haushaltszustand (live für alle Mitglieder)

app.put('/api/state/settings', ...authed((req, res) => {
  const s = req.body as Settings;
  res.json(updateState(req.householdId, (st) => void (st.settings = { ...st.settings, ...s })));
}));

app.put('/api/state/plan', ...authed((req, res) => {
  const plan = req.body as PlanEntry[];
  if (!Array.isArray(plan)) return res.status(400).json({ error: 'Plan muss eine Liste sein.' });
  res.json(updateState(req.householdId, (st) => void (st.plan = plan)));
}));

app.post('/api/state/check', ...authed((req, res) => {
  const { key, checked } = req.body as { key: string; checked: boolean };
  res.json(updateState(req.householdId, (st) => {
    if (checked) {
      st.checked[key] = true;
      st.checkedBy[key] = req.user.name;
    } else {
      delete st.checked[key];
      delete st.checkedBy[key];
    }
  }));
}));

app.post('/api/state/clear-checked', ...authed((req, res) => {
  res.json(updateState(req.householdId, (st) => {
    st.extras = st.extras.filter((e) => keepExtra(e, st.checked));
    st.checked = {};
    st.checkedBy = {};
  }));
}));

app.post('/api/state/buy-anyway', ...authed((req, res) => {
  const { id, value } = req.body as { id: string; value: boolean };
  res.json(updateState(req.householdId, (st) => {
    if (value) st.buyAnyway[id] = true;
    else delete st.buyAnyway[id];
  }));
}));

app.put('/api/state/extras', ...authed((req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Liste erwartet.' });
  const extras = (req.body as CartExtra[]).map((e) => ({
    ...e,
    by: e.by ?? req.user.name,
    packs: e.ingredientId ? Math.min(20, Math.max(1, Math.round(Number(e.packs) || 1))) : undefined,
  }));
  res.json(updateState(req.householdId, (st) => void (st.extras = extras)));
}));

app.post('/api/state/favorite', ...authed((req, res) => {
  const { id, categoryId } = req.body as { id: string; categoryId: string | null };
  res.json(updateState(req.householdId, (st) => {
    if (categoryId) st.favorites[id] = categoryId;
    else delete st.favorites[id];
  }));
}));

app.put('/api/state/fav-categories', ...authed((req, res) => {
  const cats = (req.body as FavCategory[]).filter((c) => c.id && c.name?.trim()).slice(0, 40);
  res.json(updateState(req.householdId, (st) => {
    st.favCategories = cats;
    // Favoriten gelöschter Kategorien landen in „Sonstiges“
    const ids = new Set(cats.map((c) => c.id));
    for (const [r, c] of Object.entries(st.favorites)) if (!ids.has(c)) st.favorites[r] = cats[cats.length - 1]?.id ?? 'sonstiges';
  }));
}));

app.post('/api/state/rate', ...authed((req, res) => {
  const { id, value } = req.body as { id: string; value: 1 | -1 | 0 };
  res.json(updateState(req.householdId, (st) => {
    if (value) st.ratings[id] = value;
    else delete st.ratings[id];
  }));
}));

app.post('/api/state/cooked', ...authed((req, res) => {
  const { id } = req.body as { id: string };
  res.json(updateState(req.householdId, (st) => void (st.cooked[id] = new Date().toISOString())));
}));

// ------------------------------------------------------------ Angebote (gemeinsam für alle, je Stadt)

const offersChanged = () => publishAll('offers', {});

app.post('/api/offers', ...authed((req, res) => {
  const o = req.body as Partial<Offer>;
  if (!o.title || typeof o.price !== 'number' || !o.cityId || !o.marketId) {
    return res.status(400).json({ error: 'Titel, Preis, Stadt und Markt sind Pflicht.' });
  }
  const [created] = addOffers([
    {
      cityId: o.cityId, marketId: o.marketId, title: o.title, brand: o.brand, price: o.price, quantity: o.quantity,
      regularPrice: o.regularPrice, validFrom: o.validFrom ?? today(), validTo: o.validTo, ingredientId: o.ingredientId ?? null,
      source: 'manual',
    },
  ]);
  offersChanged();
  res.json(created);
}));

app.patch('/api/offers/:id', ...authed((req, res) => {
  const o = updateOffer(req.params.id, req.body as Partial<Offer>);
  if (!o) return res.status(404).json({ error: 'Angebot nicht gefunden.' });
  offersChanged();
  res.json(o);
}));

app.delete('/api/offers/:id', ...authed((req, res) => {
  removeOffers((o) => o.id === req.params.id);
  offersChanged();
  res.json(getOffers());
}));

app.post('/api/offers/clear', ...authed((req, res) => {
  const { source, cityId, marketId, expired } = req.body as { source?: string; cityId?: string; marketId?: string; expired?: boolean };
  removeOffers(
    (o) =>
      (!source || o.source === source) &&
      (!cityId || o.cityId === cityId) &&
      (!marketId || o.marketId === marketId) &&
      (!expired || (!!o.validTo && o.validTo < today())),
  );
  offersChanged();
  res.json(getOffers());
}));

app.post('/api/offers/demo', ...authed((_req, res) => {
  if (!config.demoOffers) return res.status(403).json({ error: 'Beispielangebote sind auf diesem Server abgeschaltet.' });
  restoreDemo();
  offersChanged();
  res.json(getOffers());
}));

app.get('/api/sources', ...authed((_req, res) => res.json(sourceStatus())));
app.post('/api/sources/:id/run', ...authed(async (req, res, next) => {
  try {
    await runSource(req.params.id, true);
    offersChanged();
    res.json({ sources: sourceStatus(), offers: getOffers() });
  } catch (e) {
    next(e);
  }
}));

app.post('/api/offers/upload', requireAuth, upload.array('files', 12), async (req, res, next) => {
  try {
    const { householdId } = req as AuthedRequest;
    const files = (req.files as Express.Multer.File[]) ?? [];
    const { cityId, marketId, validFrom, validTo } = req.body as Record<string, string>;
    const city = CITY_BY_ID[cityId];
    const settings = getState(householdId).settings;
    const market = [...(city?.markets ?? []), ...(settings.customMarkets[cityId] ?? [])].find((m) => m.id === marketId);
    if (!city || !market) return res.status(400).json({ error: 'Bitte Stadt und Markt wählen.' });
    if (!files.length) return res.status(400).json({ error: 'Bitte mindestens eine PDF- oder Bilddatei hochladen.' });
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const bad = files.find((f) => !allowed.includes(f.mimetype));
    if (bad) return res.status(400).json({ error: `Dateityp nicht unterstützt: ${bad.originalname}` });
    const extracted = await extractOffers(
      files.map((f) => ({ mime: f.mimetype, base64: f.buffer.toString('base64') })),
      { market: market.name, city: city.name, currency: city.currency, today: today(), catalog: baseCatalogList() },
    );
    const created = addOffers(
      extracted
        .filter((o) => o.title && o.price > 0)
        .map((o) => ({
          cityId, marketId, title: o.title, brand: o.brand ?? undefined, price: o.price,
          regularPrice: o.regularPrice ?? undefined, quantity: o.quantity ?? undefined, packG: o.packGrams ?? undefined,
          perKg: o.perKg ?? undefined, validFrom: validFrom || o.validFrom || today(), validTo: validTo || o.validTo || undefined,
          ingredientId: o.ingredientId, source: 'upload' as const,
        })),
    );
    offersChanged();
    res.json({ created: created.length, offers: getOffers() });
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------ Rezepte (eigene Rezepte gehören zum Haushalt)

app.post('/api/recipes/import', ...authed(async (req, res, next) => {
  try {
    const recipe = await importRecipe(req.body as { url?: string; text?: string });
    if (!recipe.ingredients.length) throw new ImportError('Es konnten keine Zutaten erkannt werden.', true);
    addRecipe(req.householdId, recipe);
    publish(req.householdId, 'recipes', {});
    res.json(enrich(recipe));
  } catch (e) {
    next(e);
  }
}));

app.patch('/api/recipes/:id', ...authed((req, res) => {
  const r = getHouseholdRecipe(req.householdId, req.params.id);
  if (!r) return res.status(404).json({ error: 'Nur eigene Rezepte können geändert werden.' });
  const next: Recipe = { ...r, ...(req.body as Partial<Recipe>), id: r.id };
  addRecipe(req.householdId, next);
  publish(req.householdId, 'recipes', {});
  res.json(enrich(next));
}));

app.delete('/api/recipes/:id', ...authed((req, res) => {
  if (!deleteRecipe(req.householdId, req.params.id)) return res.status(404).json({ error: 'Rezept nicht gefunden oder Grundrezept.' });
  publish(req.householdId, 'recipes', {});
  res.json({ ok: true });
}));

app.post('/api/recipes/generate', ...authed(async (req, res, next) => {
  try {
    const { count = 3, wish } = req.body as { count?: number; wish?: string };
    const st = getState(req.householdId);
    const s = st.settings;
    const city = CITY_BY_ID[s.cityId];
    const catalog = getCatalog();
    const focus = s.shopFocus?.[s.cityId]?.length ? s.shopFocus[s.cityId] : (s.marketIds[s.cityId] ?? []);
    const offers = bestOffers(getOffers(), catalog, s.cityId, focus, today());
    const offerLines = [...offers.values()].map(
      ({ offer }) => `${catalog[offer.ingredientId!]?.name} (${offer.title}, ${offer.price.toFixed(2)} ${city.currency}${offer.quantity ? `, ${offer.quantity}` : ''})`,
    );
    const avoid = [
      ...s.dislikes.map((d) => catalog[d]?.name).filter(Boolean),
      ...s.allergies.map((a) => `Allergen ${a}`),
    ] as string[];
    const existing = [...new Set(allRecipes(req.householdId).map((r) => r.title))];
    const generated = await generateRecipes({
      count: Math.min(5, Math.max(1, count)),
      offers: offerLines.length ? offerLines : ['(keine aktuellen Angebote – nutze saisonales Gemüse)'],
      diet: s.diet,
      avoid,
      maxTime: s.maxTimeWeekday,
      kids: s.people.some((p) => p.age < 12),
      existing,
      catalog: baseCatalogList(),
      wish,
    });
    const created = [];
    for (const g of generated) {
      const ingredients = g.ingredients
        .filter((x) => catalog[x.catalogId])
        .map((x) => {
          const known = ['g', 'ml'].includes(x.unit) || catalog[x.catalogId].units[x.unit] != null;
          return known
            ? { i: x.catalogId, q: x.quantity, u: x.unit }
            : { i: x.catalogId, q: x.quantity * (UNIT_FALLBACK_G[x.unit] ?? 100), u: 'g' };
        });
      const id = `ki-${slugify(g.title)}-${uid().slice(-4)}`;
      const recipe: Recipe = {
        id, title: g.title, teaser: g.teaser, time: g.time, active: g.active, difficulty: g.difficulty, servings: 4,
        tags: g.tags.slice(0, 5), ingredients, steps: g.steps.map((t) => ({ t: t.text, min: t.minutes ?? undefined })),
        image: null, source: 'ki', createdAt: new Date().toISOString(),
      };
      recipe.image = await generateFoodImage(id, g.imagePrompt);
      if (recipe.image) recipe.imageCredit = 'KI-generiert';
      const view = enrich(recipe, catalog);
      if (!fitsPrefs(view, s)) continue;
      addRecipe(req.householdId, recipe);
      created.push(view);
    }
    publish(req.householdId, 'recipes', {});
    res.json(created);
  } catch (e) {
    next(e);
  }
}));

// ------------------------------------------------------------ Bilder & Frontend

app.use('/images', express.static(IMAGES, { maxAge: '30d' }));

const dist = path.join(ROOT, 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// ------------------------------------------------------------ Fehler

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ImportError) return res.status(422).json({ error: err.message, needsText: err.needsText });
  if (err instanceof Anthropic.AuthenticationError) return res.status(502).json({ error: 'Der Claude-API-Schlüssel ist ungültig.' });
  if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Zu viele KI-Anfragen – bitte kurz warten.' });
  if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `KI-Dienst nicht erreichbar (${err.status ?? 'Netzwerk'}).` });
  const msg = err instanceof Error ? err.message : String(err);
  console.error(err);
  res.status(500).json({ error: msg });
});

const server = app.listen(config.port, config.host, () => {
  console.log(
    `Marktküche-Server läuft auf http://${config.host}:${config.port}  (KI: ${claudeEnabled() ? MODEL : 'aus'}, Bilder: ${imagesEnabled() ? 'an' : 'aus'}, ` +
      `Registrierung: ${config.registration === 'invite' ? 'nur mit Einladung' : 'offen'})`,
  );
  startScheduler(() => offersChanged());
  startBackups();
  purgeExpiredSessions();
  setInterval(purgeExpiredSessions, 24 * 3600 * 1000).unref();
});

// Sauber beenden (z. B. bei „docker compose down“), damit die Datenbank vollständig geschrieben ist
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => {
    server.close();
    server.closeAllConnections();
    db.close();
    process.exit(0);
  });
}
