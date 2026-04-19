import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ParcerosHeader } from "@/components/parceros/ParcerosHeader";
import {
  Search, MapPin, Users, Clock, Loader2, Radio, TrendingUp, ChevronRight,
  Hash, Briefcase, AlertTriangle, Zap,
} from "lucide-react";
import { formatDistanceToNow, isPast } from "date-fns";
import { es } from "date-fns/locale";

/* ─── Types ─── */
interface Channel {
  id: string;
  name: string;
  zone: string;
  category: string;
  description: string | null;
  icon: string;
  member_count: number;
  is_active: boolean;
}

interface FlashJob {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  zone: string | null;
  category: string;
  job_date: string;
  start_time: string | null;
  end_time: string | null;
  pay_amount: number | null;
  pay_type: string;
  slots_total: number;
  slots_filled: number;
  urgency_level: string;
  expires_at: string;
  status: string;
  posted_by: string;
  created_at: string;
}

const ZONE_COLORS: Record<string, string> = {
  queens: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  brooklyn: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  bronx: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  manhattan: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  "staten-island": "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

const URGENCY_CONFIG: Record<string, { color: string; label: string }> = {
  urgent: { color: "bg-red-500 text-white", label: "URGENTE" },
  high: { color: "bg-orange-500 text-white", label: "ALTA" },
  normal: { color: "bg-primary text-primary-foreground", label: "NORMAL" },
};

export default function ParcerosCommunity() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [flashJobs, setFlashJobs] = useState<FlashJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"radar" | "channels" | "flash">("radar");

  useEffect(() => {
    loadData();

    // Realtime for flash jobs
    const channel = supabase
      .channel("flash-jobs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_jobs" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setFlashJobs((prev) => [payload.new as FlashJob, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setFlashJobs((prev) => prev.map((j) => (j.id === (payload.new as FlashJob).id ? (payload.new as FlashJob) : j)));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [channelsRes, jobsRes] = await Promise.all([
      supabase.from("community_channels").select("*").eq("is_active", true).order("member_count", { ascending: false }),
      supabase.from("flash_jobs").select("*").in("status", ["open"]).order("created_at", { ascending: false }).limit(20),
    ]);
    setChannels((channelsRes.data as Channel[]) ?? []);
    setFlashJobs((jobsRes.data as FlashJob[]) ?? []);
    setLoading(false);
  };

  const filteredChannels = channels.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.zone.toLowerCase().includes(search.toLowerCase())
  );

  const filteredJobs = flashJobs.filter(
    (j) => !search || j.title.toLowerCase().includes(search.toLowerCase()) || (j.zone ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <ParcerosHeader
        subtitle={`${channels.length} canales activos · Tu comunidad de trabajo`}
      />

      {/* Search bar */}
      <div className="px-4 py-3 bg-card/40 border-b border-border/30">
        <div className="max-w-2xl mx-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar canales, trabajos, zonas..."
            className="pl-10 h-10 bg-background/60 border-border/40 rounded-xl"
          />
        </div>
      </div>

      {/* Tab Nav */}
      <nav className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border/40 px-4">
        <div className="max-w-2xl mx-auto flex">
          {(
            [
              { key: "radar", label: "Radar", icon: Zap },
              { key: "channels", label: "Canales", icon: Hash },
              { key: "flash", label: "Flash Jobs", icon: Briefcase },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 transition-colors",
                activeTab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {key === "flash" && filteredJobs.length > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {filteredJobs.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 space-y-4 overflow-y-auto">
        {activeTab === "radar" && (
          <RadarFeed channels={filteredChannels} flashJobs={filteredJobs} navigate={navigate} />
        )}
        {activeTab === "channels" && (
          <ChannelList channels={filteredChannels} navigate={navigate} />
        )}
        {activeTab === "flash" && (
          <FlashJobList jobs={filteredJobs} navigate={navigate} userId={user?.id} />
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════ */
/*  RADAR FEED                                    */
/* ═══════════════════════════════════════════════ */

function RadarFeed({ channels, flashJobs, navigate }: { channels: Channel[]; flashJobs: FlashJob[]; navigate: any }) {
  const urgentJobs = flashJobs.filter((j) => j.urgency_level === "urgent" || j.urgency_level === "high");

  return (
    <div className="space-y-5">
      {/* Urgent Section */}
      {urgentJobs.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-sm font-bold text-foreground">Trabajos urgentes</h2>
            <Badge variant="destructive" className="text-[9px] h-4">{urgentJobs.length}</Badge>
          </div>
          <div className="space-y-2">
            {urgentJobs.slice(0, 3).map((job) => (
              <FlashJobCard key={job.id} job={job} onTap={() => navigate(`/parceros/flash/${job.id}`)} compact />
            ))}
          </div>
        </section>
      )}

      {/* Active Channels */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Canales activos
          </h2>
          <button onClick={() => navigate("/parceros")} className="text-[10px] font-semibold text-primary">
            Ver todos
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {channels.slice(0, 4).map((ch) => (
            <ChannelCard key={ch.id} channel={ch} onTap={() => navigate(`/parceros/channel/${ch.id}`)} />
          ))}
        </div>
      </section>

      {/* Recent Flash Jobs */}
      {flashJobs.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" /> Oportunidades recientes
            </h2>
          </div>
          <div className="space-y-2">
            {flashJobs.slice(0, 5).map((job) => (
              <FlashJobCard key={job.id} job={job} onTap={() => navigate(`/parceros/flash/${job.id}`)} />
            ))}
          </div>
        </section>
      )}

      {flashJobs.length === 0 && channels.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-base font-heading font-bold text-foreground">La comunidad está arrancando</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Pronto verás canales por zona, oportunidades de trabajo y más.
          </p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  CHANNEL LIST                                  */
/* ═══════════════════════════════════════════════ */

function ChannelList({ channels, navigate }: { channels: Channel[]; navigate: any }) {
  const zones = [...new Set(channels.map((c) => c.zone))];

  return (
    <div className="space-y-5">
      {zones.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Hash className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <h3 className="text-sm font-bold text-foreground">No hay canales disponibles</h3>
          <p className="text-xs text-muted-foreground mt-1">Los canales serán creados por administradores.</p>
        </div>
      )}
      {zones.map((zone) => (
        <section key={zone}>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /> {zone}
          </h3>
          <div className="space-y-2">
            {channels
              .filter((c) => c.zone === zone)
              .map((ch) => (
                <ChannelCard key={ch.id} channel={ch} onTap={() => navigate(`/parceros/channel/${ch.id}`)} wide />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  FLASH JOB LIST                                */
/* ═══════════════════════════════════════════════ */

function FlashJobList({ jobs, navigate, userId }: { jobs: FlashJob[]; navigate: any; userId?: string }) {
  return (
    <div className="space-y-3">
      {jobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Zap className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <h3 className="text-sm font-bold text-foreground">Sin trabajos flash por ahora</h3>
          <p className="text-xs text-muted-foreground mt-1">Los trabajos urgentes aparecerán aquí en tiempo real.</p>
        </div>
      )}
      {jobs.map((job) => (
        <FlashJobCard key={job.id} job={job} onTap={() => navigate(`/parceros/flash/${job.id}`)} />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  CARDS                                         */
/* ═══════════════════════════════════════════════ */

function ChannelCard({ channel, onTap, wide }: { channel: Channel; onTap: () => void; wide?: boolean }) {
  const zoneStyle = ZONE_COLORS[channel.zone.toLowerCase()] ?? "bg-muted text-muted-foreground border-border/40";
  return (
    <button
      onClick={onTap}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-accent/30 transition-all text-left w-full",
        wide ? "" : "flex-col items-start"
      )}
    >
      <div className={cn("text-2xl", wide ? "" : "mb-1")}>{channel.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{channel.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="outline" className={cn("text-[9px] h-4 border", zoneStyle)}>
            {channel.zone}
          </Badge>
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Users className="h-2.5 w-2.5" /> {channel.member_count}
          </span>
        </div>
      </div>
      {wide && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
    </button>
  );
}

function FlashJobCard({ job, onTap, compact }: { job: FlashJob; onTap: () => void; compact?: boolean }) {
  const expired = isPast(new Date(job.expires_at));
  const slotsLeft = job.slots_total - job.slots_filled;
  const urgencyCfg = URGENCY_CONFIG[job.urgency_level] ?? URGENCY_CONFIG.normal;

  return (
    <button
      onClick={onTap}
      disabled={expired}
      className={cn(
        "w-full text-left p-3 rounded-xl border transition-all",
        expired
          ? "bg-muted/30 border-border/30 opacity-60"
          : "bg-card border-border/60 hover:border-primary/40 hover:shadow-sm"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={cn("text-[9px] h-4 font-bold", urgencyCfg.color)}>{urgencyCfg.label}</Badge>
            {slotsLeft <= 2 && slotsLeft > 0 && (
              <span className="text-[9px] font-bold text-red-500 flex items-center gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" /> ¡{slotsLeft} cupo{slotsLeft > 1 ? "s" : ""}!
              </span>
            )}
          </div>
          <h3 className="text-sm font-bold text-foreground truncate">{job.title}</h3>
          {!compact && job.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{job.description}</p>
          )}
        </div>
        {job.pay_amount && (
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-earning">${job.pay_amount}</p>
            <p className="text-[9px] text-muted-foreground">/{job.pay_type === "hourly" ? "hr" : job.pay_type}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
        {job.location && (
          <span className="flex items-center gap-0.5">
            <MapPin className="h-2.5 w-2.5" /> {job.location}
          </span>
        )}
        <span className="flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5" />
          {job.start_time?.slice(0, 5)}{job.end_time ? ` - ${job.end_time.slice(0, 5)}` : ""}
        </span>
        <span className="flex items-center gap-0.5">
          <Users className="h-2.5 w-2.5" /> {job.slots_filled}/{job.slots_total}
        </span>
        {!expired && (
          <span className="ml-auto text-[9px] font-medium text-primary">
            {formatDistanceToNow(new Date(job.expires_at), { locale: es, addSuffix: false })}
          </span>
        )}
      </div>

      {/* Slots progress */}
      <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", slotsLeft === 0 ? "bg-muted-foreground" : "bg-primary")}
          style={{ width: `${(job.slots_filled / job.slots_total) * 100}%` }}
        />
      </div>
    </button>
  );
}
