import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { Phone, Mail, Lock, Eye, EyeOff, Loader2, User } from "lucide-react";
import { Clock } from "lucide-react";

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
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const isPhone = isPhoneNumber(identifier);

  useEffect(() => {
    if (authLoading || !user) return;
    if (role === "employee") {
      navigate("/portal");
    } else if (role === "admin" || role === "owner" || role === "manager") {
      navigate("/admin");
    }
  }, [user, role, authLoading, navigate]);

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
      const { error } = await supabase.auth.signUp({
        email: identifier,
        password,
        options: {
          data: { full_name: fullName },
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
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-card rounded-2xl shadow-xl border border-border/50 px-8 py-10 space-y-6">
          {/* Logo & Title */}
          <div className="flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Clock className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
              STAFLY
            </h1>
            <p className="text-sm text-muted-foreground">
              {isLogin
                ? isPhone
                  ? "Ingresa tu teléfono y PIN"
                  : "Inicia sesión con tu email"
                : "Crea una nueva cuenta"}
            </p>
          </div>

          {/* Phone mode indicator */}
          {isPhone && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
              <Phone className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-primary font-medium">Modo empleado detectado</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full name (signup only) */}
            {!isLogin && !isPhone && (
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-semibold text-foreground">
                  Nombre completo
                </Label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre completo"
                    className="pl-10 h-12 bg-muted/40 border-border/60 focus:bg-card transition-colors"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            {/* Identifier */}
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-sm font-semibold text-foreground">
                {isPhone ? "Teléfono" : "Email o Teléfono"}
              </Label>
              <div className="relative">
                {isPhone ? (
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                ) : (
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                )}
                <Input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="tu@email.com o número de teléfono"
                  className="pl-10 h-12 bg-muted/40 border-border/60 focus:bg-card transition-colors"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                {isPhone ? "PIN de acceso" : "Contraseña"}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isPhone ? "PIN de 6 dígitos" : "••••••••"}
                  className="pl-10 pr-11 h-12 bg-muted/40 border-border/60 focus:bg-card transition-colors"
                  required
                  minLength={isPhone ? 4 : 6}
                  maxLength={isPhone ? 6 : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground/60 hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold shadow-md"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
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
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-muted-foreground/50 mt-6">
          © {new Date().getFullYear()} STAFLY · staflyapps.com
        </p>
      </div>
    </div>
  );
}
