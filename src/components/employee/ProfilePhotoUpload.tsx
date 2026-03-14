import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Upload, RotateCcw, Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ProfilePhotoUploadProps {
  employeeId: string;
  currentAvatarUrl?: string | null;
  firstName: string;
  lastName: string;
  onUploaded: (newUrl: string) => void;
  /** If true, shows as a required action with warning styling */
  required?: boolean;
}

export function ProfilePhotoUpload({
  employeeId,
  currentAvatarUrl,
  firstName,
  lastName,
  onUploaded,
  required = false,
}: ProfilePhotoUploadProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.type.startsWith("image/")) {
      toast({ title: "Error", description: "Solo se permiten imágenes (JPG, PNG).", variant: "destructive" });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "La imagen no puede exceder 5 MB.", variant: "destructive" });
      return;
    }

    // Validate minimum resolution
    const img = new Image();
    img.onload = () => {
      if (img.width < 300 || img.height < 300) {
        toast({
          title: "Resolución insuficiente",
          description: "La foto debe ser al menos 300×300 píxeles. Intenta con otra imagen.",
          variant: "destructive",
        });
        return;
      }
      setPreview(URL.createObjectURL(f));
      setFile(f);
    };
    img.src = URL.createObjectURL(f);
  }, [toast]);

  const handleUpload = async () => {
    if (!file || !employeeId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${employeeId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("employee-avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("employee-avatars")
        .getPublicUrl(path);

      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("employees")
        .update({ avatar_url: avatarUrl })
        .eq("id", employeeId);
      if (updateError) throw updateError;

      onUploaded(avatarUrl);
      toast({ title: "✅ Foto de perfil actualizada" });
      setOpen(false);
      setPreview(null);
      setFile(null);
    } catch (err: any) {
      toast({ title: "Error al subir foto", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setFile(null);
  };

  return (
    <>
      {/* Trigger: either a required warning or a simple button */}
      {required && !currentAvatarUrl ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl border-2 border-dashed border-warning/40 bg-warning/5 p-4 flex items-center gap-3 hover:bg-warning/10 transition-colors active:scale-[0.98]"
        >
          <div className="h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
            <Camera className="h-6 w-6 text-warning" />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-semibold text-foreground">Foto de perfil requerida</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Sube una foto clara de tu rostro para completar tu perfil y poder fichar.
            </p>
          </div>
          <AlertCircle className="h-4 w-4 text-warning shrink-0" />
        </button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setOpen(true)}
        >
          <Camera className="h-3.5 w-3.5" />
          {currentAvatarUrl ? "Cambiar foto" : "Subir foto"}
        </Button>
      )}

      {/* Upload dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogHeader className="p-5 pb-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              Foto de perfil
            </DialogTitle>
          </DialogHeader>

          <div className="p-5 space-y-5">
            {/* Preview area with face guide */}
            <div className="relative mx-auto w-56 h-56 rounded-full bg-muted/30 border-2 border-dashed border-border overflow-hidden flex items-center justify-center">
              {preview ? (
                <img src={preview} alt="Preview" className="h-full w-full object-cover" />
              ) : currentAvatarUrl ? (
                <img src={currentAvatarUrl} alt="Current" className="h-full w-full object-cover opacity-60" />
              ) : (
                <div className="text-center space-y-2 p-4">
                  <Camera className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-[10px] text-muted-foreground">Tu foto aparecerá aquí</p>
                </div>
              )}

              {/* Face outline guide overlay */}
              {!preview && (
                <svg
                  viewBox="0 0 200 200"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  fill="none"
                >
                  {/* Oval face guide */}
                  <ellipse
                    cx="100"
                    cy="90"
                    rx="50"
                    ry="62"
                    stroke="hsl(var(--primary))"
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                    opacity="0.5"
                  />
                  {/* Shoulder guide */}
                  <path
                    d="M40 170 Q100 140 160 170"
                    stroke="hsl(var(--primary))"
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                    opacity="0.3"
                  />
                </svg>
              )}
            </div>

            {/* Guidelines */}
            <div className="space-y-1.5 text-[10px] text-muted-foreground bg-muted/30 rounded-xl p-3">
              <p className="font-semibold text-foreground text-xs mb-1">Requisitos de la foto:</p>
              <p>✓ Foto clara de tu rostro</p>
              <p>✓ Sin lentes de sol cubriendo el rostro</p>
              <p>✓ Sin fotos grupales</p>
              <p>✓ Formato retrato preferido</p>
            </div>

            {/* Action buttons */}
            {preview ? (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1.5" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Otra foto
                </Button>
                <Button className="flex-1 gap-1.5" onClick={handleUpload} disabled={uploading}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Guardar
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => cameraRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5" />
                  Cámara
                </Button>
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  Galería
                </Button>
              </div>
            )}

            {/* Hidden inputs */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
