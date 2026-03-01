import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Wifi, WifiOff } from "lucide-react";

/**
 * Shows a toast when the browser goes offline/online.
 * Mount once at the app root.
 */
export function useNetworkStatus() {
  const { toast } = useToast();
  const wasOffline = useRef(false);

  useEffect(() => {
    const onOffline = () => {
      wasOffline.current = true;
      toast({
        title: "Sin conexión",
        description: "No hay conexión a internet. Los cambios no se guardarán hasta que se restablezca.",
        variant: "destructive",
      });
    };

    const onOnline = () => {
      if (wasOffline.current) {
        wasOffline.current = false;
        toast({
          title: "Conexión restablecida",
          description: "Ya puedes continuar trabajando con normalidad.",
        });
      }
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [toast]);
}
