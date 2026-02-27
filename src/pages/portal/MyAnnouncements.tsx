import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Megaphone, Pin, ExternalLink, AlertTriangle, Bell, Heart, ThumbsUp, Laugh, PartyPopper, Play } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, parseISO, isAfter, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

interface ReactionCount {
  emoji: string;
  count: number;
  reacted: boolean;
}

const EMOJI_OPTIONS = [
  { emoji: "👍", icon: ThumbsUp, label: "Me gusta" },
  { emoji: "❤️", icon: Heart, label: "Me encanta" },
  { emoji: "😂", icon: Laugh, label: "Jaja" },
  { emoji: "🎉", icon: PartyPopper, label: "Celebrar" },
];

export default function MyAnnouncements() {
  const { employeeId } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [reactions, setReactions] = useState<Record<string, ReactionCount[]>>({});
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [expandedMedia, setExpandedMedia] = useState<string | null>(null);

  const loadAnnouncements = useCallback(async () => {
    if (!employeeId) return;
    const { data: emp } = await supabase
      .from("employees")
      .select("company_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (!emp) { setLoading(false); return; }
    setCompanyId(emp.company_id);

    const { data } = await supabase
      .from("announcements")
      .select("id, title, body, priority, pinned, published_at, link_url, link_label, media_urls")
      .eq("company_id", emp.company_id)
      .not("published_at", "is", null)
      .is("deleted_at", null)
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(50);

    const anns = (data as Announcement[]) ?? [];
    setAnnouncements(anns);
    
    // Load reactions for all announcements
    if (anns.length > 0) {
      const annIds = anns.map(a => a.id);
      const { data: allReactions } = await supabase
        .from("announcement_reactions")
        .select("announcement_id, emoji, employee_id")
        .in("announcement_id", annIds);

      const grouped: Record<string, ReactionCount[]> = {};
      anns.forEach(a => {
        const annReactions = (allReactions ?? []).filter(r => r.announcement_id === a.id);
        const emojiMap: Record<string, { count: number; reacted: boolean }> = {};
        annReactions.forEach(r => {
          if (!emojiMap[r.emoji]) emojiMap[r.emoji] = { count: 0, reacted: false };
          emojiMap[r.emoji].count++;
          if (r.employee_id === employeeId) emojiMap[r.emoji].reacted = true;
        });
        grouped[a.id] = Object.entries(emojiMap).map(([emoji, data]) => ({
          emoji, count: data.count, reacted: data.reacted,
        }));
      });
      setReactions(grouped);
    }

    setLoading(false);
  }, [employeeId]);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  // Realtime subscriptions
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel("employee-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => loadAnnouncements())
      .on("postgres_changes", { event: "*", schema: "public", table: "announcement_reactions" }, () => loadAnnouncements())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, loadAnnouncements]);

  const toggleReaction = async (announcementId: string, emoji: string) => {
    if (!employeeId) return;
    const existing = reactions[announcementId]?.find(r => r.emoji === emoji && r.reacted);
    if (existing) {
      await supabase.from("announcement_reactions")
        .delete()
        .eq("announcement_id", announcementId)
        .eq("employee_id", employeeId)
        .eq("emoji", emoji);
    } else {
      const { error } = await supabase.from("announcement_reactions").insert({
        announcement_id: announcementId,
        employee_id: employeeId,
        emoji,
      } as any);
      if (error && !error.message.includes("duplicate")) toast.error(error.message);
    }
  };

  const isVideo = (url: string) => /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
  const isNew = (publishedAt: string) => isAfter(parseISO(publishedAt), subDays(new Date(), 2));

  const priorityConfig: Record<string, { cls: string; bgCls: string; label: string; icon: any }> = {
    urgent: { cls: "text-destructive", bgCls: "bg-destructive/10", label: "Urgente", icon: AlertTriangle },
    high: { cls: "text-warning", bgCls: "bg-warning/10", label: "Importante", icon: Bell },
    important: { cls: "text-warning", bgCls: "bg-warning/10", label: "Importante", icon: Bell },
    normal: { cls: "text-muted-foreground", bgCls: "bg-muted", label: "Normal", icon: Megaphone },
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-32 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        variant="1"
        icon={Megaphone}
        title="Feed"
        subtitle="Comunicaciones y novedades de la empresa"
      />

      {announcements.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Megaphone className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay publicaciones aún</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map(a => {
            const pCfg = priorityConfig[a.priority] || priorityConfig.normal;
            const PriorityIcon = pCfg.icon;
            const fresh = isNew(a.published_at);
            const mediaList = Array.isArray(a.media_urls) ? a.media_urls.filter(Boolean) : [];
            const annReactions = reactions[a.id] ?? [];

            return (
              <article
                key={a.id}
                className={cn(
                  "rounded-2xl border bg-card overflow-hidden transition-all",
                  a.pinned && "ring-1 ring-primary/20",
                  a.priority === "urgent" && "border-destructive/30"
                )}
              >
                {/* Priority banner */}
                {a.priority === "urgent" && (
                  <div className="bg-destructive/10 px-4 py-1.5 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-[11px] font-bold text-destructive uppercase tracking-wider">Urgente</span>
                  </div>
                )}

                <div className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {a.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                        <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                        {fresh && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-primary text-primary-foreground shrink-0 animate-pulse">
                            NUEVO
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(parseISO(a.published_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                    {(a.priority === "high" || a.priority === "important") && (
                      <span className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0", pCfg.cls, pCfg.bgCls)}>
                        <PriorityIcon className="h-3 w-3" />
                        {pCfg.label}
                      </span>
                    )}
                  </div>

                  {/* Body */}
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{a.body}</p>

                  {/* Media gallery — photos & videos */}
                  {mediaList.length > 0 && (
                    <div className={cn(
                      "grid gap-2",
                      mediaList.length === 1 ? "grid-cols-1" : mediaList.length === 2 ? "grid-cols-2" : "grid-cols-2"
                    )}>
                      {mediaList.map((url, i) => (
                        <div key={i} className="relative rounded-xl overflow-hidden bg-muted">
                          {isVideo(url) ? (
                            <video
                              src={url}
                              controls
                              preload="metadata"
                              className="w-full max-h-64 object-cover rounded-xl"
                            >
                              Tu navegador no soporta video.
                            </video>
                          ) : (
                            <img
                              src={url}
                              alt=""
                              className={cn(
                                "w-full object-cover rounded-xl cursor-pointer transition-transform hover:scale-[1.02]",
                                mediaList.length === 1 ? "max-h-80" : "max-h-48"
                              )}
                              loading="lazy"
                              onClick={() => setExpandedMedia(expandedMedia === url ? null : url)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expanded image */}
                  {expandedMedia && mediaList.includes(expandedMedia) && !isVideo(expandedMedia) && (
                    <div
                      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                      onClick={() => setExpandedMedia(null)}
                    >
                      <img src={expandedMedia} alt="" className="max-w-full max-h-full rounded-xl" />
                    </div>
                  )}

                  {/* Link */}
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

                  {/* Reactions bar */}
                  <div className="flex items-center gap-1 pt-1 border-t border-border/50">
                    {/* Existing reactions */}
                    {annReactions.map(r => (
                      <button
                        key={r.emoji}
                        onClick={() => toggleReaction(a.id, r.emoji)}
                        className={cn(
                          "flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-all",
                          r.reacted
                            ? "bg-primary/10 text-primary font-semibold"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        )}
                      >
                        <span>{r.emoji}</span>
                        <span>{r.count}</span>
                      </button>
                    ))}

                    {/* Quick reaction buttons */}
                    <div className="flex items-center gap-0.5 ml-auto">
                      {EMOJI_OPTIONS.map(opt => {
                        const already = annReactions.find(r => r.emoji === opt.emoji);
                        if (already) return null;
                        return (
                          <button
                            key={opt.emoji}
                            onClick={() => toggleReaction(a.id, opt.emoji)}
                            className="p-1.5 rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-all"
                            title={opt.label}
                          >
                            <span className="text-sm">{opt.emoji}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
