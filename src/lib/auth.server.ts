/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Authentication & session management (server-only)
 *  Uses Web Crypto PBKDF2 for password hashing — no native deps.
 * ───────────────────────────────────────────────────────────── */

import type { Actor, AuditAction, Role, User } from "./dms-types";
import { loadRegistry, saveRegistry } from "./registry.server";

// ── Password hashing ────────────────────────────────────────

const SALT_LENGTH = 16;
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

function buf2hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hex2buf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  return `${buf2hex(salt.buffer as ArrayBuffer)}:${buf2hex(derived)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = hex2buf(saltHex);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  return buf2hex(derived) === hashHex;
}

// ── Session management ──────────────────────────────────────

/** In-memory session store. Sessions survive hot-reload but not server restart. */
const sessions = new Map<
  string,
  { userId: string; role: Role; expiresAt: number }
>();

function generateSessionId(): string {
  return buf2hex(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer);
}

export type SessionData = {
  sessionId: string;
  userId: string;
  role: Role;
};

export async function createSession(userId: string, role: Role): Promise<string> {
  const sessionId = generateSessionId();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  sessions.set(sessionId, { userId, role, expiresAt });
  return sessionId;
}

export function validateSession(sessionId: string): SessionData | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  return { sessionId, userId: session.userId, role: session.role };
}

export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ── Login / Logout ──────────────────────────────────────────

export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: User; sessionId: string } | { error: string }> {
  const reg = await loadRegistry();
  const user = reg.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );
  if (!user) return { error: "Invalid email or password." };
  if (!user.isActive) return { error: "Account has been deactivated." };

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { error: "Invalid email or password." };

  const sessionId = await createSession(user.id, user.role);
  user.lastLoginAt = new Date().toISOString();

  // Audit
  reg.audit = [
    {
      id: `aud-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      actor: user.name,
      actorId: user.id,
      role: user.role,
      action: "USER_LOGIN" as AuditAction,
      target: user.email,
      targetId: user.id,
      detail: "Authenticated successfully.",
      hash: null,
      ipAddress: null,
    },
    ...reg.audit,
  ].slice(0, 1000);

  await saveRegistry(reg);
  return { user, sessionId };
}

export async function logoutUser(sessionId: string): Promise<void> {
  const session = validateSession(sessionId);
  if (session) {
    const reg = await loadRegistry();
    const user = reg.users.find((u) => u.id === session.userId);
    if (user) {
      reg.audit = [
        {
          id: `aud-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          at: new Date().toISOString(),
          actor: user.name,
          actorId: user.id,
          role: user.role,
          action: "USER_LOGOUT" as AuditAction,
          target: user.email,
          targetId: user.id,
          detail: "Session ended.",
          hash: null,
          ipAddress: null,
        },
        ...reg.audit,
      ].slice(0, 1000);
      await saveRegistry(reg);
    }
    destroySession(sessionId);
  }
}

// ── Get current user ────────────────────────────────────────

export async function getCurrentUserFromSession(
  sessionId: string | undefined,
): Promise<Actor | null> {
  if (!sessionId) return null;
  const session = validateSession(sessionId);
  if (!session) return null;
  const reg = await loadRegistry();
  const user = reg.users.find((u) => u.id === session.userId);
  if (!user || !user.isActive) return null;
  return { id: user.id, name: user.name, badge: user.badge, role: user.role };
}

// ── Password change ─────────────────────────────────────────

export async function changeUserPassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const reg = await loadRegistry();
  const user = reg.users.find((u) => u.id === userId);
  if (!user) return { success: false, error: "User not found." };

  const valid = await verifyPassword(oldPassword, user.passwordHash);
  if (!valid) return { success: false, error: "Current password is incorrect." };

  if (newPassword.length < 6) {
    return { success: false, error: "Password must be at least 6 characters." };
  }

  user.passwordHash = await hashPassword(newPassword);

  reg.audit = [
    {
      id: `aud-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      actor: user.name,
      actorId: user.id,
      role: user.role,
      action: "PASSWORD_CHANGED" as AuditAction,
      target: user.email,
      targetId: user.id,
      detail: "Password updated.",
      hash: null,
      ipAddress: null,
    },
    ...reg.audit,
  ].slice(0, 1000);

  await saveRegistry(reg);
  return { success: true };
}

// ── User management (Admin) ─────────────────────────────────

export async function createUser(input: {
  actor: Actor;
  name: string;
  email: string;
  badge: string;
  role: Role;
  password: string;
}): Promise<User> {
  const reg = await loadRegistry();
  if (input.actor.role !== "ADMIN") {
    throw new Error("Only administrators can manage users.");
  }
  if (reg.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    throw new Error("A user with that email already exists.");
  }

  const user: User = {
    id: `usr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: input.name,
    email: input.email,
    badge: input.badge,
    role: input.role,
    passwordHash: await hashPassword(input.password),
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  reg.users = [user, ...reg.users];

  reg.audit = [
    {
      id: `aud-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      actor: input.actor.name,
      actorId: input.actor.id,
      role: input.actor.role,
      action: "USER_CREATED" as AuditAction,
      target: user.name,
      targetId: user.id,
      detail: `New ${input.role} account created for ${user.email}.`,
      hash: null,
      ipAddress: null,
    },
    ...reg.audit,
  ].slice(0, 1000);

  await saveRegistry(reg);
  return user;
}

export async function updateUser(input: {
  actor: Actor;
  userId: string;
  name?: string | undefined;
  role?: Role | undefined;
  isActive?: boolean | undefined;
}): Promise<User> {
  const reg = await loadRegistry();
  if (input.actor.role !== "ADMIN") {
    throw new Error("Only administrators can manage users.");
  }
  const user = reg.users.find((u) => u.id === input.userId);
  if (!user) throw new Error("User not found.");

  const changes: string[] = [];
  if (input.name !== undefined && input.name !== user.name) {
    user.name = input.name;
    changes.push(`name → ${input.name}`);
  }
  if (input.role !== undefined && input.role !== user.role) {
    changes.push(`role ${user.role} → ${input.role}`);
    user.role = input.role;
  }
  if (input.isActive !== undefined && input.isActive !== user.isActive) {
    user.isActive = input.isActive;
    changes.push(input.isActive ? "reactivated" : "deactivated");
  }

  if (changes.length > 0) {
    reg.audit = [
      {
        id: `aud-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        at: new Date().toISOString(),
        actor: input.actor.name,
        actorId: input.actor.id,
        role: input.actor.role,
        action: (input.isActive === false ? "USER_DEACTIVATED" : "USER_UPDATED") as AuditAction,
        target: user.name,
        targetId: user.id,
        detail: changes.join(", "),
        hash: null,
        ipAddress: null,
      },
      ...reg.audit,
    ].slice(0, 1000);
    await saveRegistry(reg);
  }

  return user;
}
