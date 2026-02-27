import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Wallet, Clock, Megaphone, CalendarDays,
  ArrowRight, Pin,
  ExternalLink, AlertTriangle, Bell, Heart, ThumbsUp, Laugh, PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { format, parseISO, isToday, isTomorrow, formatDistanceToNow, isAfter, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface PayPeriod {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  published_at: string;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  company_id: string;
}

interface ScheduledShift {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  locations: Location | null;
}

interface ShiftAssignment {
  id: string;
  employee_id: string;
  scheduled_shift_id: string;
  status: string;
  scheduled_shifts: ScheduledShift;
}

interface Location {
  id: string;
  name: string;
}

interface PeriodBasePay {
  id: string;
  employee_id: string;
  period_id: string;
  base_total_pay: number;
}

interface Movement {
  id: string;
  employee_id: string;
  period_id: string;
  concept_id: string;
  total_value: number;
  concepts: Concept | null;
}

interface Concept {
  id: string;
  name: string;
  category: string;
}

interface AnnouncementReaction {
  id: string;
  announcement_id: string;
  employee_id: string;
  emoji: string;
}

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
  urgent: { cls: "text-destructive", bgCls: "bg-destructive/8", label: "Urgente", icon: AlertTriangle },
  high: { cls: "text-warning", bgCls: "bg-warning/8", label: "Importante", icon: Bell },
  important: { cls: "text-warning", bgCls: "bg-warning/8", label: "Importante", icon: Bell },
  normal: { cls: "text-muted-foreground", bgCls: "bg-muted", label: "Normal", icon: Megaphone },
};

export default function EmployeeDashboard() {
  const { employeeId } = useAuth();
  const [empName, setEmpName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [nextShift, setNextShift] = useState<NextShift | null>(null);
  const [estimatedPay, setEstimatedPay] = useState<number | null>(null);
  const [periodInfo, setPeriodInfo] = useState<{ status: string; startDate: string; endDate: string } | null>(null);
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

    if (periodRes.data) {
      const p = periodRes.data;
      setPeriodInfo({ status: p.status, startDate: p.start_date, endDate: p.end_date });
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

    const shifts = (assignRes.data ?? []) as any[];
    if (shifts.length > 0) {
      const s = shifts[0].scheduled_shifts;
      setNextShift({
        title: s.title, date: s.date, start_time: s.start_time, end_time: s.end_time,
        location_name: s.locations?.name ?? null, status: shifts[0].status,
      });
    }

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

  const firstName = empName.split(" ")[0] || "";
  const lastName = empName.split(" ").slice(1).join(" ") || "";

  return (
    <div className="space-y-5">
      {/* ── Greeting ── */}
      <div className="flex items-center gap-3">
        <EmployeeAvatar firstName={firstName} lastName={lastName} size="md" className="ring-2 ring-primary/15 shadow-2xs" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground font-medium">{greeting} 👋</p>
          <h1 className="text-lg font-bold font-heading tracking-tight leading-tight">{firstName}</h1>
        </div>
      </div>

      {/* ── Hero cards: pay + next shift ── */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Pay */}
        {estimatedPay !== null && (
          <Link to="/portal/payments" className="block group">
            <div className="rounded-xl bg-gradient-to-br from-primary to-primary/70 p-4 text-primary-foreground relative overflow-hidden h-full shadow-sm press-scale">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,hsl(212_100%_73%/0.3),transparent_60%)]" />
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-2">
                  <Wallet className="h-3.5 w-3.5 opacity-70" />
                  <p className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">Pago estimado</p>
                </div>
                <p className="text-xl font-bold font-heading tabular-nums leading-none">${estimatedPay.toFixed(2)}</p>
                <div className="flex items-center gap-1 mt-2.5 text-[10px] font-medium opacity-60 group-hover:opacity-100 transition-opacity">
                  Ver nómina <ArrowRight className="h-2.5 w-2.5" />
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Next shift */}
        {nextShift ? (
          <Link to="/portal/shifts" className="block group">
            <div className={cn(
              "rounded-xl border bg-card p-4 h-full flex flex-col justify-between shadow-2xs press-scale",
              isToday(parseISO(nextShift.date)) && "ring-1 ring-primary/15 border-primary/15"
            )}>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3 w-3 text-muted-foreground/50" />
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">Próximo turno</p>
                  </div>
                  {isToday(parseISO(nextShift.date)) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-primary text-primary-foreground">HOY</span>
                  )}
                </div>
                <p className="text-[13px] font-semibold leading-snug text-foreground">{nextShift.title}</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-2">
                <Clock className="h-3 w-3" />
                {nextShift.start_time?.slice(0, 5)} – {nextShift.end_time?.slice(0, 5)}
              </div>
            </div>
          </Link>
        ) : estimatedPay === null ? null : (
          <Link to="/portal/shifts" className="block group">
            <div className="rounded-xl border border-dashed border-primary/20 bg-primary/[0.03] p-4 flex flex-col items-center justify-center h-full gap-1.5 press-scale">
              <CalendarDays className="h-5 w-5 text-primary/50" />
              <p className="text-[10px] text-primary/70 font-semibold text-center leading-tight">Sin turnos hoy</p>
              <span className="text-[9px] text-primary/50 font-medium flex items-center gap-0.5">
                Ver disponibles <ArrowRight className="h-2.5 w-2.5" />
              </span>
            </div>
          </Link>
        )}
      </div>

      {/* ── Period info ── */}
      {periodInfo && (
        <div className="rounded-xl border bg-card px-3.5 py-2.5 flex items-center gap-2.5">
          <div className={cn(
            "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
            periodInfo.status === "open" ? "bg-earning/8" :
            periodInfo.status === "closed" ? "bg-warning/8" : "bg-primary/8"
          )}>
            <CalendarDays className={cn("h-3.5 w-3.5",
              periodInfo.status === "open" ? "text-earning" :
              periodInfo.status === "closed" ? "text-warning" : "text-primary"
            )} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground font-medium">Periodo actual</p>
            <p className="text-[11px] font-semibold tabular-nums">{periodInfo.startDate} → {periodInfo.endDate}</p>
          </div>
          <Badge variant="outline" className={cn("text-[9px] shrink-0 h-5",
            periodInfo.status === "open" ? "border-earning/20 text-earning" :
            periodInfo.status === "closed" ? "border-warning/20 text-warning" : "border-primary/20 text-primary"
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full mr-1",
              periodInfo.status === "open" ? "bg-earning" :
              periodInfo.status === "closed" ? "bg-warning" : "bg-primary"
            )} />
            {periodInfo.status === "open" ? "Abierto" : periodInfo.status === "closed" ? "Cerrado" : "Publicado"}
          </Badge>
        </div>
      )}

      {/* ── Feed header ── */}
      <div className="flex items-center gap-2 pt-1">
        <Megaphone className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-xs font-semibold text-foreground tracking-tight">Muro</h2>
        <div className="flex-1 h-px bg-border/50 ml-1" />
      </div>

      {/* ── Feed ── */}
      {announcements.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Megaphone className="h-7 w-7 mx-auto mb-2 opacity-20" />
          <p className="text-xs">No hay publicaciones aún</p>
        </div>
      ) : (
        <div className="space-y-2.5">
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
                  "rounded-xl border bg-card overflow-hidden transition-all",
                  a.pinned && "border-primary/10",
                  a.priority === "urgent" && "border-destructive/20"
                )}
              >
                {a.priority === "urgent" && (
                  <div className="bg-destructive/6 px-3.5 py-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                    <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">Urgente</span>
                  </div>
                )}

                <div className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {a.pinned && <Pin className="h-2.5 w-2.5 text-primary shrink-0" />}
                        <h3 className="text-[13px] font-semibold text-foreground leading-snug">{a.title}</h3>
                        {fresh && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-primary text-primary-foreground shrink-0">
                            NUEVO
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(parseISO(a.published_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                    {(a.priority === "high" || a.priority === "important") && (
                      <span className={cn("flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-semibold shrink-0", pCfg.cls, pCfg.bgCls)}>
                        <PriorityIcon className="h-2.5 w-2.5" />
                        {pCfg.label}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-foreground/75 leading-relaxed whitespace-pre-wrap">{a.body}</p>

                  {/* Media */}
                  {mediaList.length > 0 && (
                    <div className={cn("grid gap-1.5", mediaList.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                      {mediaList.map((url, i) => (
                        <div key={i} className="relative rounded-lg overflow-hidden bg-muted">
                          {isVideo(url) ? (
                            <video src={url} controls preload="metadata" className="w-full max-h-56 object-cover rounded-lg">
                              Tu navegador no soporta video.
                            </video>
                          ) : (
                            <img
                              src={url} alt=""
                              className={cn("w-full object-cover rounded-lg cursor-pointer transition-transform hover:scale-[1.02]",
                                mediaList.length === 1 ? "max-h-72" : "max-h-44"
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
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline bg-primary/5 px-2.5 py-1.5 rounded-lg">
                      <ExternalLink className="h-3 w-3" />
                      {a.link_label || "Ver más"}
                    </a>
                  )}

                  {/* Reactions */}
                  <div className="flex items-center gap-1 pt-1 border-t border-border/40">
                    {annReactions.map(r => (
                      <button key={r.emoji} onClick={() => toggleReaction(a.id, r.emoji)}
                        className={cn("flex items-center gap-1 text-[11px] px-2 py-1 rounded-full transition-all",
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
                            className="p-1.5 rounded-full text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-all" title={opt.label}>
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
