import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const onOff = () => setOffline(true);
    const onOn = () => setOffline(false);
    window.addEventListener("offline", onOff);
    window.addEventListener("online", onOn);
    return () => {
      window.removeEventListener("offline", onOff);
      window.removeEventListener("online", onOn);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className={cn(
      "fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2",
      "bg-destructive text-destructive-foreground text-xs font-medium py-1.5 px-4",
      "animate-in slide-in-from-top duration-300"
    )}>
      <WifiOff className="h-3.5 w-3.5" />
      Sin conexión — los datos pueden no estar actualizados
    </div>
  );
}
