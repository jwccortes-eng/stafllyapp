import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/ui/company-logo";
import { ShieldCheck, Loader2, Building2, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface TargetCompany {
  id: string;
  name: string;
  logo_url?: string | null;
  brand_color?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetCompany: TargetCompany | null;
  onConfirm: (companyId: string) => void;
}

const PIN_LENGTH = 4;

export default function CompanySwitchPinDialog({ open, onOpenChange, targetCompany, onConfirm }: Props) {
  const { user } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPin("");
      setError("");
      setLoading(false);
      setShake(false);
    }
  }, [open]);

  const handleDigit = useCallback((digit: string) => {
    if (loading) return;
    setError("");
    setPin(prev => {
      if (prev.length >= PIN_LENGTH) return prev;
      return prev + digit;
    });
  }, [loading]);

  const handleDelete = useCallback(() => {
    if (loading) return;
    setPin(prev => prev.slice(0, -1));
    setError("");
  }, [loading]);

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === PIN_LENGTH && !loading) {
      handleConfirm(pin);
    }
  }, [pin]);

  const handleConfirm = async (currentPin: string) => {
    if (!user || !targetCompany) return;
    setLoading(true);
    setError("");

    try {
      // Verify PIN against stored switch_pin in profiles
      const { data: profile, error: fetchErr } = await supabase
        .from("profiles")
        .select("switch_pin")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      const storedPin = profile?.switch_pin;

      // If no PIN set, auto-set this one and allow
      if (!storedPin) {
        await supabase
          .from("profiles")
          .update({ switch_pin: currentPin })
          .eq("user_id", user.id);
        
        onConfirm(targetCompany.id);
        onOpenChange(false);
        return;
      }

      if (storedPin !== currentPin) {
        setShake(true);
        setTimeout(() => setShake(false), 600);
        setError("Código incorrecto");
        setPin("");
        setLoading(false);
        return;
      }

      onConfirm(targetCompany.id);
      onOpenChange(false);
    } catch (err) {
      setError("Error al verificar");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  // Keyboard support
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handleDigit(e.key);
      else if (e.key === "Backspace") handleDelete();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleDigit, handleDelete]);

  if (!targetCompany) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[360px] p-0 overflow-hidden rounded-2xl">
        {/* Header with company identity */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="flex justify-center mb-3">
            <CompanyLogo
              name={targetCompany.name}
              logoUrl={targetCompany.logo_url}
              brandColor={targetCompany.brand_color}
              size="xl"
              glow
            />
          </div>
          <h3 className="text-base font-bold text-foreground">Cambiar a {targetCompany.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Ingresa tu código de 4 dígitos para confirmar
          </p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-3 pb-4">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-3.5 w-3.5 rounded-full transition-all duration-200",
                i < pin.length
                  ? "bg-primary scale-110 shadow-sm shadow-primary/30"
                  : "bg-muted-foreground/15",
                shake && "animate-shake"
              )}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p className="text-xs text-destructive text-center pb-2 font-medium animate-in fade-in">{error}</p>
        )}

        {/* Numeric keypad */}
        <div className="px-8 pb-6">
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit => (
              <button
                key={digit}
                onClick={() => handleDigit(digit)}
                disabled={loading}
                className="h-14 rounded-xl text-lg font-semibold text-foreground bg-muted/40 hover:bg-muted/70 active:bg-muted active:scale-95 transition-all duration-150 disabled:opacity-40"
              >
                {digit}
              </button>
            ))}
            <button
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-14 rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => handleDigit("0")}
              disabled={loading}
              className="h-14 rounded-xl text-lg font-semibold text-foreground bg-muted/40 hover:bg-muted/70 active:bg-muted active:scale-95 transition-all duration-150 disabled:opacity-40"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              disabled={loading || pin.length === 0}
              className="h-14 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted/50 active:scale-95 transition-all disabled:opacity-30"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Delete className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* First-time hint */}
        {!error && pin.length === 0 && (
          <div className="px-6 pb-4">
            <p className="text-[10px] text-muted-foreground/50 text-center leading-tight">
              Si es tu primera vez, el código que ingreses será tu PIN de cambio de empresa.
            </p>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
