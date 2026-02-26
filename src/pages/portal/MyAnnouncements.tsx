import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Megaphone, Pin, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, parseISO } from "date-fns";
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
}

export default function MyAnnouncements() {
  const { employeeId } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;

    async function load() {
      // Get employee's company
      const { data: emp } = await supabase
        .from("employees")
        .select("company_id")
        .eq("id", employeeId)
        .maybeSingle();

      if (!emp) { setLoading(false); return; }

      const { data } = await supabase
        .from("announcements")
        .select("id, title, body, priority, pinned, published_at, link_url, link_label")
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

  const priorityConfig: Record<string, { cls: string; label: string }> = {
    urgent: { cls: "bg-destructive/10 text-destructive", label: "Urgente" },
    high: { cls: "bg-warning/10 text-warning", label: "Alta" },
    normal: { cls: "bg-muted text-muted-foreground", label: "Normal" },
  };

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
            return (
              <div
                key={a.id}
                className={cn(
                  "rounded-2xl border bg-card p-4 space-y-2",
                  a.pinned && "ring-1 ring-primary/20"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {a.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                      <h3 className="text-sm font-semibold text-foreground truncate">{a.title}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(parseISO(a.published_at), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                  {a.priority !== "normal" && (
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0", pCfg.cls)}>
                      {pCfg.label}
                    </span>
                  )}
                </div>

                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{a.body}</p>

                {a.link_url && (
                  <a
                    href={a.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {a.link_label || "Ver más"}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
