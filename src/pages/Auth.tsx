import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { APP_BASE_URL } from "@/lib/app-url";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck, Phone, Radio, Hash, Briefcase, Zap } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { EmployeeAuthFlow } from "@/components/auth/EmployeeAuthFlow";
import { IS_PARCEROS_FLAVOR } from "@/lib/app-flavor";
import { consumeSessionExpired, consumeIntendedRoute, watchTabPresence } from "@/lib/auth-session";
import { resolveRestoreTarget } from "@/lib/session/workspace-memory";

type LoginMethod = "email" | "phone";

export default function Auth() {
  const {
    user,
    session,
    role,
    loading: authLoading,
    canAccessAdmin,
    canAccessPortal,
    activeMode,
    companyRoles,
    allEmployeeIds,
    canAccessAdminForCompany,
    canAccessPortalForCompany,
  } = useAuth();
  const { companies, loading: companyLoading, selectedCompanyId, selectedCompany } = useCompany();
  const navigate = useNavigate();
  const phoneRedirectPendingRef = useRef(false);
  const [method, setMethod] = useState<LoginMethod>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  // Parceros launch readiness — pure UI/copy variant. Detects `?from=parceros`
  // to swap branding/copy and prefer /parceros as the post-login destination.
  // Does NOT touch auth backend, signup, or RLS.
  // `fromParceros` also turns ON when the build flavor is Parceros, so the
  // native Parceros app behaves like a permanent `?from=parceros` session.
  const fromParceros = useMemo(
    () => IS_PARCEROS_FLAVOR || searchParams.get("from") === "parceros",
    [searchParams]
  );

  // One-shot toast when the user lands here after a server-side session loss
  // (refresh-token race in Lovable Preview, multi-tab signOut, stale token).
  useEffect(() => {
    const expired = consumeSessionExpired();
    if (expired) {
      toast({
        title: "Sesión expirada",
        description: "Tu sesión expiró o fue abierta en otra pestaña. Inicia sesión nuevamente.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Lightweight multi-tab warning — fires once, only when more than one tab is
  // active in the same browser profile. Does NOT block any production flow.
  useEffect(() => {
    const stop = watchTabPresence(() => {
      toast({
        title: "Varias pestañas abiertas",
        description: "Para evitar cierre de sesión en Preview, usa una sola pestaña.",
      });
    });
    return stop;
  }, [toast]);


  useEffect(() => {
    const redirectTarget = phoneRedirectPendingRef.current
      ? (canAccessAdmin ? "/app" : canAccessPortal ? "/portal" : null)
      : (canAccessAdmin && canAccessPortal
          ? (activeMode === "employee" ? "/portal" : "/app")
          : canAccessAdmin
            ? "/app"
            : canAccessPortal
              ? "/portal"
              : null);

    console.info("[post-login-debug]", {
      step: "auth-screen",
      userId: user?.id ?? null,
      sessionExists: !!session,
      authLoading,
      companyLoading,
      selectedCompanyId,
      selectedCompanyName: selectedCompany?.name ?? null,
      companies: companies.map((company) => ({ id: company.id, name: company.name })),
      companyRoles,
      allEmployeeIds,
      activeMode,
      canAccessAdminForSelected: canAccessAdminForCompany(selectedCompanyId),
      canAccessPortalForSelected: canAccessPortalForCompany(selectedCompanyId),
      redirectTarget,
    });
  }, [
    activeMode,
    allEmployeeIds,
    authLoading,
    canAccessAdmin,
    canAccessAdminForCompany,
    canAccessPortal,
    canAccessPortalForCompany,
    companies,
    companyLoading,
    companyRoles,
    selectedCompany,
    selectedCompanyId,
    session,
    user,
  ]);

  // Smart redirect after auth
  useEffect(() => {
    if (authLoading || !user) return;

    // Prefer the route the user was trying to reach before being bounced to
    // /auth (saved by the route guards). Only honor it when it matches the
    // user's current access surface; otherwise fall through to defaults.
    const pickIntended = (): string | null => {
      const intended = consumeIntendedRoute();
      if (!intended) return null;
      if (intended.startsWith("/.lovable/oauth/consent")) return intended;
      if (intended.startsWith("/parceros")) return intended;
      if (intended.startsWith("/app") && canAccessAdmin) return intended;
      if (intended.startsWith("/portal") && canAccessPortal) return intended;
      return null;
    };

    // P0 — Last workspace restoration: when there is no intended route, send
    // the user back to the last valid operational context of this device.
    const pickRemembered = (): string | null =>
      resolveRestoreTarget({ userId: user.id, canAccessAdmin, canAccessPortal });

    if (phoneRedirectPendingRef.current) {
      console.info("[phone-login]", {
        step: "post-session-redirect",
        userId: user.id,
        canAccessAdmin,
        canAccessPortal,
        activeMode,
      });

      const intended = pickIntended() ?? pickRemembered();
      if (intended) {
        phoneRedirectPendingRef.current = false;
        navigate(intended, { replace: true });
        return;
      }

      if (canAccessAdmin) {
        phoneRedirectPendingRef.current = false;
        navigate("/app", { replace: true });
        return;
      }

      if (canAccessPortal) {
        phoneRedirectPendingRef.current = false;
        navigate("/portal", { replace: true });
        return;
      }
    }

    const autoSetup = async () => {
      // [SECURITY 2026-05-01] Self-service company creation is DISABLED platform-wide.
      // Stafly is invite-only pre-launch. Only developers can provision tenants.
      const intended = pickIntended() ?? pickRemembered();
      if (intended) {
        navigate(intended, { replace: true });
        return;
      }
      if (fromParceros) {
        navigate("/parceros");
      } else if (canAccessAdmin && canAccessPortal) {
        navigate(activeMode === 'employee' ? "/portal" : "/app");
      } else if (canAccessAdmin) {
        navigate("/app");
      } else if (canAccessPortal) {
        navigate("/portal");
      }
    };
    autoSetup();
  }, [user, role, authLoading, navigate, canAccessAdmin, canAccessPortal, activeMode, fromParceros]);


  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // [SECURITY 2026-05-01] Signup is disabled platform-wide. Login only.
    console.log("[Auth] Login attempt:", identifier);
    const { error } = await supabase.auth.signInWithPassword({ email: identifier, password });
    if (error) {
      console.error("[Auth] Login error:", error.message, error.status);
      toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    }
    setLoading(false);
  };

  const handlePhoneSessionReady = () => {
    phoneRedirectPendingRef.current = true;
    console.info("[phone-login]", {
      step: "session-ready",
      hasUser: !!user,
      canAccessAdmin,
      canAccessPortal,
      activeMode,
    });
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left — Branding panel (desktop) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden items-center justify-center bg-gradient-to-br from-secondary via-background to-muted">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-16 right-16 w-80 h-80 rounded-full bg-primary/[0.04] blur-3xl" />
          <div className="absolute bottom-24 left-12 w-64 h-64 rounded-full bg-primary/[0.06] blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/[0.02] blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-16 max-w-md">
          {fromParceros ? (
            <>
              <div
                className="h-24 w-24 rounded-2xl flex items-center justify-center mb-10 select-none shadow-lg"
                style={{ background: "var(--gradient-parceros, linear-gradient(135deg, hsl(var(--parceros-coral, 11 100% 67%)), hsl(var(--parceros-amber, 30 100% 60%))))" }}
              >
                <Radio className="h-12 w-12 text-white" />
              </div>
              <h2 className="text-2xl font-bold font-heading text-foreground mb-3 leading-tight tracking-tight">
                Bienvenido a Parceros.
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
                Tu comunidad de trabajo: canales por zona, oportunidades y flash jobs cerca de ti.
              </p>
              <div className="flex items-center gap-6 mt-8">
                {[
                  { label: "Comunidad", Icon: Hash },
                  { label: "Flash Jobs", Icon: Zap },
                  { label: "Oportunidades", Icon: Briefcase },
                  { label: "Reputación", Icon: ShieldCheck },
                ].map(({ label, Icon }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-primary/60" />
                    <span className="text-xs text-muted-foreground/70 font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="h-24 w-24 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-10 select-none">
                <ShieldCheck className="h-12 w-12 text-primary/60" />
              </div>
              <h2 className="text-2xl font-bold font-heading text-foreground mb-3 leading-tight tracking-tight">
                One account, full control.
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
                Manage your team, review shifts, clock in/out, and check payroll — all from a single account.
              </p>

              <div className="flex items-center gap-6 mt-8">
                {["Shifts", "Payroll", "Time Clock", "Multi-company"].map((feature) => (
                  <div key={feature} className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary/60" />
                    <span className="text-xs text-muted-foreground/70 font-medium">{feature}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right — Auth forms */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10">
        {/* Method toggle */}
        <div className="w-full max-w-[400px] mb-6">
          <div className="flex bg-muted/50 rounded-xl p-1 border border-border/40">
            <button
              onClick={() => setMethod("email")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold transition-all ${
                method === "email"
                  ? "bg-card shadow-sm text-foreground border border-border/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              Email
            </button>
            <button
              onClick={() => setMethod("phone")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold transition-all ${
                method === "phone"
                  ? "bg-card shadow-sm text-foreground border border-border/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Phone className="h-3.5 w-3.5" />
              Phone + PIN
            </button>
          </div>
        </div>

        {/* Phone + PIN flow */}
        {method === "phone" && (
          <EmployeeAuthFlow onSessionReady={handlePhoneSessionReady} />
        )}

        {/* Email flow */}
        {method === "email" && (
          <div className="w-full max-w-[400px]">
            <div className="flex flex-col items-center mb-8 text-center">
              <StaflyLogo size={44} />
              <p className="text-[11px] text-muted-foreground mt-2 max-w-[280px]">
                {fromParceros
                  ? "Tu comunidad de trabajo en el ecosistema Stafly."
                  : "The operating system for your service workforce."}
              </p>
            </div>

            <div className="bg-card rounded-2xl shadow-sm border border-border/40 px-8 py-9 space-y-6">
              <div className="text-center space-y-1">
                <h1 className="text-lg font-semibold font-heading text-foreground tracking-tight">
                  {fromParceros ? "Bienvenido a Parceros" : "Welcome back"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {fromParceros ? "Ingresa con tu email" : "Sign in with your email"}
                </p>
                <p className="text-[10px] text-muted-foreground/60 flex items-center justify-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {fromParceros ? "Una cuenta · Stafly + Parceros" : "One account · Multiple roles"}
                </p>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-foreground/80">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input id="email" type="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@email.com" className="pl-9 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors" required />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-semibold text-foreground/80">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-9 pr-10 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors" required minLength={6} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-muted-foreground/40 hover:text-foreground transition-colors" tabIndex={-1}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full h-11 text-sm font-semibold rounded-xl shadow-sm mt-2" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                </Button>
              </form>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    if (!identifier.trim()) {
                      toast({ title: "Email required", description: "Enter your email to reset your password", variant: "destructive" });
                      return;
                    }
                    setLoading(true);
                    const { error } = await supabase.auth.resetPasswordForEmail(identifier, {
                      redirectTo: `${APP_BASE_URL}/reset-password`,
                    });
                    setLoading(false);
                    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
                    else toast({ title: "Email sent", description: "Check your inbox to reset your password." });
                  }}
                  className="text-xs text-muted-foreground hover:text-primary font-medium transition-colors"
                >
                  Forgot your password?
                </button>
              </div>

              <div className="border-t border-border/40 pt-4 text-center">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {fromParceros ? (
                    <>
                      Parceros es <span className="font-semibold text-foreground/80">invite-only</span>.
                      <br />¿Tienes un código de invitación? Ingresa con tu email o teléfono.
                    </>
                  ) : (
                    <>
                      Stafly is currently <span className="font-semibold text-foreground/80">invite-only</span>.
                      <br />Please contact your administrator to get access.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-8 text-muted-foreground/40">
              <Lock className="h-3 w-3" />
              <span className="text-[11px]">Secure access · staflyapps.com</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}