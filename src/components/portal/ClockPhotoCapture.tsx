import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, RotateCcw, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ClockPhotoCaptureProps {
  open: boolean;
  onClose: () => void;
  onCaptured: (photoUrl: string) => void;
  employeeId: string;
  companyId: string;
  clockType: "clock_in" | "clock_out";
}

export function ClockPhotoCapture({
  open,
  onClose,
  onCaptured,
  employeeId,
  companyId,
  clockType,
}: ClockPhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setCaptured(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch {
      setError("No se pudo acceder a la cámara. Verifica los permisos.");
    }
  }, []);

  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
      setCaptured(null);
      setError(null);
    }
    return () => stopCamera();
  }, [open]);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Center crop to square
    const video = videoRef.current;
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 480, 480);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
    setCaptured(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const retake = useCallback(() => {
    setCaptured(null);
    startCamera();
  }, [startCamera]);

  const confirmPhoto = useCallback(async () => {
    if (!captured) return;
    setUploading(true);
    try {
      // Convert data URL to blob
      const res = await fetch(captured);
      const blob = await res.blob();
      const fileName = `${companyId}/${employeeId}/${clockType}_${Date.now()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from("kiosk-photos")
        .upload(fileName, blob, { contentType: "image/jpeg", upsert: false });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("kiosk-photos")
        .getPublicUrl(fileName);

      onCaptured(urlData.publicUrl);
    } catch (err: any) {
      setError(err.message ?? "Error al subir la foto");
      setUploading(false);
    }
  }, [captured, companyId, employeeId, clockType, onCaptured]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-3xl gap-0">
        <div className="bg-card p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Camera className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Verificación de identidad</p>
                <p className="text-[10px] text-muted-foreground">
                  {clockType === "clock_in" ? "Foto de entrada" : "Foto de salida"}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Camera / Preview */}
          <div className="relative aspect-square w-full max-w-[320px] mx-auto rounded-2xl overflow-hidden bg-black/90 border border-border/30">
            {!captured ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={cn(
                    "w-full h-full object-cover transition-opacity duration-300",
                    cameraReady ? "opacity-100" : "opacity-0"
                  )}
                />
                {!cameraReady && !error && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  </div>
                )}
                {/* Face guide overlay */}
                {cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 rounded-full border-2 border-white/30 border-dashed" />
                  </div>
                )}
              </>
            ) : (
              <img src={captured} alt="Selfie" className="w-full h-full object-cover" />
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-center">
              <p className="text-xs text-destructive font-medium">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!captured ? (
              <Button
                onClick={takePhoto}
                disabled={!cameraReady || !!error}
                className="w-full h-12 rounded-xl text-sm font-semibold gap-2"
              >
                <Camera className="h-4 w-4" />
                Tomar foto
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={retake}
                  disabled={uploading}
                  className="flex-1 h-12 rounded-xl text-sm gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Repetir
                </Button>
                <Button
                  onClick={confirmPhoto}
                  disabled={uploading}
                  className="flex-1 h-12 rounded-xl text-sm font-semibold gap-2"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Confirmar
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
