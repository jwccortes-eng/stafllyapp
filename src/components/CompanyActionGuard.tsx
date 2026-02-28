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
  /** Title shown in the dialog */
  title?: string;
  /** Description shown below the title */
  description?: string;
  /** If provided, user must type this exact name to confirm (case-insensitive) */
  companyName?: string;
  /** Whether to require password re-authentication */
  requirePassword?: boolean;
  /** Callback invoked only after all validations pass */
  onConfirm: () => void | Promise<void>;
}

export default function CompanyActionGuard({
  open, onOpenChange, title, description, companyName, requirePassword = true, onConfirm,
}: Props) {
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const needsNameConfirm = !!companyName;

  const reset = () => {
    setPassword("");
    setConfirmName("");
    setError("");
  };

  const handleConfirm = async () => {
    // Step 1: Validate company name if required
    if (needsNameConfirm) {
      if (confirmName.trim().toLowerCase() !== companyName!.trim().toLowerCase()) {
        setError("El nombre de la empresa no coincide");
        return;
      }
    }

    // Step 2: Validate password if required
    if (requirePassword) {
      if (!password.trim()) {
        setError("Ingresa tu contraseña");
        return;
      }

      setLoading(true);
      setError("");

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
    }

    setLoading(true);
    setError("");

    try {
      await onConfirm();
    } finally {
      reset();
      setLoading(false);
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            {title || "Verificación de seguridad"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description || "Esta acción requiere verificación. Confirma tu identidad para continuar."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          {needsNameConfirm && (
            <div className="space-y-2">
              <Label htmlFor="confirm-company-name" className="text-sm">
                Escribe <span className="font-bold text-foreground">"{companyName}"</span> para confirmar
              </Label>
              <Input
                id="confirm-company-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={companyName}
                autoFocus={!requirePassword}
              />
            </div>
          )}

          {requirePassword && (
            <div className="space-y-2">
              <Label htmlFor="guard-password">Contraseña maestra</Label>
              <Input
                id="guard-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
                placeholder="Ingresa tu contraseña"
                autoFocus
              />
            </div>
          )}

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
