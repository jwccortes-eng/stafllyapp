import { useState } from "react";
import { Camera, Upload, RotateCcw, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

interface PhotoGateProps {
  employeeId: string;
  onPhotoUploaded: (url: string) => void;
  onSignOut: () => void;
}

export function PhotoGate({ employeeId, onPhotoUploaded, onSignOut }: PhotoGateProps) {
  const { toast } = useToast();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const handlePhotoUpload = async () => {
    if (!photoFile) return;
    setUploading(true);
    try {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${employeeId}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("employee-avatars").upload(path, photoFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("employee-avatars").getPublicUrl(path);
      const newUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from("employees").update({ avatar_url: newUrl }).eq("id", employeeId);
      toast({ title: "✅ Foto de perfil actualizada" });
      onPhotoUploaded(newUrl);
    } catch (err: any) {
      toast({ title: "Error al subir foto", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center">
          <StaflyLogo size={44} />
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border/40 p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-warning/20 to-warning/5 flex items-center justify-center">
              <Camera className="h-7 w-7 text-warning" />
            </div>
            <h1 className="text-lg font-semibold font-heading text-foreground tracking-tight">
              Foto de perfil requerida
            </h1>
            <p className="text-sm text-muted-foreground">
              Para continuar usando la app, sube una foto clara de tu rostro.
            </p>
          </div>

          {/* Preview */}
          <div className="relative mx-auto w-40 h-40 rounded-full bg-muted/30 border-2 border-dashed border-border overflow-hidden flex items-center justify-center">
            {photoPreview ? (
              <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              <div className="text-center space-y-1 p-4">
                <Camera className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-[10px] text-muted-foreground">Tu foto aparecerá aquí</p>
              </div>
            )}
          </div>

          {/* Guidelines */}
          <div className="space-y-1 text-[10px] text-muted-foreground bg-muted/30 rounded-xl p-3">
            <p className="font-semibold text-foreground text-xs mb-1">Requisitos:</p>
            <p>✓ Foto clara de tu rostro</p>
            <p>✓ Sin lentes de sol</p>
            <p>✓ Sin fotos grupales</p>
          </div>

          {photoPreview ? (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1.5" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>
                <RotateCcw className="h-3.5 w-3.5" />
                Otra foto
              </Button>
              <Button className="flex-1 gap-1.5" onClick={handlePhotoUpload} disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Guardar
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <input type="file" accept="image/*" capture="user" onChange={handlePhotoSelect} className="hidden" id="photo-gate-camera" />
              <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" id="photo-gate-gallery" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => document.getElementById("photo-gate-camera")?.click()}>
                  <Camera className="h-3.5 w-3.5" />
                  Cámara
                </Button>
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => document.getElementById("photo-gate-gallery")?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  Galería
                </Button>
              </div>
            </div>
          )}
        </div>

        <button onClick={onSignOut} className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
