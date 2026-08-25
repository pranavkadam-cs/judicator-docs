import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Actor, Role } from "@/lib/dms-types";
import { ROLE_PROFILE } from "@/lib/dms-types";

export const PERSONNEL: Record<Role, Actor> = {
  OFFICER: { name: "Const. R. Salvi", badge: "MH-4471", role: "OFFICER" },
  INVESTIGATOR: { name: "Insp. A. Deshmukh", badge: "MH-1180", role: "INVESTIGATOR" },
  FORENSICS: { name: "Dr. N. Iyer", badge: "FSL-303", role: "FORENSICS" },
  PROSECUTOR: { name: "Adv. K. Bhatia", badge: "PP-0092", role: "PROSECUTOR" },
  ADMIN: { name: "S. Rao", badge: "REC-0001", role: "ADMIN" },
};

type Ctx = { actor: Actor; setRole: (role: Role) => void };

const ActorContext = createContext<Ctx | null>(null);

export function ActorProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("INVESTIGATOR");

  useEffect(() => {
    const stored = window.localStorage.getItem("vigil.role") as Role | null;
    if (stored && stored in PERSONNEL) setRole(stored);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      actor: PERSONNEL[role],
      setRole: (next) => {
        setRole(next);
        window.localStorage.setItem("vigil.role", next);
      },
    }),
    [role],
  );

  return <ActorContext.Provider value={value}>{children}</ActorContext.Provider>;
}

export function useActor() {
  const ctx = useContext(ActorContext);
  if (!ctx) throw new Error("useActor must be used inside ActorProvider");
  return ctx;
}

export function profileOf(role: Role) {
  return ROLE_PROFILE[role];
}
