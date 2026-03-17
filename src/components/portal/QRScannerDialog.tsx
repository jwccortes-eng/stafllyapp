import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScanLine, X, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface QRScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onScanned: (data: string) => void;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const hasScanned = useRef(false);

  useEffect(() => {
    if (!open) {
      hasScanned.current = false;
      return;
    }

    let mounted = true;
    const startScanner = async () => {
      setStarting(true);
      setError(null);

      try {
        // Small delay to let DOM render
        await new Promise(r => setTimeout(r, 300));
        if (!mounted) return;

        const scanner = new Html5Qrcode("qr-reader-container");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => {
            if (hasScanned.current) return;
            hasScanned.current = true;
            // Vibrate on scan if supported
            if (navigator.vibrate) navigator.vibrate(100);
            onScanned(decodedText);
          },
          () => { /* ignore scan failures */ }
        );
      } catch (err: any) {
        if (mounted) {
          if (err?.message?.includes("Permission")) {
            setError("Permiso de cámara denegado. Habilita el acceso a la cámara en la configuración de tu navegador.");
          } else {
            setError("No se pudo iniciar la cámara. Verifica los permisos.");
          }
        }
      } finally {
        if (mounted) setStarting(false);
      }
    };

    startScanner();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    };
  }, [open, onScanned]);

  const handleClose = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current.clear();
      scannerRef.current = null;
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <ScanLine className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold">{title}</DialogTitle>
                <p className="text-[11px] text-muted-foreground">{description}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={handleClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="px-4 pb-5 space-y-3">
          {/* Scanner viewport */}
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
            <div id="qr-reader-container" ref={containerRef} className="w-full h-full" />

            {/* Overlay frame */}
            {!error && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[65%] h-[65%] border-2 border-white/40 rounded-2xl relative">
                  {/* Corner accents */}
                  <div className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                  <div className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                  <div className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                  <div className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg" />
                  {/* Scan line animation */}
                  <div className="absolute left-2 right-2 h-0.5 bg-primary/60 animate-[scan_2s_ease-in-out_infinite]" />
                </div>
              </div>
            )}

            {starting && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                <p className="text-xs text-white/70">Iniciando cámara...</p>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
