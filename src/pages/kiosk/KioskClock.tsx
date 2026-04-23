import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Camera, CheckCircle2, Clock, LogIn, LogOut, XCircle, Delete, ArrowLeft, Loader2 } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { usePhonePadInput } from "@/hooks/usePhonePadInput";

type Step = "phone" | "pin" | "camera" | "processing" | "success" | "error";

const AUTO_RESET_MS = 5000;

export default function KioskClock() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{
    clock_type: "clock_in" | "clock_out";
    employee_name: string;
    avatar_url?: string;
    timestamp: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const resetAll = useCallback(() => {
    setStep("phone");
    setPhone("");
    setPin("");
    setResult(null);
    setError("");
    setPhotoBase64(null);
    stopCamera();
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      // Camera not available — proceed without photo
      handleClock(null);
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) {
      handleClock(null);
      return;
    }
    const canvas = canvasRef.current;
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) { handleClock(null); return; }
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const base64 = dataUrl.split(",")[1];
    setPhotoBase64(base64);
    stopCamera();
    handleClock(base64);
  }, [phone, pin]);

  const handleClock = useCallback(async (photo: string | null) => {
    setStep("processing");
    setProcessing(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("kiosk-clock", {
        body: {
          phone: phone.trim(),
          pin,
          photo_base64: photo,
          kiosk_device_id: getKioskDeviceId(),
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      setResult(data);
      setStep("success");
      resetTimerRef.current = setTimeout(resetAll, AUTO_RESET_MS);
    } catch (err: any) {
      setError(err.message || "Error al fichar");
      setStep("error");
      resetTimerRef.current = setTimeout(resetAll, AUTO_RESET_MS);
    } finally {
      setProcessing(false);
    }
  }, [phone, pin, resetAll]);

  const handlePhoneComplete = () => {
    if (phone.length >= 10) {
      setStep("pin");
    }
  };

  const handlePinComplete = (completedPin: string) => {
    setPin(completedPin);
    setStep("camera");
    setTimeout(() => startCamera(), 100);
  };

  useEffect(() => {
    if (step === "camera") {
      const timer = setTimeout(() => {
        if (step === "camera") capturePhoto();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const timeStr = currentTime.toLocaleTimeString("es-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const dateStr = currentTime.toLocaleDateString("es-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(220,20%,8%)] via-[hsl(222,30%,12%)] to-[hsl(220,20%,8%)] flex flex-col items-center justify-center p-6 select-none overflow-hidden">
      {/* Background pattern */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, hsl(222,100%,59%) 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }} />
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-6">
        {/* Logo + Clock */}
        <div className="text-center space-y-2">
          <div className="flex justify-center"><StaflyLogo size={28} /></div>
          <p className="text-4xl font-bold text-white font-[var(--font-heading)] tracking-tight">{timeStr}</p>
          <p className="text-sm text-white/50 capitalize">{dateStr}</p>
        </div>

        {/* Main card */}
        <div className="w-full bg-white/[0.06] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          {step === "phone" && (
            <PhoneEntry
              value={phone}
              onChange={setPhone}
              onComplete={handlePhoneComplete}
            />
          )}

          {step === "pin" && (
            <PinEntry
              value={pin}
              onChange={setPin}
              onComplete={handlePinComplete}
              onBack={() => { setStep("phone"); setPin(""); }}
              phone={phone}
            />
          )}

          {step === "camera" && (
            <div className="flex flex-col items-center gap-4">
              <Camera className="h-8 w-8 text-primary animate-pulse" />
              <p className="text-white/70 text-sm">Capturando foto...</p>
              <div className="w-48 h-36 rounded-2xl overflow-hidden bg-black/40 border border-white/10">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <button
                onClick={capturePhoto}
                className="px-6 py-3 bg-primary text-white rounded-2xl text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Capturar
              </button>
            </div>
          )}

          {step === "processing" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <p className="text-white/70 text-sm">Procesando fichaje...</p>
            </div>
          )}

          {step === "success" && result && (
            <SuccessScreen result={result} onReset={resetAll} />
          )}

          {step === "error" && (
            <ErrorScreen message={error} onReset={resetAll} />
          )}
        </div>

        <p className="text-[10px] text-white/20">Kiosk Mode · StaflyApps</p>
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function PhoneEntry({
  value,
  onChange,
  onComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete: () => void;
}) {
  const handlePress = (digit: string) => {
    if (value.length >= 15) return;
    onChange(value + digit);
  };

  const handleDelete = () => onChange(value.slice(0, -1));

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-center space-y-1">
        <Clock className="h-6 w-6 text-primary mx-auto" />
        <h2 className="text-lg font-bold text-white font-[var(--font-heading)]">Fichaje Kiosk</h2>
        <p className="text-xs text-white/50">Ingresa tu número de teléfono</p>
      </div>

      {/* Phone display */}
      <div className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 text-center">
        <span className={cn(
          "text-2xl font-mono tracking-widest",
          value ? "text-white" : "text-white/20"
        )}>
          {value || "••••••••••"}
        </span>
      </div>

      <KioskKeypad onPress={handlePress} onDelete={handleDelete} disableDelete={!value} />

      <button
        onClick={onComplete}
        disabled={value.length < 10}
        className="w-full py-4 bg-primary text-white rounded-2xl text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-all active:scale-[0.98]"
      >
        Continuar
      </button>
    </div>
  );
}

function PinEntry({
  value,
  onChange,
  onComplete,
  onBack,
  phone,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete: (v: string) => void;
  onBack: () => void;
  phone: string;
}) {
  const handlePress = (digit: string) => {
    if (value.length >= 4) return;
    const next = value + digit;
    onChange(next);
    if (next.length === 4) {
      setTimeout(() => onComplete(next), 200);
    }
  };

  const handleDelete = () => onChange(value.slice(0, -1));

  return (
    <div className="flex flex-col items-center gap-5">
      <button onClick={onBack} className="self-start flex items-center gap-1 text-white/40 hover:text-white/70 text-xs transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Atrás
      </button>

      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold text-white font-[var(--font-heading)]">Ingresa tu PIN</h2>
        <p className="text-xs text-white/50">
          Teléfono: {phone.slice(-4).padStart(phone.length, "•")}
        </p>
      </div>

      {/* PIN dots */}
      <div className="flex items-center gap-4 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-5 h-5 rounded-full border-2 transition-all duration-200",
              i < value.length
                ? "bg-primary border-primary shadow-[0_0_12px_hsl(222,100%,59%,0.5)] scale-110"
                : "border-white/20 bg-transparent"
            )}
          />
        ))}
      </div>

      <KioskKeypad onPress={handlePress} onDelete={handleDelete} disableDelete={!value} />
    </div>
  );
}

function KioskKeypad({
  onPress,
  onDelete,
  disableDelete,
}: {
  onPress: (d: string) => void;
  onDelete: () => void;
  disableDelete: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-[300px]">
      {keys.map((key, i) => {
        if (key === "") return <div key={i} />;
        if (key === "del") {
          return (
            <button
              key={i}
              type="button"
              onClick={onDelete}
              disabled={disableDelete}
              className="h-16 rounded-2xl flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.06] active:scale-95 transition-all disabled:opacity-20"
            >
              <Delete className="h-6 w-6" />
            </button>
          );
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPress(key)}
            className="h-16 rounded-2xl bg-white/[0.06] border border-white/[0.08] text-2xl font-semibold text-white hover:bg-white/[0.12] active:scale-[0.92] active:bg-primary/20 transition-all duration-150 select-none"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}

function SuccessScreen({
  result,
  onReset,
}: {
  result: { clock_type: string; employee_name: string; avatar_url?: string; timestamp: string };
  onReset: () => void;
}) {
  const isIn = result.clock_type === "clock_in";
  const time = new Date(result.timestamp).toLocaleTimeString("es-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="flex flex-col items-center gap-5 py-4" onClick={onReset}>
      <div className={cn(
        "w-20 h-20 rounded-full flex items-center justify-center",
        isIn
          ? "bg-[hsl(163,68%,44%)]/20 text-[hsl(163,68%,50%)]"
          : "bg-[hsl(222,100%,59%)]/20 text-[hsl(222,100%,59%)]"
      )}>
        {isIn ? <LogIn className="h-10 w-10" /> : <LogOut className="h-10 w-10" />}
      </div>

      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-white font-[var(--font-heading)]">
          {isIn ? "Entrada Registrada" : "Salida Registrada"}
        </h2>
        <p className="text-white/70 text-base font-semibold">{result.employee_name}</p>
        <p className="text-white/40 text-sm">{time}</p>
      </div>

      <CheckCircle2 className={cn(
        "h-12 w-12",
        isIn ? "text-[hsl(163,68%,50%)]" : "text-[hsl(222,100%,59%)]"
      )} />

      <p className="text-[10px] text-white/30">Toca para continuar</p>
    </div>
  );
}

function ErrorScreen({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4" onClick={onReset}>
      <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center">
        <XCircle className="h-10 w-10 text-destructive" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold text-white font-[var(--font-heading)]">Error</h2>
        <p className="text-white/60 text-sm max-w-[260px]">{message}</p>
      </div>
      <p className="text-[10px] text-white/30">Toca para reintentar</p>
    </div>
  );
}

function getKioskDeviceId(): string | null {
  try {
    let id = localStorage.getItem("stafly_kiosk_device_id");
    return id;
  } catch {
    return null;
  }
}
