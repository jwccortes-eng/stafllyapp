import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Megaphone, Pin, ExternalLink, AlertTriangle, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, parseISO, isAfter, subDays } from "date-fns";
import { es } from "date-fns/locale";

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: string;
  pinned: boolean;
  published_at: string;
  link_url: string | null;
  link_label: string | null;
  media_urls: string[] | null;
}

export default function MyAnnouncements() {
  const { employeeId } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;

    async function load() {
      const { data: emp } = await supabase
        .from("employees")
        .select("company_id")
        .eq("id", employeeId)
        .maybeSingle();

      if (!emp) { setLoading(false); return; }

      const { data } = await supabase
        .from("announcements")
        .select("id, title, body, priority, pinned, published_at, link_url, link_label, media_urls")
        .eq("company_id", emp.company_id)
        .not("published_at", "is", null)
        .is("deleted_at", null)
        .order("pinned", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(50);

      setAnnouncements((data as Announcement[]) ?? []);
      setLoading(false);
    }
    load();
  }, [employeeId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  const priorityConfig: Record<string, { cls: string; bgCls: string; label: string; icon: any }> = {
    urgent: { cls: "text-destructive", bgCls: "bg-destructive/10", label: "Urgente", icon: AlertTriangle },
    high: { cls: "text-warning", bgCls: "bg-warning/10", label: "Importante", icon: Bell },
    normal: { cls: "text-muted-foreground", bgCls: "bg-muted", label: "Normal", icon: Megaphone },
  };

  const isNew = (publishedAt: string) => isAfter(parseISO(publishedAt), subDays(new Date(), 2));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight">Anuncios</h1>
        <p className="text-sm text-muted-foreground mt-1">Comunicaciones de la empresa</p>
      </div>

      {announcements.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Megaphone className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay anuncios publicados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map(a => {
            const pCfg = priorityConfig[a.priority] || priorityConfig.normal;
            const PriorityIcon = pCfg.icon;
            const fresh = isNew(a.published_at);
            const mediaList = Array.isArray(a.media_urls) ? a.media_urls.filter(Boolean) : [];

            return (
              <div
                key={a.id}
                className={cn(
                  "rounded-2xl border bg-card overflow-hidden transition-all",
                  a.pinned && "ring-1 ring-primary/20",
                  a.priority === "urgent" && "border-destructive/30"
                )}
              >
                {/* Priority banner for urgent */}
                {a.priority === "urgent" && (
                  <div className="bg-destructive/10 px-4 py-1.5 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-[11px] font-bold text-destructive uppercase tracking-wider">Urgente</span>
                  </div>
                )}

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {a.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                        <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                        {fresh && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-primary text-primary-foreground shrink-0">
                            NUEVO
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(parseISO(a.published_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                    {a.priority === "high" && (
                      <span className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0", pCfg.cls, pCfg.bgCls)}>
                        <PriorityIcon className="h-3 w-3" />
                        {pCfg.label}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{a.body}</p>

                  {/* Media gallery */}
                  {mediaList.length > 0 && (
                    <div className={cn(
                      "grid gap-2",
                      mediaList.length === 1 ? "grid-cols-1" : "grid-cols-2"
                    )}>
                      {mediaList.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt=""
                          className="rounded-xl w-full object-cover max-h-48"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}

                  {a.link_url && (
                    <a
                      href={a.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline bg-primary/5 px-3 py-1.5 rounded-lg"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {a.link_label || "Ver más"}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
