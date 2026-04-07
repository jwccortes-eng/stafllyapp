import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);
  const [recoveryError, setRecoveryError] = useState("");

  useEffect(() => {
    let active = true;

    const finishRecoveryCheck = (allowed: boolean, errorMessage = "") => {
      if (!active) return;
      console.log("[reset-password] recovery resolved", { allowed, errorMessage });
      setIsRecovery(allowed);
      setRecoveryError(errorMessage);
      setCheckingRecovery(false);
    };

    const markRecoveryReady = (source: string, email?: string | null) => {
      console.log("[reset-password] recovery session ready", { source, email });
      finishRecoveryCheck(true);
      if (window.location.hash || window.location.search) {
        window.history.replaceState({}, document.title, "/reset-password");
      }
    };

    const resolveRecoverySession = async () => {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const queryParams = url.searchParams;
      const hasRecoveryHash =
        hashParams.get("type") === "recovery" ||
        hashParams.has("access_token") ||
        hashParams.has("refresh_token");
      const hasRecoveryQuery =
        queryParams.get("type") === "recovery" || queryParams.has("code");
      const hasRecoveryIntent = hasRecoveryHash || hasRecoveryQuery;

      console.log("[reset-password] init", {
        path: url.pathname,
        hasRecoveryHash,
        hasRecoveryQuery,
        hasCode: queryParams.has("code"),
        hasAccessToken: hashParams.has("access_token"),
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        console.log("[reset-password] auth event", {
          event,
          hasSession: !!session,
          email: session?.user?.email ?? null,
        });

        if (!active) return;

        if (event === "PASSWORD_RECOVERY") {
          markRecoveryReady("PASSWORD_RECOVERY", session?.user?.email);
          return;
        }

        if (hasRecoveryIntent && session) {
          markRecoveryReady(`session:${event}`, session.user.email);
        }
      });

      try {
        if (queryParams.has("code")) {
          console.log("[reset-password] exchanging code for session");
          const code = queryParams.get("code") ?? "";
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) throw error;

          if (data.session) {
            markRecoveryReady("code-exchange", data.session.user.email);
            subscription.unsubscribe();
            return;
          }
        }

        if (hashParams.has("access_token") && hashParams.has("refresh_token")) {
          console.log("[reset-password] setting session from hash tokens");
          const { data, error } = await supabase.auth.setSession({
            access_token: hashParams.get("access_token") ?? "",
            refresh_token: hashParams.get("refresh_token") ?? "",
          });

          if (error) throw error;

          if (data.session) {
            markRecoveryReady("hash-session", data.session.user.email);
            subscription.unsubscribe();
            return;
          }
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        console.log("[reset-password] current session", {
          hasSession: !!session,
          email: session?.user?.email ?? null,
        });

        if (hasRecoveryIntent && session) {
          markRecoveryReady("existing-session", session.user.email);
          subscription.unsubscribe();
          return;
        }

        if (!hasRecoveryIntent) {
          finishRecoveryCheck(false, "Este enlace de recuperación ha expirado o no es válido.");
          subscription.unsubscribe();
          return;
        }

        window.setTimeout(async () => {
          if (!active) return;

          const {
            data: { session: delayedSession },
          } = await supabase.auth.getSession();

          console.log("[reset-password] delayed session check", {
            hasSession: !!delayedSession,
            email: delayedSession?.user?.email ?? null,
          });

          if (delayedSession) {
            markRecoveryReady("delayed-session", delayedSession.user.email);
          } else {
            finishRecoveryCheck(false, "No pudimos validar tu enlace de recuperación. Solicita uno nuevo.");
          }

          subscription.unsubscribe();
        }, 2500);
      } catch (error: any) {
        console.error("[reset-password] recovery setup error", error);
        finishRecoveryCheck(false, error?.message || "No pudimos validar tu enlace de recuperación.");
        subscription.unsubscribe();
      }

      return () => subscription.unsubscribe();
    };

    const cleanupPromise = resolveRecoverySession();

    return () => {
      active = false;
      Promise.resolve(cleanupPromise).then((cleanup) => cleanup?.());
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({ title: "Error", description: "La contraseña debe tener al menos 6 caracteres", variant: "destructive" });
      return;
    }

    if (password !== confirm) {
      toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }

    setLoading(true);
    console.log("[reset-password] updating password");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error("[reset-password] update password error", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    console.log("[reset-password] password updated successfully");
    await supabase.auth.signOut();
    setSuccess(true);
    toast({ title: "¡Listo!", description: "Tu contraseña ha sido actualizada." });
    setLoading(false);
    window.setTimeout(() => navigate("/auth", { replace: true }), 1800);
  };

  if (checkingRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-[400px] text-center space-y-4">
          <StaflyLogo size={44} />
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <h1 className="text-lg font-semibold font-heading text-foreground">Validando enlace</h1>
          <p className="text-sm text-muted-foreground">Estamos preparando tu recuperación de contraseña.</p>
        </div>
      </div>
    );
  }

  if (!isRecovery && !success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-[400px] text-center space-y-4">
          <StaflyLogo size={44} />
          <h1 className="text-lg font-semibold font-heading text-foreground">Enlace inválido</h1>
          <p className="text-sm text-muted-foreground">{recoveryError || "Este enlace de recuperación ha expirado o no es válido."}</p>
          <Button variant="outline" onClick={() => navigate("/auth", { replace: true })}>Volver al login</Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-[400px] text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
          <h1 className="text-lg font-semibold font-heading text-foreground">Contraseña actualizada</h1>
          <p className="text-sm text-muted-foreground">Serás redirigido al login en unos segundos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-8">
          <StaflyLogo size={44} />
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border/40 px-8 py-9 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-lg font-semibold font-heading text-foreground tracking-tight">
              Nueva contraseña
            </h1>
            <p className="text-sm text-muted-foreground">
              Ingresa tu nueva contraseña para continuar
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs font-semibold text-foreground/80">Nueva contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-10 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors"
                  required
                  minLength={6}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-muted-foreground/40 hover:text-foreground transition-colors" tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs font-semibold text-foreground/80">Confirmar contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-11 text-sm font-semibold rounded-xl shadow-sm mt-2" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar contraseña"}
            </Button>
          </form>
        </div>

        <div className="flex items-center justify-center gap-1.5 mt-8 text-muted-foreground/40">
          <Lock className="h-3 w-3" />
          <span className="text-[11px]">Acceso seguro · staflyapps.com</span>
        </div>
      </div>
    </div>
  );
}
