import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { User } from '../../shared/types';
import { db } from './db';

const COOKIE = 'mk_session';
const SESSION_DAYS = 90;

// ------------------------------------------------------------ Passwörter (scrypt mit Salz)

const N = 16384;
const R = 8;
const P = 1;

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(expected, actual);
}

// ------------------------------------------------------------ Sitzungen

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(res: Response, userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 864e5);
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token), userId, now.toISOString(), expires.toISOString(),
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: SESSION_DAYS * 864e5,
    path: '/',
  });
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Abgelaufene Sitzungen entfernen (läuft beim Start und täglich). */
export function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}

export function endSession(req: Request, res: Response) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  emoji: string;
  password_hash: string;
  active_household_id: string | null;
}

export function sessionUser(req: Request): UserRow | null {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), new Date().toISOString()) as UserRow | undefined;
  return row ?? null;
}

export const publicUser = (u: UserRow): User => ({ id: u.id, email: u.email, name: u.name, emoji: u.emoji });

export function getUserByEmail(email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim()) as UserRow | undefined;
}

export function getUser(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

// ------------------------------------------------------------ Schutz vor zu vielen Login-Versuchen

const attempts = new Map<string, { n: number; until: number }>();
export function tooManyAttempts(key: string): boolean {
  const a = attempts.get(key);
  return !!a && a.n >= 8 && a.until > Date.now();
}
export function noteFailedAttempt(key: string) {
  const a = attempts.get(key);
  const until = Date.now() + 15 * 60 * 1000;
  attempts.set(key, { n: a && a.until > Date.now() ? a.n + 1 : 1, until });
}
export const clearAttempts = (key: string) => attempts.delete(key);

// ------------------------------------------------------------ Middleware

export interface AuthedRequest extends Request {
  user: UserRow;
  householdId: string;
}

/** Prüft die Sitzung und setzt den aktiven Haushalt (req.householdId). */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: 'Bitte anmelden.' });
  const membership = db
    .prepare('SELECT household_id FROM memberships WHERE user_id = ? ORDER BY (household_id = ?) DESC, joined_at LIMIT 1')
    .get(user.id, user.active_household_id ?? '') as { household_id: string } | undefined;
  if (!membership) return res.status(409).json({ error: 'Du bist in keinem Haushalt.', noHousehold: true });
  (req as AuthedRequest).user = user;
  (req as AuthedRequest).householdId = membership.household_id;
  next();
}
