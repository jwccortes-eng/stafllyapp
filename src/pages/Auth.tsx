import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { Phone, Mail, Lock, Eye, EyeOff, Loader2, User, ShieldCheck, Building2 } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { StaflyMascot } from "@/components/brand/StaflyMascot";

function isPhoneNumber(value: string): boolean {
  const cleaned = value.replace(/[\s\-\(\)\+]/g, "");
  return /^\d{7,15}$/.test(cleaned);
}

export default function Auth() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const { toast } = useToast();

  const isPhone = isPhoneNumber(identifier);

  // Auto-setup: when user logs in with no company, provision one
  useEffect(() => {
    if (authLoading || !user || settingUp) return;

    const autoSetup = async () => {
      // If role is null or employee (default from trigger), and we have company_name in metadata
      if (role === null || role === undefined) {
        const metaCompanyName = user.user_metadata?.company_name;
        if (metaCompanyName) {
          setSettingUp(true);
          try {
            const { data, error } = await supabase.functions.invoke("setup-company", {
              body: { company_name: metaCompanyName },
            });
            if (error) throw error;
            if (data?.already_setup) {
              // Already has a company, just reload
              window.location.reload();
              return;
            }
            if (data?.success) {
              toast({ title: "¡Empresa creada!", description: `${metaCompanyName} está lista.` });
              // Reload to pick up new role/company
              window.location.reload();
              return;
            }
          } catch (err: any) {
            console.error("Auto-setup error:", err);
            // Don't block login if setup fails
          } finally {
            setSettingUp(false);
          }
        }
      }

      // Normal redirect
      if (role === "employee") {
        navigate("/portal");
      } else if (role === "admin" || role === "owner" || role === "manager") {
        navigate("/app");
      }
    };

    autoSetup();
  }, [user, role, authLoading, navigate, settingUp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isPhone) {
      try {
        const { data, error } = await supabase.functions.invoke("employee-auth", {
          body: { action: "login", phone: identifier, pin: password },
        });
        if (error) {
          toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
        } else if (data?.error) {
          toast({ title: "Error", description: data.error, variant: "destructive" });
        } else if (data?.session) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }
      } catch (err: any) {
        toast({ title: "Error", description: err.message || "Error al iniciar sesión", variant: "destructive" });
      }
    } else if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email: identifier, password });
      if (error) {
        toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
      }
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
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
      } else {
        toast({ title: "Cuenta creada", description: "Revisa tu email para confirmar tu cuenta." });
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left — Branding panel (desktop) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden items-center justify-center bg-gradient-to-br from-secondary via-background to-muted">
        {/* Subtle decorative shapes */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-16 right-16 w-80 h-80 rounded-full bg-primary/[0.04] blur-3xl" />
          <div className="absolute bottom-24 left-12 w-64 h-64 rounded-full bg-primary/[0.06] blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/[0.02] blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-16 max-w-md">
          {/* Mascot */}
          <StaflyMascot variant="checklist" size={200} className="drop-shadow-xl mb-10 select-none" />

          <h2 className="text-2xl font-bold font-heading text-foreground mb-3 leading-tight tracking-tight">
            Control semanal de tu equipo, sin estrés.
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
            Turnos, clock-in/out con ubicación, nómina semanal y reportes. Todo en una app diseñada para tu operación.
          </p>

          <div className="flex items-center gap-6 mt-8">
            {[
              "Turnos inteligentes",
              "Nómina automática",
              "Reportes al instante",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary/60" />
                <span className="text-xs text-muted-foreground/70 font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — Login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px]">
          {/* Logo */}
          <div className="flex flex-col items-center mb-10">
            <StaflyLogo size={48} />
          </div>

          {/* Setting up overlay */}
          {settingUp && (
            <div className="bg-card rounded-2xl shadow-sm border border-border/40 px-8 py-12 text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <h2 className="text-lg font-semibold font-heading text-foreground">Configurando tu empresa...</h2>
              <p className="text-sm text-muted-foreground">Estamos preparando todo para que puedas comenzar.</p>
            </div>
          )}

          {/* Card */}
          {!settingUp && <div className="bg-card rounded-2xl shadow-sm border border-border/40 px-8 py-9 space-y-6">
            <div className="text-center space-y-1">
              <h1 className="text-lg font-semibold font-heading text-foreground tracking-tight">
                {isLogin
                  ? isPhone
                    ? "Acceso empleado"
                    : "Bienvenido de vuelta"
                  : "Crear cuenta"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isLogin
                  ? isPhone
                    ? "Ingresa tu teléfono y PIN"
                    : "Inicia sesión con tu email"
                  : "Completa los datos para registrarte"}
              </p>
              <p className="text-[10px] text-muted-foreground/60 flex items-center justify-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Acceso seguro por roles
              </p>
            </div>

            {/* Phone mode indicator */}
            {isPhone && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/[0.06] border border-primary/10">
                <Phone className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-primary font-medium">Modo empleado detectado</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full name (signup only) */}
              {!isLogin && !isPhone && (
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-xs font-semibold text-foreground/80">
                    Nombre completo
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Tu nombre completo"
                      className="pl-9 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors"
                      required={!isLogin}
                    />
                  </div>
                </div>
              )}

              {/* Company name (signup only) */}
              {!isLogin && !isPhone && (
                <div className="space-y-1.5">
                  <Label htmlFor="companyName" className="text-xs font-semibold text-foreground/80">
                    Nombre de tu empresa
                  </Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input
                      id="companyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Mi Empresa LLC"
                      className="pl-9 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors"
                      required={!isLogin}
                    />
                  </div>
                </div>
              )}

              {/* Identifier */}
              <div className="space-y-1.5">
                <Label htmlFor="identifier" className="text-xs font-semibold text-foreground/80">
                  {isPhone ? "Teléfono" : "Email o Teléfono"}
                </Label>
                <div className="relative">
                  {isPhone ? (
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                  ) : (
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                  )}
                  <Input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="tu@email.com o número de teléfono"
                    className="pl-9 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold text-foreground/80">
                  {isPhone ? "PIN de acceso" : "Contraseña"}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isPhone ? "PIN de 6 dígitos" : "••••••••"}
                    className="pl-9 pr-10 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors"
                    required
                    minLength={isPhone ? 4 : 6}
                    maxLength={isPhone ? 6 : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-muted-foreground/40 hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all mt-2"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isLogin || isPhone ? (
                  "Iniciar sesión"
                ) : (
                  "Crear cuenta"
                )}
              </Button>
            </form>

            {/* Toggle login/signup */}
            {!isPhone && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  {isLogin ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
                </button>
              </div>
            )}
          </div>}

          {/* Footer */}
          <div className="flex items-center justify-center gap-1.5 mt-8 text-muted-foreground/40">
            <Lock className="h-3 w-3" />
            <span className="text-[11px]">Acceso seguro · staflyapps.com</span>
          </div>
        </div>
      </div>
    </div>
  );
}
