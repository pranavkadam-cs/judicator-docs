/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Supabase Auth Integration Bridge
 *  Bridges Supabase Auth services with Vigil.OS RBAC
 *  while supporting seamless local PBKDF2 fallback.
 * ───────────────────────────────────────────────────────────── */

import type { User, Role } from "./dms-types";
import {
  getSupabaseAdminClient,
  getSupabaseClient,
  isSupabaseConfigured,
} from "./supabase";

export interface SupabaseAuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    role?: Role;
    token?: string;
  };
  error?: string;
}

/**
 * Authenticates user credentials against Supabase Auth.
 */
export async function authenticateWithSupabase(
  email: string,
  password: string,
): Promise<SupabaseAuthResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase is not configured." };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: "Failed to initialize Supabase client." };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return {
        success: false,
        error: error?.message || "Invalid credentials in Supabase Auth",
      };
    }

    const appRole = ((data.user.user_metadata as Record<string, any> | undefined)?.["role"] as Role) || "VIEWER";

    return {
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email || email,
        role: appRole,
        token: data.session?.access_token,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Synchronizes a Vigil.OS user account to Supabase Auth if admin client is available.
 */
export async function syncUserToSupabaseAuth(user: User): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const adminClient = getSupabaseAdminClient();
  if (!adminClient) return false;

  try {
    const { error } = await adminClient.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
      user_metadata: {
        name: user.name,
        badge: user.badge,
        role: user.role,
        vigil_id: user.id,
      },
    });

    return !error;
  } catch {
    return false;
  }
}
