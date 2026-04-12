import { useState } from "react";
import { AlertTriangle, BellRing, Volume2, VolumeX } from "lucide-react";
import { useSoundContext } from "@/hooks/useSound";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function getStatusMeta(status: "active" | "blocked" | "disabled") {
  if (status === "active") return { label: "Active", dot: "bg-emerald-500", variant: "success" as const, Icon: Volume2 };
  if (status === "blocked") return { label: "Blocked", dot: "bg-amber-500", variant: "warning" as const, Icon: AlertTriangle };
  return { label: "Disabled", dot: "bg-muted-foreground/40", variant: "secondary" as const, Icon: VolumeX };
}

export function SoundStatusControl({ compact = false }: { compact?: boolean }) {
  const { isEnabled, status, setEnabled, testSound, unlockAudio } = useSoundContext();
  const [busy, setBusy] = useState(false);
  const statusMeta = getStatusMeta(status);

  const handleEnableChange = async (next: boolean) => {
    setBusy(true);
    await setEnabled(next);
    setBusy(false);
  };

  const handleTest = async (type: "notification" | "alert") => {
    setBusy(true);
    await testSound(type);
    setBusy(false);
  };

  const handleUnlock = async () => {
    setBusy(true);
    await unlockAudio({ source: "sound-control" });
    await testSound("notification");
    setBusy(false);
  };

  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className="relative h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors">
            <statusMeta.Icon className="h-4 w-4" />
            <span className={cn("absolute top-1 right-1 h-2 w-2 rounded-full ring-2 ring-card", statusMeta.dot)} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3 rounded-2xl border-border/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Sound</h3>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">Enable sounds</p>
            <Switch checked={isEnabled} onCheckedChange={(checked) => void handleEnableChange(checked)} disabled={busy} />
          </div>
          {status === "blocked" && (
            <Button className="w-full gap-2" size="sm" onClick={() => void handleUnlock()} disabled={busy}>
              <BellRing className="h-4 w-4" />
              Unlock audio
            </Button>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 rounded-lg px-2.5">
          <statusMeta.Icon className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Sound</span>
          <Badge variant={statusMeta.variant} className="px-2 py-0 text-[10px]">
            {statusMeta.label}
          </Badge>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 space-y-4 rounded-2xl border-border/60 p-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Operational Sound</h3>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Control alerts, bell and real-time chat sounds from here.</p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">Sounds</p>
            <p className="text-xs text-muted-foreground">Respects manual mute setting.</p>
          </div>
          <Switch checked={isEnabled} onCheckedChange={(checked) => void handleEnableChange(checked)} disabled={busy} />
        </div>

        {status === "blocked" && (
          <Button className="w-full gap-2" onClick={() => void handleUnlock()} disabled={busy}>
            <BellRing className="h-4 w-4" />
            Unlock audio
          </Button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => void handleTest("notification")} disabled={busy} className="gap-2">
            <Volume2 className="h-4 w-4" />
            Test sound
          </Button>
          <Button variant="outline" onClick={() => void handleTest("alert")} disabled={busy} className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Test alert
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}