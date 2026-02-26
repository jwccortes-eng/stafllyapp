import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import {
  Wallet, Clock, Megaphone, CalendarDays,
  MapPin, ArrowRight, AlertCircle, Pin,
  ExternalLink, AlertTriangle, Bell, Heart, ThumbsUp, Laugh, PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { format, parseISO, isToday, isTomorrow, formatDistanceToNow, isAfter, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface NextShift {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  status: string;
}

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

const priorityConfig: Record<string, { cls: string; bgCls: string; label: string; icon: any }> = {
  urgent: { cls: "text-destructive", bgCls: "bg-destructive/10", label: "Urgente", icon: AlertTriangle },
  high: { cls: "text-warning", bgCls: "bg-warning/10", label: "Importante", icon: Bell },
  important: { cls: "text-warning", bgCls: "bg-warning/10", label: "Importante", icon: Bell },
  normal: { cls: "text-muted-foreground", bgCls: "bg-muted", label: "Normal", icon: Megaphone },
};

export default function EmployeeDashboard() {
  const { employeeId } = useAuth();
  const [empName, setEmpName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [nextShift, setNextShift] = useState<NextShift | null>(null);
  const [estimatedPay, setEstimatedPay] = useState<number | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [reactions, setReactions] = useState<Record<string, ReactionCount[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedMedia, setExpandedMedia] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    if (!employeeId) {
      setEmpName("");
      setCompanyId(null);
      setNextShift(null);
      setEstimatedPay(null);
      setAnnouncements([]);
      setReactions({});
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: emp } = await supabase
      .from("employees")
      .select("first_name, last_name, company_id")
      .eq("id", employeeId)
      .maybeSingle();
    if (!emp) { setLoading(false); return; }

    setEmpName(`${emp.first_name} ${emp.last_name}`);
    setCompanyId(emp.company_id);
    const today = new Date().toISOString().split("T")[0];

    const [periodRes, assignRes, annRes] = await Promise.all([
      supabase.from("pay_periods").select("id, start_date, end_date, status, published_at")
        .eq("company_id", emp.company_id).order("start_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("shift_assignments").select(`
        status, scheduled_shifts!inner (title, date, start_time, end_time, status, locations (name))
      `).eq("employee_id", employeeId).neq("status", "rejected")
        .gte("scheduled_shifts.date", today)
        .order("created_at", { ascending: true }).limit(1),
      supabase.from("announcements")
        .select("id, title, body, priority, pinned, published_at, link_url, link_label, media_urls")
        .eq("company_id", emp.company_id)
        .not("published_at", "is", null)
        .is("deleted_at", null)
        .order("pinned", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(20),
    ]);

    // Period & estimated pay
    if (periodRes.data) {
      const p = periodRes.data;
      const [bpRes, movRes] = await Promise.all([
        supabase.from("period_base_pay").select("base_total_pay")
          .eq("employee_id", employeeId!).eq("period_id", p.id).maybeSingle(),
        supabase.from("movements").select("total_value, concepts(category)")
          .eq("employee_id", employeeId!).eq("period_id", p.id),
      ]);
      const base = Number(bpRes.data?.base_total_pay) || 0;
      let extras = 0, deductions = 0;
      (movRes.data ?? []).forEach((m: any) => {
        if (m.concepts?.category === "extra") extras += Number(m.total_value) || 0;
        else deductions += Number(m.total_value) || 0;
      });
      setEstimatedPay(base + extras - deductions);
    }

    // Next shift
    const shifts = (assignRes.data ?? []) as any[];
    if (shifts.length > 0) {
      const s = shifts[0].scheduled_shifts;
      setNextShift({
        title: s.title, date: s.date, start_time: s.start_time, end_time: s.end_time,
        location_name: s.locations?.name ?? null, status: shifts[0].status,
      });
    }

    // Announcements with reactions
    const anns = (annRes.data as Announcement[]) ?? [];
    setAnnouncements(anns);

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

  useEffect(() => { loadFeed(); }, [loadFeed]);

  // Realtime
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel("employee-feed-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => loadFeed())
      .on("postgres_changes", { event: "*", schema: "public", table: "announcement_reactions" }, () => loadFeed())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, loadFeed]);

  const toggleReaction = async (announcementId: string, emoji: string) => {
    if (!employeeId) return;
    const existing = reactions[announcementId]?.find(r => r.emoji === emoji && r.reacted);
    if (existing) {
      await supabase.from("announcement_reactions").delete()
        .eq("announcement_id", announcementId).eq("employee_id", employeeId).eq("emoji", emoji);
    } else {
      const { error } = await supabase.from("announcement_reactions").insert({
        announcement_id: announcementId, employee_id: employeeId, emoji,
      } as any);
      if (error && !error.message.includes("duplicate")) toast.error(error.message);
    }
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  })();

  const getDateLabel = (dateStr: string) => {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Hoy";
    if (isTomorrow(d)) return "Mañana";
    return format(d, "EEEE d MMM", { locale: es });
  };

  const isVideo = (url: string) => /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
  const isNew = (publishedAt: string) => isAfter(parseISO(publishedAt), subDays(new Date(), 2));

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse bg-muted rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting with avatar */}
      <div className="flex items-center gap-3.5 pt-1">
        <EmployeeAvatar
          firstName={empName.split(" ")[0] || ""}
          lastName={empName.split(" ").slice(1).join(" ") || ""}
          size="md"
          className="ring-2 ring-primary/20 shadow-sm"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground/70 font-medium">{greeting} 👋</p>
          <h1 className="text-xl font-bold font-heading tracking-tight leading-tight mt-0.5">
            {empName.split(" ")[0]}
          </h1>
        </div>
      </div>

      {/* Hero cards row: pay + next shift */}
      <div className="grid grid-cols-2 gap-3">
        {/* Pay card */}
        {estimatedPay !== null && (
          <Link to="/portal/payments" className="block group">
            <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 p-4 text-primary-foreground relative overflow-hidden h-full shadow-md transition-transform duration-200 active:scale-[0.97]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,hsl(200_85%_65%/0.4),transparent_60%)]" />
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-2">
                  <Wallet className="h-3.5 w-3.5 opacity-80" />
                  <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wider">Pago estimado</p>
                </div>
                <p className="text-[22px] font-bold font-heading tabular-nums leading-none">${estimatedPay.toFixed(2)}</p>
                <div className="flex items-center gap-1 mt-3 text-[10px] font-medium opacity-70 group-hover:opacity-100 transition-opacity">
                  Ver nómina <ArrowRight className="h-2.5 w-2.5" />
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Next shift card */}
        {nextShift ? (
          <Link to="/portal/shifts" className="block group">
            <div className={cn(
              "rounded-2xl border bg-card p-4 h-full flex flex-col justify-between shadow-sm transition-all duration-200 active:scale-[0.97]",
              isToday(parseISO(nextShift.date)) && "ring-2 ring-primary/20 border-primary/20"
            )}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-semibold">Próximo turno</p>
                  </div>
                  {isToday(parseISO(nextShift.date)) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-primary text-primary-foreground">HOY</span>
                  )}
                </div>
                <p className="text-sm font-semibold leading-snug">{nextShift.title}</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-2.5">
                <Clock className="h-3 w-3" />
                {nextShift.start_time?.slice(0, 5)} – {nextShift.end_time?.slice(0, 5)}
              </div>
            </div>
          </Link>
        ) : estimatedPay === null ? null : (
          <Link to="/portal/shifts" className="block group">
            <div className="rounded-2xl border border-dashed border-primary/25 bg-primary/5 p-4 flex flex-col items-center justify-center h-full gap-2 transition-all duration-200 active:scale-[0.97]">
              <CalendarDays className="h-5 w-5 text-primary/70" />
              <p className="text-[10px] text-primary/80 font-semibold text-center leading-tight">
                Sin turnos hoy
              </p>
              <span className="text-[9px] text-primary/60 font-medium flex items-center gap-0.5 group-hover:text-primary transition-colors">
                Ver disponibles <ArrowRight className="h-2.5 w-2.5" />
              </span>
            </div>
          </Link>
        )}
      </div>

      {/* Feed header */}
      <div className="flex items-center gap-2 pt-1">
        <Megaphone className="h-4 w-4 text-primary" />
        <h2 className="text-[13px] font-semibold text-foreground tracking-tight">Muro</h2>
        <div className="flex-1 h-px bg-border/60 ml-1" />
      </div>

      {/* Feed/Wall */}
      {announcements.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Megaphone className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay publicaciones aún</p>
        </div>
      ) : (
        <div className="space-y-3">
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
                {a.priority === "urgent" && (
                  <div className="bg-destructive/10 px-4 py-1.5 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-[11px] font-bold text-destructive uppercase tracking-wider">Urgente</span>
                  </div>
                )}

                <div className="p-4 space-y-3">
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

                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{a.body}</p>

                  {/* Media */}
                  {mediaList.length > 0 && (
                    <div className={cn("grid gap-2", mediaList.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                      {mediaList.map((url, i) => (
                        <div key={i} className="relative rounded-xl overflow-hidden bg-muted">
                          {isVideo(url) ? (
                            <video src={url} controls preload="metadata" className="w-full max-h-64 object-cover rounded-xl">
                              Tu navegador no soporta video.
                            </video>
                          ) : (
                            <img
                              src={url}
                              alt=""
                              className={cn("w-full object-cover rounded-xl cursor-pointer transition-transform hover:scale-[1.02]",
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

                  {expandedMedia && mediaList.includes(expandedMedia) && !isVideo(expandedMedia) && (
                    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setExpandedMedia(null)}>
                      <img src={expandedMedia} alt="" className="max-w-full max-h-full rounded-xl" />
                    </div>
                  )}

                  {a.link_url && (
                    <a href={a.link_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline bg-primary/5 px-3 py-1.5 rounded-lg">
                      <ExternalLink className="h-3 w-3" />
                      {a.link_label || "Ver más"}
                    </a>
                  )}

                  {/* Reactions */}
                  <div className="flex items-center gap-1 pt-1 border-t border-border/50">
                    {annReactions.map(r => (
                      <button key={r.emoji} onClick={() => toggleReaction(a.id, r.emoji)}
                        className={cn("flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-all",
                          r.reacted ? "bg-primary/10 text-primary font-semibold" : "bg-muted text-muted-foreground hover:bg-accent"
                        )}>
                        <span>{r.emoji}</span><span>{r.count}</span>
                      </button>
                    ))}
                    <div className="flex items-center gap-0.5 ml-auto">
                      {EMOJI_OPTIONS.map(opt => {
                        if (annReactions.find(r => r.emoji === opt.emoji)) return null;
                        return (
                          <button key={opt.emoji} onClick={() => toggleReaction(a.id, opt.emoji)}
                            className="p-1.5 rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-all" title={opt.label}>
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
