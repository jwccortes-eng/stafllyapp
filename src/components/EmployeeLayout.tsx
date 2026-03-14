import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation, Navigate, useNavigate } from "react-router-dom";
import { User, LogOut, LogIn, Camera, Upload, RotateCcw, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import EmployeeChatWidget from "@/components/EmployeeChatWidget";
import NotificationBell from "@/components/NotificationBell";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { FloatingDock } from "@/components/navigation/FloatingDock";
import { AppLauncher } from "@/components/navigation/AppLauncher";
import { EMPLOYEE_NAV_ITEMS, EMPLOYEE_DEFAULT_PINS } from "@/components/navigation/nav-items";
import { useNavPreferences } from "@/hooks/useNavPreferences";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/** Shows current page title in mobile portal header */
function PortalPageTitle() {
  const location = useLocation();
  const current = EMPLOYEE_NAV_ITEMS.find(item => {
    if (item.end) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  });
  if (!current) return null;
  return (
    <span className="text-sm font-semibold text-foreground/80 truncate max-w-[140px]">
      {current.label}
    </span>
  );
}

export default function EmployeeLayout() {
  const { user, role, employeeActive, employeeId, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const { pinnedIds, togglePin, maxPins } = useNavPreferences(EMPLOYEE_DEFAULT_PINS);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(undefined); // undefined = loading
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch employee avatar
  useEffect(() => {
    if (!employeeId) return;
    supabase.from("employees").select("avatar_url").eq("id", employeeId).single()
      .then(({ data }) => setAvatarUrl(data?.avatar_url ?? null));
  }, [employeeId]);

  // Check active clock entry
  const checkClockStatus = useCallback(async () => {
    if (!employeeId) return;
    const { data } = await supabase.from("time_entries").select("id").eq("employee_id", employeeId).is("clock_out", null).limit(1);
    setIsClockedIn((data ?? []).length > 0);
  }, [employeeId]);

  useEffect(() => { checkClockStatus(); }, [checkClockStatus]);
  useEffect(() => {
    if (!employeeId) return;
    const ch = supabase.channel("emp-clock-status").on("postgres_changes", { event: "*", schema: "public", table: "time_entries", filter: `employee_id=eq.${employeeId}` }, () => checkClockStatus()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [employeeId, checkClockStatus]);

  const isOnClockPage = location.pathname.includes("/portal/clock");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (role !== 'employee') return <Navigate to="/auth" replace />;
  
  if (!employeeActive) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center gap-6">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <User className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground font-heading">Cuenta inactiva</h2>
          <p className="text-muted-foreground text-sm mt-2 max-w-sm">
            Tu cuenta de empleado está inactiva. Contacta al administrador para más información.
          </p>
        </div>
        <button onClick={signOut} className="text-sm text-primary hover:underline font-medium">
          Cerrar sesión
        </button>
      </div>
    );
  }

  // Photo upload handlers for gate
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
    if (!photoFile || !employeeId) return;
    setUploading(true);
    try {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${employeeId}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("employee-avatars").upload(path, photoFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("employee-avatars").getPublicUrl(path);
      const newUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from("employees").update({ avatar_url: newUrl }).eq("id", employeeId);
      setAvatarUrl(newUrl);
      toast({ title: "✅ Foto de perfil actualizada" });
      setPhotoFile(null);
      setPhotoPreview(null);
    } catch (err: any) {
      toast({ title: "Error al subir foto", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Gate: require photo before accessing portal
  if (avatarUrl === undefined) {
    // Still loading avatar status
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!avatarUrl) {
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

          <button onClick={signOut} className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }
  if (isMobile) {
    return (
      <div className="min-h-[100dvh] bg-[hsl(var(--background))] flex flex-col">
        {/* Top bar with page context */}
        <header className="sticky top-0 z-30 shrink-0 bg-card/95 backdrop-blur-2xl border-b border-border/50 shadow-2xs">
          <div className="flex items-center justify-between px-5 h-14">
            <div className="flex items-center gap-2.5">
              <StaflyLogo size={24} />
              <PortalPageTitle />
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5 pb-24 animate-fade-in">
          <Outlet />
        </main>

        {/* Floating Dock */}
        <FloatingDock
          items={EMPLOYEE_NAV_ITEMS}
          pinnedIds={pinnedIds}
          onOpenLauncher={() => setLauncherOpen(true)}
          variant="portal"
        />

        {/* App Launcher */}
        <AppLauncher
          open={launcherOpen}
          onClose={() => setLauncherOpen(false)}
          items={EMPLOYEE_NAV_ITEMS}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          maxPins={maxPins}
          onSignOut={signOut}
          variant="portal"
        />

        {/* Floating Clock Button */}
        {!isOnClockPage && (
          <button
            onClick={() => navigate("/portal/clock")}
            className={cn(
              "fixed z-40 right-5 bottom-24 h-14 w-14 rounded-full shadow-xl flex items-center justify-center transition-all active:scale-90",
              isClockedIn
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "gradient-primary text-primary-foreground"
            )}
          >
            {isClockedIn ? <LogOut className="h-6 w-6" /> : <LogIn className="h-6 w-6" />}
          </button>
        )}

        <EmployeeChatWidget />
      </div>
    );
  }

  // Desktop — centered clean layout with dock
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-xl border-b border-border/50 shadow-2xs">
          <div className="max-w-3xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-2.5">
            <StaflyLogo size={32} />
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 pb-24 animate-fade-in">
        <Outlet />
      </main>

      {/* Floating Dock */}
      <FloatingDock
        items={EMPLOYEE_NAV_ITEMS}
        pinnedIds={pinnedIds}
        onOpenLauncher={() => setLauncherOpen(true)}
        variant="portal"
      />

      {/* App Launcher */}
      <AppLauncher
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
        items={EMPLOYEE_NAV_ITEMS}
        pinnedIds={pinnedIds}
        onTogglePin={togglePin}
        maxPins={maxPins}
        onSignOut={signOut}
        variant="portal"
      />

      <EmployeeChatWidget />
    </div>
  );
}
