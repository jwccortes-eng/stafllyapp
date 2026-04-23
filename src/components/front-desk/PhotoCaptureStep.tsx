import { useEffect, useRef, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Check, X, Loader2, CameraOff, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  lang: "es" | "en";
  onSave: (base64: string) => Promise<void> | void;
  onSkip: () => void;
  onBack?: () => void;
  saving?: boolean;
}

/**
 * Tablet-friendly camera capture for the kiosk.
 * - Live preview via getUserMedia (front camera).
 * - Capture → preview → retake / save.
 * - Elegant fallback when permission is denied or no camera is available.
 */
export function PhotoCaptureStep({ lang, onSave, onSkip, onBack, saving }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<"loading" | "live" | "captured" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async () => {
    setStatus("loading");
    setErrorMsg(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("no_api");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStatus("live");
    } catch (err: any) {
      setStatus("error");
      const code = err?.name || err?.message || "unknown";
      setErrorMsg(
        code.includes("NotAllowed") || code.includes("Permission")
          ? lang === "es"
            ? "No tenemos permiso para usar la cámara"
            : "Camera permission denied"
          : code === "no_api"
          ? lang === "es"
            ? "Este dispositivo no soporta cámara"
            : "This device doesn't support the camera"
          : lang === "es"
          ? "No pudimos acceder a la cámara"
          : "We couldn't access the camera",
      );
    }
  }, [lang]);

  useEffect(() => {
    void startStream();
    return () => stopStream();
  }, [startStream, stopStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 720;
    const size = Math.min(w, h);
    canvas.width = 720;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror so the user sees themselves naturally; draw centered crop.
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(
      video,
      (w - size) / 2, (h - size) / 2, size, size,
      0, 0, canvas.width, canvas.height,
    );
    ctx.restore();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setSnapshot(dataUrl);
    setStatus("captured");
  };

  const handleRetake = () => {
    setSnapshot(null);
    setStatus("live");
  };

  const handleSave = async () => {
    if (!snapshot) return;
    await onSave(snapshot);
    stopStream();
  };

  const t = {
    title: lang === "es" ? "Tomemos tu foto" : "Let's take your photo",
    sub:
      lang === "es"
        ? "Una sola foto para completar tu perfil"
        : "Just one photo to complete your profile",
    capture: lang === "es" ? "Tomar foto" : "Take photo",
    retake: lang === "es" ? "Repetir" : "Retake",
    save: lang === "es" ? "Guardar foto" : "Save photo",
    skip: lang === "es" ? "Más tarde" : "Maybe later",
    saving: lang === "es" ? "Guardando…" : "Saving…",
    grant: lang === "es" ? "Permitir cámara" : "Allow camera",
    fallbackTitle: lang === "es" ? "Sin cámara disponible" : "Camera not available",
    fallbackSub:
      lang === "es"
        ? "No hay problema — puedes continuar sin foto y subirla luego desde el portal."
        : "No worries — you can continue without a photo and upload it from the portal later.",
  };

  return (
    <Card className="rounded-3xl border-2 border-border/50 bg-card/75 p-6 sm:p-8 shadow-xl backdrop-blur-xl">
      <div className="flex items-start gap-3 mb-6">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl flex-shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t.sub}</p>
        </div>
      </div>

      <div className="flex flex-col items-center">
        <div
          className={cn(
            "relative aspect-square w-full max-w-sm overflow-hidden rounded-3xl border-2 border-border bg-black shadow-inner",
            status === "error" && "bg-muted",
          )}
        >
          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80">
              <Loader2 className="h-10 w-10 animate-spin" />
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <CameraOff className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="font-semibold text-sm">{t.fallbackTitle}</p>
              <p className="text-xs text-muted-foreground mt-1">{errorMsg ?? t.fallbackSub}</p>
            </div>
          )}
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn(
              "h-full w-full object-cover scale-x-[-1] transition-opacity",
              status === "live" ? "opacity-100" : "opacity-0",
            )}
          />
          {status === "captured" && snapshot && (
            <img src={snapshot} alt="snapshot" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 w-full max-w-sm">
          {status === "live" && (
            <>
              <Button variant="ghost" size="lg" onClick={onSkip} className="h-12 px-5 rounded-xl">
                {t.skip}
              </Button>
              <Button size="lg" onClick={handleCapture} className="h-12 px-6 rounded-xl flex-1">
                <Camera className="h-5 w-5 mr-2" /> {t.capture}
              </Button>
            </>
          )}
          {status === "captured" && (
            <>
              <Button variant="outline" size="lg" onClick={handleRetake} className="h-12 px-5 rounded-xl" disabled={saving}>
                <RefreshCw className="h-4 w-4 mr-2" /> {t.retake}
              </Button>
              <Button size="lg" onClick={handleSave} className="h-12 px-6 rounded-xl flex-1" disabled={saving}>
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t.saving}</>
                ) : (
                  <><Check className="h-5 w-5 mr-2" /> {t.save}</>
                )}
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <Button variant="outline" size="lg" onClick={() => void startStream()} className="h-12 px-5 rounded-xl">
                <RefreshCw className="h-4 w-4 mr-2" /> {t.grant}
              </Button>
              <Button size="lg" onClick={onSkip} className="h-12 px-6 rounded-xl flex-1">
                <X className="h-4 w-4 mr-2" /> {t.skip}
              </Button>
            </>
          )}
          {status === "loading" && (
            <Button variant="ghost" size="lg" onClick={onSkip} className="h-12 px-5 rounded-xl">
              {t.skip}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
