import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Actor, Role } from "@/lib/dms-types";
import { ROLE_PROFILE } from "@/lib/dms-types";
import { useServerFn } from "@tanstack/react-start";
import { getSessionFn, loginFn, logoutFn } from "@/lib/auth.functions";
import { toast } from "sonner";

type AuthCtx = {
  actor: Actor | null;
  sessionId: string | null;
  isPending: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  demoSwitchRole: (role: Role) => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function ActorProvider({ children }: { children: ReactNode }) {
  const getSession = useServerFn(getSessionFn);
  const performLogin = useServerFn(loginFn);
  const performLogout = useServerFn(logoutFn);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [isPending, setIsPending] = useState(true);

  // Initialize session from localStorage
  useEffect(() => {
    const storedSession = window.localStorage.getItem("vigil.sessionId");
    if (storedSession) {
      setSessionId(storedSession);
      getSession({ data: { sessionId: storedSession } })
        .then((res) => {
          if (res) {
            setActor(res);
          } else {
            // Expired/invalid session
            window.localStorage.removeItem("vigil.sessionId");
            setSessionId(null);
          }
        })
        .catch(() => {
          window.localStorage.removeItem("vigil.sessionId");
          setSessionId(null);
        })
        .finally(() => {
          setIsPending(false);
        });
    } else {
      setIsPending(false);
    }
  }, [getSession]);

  async function login(email: string, password: string): Promise<boolean> {
    setIsPending(true);
    try {
      const res = await performLogin({ data: { email, password } });
      if (res.success && res.sessionId && res.user) {
        setSessionId(res.sessionId);
        const newActor: Actor = {
          id: res.user.id,
          name: res.user.name,
          badge: res.user.badge,
          role: res.user.role,
        };
        setActor(newActor);
        window.localStorage.setItem("vigil.sessionId", res.sessionId);
        toast.success(`Welcome back, ${res.user.name}`);
        return true;
      } else {
        toast.error("login" in res ? String(res.login) : "Invalid credentials.");
        return false;
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to log in.");
      return false;
    } finally {
      setIsPending(false);
    }
  }

  async function logout() {
    if (sessionId) {
      try {
        await performLogout({ data: { sessionId } });
      } catch {}
      window.localStorage.removeItem("vigil.sessionId");
      setSessionId(null);
      setActor(null);
      toast.info("Logged out of session.");
    }
  }

  // Demo fallback capability (Admin/dev only or general for this local demo)
  function demoSwitchRole(role: Role) {
    // For demo purposes, we will fetch the first seeded user of this role
    // and mock authenticate them in local state.
    import("@/lib/seed-registry").then(async (m) => {
      const seed = await m.buildSeedRegistry();
      const user = seed.users.find((u) => u.role === role);
      if (user) {
        // Authenticate via normal flow using seed password
        const passMap: Record<Role, string> = {
          ADMIN: "admin123",
          INVESTIGATOR: "invest123",
          LEGAL_OFFICER: "legal123",
          COURT_OFFICER: "court123",
          VIEWER: "viewer123",
        };
        await login(user.email, passMap[role]);
      }
    });
  }

  const value = useMemo<AuthCtx>(
    () => ({
      actor,
      sessionId,
      isPending,
      login,
      logout,
      demoSwitchRole,
    }),
    [actor, sessionId, isPending],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useActor() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useActor must be used inside ActorProvider");
  return ctx;
}

export function profileOf(role: Role) {
  return ROLE_PROFILE[role];
}
