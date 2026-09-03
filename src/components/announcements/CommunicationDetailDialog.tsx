/**
 * Detalle post-publicación de un comunicado oficial.
 * Muestra hechos demostrables: destinatarios congelados, vistos y confirmados.
 * No existe "entregado": Stafly no tiene acuse de entrega real.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, CheckCircle2, Eye, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  computeVersionStats,
  recipientStateLabel,
  typeLabel,
  type AnnouncementVersion,
  type RecipientRow,
} from "@/lib/announcements/official-communications";

type Filter = "all" | "acknowledged" | "pending" | "viewed";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcementId: string | null;
  onNewVersion?: () => void;
  canEdit: boolean;
}

export function CommunicationDetailDialog({
  open,
  onOpenChange,
  announcementId,
  onNewVersion,
  canEdit,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<AnnouncementVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!announcementId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("announcement_versions")
      .select("*")
      .eq("announcement_id", announcementId)
      .order("version_number", { ascending: false });
    if (error) {
      toast.error("No pudimos cargar las versiones", { description: error.message });
      setLoading(false);
      return;
    }
    const list = (data ?? []) as unknown as AnnouncementVersion[];
    setVersions(list);
    const published = list.find((v) => v.status === "published") ?? list[0] ?? null;
    setActiveVersionId(published?.id ?? null);
    setLoading(false);
  }, [announcementId]);

  useEffect(() => {
    if (open) load();
    else {
      setVersions([]);
      setRows([]);
      setFilter("all");
      setSearch("");
    }
  }, [open, load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeVersionId) {
        setRows([]);
        return;
      }
      const { data, error } = await supabase.rpc("announcement_version_recipients", {
        p_version_id: activeVersionId,
      });
      if (cancelled) return;
      if (error) {
        toast.error("No pudimos cargar los destinatarios", { description: error.message });
        setRows([]);
        return;
      }
      setRows((data ?? []) as unknown as RecipientRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeVersionId]);

  const activeVersion = versions.find((v) => v.id === activeVersionId) ?? null;
  const stats = useMemo(() => computeVersionStats(rows), [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "acknowledged" && r.state !== "acknowledged") return false;
      if (filter === "pending" && r.state === "acknowledged") return false;
      if (filter === "viewed" && r.state !== "viewed") return false;
      if (q && !(r.full_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, search]);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: stats.recipients },
    { key: "acknowledged", label: "Confirmados", count: stats.acknowledged },
    { key: "pending", label: "Pendientes", count: stats.pending },
    { key: "viewed", label: "Vistos sin confirmar", count: stats.viewedNotAcknowledged },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Seguimiento del comunicado</DialogTitle>
          <DialogDescription>
            Estados reales: disponible, visto y confirmado. Sin acuse de entrega inventado.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Este anuncio todavía no tiene versiones oficiales.
          </p>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Versiones */}
            <div className="flex gap-2 flex-wrap">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setActiveVersionId(v.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium min-h-[36px]",
                    activeVersionId === v.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  v{v.version_number} · {v.status === "published" ? "Activa" : v.status === "draft" ? "Borrador" : "Anterior"}
                </button>
              ))}
            </div>

            {activeVersion && (
              <div className="rounded-xl border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate">
                      {activeVersion.title_es || activeVersion.title_en}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {activeVersion.published_at
                        ? `Publicada el ${format(new Date(activeVersion.published_at), "dd/MM/yyyy HH:mm")}`
                        : "Borrador sin publicar"}
                      {" · "}
                      {activeVersion.audience_mode === "all_company"
                        ? "Toda la empresa"
                        : "Personas seleccionadas"}
                    </p>
                  </div>
                  <Badge variant="secondary">{typeLabel(activeVersion.communication_type)}</Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Kpi label="Destinatarios" value={stats.recipients} />
                  <Kpi label="Confirmados" value={stats.acknowledged} icon={CheckCircle2} />
                  <Kpi label="Pendientes" value={stats.pending} icon={Clock} />
                  <Kpi label="Sin abrir" value={stats.availableNotViewed} icon={Eye} />
                </div>

                <div className="space-y-1">
                  <Progress value={stats.progress} className="h-2" />
                  <p className="text-[11px] text-muted-foreground">
                    {stats.progress}% confirmado
                  </p>
                </div>

                {canEdit && (
                  <Button variant="outline" size="sm" onClick={onNewVersion}>
                    Crear nueva versión
                  </Button>
                )}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs min-h-[36px]",
                    filter === f.key
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar persona"
                className="pl-8"
              />
            </div>

            <ScrollArea className="flex-1 rounded-lg border">
              <div className="divide-y">
                {visibleRows.map((r) => (
                  <div key={r.employee_id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.full_name || "Sin nombre"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {recipientStateLabel(r.state)}
                        {r.acknowledged_at
                          ? ` · ${format(new Date(r.acknowledged_at), "dd/MM/yyyy HH:mm")}${r.language_variant ? ` · ${r.language_variant.toUpperCase()}` : ""}`
                          : ""}
                      </p>
                    </div>
                    <Badge
                      variant={r.state === "acknowledged" ? "default" : "outline"}
                      className="text-[10px] shrink-0"
                    >
                      {recipientStateLabel(r.state)}
                    </Badge>
                  </div>
                ))}
                {visibleRows.length === 0 && (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Sin personas en este filtro
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value, icon: Icon }: { label: string; value: number; icon?: any }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
