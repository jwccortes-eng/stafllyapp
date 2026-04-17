import { useState, useCallback } from "react";
import { safeRandomUUID } from "@/lib/safe-storage";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { QrCode, Download, RefreshCw, Copy, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ShiftQRSectionProps {
  shiftId: string;
  qrToken: string | null;
  qrAttendanceMode: string;
  onUpdate: (updates: { qr_attendance_mode?: string; qr_token?: string }) => void;
  disabled?: boolean;
}

export function ShiftQRSection({
  shiftId,
  qrToken,
  qrAttendanceMode,
  onUpdate,
  disabled = false,
}: ShiftQRSectionProps) {
  const { toast } = useToast();
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const qrEnabled = qrAttendanceMode !== "disabled";
  const qrValue = qrToken ? `stafly:shift:${shiftId}:${qrToken}` : null;

  const handleRegenerate = async () => {
    setRegenerating(true);
    const newToken = safeRandomUUID();
    const { error } = await supabase
      .from("scheduled_shifts")
      .update({ qr_token: newToken } as any)
      .eq("id", shiftId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      onUpdate({ qr_token: newToken });
      toast({ title: "QR regenerado", description: "El código anterior ya no es válido" });
    }
    setRegenerating(false);
  };

  const handleCopyQRData = async () => {
    if (!qrValue) return;
    await navigator.clipboard.writeText(qrValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    if (!qrValue) return;
    // Generate QR as SVG using a simple QR encoding API
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrValue)}&format=png`;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `qr-shift-${shiftId.slice(0, 8)}.png`;
    a.target = "_blank";
    a.click();
  };

  return (
    <div className="space-y-3">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-muted-foreground" />
          <Label className="text-xs font-medium">Asistencia por QR</Label>
        </div>
        <Switch
          checked={qrEnabled}
          onCheckedChange={(checked) =>
            onUpdate({ qr_attendance_mode: checked ? "optional" : "disabled" })
          }
          disabled={disabled}
        />
      </div>

      {qrEnabled && (
        <>
          {/* Mode select */}
          <div>
            <Label className="text-[11px] text-muted-foreground font-medium">Modo de QR</Label>
            <Select
              value={qrAttendanceMode}
              onValueChange={(v) => onUpdate({ qr_attendance_mode: v })}
              disabled={disabled}
            >
              <SelectTrigger className="h-9 text-sm mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="optional">Opcional (alternativa al fichaje normal)</SelectItem>
                <SelectItem value="required_in">Obligatorio para entrada</SelectItem>
                <SelectItem value="required_out">Obligatorio para salida</SelectItem>
                <SelectItem value="required_both">Obligatorio para entrada y salida</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* QR Preview + Actions */}
          {qrValue && (
            <div className="rounded-xl border border-border/30 bg-muted/20 p-4 space-y-3">
              {/* QR Image */}
              <div className="flex justify-center">
                <div className="bg-white rounded-xl p-3 shadow-sm">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrValue)}&format=svg`}
                    alt="QR Code"
                    className="w-40 h-40"
                    loading="lazy"
                  />
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground text-center font-mono truncate">
                {qrToken?.slice(0, 8)}...{qrToken?.slice(-4)}
              </p>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-8"
                  onClick={handleDownloadQR}
                  disabled={disabled}
                >
                  <Download className="h-3 w-3" />
                  Descargar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-8"
                  onClick={handleCopyQRData}
                  disabled={disabled}
                >
                  {copied ? <CheckCircle2 className="h-3 w-3 text-earning" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8 text-warning hover:text-warning"
                  onClick={handleRegenerate}
                  disabled={disabled || regenerating}
                >
                  {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                Regenerar invalida el QR anterior. Imprima o comparta el nuevo código.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
