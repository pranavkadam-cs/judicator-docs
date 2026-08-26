/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Auth server functions (TanStack Start)
 * ───────────────────────────────────────────────────────────── */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ROLES } from "./dms-types";

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { loginUser } = await import("./auth.server");
    const result = await loginUser(data.email, data.password);
    if ("error" in result) {
      return { success: false as const, error: result.error };
    }
    return {
      success: true as const,
      sessionId: result.sessionId,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        badge: result.user.badge,
        role: result.user.role,
      },
    };
  });

export const logoutFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ sessionId: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { logoutUser } = await import("./auth.server");
    await logoutUser(data.sessionId);
    return { success: true };
  });

export const getSessionFn = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ sessionId: z.string().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getCurrentUserFromSession } = await import("./auth.server");
    const actor = await getCurrentUserFromSession(data.sessionId);
    return actor;
  });

export const changePasswordFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        sessionId: z.string(),
        oldPassword: z.string().min(1),
        newPassword: z.string().min(6),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { validateSession, changeUserPassword } = await import(
      "./auth.server"
    );
    const session = validateSession(data.sessionId);
    if (!session) throw new Error("Session expired. Please log in again.");
    return changeUserPassword(
      session.userId,
      data.oldPassword,
      data.newPassword,
    );
  });

export const createUserFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        sessionId: z.string(),
        name: z.string().min(2),
        email: z.string().email(),
        badge: z.string().min(2),
        role: z.enum(ROLES),
        password: z.string().min(6),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { validateSession, createUser } = await import("./auth.server");
    const { loadRegistry } = await import("./registry.server");
    const session = validateSession(data.sessionId);
    if (!session) throw new Error("Session expired.");
    const reg = await loadRegistry();
    const actor = reg.users.find((u) => u.id === session.userId);
    if (!actor) throw new Error("User not found.");
    return createUser({
      actor: {
        id: actor.id,
        name: actor.name,
        badge: actor.badge,
        role: actor.role,
      },
      name: data.name,
      email: data.email,
      badge: data.badge,
      role: data.role,
      password: data.password,
    });
  });

export const updateUserFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        sessionId: z.string(),
        userId: z.string(),
        name: z.string().optional(),
        role: z.enum(ROLES).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { validateSession, updateUser } = await import("./auth.server");
    const { loadRegistry } = await import("./registry.server");
    const session = validateSession(data.sessionId);
    if (!session) throw new Error("Session expired.");
    const reg = await loadRegistry();
    const actor = reg.users.find((u) => u.id === session.userId);
    if (!actor) throw new Error("User not found.");
    return updateUser({
      actor: {
        id: actor.id,
        name: actor.name,
        badge: actor.badge,
        role: actor.role,
      },
      userId: data.userId,
      name: data.name,
      role: data.role,
      isActive: data.isActive,
    });
  });

export const listUsersFn = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ sessionId: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { validateSession } = await import("./auth.server");
    const { loadRegistry } = await import("./registry.server");
    const session = validateSession(data.sessionId);
    if (!session) throw new Error("Session expired.");
    const reg = await loadRegistry();
    // Return users without password hashes
    return reg.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      badge: u.badge,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));
  });
