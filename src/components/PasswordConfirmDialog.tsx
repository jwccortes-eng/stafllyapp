import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onConfirm: () => void | Promise<void>;
}

export default function PasswordConfirmDialog({
  open, onOpenChange, title, description, onConfirm,
}: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!password.trim()) {
      setError("Ingresa tu contraseña");
      return;
    }
    setLoading(true);
    setError("");

    // Re-authenticate by signing in with current email + password
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setError("No se pudo verificar tu sesión");
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (authError) {
      setError("Contraseña incorrecta");
      setLoading(false);
      return;
    }

    await onConfirm();
    setPassword("");
    setError("");
    setLoading(false);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) { setPassword(""); setError(""); } onOpenChange(v); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            {title || "Confirmación requerida"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description || "Esta acción requiere confirmación. Ingresa tu contraseña de administrador para continuar."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="confirm-password">Contraseña</Label>
          <Input
            id="confirm-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
            placeholder="Ingresa tu contraseña"
            autoFocus
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Verificando...</> : "Confirmar"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
