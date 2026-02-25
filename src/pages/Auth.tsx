import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { Phone, Mail } from "lucide-react";
import logoQS from "@/assets/logo-quality-staff.png";

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
      // Employee login via edge function
      try {
        const { data, error } = await supabase.functions.invoke("employee-auth", {
          body: { action: "login", phone: identifier, pin: password },
        });

        if (error) {
          toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
        } else if (data?.error) {
          toast({ title: "Error", description: data.error, variant: "destructive" });
        } else if (data?.session) {
          // Set the session manually
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }
      } catch (err: any) {
        toast({ title: "Error", description: err.message || "Error al iniciar sesión", variant: "destructive" });
      }
    } else if (isLogin) {
      // Admin/manager login with email
      const { error } = await supabase.auth.signInWithPassword({ email: identifier, password });
      if (error) {
        toast({ title: "Error", description: getUserFriendlyError(error), variant: "destructive" });
      }
    } else {
      // Signup
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <img src={logoQS} alt="Quality Staff" className="h-16 mx-auto object-contain" />
          <CardTitle className="text-xl font-heading">Quality Staff</CardTitle>
          <CardDescription>
            {isLogin
              ? isPhone
                ? "Ingresa tu teléfono y PIN de acceso"
                : "Inicia sesión con tu email"
              : "Crea una nueva cuenta"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nombre completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  required={!isLogin}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="identifier">
                {isPhone ? "Teléfono" : "Email o Teléfono"}
              </Label>
              <div className="relative">
                {isPhone ? (
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                ) : (
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="tu@email.com o número de teléfono"
                  className="pl-9"
                  required
                />
              </div>
              {isPhone && (
                <p className="text-xs text-muted-foreground">
                  Se detectó un número de teléfono — ingresarás como empleado
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{isPhone ? "PIN de acceso" : "Contraseña"}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isPhone ? "Tu PIN de 6 dígitos" : "••••••••"}
                required
                minLength={isPhone ? 4 : 6}
                maxLength={isPhone ? 6 : undefined}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Cargando..." : isLogin || isPhone ? "Iniciar sesión" : "Crear cuenta"}
            </Button>
          </form>
          {!isPhone && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-primary hover:underline"
              >
                {isLogin ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
