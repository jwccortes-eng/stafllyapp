import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { APP_BASE_URL } from "@/lib/app-url";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { Mail, Lock, Eye, EyeOff, Loader2, User, ShieldCheck, Building2, Phone, Sparkles } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { EmployeeAuthFlow } from "@/components/auth/EmployeeAuthFlow";

type LoginMethod = "email" | "phone";

export default function Auth() {
  const { user, role, loading: authLoading, canAccessAdmin, canAccessPortal, activeMode } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [method, setMethod] = useState<LoginMethod>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isLogin, setIsLogin] = useState(!searchParams.get("register"));
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [needsSetupChecked, setNeedsSetupChecked] = useState(false);
  const { toast } = useToast();

  // Smart redirect after auth
  useEffect(() => {
    if (authLoading || !user || settingUp) return;

    const autoSetup = async () => {
      // Check if this is a self-service signup that needs company setup
      const metaCompanyName = user.user_metadata?.company_name;
      if (metaCompanyName && !needsSetupChecked) {
        setNeedsSetupChecked(true);
        setSettingUp(true);
        try {
          const { data, error } = await supabase.functions.invoke("setup-company", {
            body: { company_name: metaCompanyName },
          });
          if (error) throw error;
          if (data?.already_setup) {
            // Already has a company, just redirect
          } else if (data?.success) {
            toast({ title: "¡Empresa creada!", description: `${metaCompanyName} está lista. Tienes 14 días de prueba Pro.` });
          }
          window.location.reload();
          return;
        } catch (err: any) {
          console.error("Auto-setup error:", err);
        } finally {
          setSettingUp(false);
        }
      }

      // Smart redirect based on access + preferred mode
      if (canAccessAdmin && canAccessPortal) {
        // Dual access — go to preferred mode
        navigate(activeMode === 'employee' ? "/portal" : "/app");
      } else if (canAccessAdmin) {
        navigate("/app");
      } else if (canAccessPortal) {
        navigate("/portal");
      }
      // else: user has no access yet — stay on auth
    };
    autoSetup();
  }, [user, role, authLoading, navigate, settingUp, canAccessAdmin, canAccessPortal, activeMode]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email: identifier, password });
      if (error) toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
    } else {
      if (!companyName.trim()) {
        toast({ title: "Error", description: "Ingresa el nombre de tu empresa", variant: "destructive" });
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: identifier,
        password,
        options: {
          data: { full_name: fullName, company_name: companyName.trim() },
          emailRedirectTo: APP_BASE_URL,
        },
      });
      if (error) toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
      else toast({ title: "Cuenta creada", description: "Revisa tu email para confirmar tu cuenta." });
    }
    setLoading(false);
  };

  const handlePhoneSessionReady = () => {
    // After phone auth, redirect will happen via the useEffect above
    // Force a small delay so useAuth can reload
    window.location.reload();
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
          <div className="h-24 w-24 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-10 select-none">
            <ShieldCheck className="h-12 w-12 text-primary/60" />
          </div>
          <h2 className="text-2xl font-bold font-heading text-foreground mb-3 leading-tight tracking-tight">
            Una cuenta, todo el control.
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
            Administra tu equipo, revisa tus turnos, ficha y consulta tu nómina. Todo desde una misma cuenta.
          </p>

          <div className="flex items-center gap-6 mt-8">
            {["Turnos", "Nómina", "Fichajes", "Multi-empresa"].map((feature) => (
              <div key={feature} className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary/60" />
                <span className="text-xs text-muted-foreground/70 font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — Auth forms */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10">
        {/* Method toggle — unified, not admin/employee */}
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
              Teléfono + PIN
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
            <div className="flex flex-col items-center mb-8">
              <StaflyLogo size={44} />
            </div>

            {settingUp && (
              <div className="bg-card rounded-2xl shadow-sm border border-border/40 px-8 py-12 text-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <h2 className="text-lg font-semibold font-heading text-foreground">Configurando tu empresa...</h2>
                <p className="text-sm text-muted-foreground">Estamos preparando todo para que puedas comenzar.</p>
              </div>
            )}

            {!settingUp && (
              <div className="bg-card rounded-2xl shadow-sm border border-border/40 px-8 py-9 space-y-6">
                <div className="text-center space-y-1">
                  <h1 className="text-lg font-semibold font-heading text-foreground tracking-tight">
                    {isLogin ? "Bienvenido de vuelta" : "Crear cuenta"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {isLogin ? "Inicia sesión con tu email" : "Completa los datos para registrarte"}
                  </p>
                  {!isLogin && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full mt-1">
                      <Sparkles className="h-3 w-3" /> 14 días de prueba Pro gratis
                    </span>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 flex items-center justify-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Una cuenta · Múltiples roles
                  </p>
                </div>

                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  {!isLogin && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="fullName" className="text-xs font-semibold text-foreground/80">Nombre completo</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre completo" className="pl-9 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors" required />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="companyName" className="text-xs font-semibold text-foreground/80">Nombre de tu empresa</Label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                          <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Mi Empresa LLC" className="pl-9 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors" required />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-semibold text-foreground/80">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <Input id="email" type="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="tu@email.com" className="pl-9 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors" required />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-semibold text-foreground/80">Contraseña</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-9 pr-10 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors" required minLength={6} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-muted-foreground/40 hover:text-foreground transition-colors" tabIndex={-1}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-11 text-sm font-semibold rounded-xl shadow-sm mt-2" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isLogin ? "Iniciar sesión" : "Crear cuenta"}
                  </Button>
                </form>

                {isLogin && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!identifier.trim()) {
                          toast({ title: "Email requerido", description: "Ingresa tu email para recuperar tu contraseña", variant: "destructive" });
                          return;
                        }
                        setLoading(true);
                        const { error } = await supabase.auth.resetPasswordForEmail(identifier, {
                          redirectTo: `${APP_BASE_URL}/reset-password`,
                        });
                        setLoading(false);
                        if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
                        else toast({ title: "Email enviado", description: "Revisa tu bandeja de entrada para restablecer tu contraseña." });
                      }}
                      className="text-xs text-muted-foreground hover:text-primary font-medium transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                )}

                <div className="text-center pt-1">
                  <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                    {isLogin ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-1.5 mt-8 text-muted-foreground/40">
              <Lock className="h-3 w-3" />
              <span className="text-[11px]">Acceso seguro · staflyapps.com</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
