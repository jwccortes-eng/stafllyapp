import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Upload, RotateCcw, Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { clearFileInput, createPreviewUrl, openFilePicker, selectedFileFromInput } from "@/lib/mobile-file-picker";

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
    const f = selectedFileFromInput(e);
    if (!f) {
      clearFileInput(e);
      return;
    }

    if (!f.type.startsWith("image/")) {
      toast({ title: "Error", description: "Solo se permiten imágenes (JPG, PNG).", variant: "destructive" });
      clearFileInput(e);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "La imagen no puede exceder 5 MB.", variant: "destructive" });
      clearFileInput(e);
      return;
    }

    // Validate minimum resolution
    const objectUrl = createPreviewUrl(f, toast);
    if (!objectUrl) {
      clearFileInput(e);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (img.width < 300 || img.height < 300) {
        URL.revokeObjectURL(objectUrl);
        toast({
          title: "Resolución insuficiente",
          description: "La foto debe ser al menos 300×300 píxeles. Intenta con otra imagen.",
          variant: "destructive",
        });
        return;
      }
      setPreview(objectUrl);
      setFile(f);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      toast({ title: "No se pudo abrir la foto", description: "Intenta con otra imagen.", variant: "destructive" });
    };
    img.src = objectUrl;
    clearFileInput(e);
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

            {/* Guidelines — Photo Update Flow v2 */}
            <div className="space-y-2 text-[10px] text-muted-foreground bg-muted/30 rounded-xl p-3">
              <p className="font-semibold text-foreground text-xs leading-snug">
                Sube una foto tipo documento: rostro claro, fondo limpio y buena iluminación.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-0.5">
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400 text-[10px]">Aceptado</p>
                  <p>✓ Rostro visible</p>
                  <p>✓ Cabeza y hombros</p>
                  <p>✓ Fondo limpio</p>
                  <p>✓ Sin filtros fuertes</p>
                </div>
                <div className="space-y-0.5">
                  <p className="font-semibold text-destructive text-[10px]">No aceptado</p>
                  <p>✗ Gatos / mascotas</p>
                  <p>✗ Paisajes / logos</p>
                  <p>✗ Caricaturas o avatares</p>
                  <p>✗ Fotos grupales</p>
                  <p>✗ Contenido sugestivo</p>
                  <p>✗ Borrosa o muy oscura</p>
                </div>
              </div>
            </div>
            {/*
              TODO — Professional Photo Assistant (future, NOT in this sprint):
                - crop face
                - clean background
                - improve lighting
                - optional formal attire
                - worker + admin approval before replacing the original photo
              Constraints: never auto-replace, never mutate storage without approval,
              keep audit trail of original vs generated photo.
            */}

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
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => openFilePicker(cameraRef.current, toast)}>
                  <Camera className="h-3.5 w-3.5" />
                  Cámara
                </Button>
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => openFilePicker(fileRef.current, toast)}>
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
