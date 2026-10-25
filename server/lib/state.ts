import crypto from 'node:crypto';
import fs from 'node:fs';
import type { HouseholdInfo, HouseholdMember, HouseholdState } from '../../shared/types';
import { freshState, normalizeState } from '../../shared/state';
import { readJson, storagePath, uid } from './store';
import { baseCatalogList } from './catalog';
import { db } from './db';
import { publish } from './events';

const pantry = () => baseCatalogList().filter((i) => i.pantry).map((i) => i.id);
const fresh = (ownerName: string) => freshState(ownerName, pantry());
const normalize = (s: Partial<HouseholdState>) => normalizeState(s, pantry());

// ------------------------------------------------------------ Haushalte

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function inviteCode(): string {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function createHousehold(name: string, ownerId: string, ownerName: string): string {
  const id = uid('h-');
  const now = new Date().toISOString();
  // Einmalige Übernahme des früheren Einzelzustands (vor Einführung der Konten)
  const legacyFile = storagePath('state.json');
  const count = (db.prepare('SELECT COUNT(*) AS n FROM households').get() as { n: number }).n;
  let state = fresh(ownerName);
  if (count === 0 && fs.existsSync(legacyFile)) {
    state = normalize(readJson<Partial<HouseholdState>>(legacyFile, {}));
    fs.renameSync(legacyFile, `${legacyFile}.migrated`);
  }
  db.prepare('INSERT INTO households (id, name, invite_code, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, name, inviteCode(), JSON.stringify(state), now, now,
  );
  addMember(id, ownerId, 'owner');
  return id;
}

export function addMember(householdId: string, userId: string, role: 'owner' | 'member' = 'member') {
  db.prepare('INSERT OR IGNORE INTO memberships (user_id, household_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
    userId, householdId, role, new Date().toISOString(),
  );
  db.prepare('UPDATE users SET active_household_id = ? WHERE id = ?').run(householdId, userId);
}

export function householdByCode(code: string): { id: string; name: string } | undefined {
  return db.prepare('SELECT id, name FROM households WHERE invite_code = ?').get(code.trim().toUpperCase()) as
    | { id: string; name: string }
    | undefined;
}

export function isMember(userId: string, householdId: string): boolean {
  return !!db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND household_id = ?').get(userId, householdId);
}

export function leaveHousehold(userId: string, householdId: string) {
  db.prepare('DELETE FROM memberships WHERE user_id = ? AND household_id = ?').run(userId, householdId);
  const left = (db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE household_id = ?').get(householdId) as { n: number }).n;
  if (left === 0) db.prepare('DELETE FROM households WHERE id = ?').run(householdId);
  else {
    // Ohne Eigentümer*in übernimmt das am längsten dabei gebliebene Mitglied
    const owner = db.prepare("SELECT 1 FROM memberships WHERE household_id = ? AND role = 'owner'").get(householdId);
    if (!owner) {
      db.prepare(
        "UPDATE memberships SET role = 'owner' WHERE household_id = ? AND user_id = (SELECT user_id FROM memberships WHERE household_id = ? ORDER BY joined_at LIMIT 1)",
      ).run(householdId, householdId);
    }
  }
  db.prepare('UPDATE users SET active_household_id = NULL WHERE id = ? AND active_household_id = ?').run(userId, householdId);
}

export function renameHousehold(householdId: string, name: string) {
  db.prepare('UPDATE households SET name = ? WHERE id = ?').run(name, householdId);
}

export function regenerateInvite(householdId: string): string {
  const code = inviteCode();
  db.prepare('UPDATE households SET invite_code = ? WHERE id = ?').run(code, householdId);
  return code;
}

export function householdsForUser(userId: string): HouseholdInfo[] {
  const rows = db
    .prepare(
      `SELECT h.id, h.name, h.invite_code, m.role FROM memberships m JOIN households h ON h.id = m.household_id
       WHERE m.user_id = ? ORDER BY m.joined_at`,
    )
    .all(userId) as { id: string; name: string; invite_code: string; role: 'owner' | 'member' }[];
  return rows.map((h) => ({
    id: h.id,
    name: h.name,
    inviteCode: h.invite_code,
    role: h.role,
    members: db
      .prepare(
        `SELECT u.id, u.name, u.emoji, m.role FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.household_id = ? ORDER BY m.joined_at`,
      )
      .all(h.id) as unknown as HouseholdMember[],
  }));
}

// ------------------------------------------------------------ Zustand je Haushalt

export function getState(householdId: string): HouseholdState {
  const row = db.prepare('SELECT state_json FROM households WHERE id = ?').get(householdId) as { state_json: string } | undefined;
  if (!row) throw new Error('Haushalt nicht gefunden.');
  return normalize(JSON.parse(row.state_json));
}

/** Ändert den Zustand, speichert ihn und schickt ihn live an alle Geräte des Haushalts. */
export function updateState(householdId: string, fn: (s: HouseholdState) => void): HouseholdState {
  const state = getState(householdId);
  fn(state);
  state.updatedAt = new Date().toISOString();
  db.prepare('UPDATE households SET state_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(state), state.updatedAt, householdId);
  publish(householdId, 'state', state);
  return state;
}
