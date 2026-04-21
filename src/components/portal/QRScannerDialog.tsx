/**
 * QRScannerDialog — premium scanner with success/error feedback.
 *
 * Two-stage UX:
 *  1. SCANNING: live camera + framed overlay + animated scan line
 *  2. RESULT:   inline confirmation card (success or error) before closing
 *
 * The result stage is owned by the dialog (not the parent) so the user gets
 * tactile confirmation tied to the scan, not to a downstream action.
 *
 * Parent contract:
 *  - onScanned(data) → return a ResultMessage to render, or null to close immediately
 *  - if it throws, we render a generic error.
 */
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScanLine, X, AlertTriangle, CheckCircle2, Loader2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScanResult =
  | { kind: "success"; title: string; description?: string }
  | { kind: "error"; title: string; description?: string };

interface QRScannerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Return ScanResult to keep the dialog open with feedback, or null to close. */
  onScanned: (data: string) => Promise<ScanResult | null> | ScanResult | null;
  title?: string;
  description?: string;
}

export function QRScannerDialog({
  open,
  onClose,
  onScanned,
  title = "Escanear QR",
  description = "Apunta la cámara al código QR del turno",
}: QRScannerDialogProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const hasScanned = useRef(false);

  /** Stop & release the camera (idempotent). */
  const stopCamera = async () => {
    const inst = scannerRef.current;
    if (!inst) return;
    scannerRef.current = null;
    try { await inst.stop(); } catch { /* already stopped */ }
    try { inst.clear(); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!open) {
      hasScanned.current = false;
      setResult(null);
      setError(null);
      setProcessing(false);
      return;
    }

    let mounted = true;
    const startScanner = async () => {
      setStarting(true);
      setError(null);

      try {
        await new Promise(r => setTimeout(r, 300));
        if (!mounted) return;

        const scanner = new Html5Qrcode("qr-reader-container");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
          async (decodedText) => {
            if (hasScanned.current) return;
            hasScanned.current = true;
            if (navigator.vibrate) navigator.vibrate(80);
            setProcessing(true);
            await stopCamera();

            try {
              const res = await onScanned(decodedText);
              if (!mounted) return;
              if (res) setResult(res);
              else onClose();
            } catch (e) {
              if (!mounted) return;
              setResult({
                kind: "error",
                title: "No pudimos procesar el código",
                description: e instanceof Error ? e.message : "Intenta nuevamente.",
              });
            } finally {
              if (mounted) setProcessing(false);
            }
          },
          () => { /* ignore frame failures */ },
        );
      } catch (err: unknown) {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : "";
        setError(
          msg.includes("Permission")
            ? "Permiso de cámara denegado. Habilita el acceso a la cámara en la configuración de tu navegador."
            : "No se pudo iniciar la cámara. Verifica los permisos.",
        );
      } finally {
        if (mounted) setStarting(false);
      }
    };

    startScanner();
    return () => { mounted = false; void stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => { void stopCamera(); onClose(); };

  /** Restart scanner after an error result. */
  const handleRetry = () => {
    hasScanned.current = false;
    setResult(null);
    // Rerun the effect by toggling — easiest way is forcing a re-init via state.
    // We re-trigger the effect by reading `open` again: simulate close-open is
    // not possible from here, so just call startScanner equivalent inline.
    setStarting(true);
    setError(null);
    (async () => {
      try {
        await new Promise(r => setTimeout(r, 200));
        const scanner = new Html5Qrcode("qr-reader-container");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
          async (decodedText) => {
            if (hasScanned.current) return;
            hasScanned.current = true;
            if (navigator.vibrate) navigator.vibrate(80);
            setProcessing(true);
            await stopCamera();
            try {
              const res = await onScanned(decodedText);
              if (res) setResult(res); else onClose();
            } catch (e) {
              setResult({
                kind: "error",
                title: "No pudimos procesar el código",
                description: e instanceof Error ? e.message : "Intenta nuevamente.",
              });
            } finally { setProcessing(false); }
          },
          () => {},
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        setError(msg.includes("Permission")
          ? "Permiso de cámara denegado."
          : "No se pudo iniciar la cámara.");
      } finally { setStarting(false); }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "h-8 w-8 rounded-xl flex items-center justify-center transition-colors",
                result?.kind === "success" && "bg-earning/10",
                result?.kind === "error" && "bg-destructive/10",
                !result && "bg-primary/10",
              )}>
                {result?.kind === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-earning" />
                ) : result?.kind === "error" ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <ScanLine className="h-4 w-4 text-primary" />
                )}
              </div>
              <div>
                <DialogTitle className="text-sm font-bold">
                  {result?.title ?? title}
                </DialogTitle>
                {!result && <p className="text-[11px] text-muted-foreground">{description}</p>}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={handleClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="px-4 pb-5 space-y-3">
          {/* ── Result state (success or error) ── */}
          {result ? (
            <div className={cn(
              "rounded-2xl border p-5 flex flex-col items-center gap-3 text-center",
              result.kind === "success"
                ? "border-earning/30 bg-earning/5"
                : "border-destructive/30 bg-destructive/5",
            )}>
              <div className={cn(
                "h-14 w-14 rounded-full flex items-center justify-center",
                result.kind === "success" ? "bg-earning/15" : "bg-destructive/15",
              )}>
                {result.kind === "success"
                  ? <CheckCircle2 className="h-7 w-7 text-earning" />
                  : <AlertTriangle className="h-7 w-7 text-destructive" />}
              </div>
              {result.description && (
                <p className={cn(
                  "text-xs leading-relaxed",
                  result.kind === "success" ? "text-foreground" : "text-destructive",
                )}>
                  {result.description}
                </p>
              )}
              <div className="flex gap-2 w-full pt-1">
                {result.kind === "error" && (
                  <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1.5" onClick={handleRetry}>
                    <RotateCw className="h-3.5 w-3.5" /> Reintentar
                  </Button>
                )}
                <Button
                  variant={result.kind === "success" ? "default" : "ghost"}
                  size="sm"
                  className="flex-1 h-9 text-xs"
                  onClick={handleClose}
                >
                  {result.kind === "success" ? "Listo" : "Cerrar"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* ── Scanner viewport ── */}
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
                <div id="qr-reader-container" className="w-full h-full" />

                {!error && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[65%] h-[65%] border-2 border-white/40 rounded-2xl relative">
                      <div className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                      <div className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                      <div className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                      <div className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg" />
                      <div className="absolute left-2 right-2 h-0.5 bg-primary/60 animate-[scan_2s_ease-in-out_infinite]" />
                    </div>
                  </div>
                )}

                {(starting || processing) && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    <p className="text-xs text-white/70">
                      {processing ? "Validando código..." : "Iniciando cámara..."}
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-[11px] text-destructive font-medium leading-relaxed">{error}</p>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground text-center">
                Coloca el código QR dentro del recuadro para escanearlo automáticamente
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
