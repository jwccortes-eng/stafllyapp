/**
 * Imagen/video de un comunicado con acceso firmado.
 * El almacén es privado: si la persona no está en la audiencia congelada, la
 * firma falla y no se muestra nada.
 */
import { useEffect, useState } from "react";
import { isVideoMedia, resolveAnnouncementMediaUrl } from "@/lib/announcements/media";
import { cn } from "@/lib/utils";
import { Film } from "lucide-react";

interface Props {
  url: string;
  className?: string;
  alt?: string;
  /** Muestra un icono en lugar del reproductor cuando es video. */
  videoAsIcon?: boolean;
  controls?: boolean;
  onClick?: () => void;
}

export function AnnouncementMedia({
  url,
  className,
  alt = "",
  videoAsIcon = false,
  controls = true,
  onClick,
}: Props) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    setFailed(false);
    resolveAnnouncementMediaUrl(url).then((next) => {
      if (cancelled) return;
      if (!next) setFailed(true);
      else setResolved(next);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const isVideo = isVideoMedia(url);

  if (failed) return null;

  if (isVideo && videoAsIcon) {
    return (
      <div className={cn("bg-muted flex items-center justify-center", className)}>
        <Film className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (!resolved) {
    return <div className={cn("bg-muted animate-pulse", className)} aria-hidden="true" />;
  }

  if (isVideo) {
    return <video src={resolved} controls={controls} className={className} onClick={onClick} />;
  }

  return <img src={resolved} alt={alt} className={className} onClick={onClick} loading="lazy" />;
}
