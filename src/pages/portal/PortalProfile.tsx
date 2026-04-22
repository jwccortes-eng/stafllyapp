import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useEmployeeReadiness } from "@/hooks/useEmployeeReadiness";
import { Link, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  User, Mail, Phone, MapPin, CalendarDays, Wallet,
  ChevronRight, LogOut, Shield, BarChart3, Camera, ArrowLeft, Loader2, KeyRound, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { ProfilePhotoUpload } from "@/components/employee/ProfilePhotoUpload";
import { ReadinessCard } from "@/components/portal/ReadinessCard";

interface EmployeeProfile {
  first_name: string;
  last_name: string;
  email: string | null;
  phone_number: string | null;
  employee_role: string | null;
  start_date: string | null;
  groups: string | null;
  tags: string | null;
  avatar_url: string | null;
}

export default function PortalProfile() {
  const { signOut } = useAuth();
  const { effectiveEmployeeId: employeeId } = useEffectiveEmployee();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const outletCtx = useOutletContext<{ openMore?: () => void } | null>();
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Readiness drives the banner *and* acts as a freshness signal: when the
  // worker comes back from /portal/profile/complete, the status changes and we
  // re-fetch the employee row so chips (phone, role…) don't show stale values.
  const readiness = useEmployeeReadiness(employeeId);

  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("employees")
        .select("first_name, last_name, email, phone_number, employee_role, start_date, groups, tags, company_id, avatar_url")
        .eq("id", employeeId)
        .maybeSingle();

      if (cancelled) return;
      if (data) {
        setProfile(data);
        const { data: comp } = await supabase.from("companies").select("name").eq("id", data.company_id).maybeSingle();
        if (!cancelled) setCompanyName(comp?.name ?? "");
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
    // Re-run when status changes (saved profile) or when navigating back to this route.
  }, [employeeId, readiness.status, location.key]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employeeId) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Only images are allowed.", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image cannot exceed 5MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
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

      setProfile(prev => prev ? { ...prev, avatar_url: avatarUrl } : prev);
      toast({ title: "Photo updated" });
    } catch (err: any) {
      toast({ title: "Error uploading photo", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse bg-muted rounded-2xl" />
        <div className="h-20 animate-pulse bg-muted rounded-2xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-14 space-y-3">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/30 flex items-center justify-center">
          <User className="h-7 w-7 text-muted-foreground/20" />
        </div>
        <p className="text-sm font-bold text-foreground">Could not load your profile</p>
        <p className="text-xs text-muted-foreground/60 max-w-[240px] mx-auto">Try signing out and back in.</p>
      </div>
    );
  }

  const infoItems = [
    { icon: Mail, label: "Email", value: profile.email },
    { icon: Phone, label: "Phone", value: profile.phone_number },
    { icon: Shield, label: "Role", value: profile.employee_role },
    { icon: CalendarDays, label: "Start date", value: profile.start_date },
  ].filter(i => i.value);

  const menuItems = [
    { to: "/portal/payments", icon: Wallet, label: "My payments", description: "Payroll history" },
    { to: "/portal/accumulated", icon: BarChart3, label: "Accumulated", description: "Total history" },
    { to: "/portal/shifts", icon: CalendarDays, label: "My shifts", description: "Assignments and requests" },
  ];

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold font-heading tracking-tight text-foreground">My Profile</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{companyName}</p>
      </div>

      {/* Readiness banner — surfaces missing data with editable CTA */}
      <ReadinessCard />

      {/* Profile photo required warning */}
      {!profile.avatar_url && (
        <ProfilePhotoUpload
          employeeId={employeeId!}
          currentAvatarUrl={profile.avatar_url}
          firstName={profile.first_name}
          lastName={profile.last_name}
          onUploaded={(url) => setProfile(prev => prev ? { ...prev, avatar_url: url } : prev)}
          required
        />
      )}

      {/* Profile header */}
      <div className="rounded-2xl gradient-primary p-5 text-primary-foreground relative overflow-hidden shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,hsl(200_85%_65%/0.4),transparent_60%)]" />
        <div className="relative flex items-center gap-4">
          {/* Avatar with upload */}
          <div className="relative group">
            <EmployeeAvatar
              firstName={profile.first_name}
              lastName={profile.last_name}
              avatarUrl={profile.avatar_url}
              size="xl"
              className="border-2 border-white/30 shadow-lg"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold font-heading tracking-tight leading-tight">
              {profile.first_name} {profile.last_name}
            </h2>
            {profile.employee_role && (
              <span className="inline-block mt-1.5 text-[10px] px-2.5 py-0.5 rounded-full bg-white/20 font-semibold backdrop-blur-sm">
                {profile.employee_role}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Info cards */}
      {infoItems.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {infoItems.map(item => (
            <div key={item.label} className="rounded-2xl border border-border/30 bg-card p-3.5 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <item.icon className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
              </div>
              <p className="text-sm font-medium text-foreground truncate">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tags & groups */}
      {(profile.groups || profile.tags) && (
        <div className="space-y-2">
          {profile.groups && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Groups:</span>
              {profile.groups.split(",").map(g => (
                <span key={g.trim()} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {g.trim()}
                </span>
              ))}
            </div>
          )}
          {profile.tags && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tags:</span>
              {profile.tags.split(",").map(t => (
                <span key={t.trim()} className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                  {t.trim()}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick menu */}
      <div className="space-y-2">
        {menuItems.map(item => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3.5 rounded-2xl border border-border/40 bg-card p-4 hover:bg-accent/50 transition-all duration-200 active:scale-[0.98] shadow-xs"
          >
            <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center">
              <item.icon className="h-[18px] w-[18px] text-primary/70" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="text-[10px] text-muted-foreground">{item.description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
          </Link>
        ))}
      </div>

      {/* More options */}
      {outletCtx?.openMore && (
        <button
          onClick={outletCtx.openMore}
          className="flex items-center gap-3.5 w-full rounded-2xl border border-border/40 bg-card p-4 hover:bg-accent/50 transition-all duration-200 active:scale-[0.98] shadow-xs text-left"
        >
          <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center">
            <MoreHorizontal className="h-[18px] w-[18px] text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
             <p className="text-sm font-semibold">More options</p>
             <p className="text-[10px] text-muted-foreground">Payments, availability, announcements and more</p>
           </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
        </button>
      )}

      {/* Change PIN section */}
      <ChangePinSection />

      {/* Logout */}
      <LogoutConfirmDialog onConfirm={signOut}>
        <Button
          variant="outline"
          className="w-full h-11 text-sm gap-2 text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/5"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </LogoutConfirmDialog>
    </div>
  );
}

function ChangePinSection() {
  const { toast } = useToast();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleChangePin = async () => {
    if (!/^\d{4}$/.test(newPin)) {
      toast({ title: "Error", description: "New PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    if (newPin !== confirmPin) {
      toast({ title: "Error", description: "PINs don't match", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("employee-auth", {
        body: { action: "change-pin", current_pin: currentPin || undefined, new_pin: newPin },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "PIN updated ✅", description: "Your new PIN is active" });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setExpanded(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not change PIN", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-3.5 w-full rounded-2xl border border-border/40 bg-card p-4 hover:bg-accent/50 transition-all duration-200 active:scale-[0.98] shadow-xs"
      >
        <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center">
          <KeyRound className="h-[18px] w-[18px] text-primary/70" />
        </div>
        <div className="flex-1 min-w-0 text-left">
           <p className="text-sm font-semibold">Change PIN</p>
           <p className="text-[10px] text-muted-foreground">Update your access code</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4 shadow-xs">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Change PIN</h3>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Current PIN (optional)</Label>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            className="h-10 text-center tracking-[0.5em] font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">New PIN *</Label>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            className="h-10 text-center tracking-[0.5em] font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Confirm new PIN *</Label>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            className="h-10 text-center tracking-[0.5em] font-mono"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => setExpanded(false)}>
          Cancel
        </Button>
        <Button size="sm" className="flex-1" onClick={handleChangePin} disabled={saving || !newPin || !confirmPin}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save PIN"}
        </Button>
      </div>
    </div>
  );
}
