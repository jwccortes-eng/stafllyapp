/**
 * Lista de adjuntos de una versión de comunicado — vista de la persona.
 * Mobile first: tarjetas simples, miniatura para imágenes, botón para abrir.
 * El acceso se firma en el momento; si no está autorizada, no se abre.
 */
import { useState } from "react";
import { FileText, FileSpreadsheet, File as FileIcon, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  attachmentKindLabel,
  formatBytes,
  resolveAttachmentUrl,
  type CommunicationAttachment,
} from "@/lib/announcements/attachments";
import { AnnouncementMedia } from "./AnnouncementMedia";
import { toast } from "sonner";

interface Props {
  attachments: CommunicationAttachment[];
  className?: string;
}

function KindIcon({ kind }: { kind: CommunicationAttachment["kind"] }) {
  if (kind === "sheet") return <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />;
  if (kind === "pdf" || kind === "doc") return <FileText className="h-5 w-5 text-muted-foreground" />;
  return <FileIcon className="h-5 w-5 text-muted-foreground" />;
}

export function AnnouncementAttachments({ attachments, className }: Props) {
  const [opening, setOpening] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  const open = async (att: CommunicationAttachment) => {
    setOpening(att.path);
    const url = await resolveAttachmentUrl(att.path);
    setOpening(null);
    if (!url) {
      toast.error("No pudimos abrir el archivo", {
        description: "Este adjunto solo está disponible para las personas destinatarias del comunicado.",
      });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Adjuntos ({attachments.length})
      </p>
      <div className="space-y-2">
        {attachments.map((att) => (
          <div
            key={att.path}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            {att.kind === "image" ? (
              <AnnouncementMedia
                url={att.path}
                alt={att.name}
                className="h-12 w-12 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <KindIcon kind={att.kind} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{att.name}</p>
              <p className="text-xs text-muted-foreground">
                {attachmentKindLabel(att.kind)} · {formatBytes(att.size)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-[44px] shrink-0"
              disabled={opening === att.path}
              onClick={() => open(att)}
            >
              {opening === att.path ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  {att.kind === "image" ? "Ver imagen" : "Abrir"}
                </>
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
