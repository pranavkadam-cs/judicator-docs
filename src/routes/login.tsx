import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useActor } from "@/components/dms/actor";
import { Label, Panel } from "@/components/dms/primitives";
import { Lock, Mail, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

export function LoginPage() {
  const { login, isPending } = useActor();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const success = await login(email, password);
      if (success) {
        void navigate({ to: "/" });
      } else {
        setError("Invalid email or password. Please verify credentials.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to log in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="font-mono text-xl font-bold tracking-[0.4em] text-primary uppercase">
            Vigil.OS
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Records Division · Secure intake & archival system
          </p>
        </div>

        <Panel className="p-6 space-y-6">
          <div className="border-b border-border pb-3 flex items-center justify-between">
            <Label>AUTHENTICATION PORTAL</Label>
            <span className="inline-flex size-2 rounded-full bg-primary animate-pulse" />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 p-3 rounded-sm text-xs text-destructive">
              <ShieldAlert className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Security Email</Label>
              <div className="relative">
                <Mail className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@vigil.os"
                  required
                  disabled={loading || isPending}
                  className="w-full rounded-sm border border-border bg-background pl-10 pr-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Security Pin / Password</Label>
              <div className="relative">
                <Lock className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading || isPending}
                  className="w-full rounded-sm border border-border bg-background pl-10 pr-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || isPending}
              className="w-full rounded-sm bg-primary px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-wider text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading || isPending ? "Authenticating..." : "Authorize session"}
            </button>
          </form>
        </Panel>

        <Panel className="p-4 text-center">
          <Label className="block mb-2">Seeded Demo Credentials</Label>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground font-mono text-left max-w-xs mx-auto">
            <div>Admin:</div>
            <div>admin@vigil.os / admin123</div>
            <div>Investigator:</div>
            <div>investigator@vigil.os / invest123</div>
            <div>Legal Officer:</div>
            <div>legal@vigil.os / legal123</div>
            <div>Court Officer:</div>
            <div>court@vigil.os / court123</div>
            <div>Viewer:</div>
            <div>viewer@vigil.os / viewer123</div>
          </div>
        </Panel>

        <div className="text-center font-mono text-[10px] text-muted-foreground tracking-wider uppercase">
          Technology Architecture: React · TypeScript · Python · Java · Node.js
        </div>
      </div>
    </div>
  );
}
