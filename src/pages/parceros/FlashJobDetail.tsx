import { useState, useEffect } from "react";
import { safeRandomUUID } from "@/lib/safe-storage";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChevronLeft, Zap, MapPin, Clock, DollarSign, Users, Loader2,
  CheckCircle2, AlertTriangle, Timer, Send, Star,
} from "lucide-react";
import { format, formatDistanceToNow, isPast, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";

interface FlashJobDetail {
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
  requirements: string[] | null;
  expires_at: string;
  status: string;
  posted_by: string;
  created_at: string;
}

interface JobResponse {
  id: string;
  flash_job_id: string;
  user_id: string;
  status: string;
  message: string | null;
  responded_at: string;
}

const URGENCY_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  urgent: { color: "text-red-500", label: "URGENTE", bg: "bg-red-500/10 border-red-500/30" },
  high: { color: "text-orange-500", label: "PRIORIDAD ALTA", bg: "bg-orange-500/10 border-orange-500/30" },
  normal: { color: "text-primary", label: "NORMAL", bg: "bg-primary/10 border-primary/30" },
};

export default function FlashJobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob] = useState<FlashJobDetail | null>(null);
  const [myResponse, setMyResponse] = useState<JobResponse | null>(null);
  const [responses, setResponses] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [responseMessage, setResponseMessage] = useState("");
  const [showResponseForm, setShowResponseForm] = useState(false);
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!id) return;
    loadJob();
  }, [id]);

  // Live countdown
  useEffect(() => {
    if (!job) return;
    const timer = setInterval(() => {
      const expiresAt = new Date(job.expires_at);
      if (isPast(expiresAt)) {
        setCountdown("Expirado");
        clearInterval(timer);
        return;
      }
      const mins = differenceInMinutes(expiresAt, new Date());
      if (mins > 60) {
        setCountdown(`${Math.floor(mins / 60)}h ${mins % 60}m`);
      } else {
        setCountdown(`${mins}m`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [job]);

  // Realtime for responses
  useEffect(() => {
    if (!id) return;
    const sub = supabase
      .channel(`flash-job-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_job_responses", filter: `flash_job_id=eq.${id}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const newResp = payload.new as JobResponse;
          setResponses((prev) => [...prev, newResp]);
          if (newResp.user_id === user?.id) setMyResponse(newResp);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "flash_jobs", filter: `id=eq.${id}` }, (payload) => {
        setJob(payload.new as FlashJobDetail);
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [id, user?.id]);

  const loadJob = async () => {
    if (!id || !user) return;
    setLoading(true);

    const [jobRes, myResRes, allResRes] = await Promise.all([
      supabase.from("flash_jobs").select("*").eq("id", id).single(),
      supabase.from("flash_job_responses").select("*").eq("flash_job_id", id).eq("user_id", user.id).maybeSingle(),
      // Only load all responses if user is the poster
      supabase.from("flash_job_responses").select("*").eq("flash_job_id", id).order("responded_at", { ascending: true }),
    ]);

    setJob(jobRes.data as FlashJobDetail | null);
    setMyResponse(myResRes.data as JobResponse | null);
    setResponses((allResRes.data as JobResponse[]) ?? []);
    setLoading(false);
  };

  const handleRespond = async () => {
    if (!id || !user || responding) return;
    setResponding(true);

    const { error } = await supabase.from("flash_job_responses").insert({
      flash_job_id: id,
      user_id: user.id,
      status: "interested",
      message: responseMessage.trim() || null,
    });

    if (!error) {
      setMyResponse({
        id: crypto.randomUUID(),
        flash_job_id: id,
        user_id: user.id,
        status: "interested",
        message: responseMessage.trim() || null,
        responded_at: new Date().toISOString(),
      });
      setShowResponseForm(false);
    }

    setResponding(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <h1 className="text-lg font-bold text-foreground">Trabajo no encontrado</h1>
        <Button variant="outline" onClick={() => navigate("/parceros")} className="mt-4">Volver</Button>
      </div>
    );
  }

  const expired = isPast(new Date(job.expires_at));
  const slotsLeft = job.slots_total - job.slots_filled;
  const urgencyCfg = URGENCY_CONFIG[job.urgency_level] ?? URGENCY_CONFIG.normal;
  const isOwner = job.posted_by === user?.id;
  const alreadyResponded = !!myResponse;
  const slotsPercent = (job.slots_filled / job.slots_total) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card border-b border-border/40 px-3 py-2.5 safe-top">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/parceros")} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <Zap className="h-5 w-5 text-amber-500" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">Flash Job</h1>
          </div>
          {!expired && countdown && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10">
              <Timer className="h-3 w-3 text-red-500" />
              <span className="text-[10px] font-bold text-red-500 tabular-nums">{countdown}</span>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 space-y-5">
        {/* Urgency Banner */}
        <div className={cn("flex items-center gap-2 p-3 rounded-xl border", urgencyCfg.bg)}>
          <AlertTriangle className={cn("h-4 w-4 shrink-0", urgencyCfg.color)} />
          <span className={cn("text-xs font-bold", urgencyCfg.color)}>{urgencyCfg.label}</span>
          {expired && <Badge variant="secondary" className="ml-auto text-[9px]">Expirado</Badge>}
        </div>

        {/* Title + Pay */}
        <div>
          <h2 className="text-xl font-heading font-black text-foreground">{job.title}</h2>
          {job.description && (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{job.description}</p>
          )}
        </div>

        {/* Key Info Cards */}
        <div className="grid grid-cols-2 gap-3">
          {job.pay_amount && (
            <InfoCard icon={<DollarSign className="h-4 w-4 text-earning" />} label="Pago" value={`$${job.pay_amount}/${job.pay_type === "hourly" ? "hr" : job.pay_type}`} />
          )}
          <InfoCard icon={<Clock className="h-4 w-4 text-primary" />} label="Horario" value={`${job.start_time?.slice(0, 5) ?? "—"} - ${job.end_time?.slice(0, 5) ?? "—"}`} />
          {job.location && (
            <InfoCard icon={<MapPin className="h-4 w-4 text-orange-500" />} label="Ubicación" value={job.location} />
          )}
          <InfoCard
            icon={<Users className="h-4 w-4 text-blue-500" />}
            label="Cupos"
            value={`${slotsLeft} de ${job.slots_total} disponibles`}
          />
        </div>

        {/* Slots Progress */}
        <div className="bg-card border border-border/60 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">Cupos ocupados</span>
            <span className="text-xs font-bold text-primary">{job.slots_filled}/{job.slots_total}</span>
          </div>
          <Progress value={slotsPercent} className="h-2" />
          {slotsLeft <= 2 && slotsLeft > 0 && (
            <p className="text-[10px] font-bold text-red-500 mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> ¡Quedan pocos cupos!
            </p>
          )}
        </div>

        {/* Requirements */}
        {job.requirements && job.requirements.length > 0 && (
          <div className="bg-card border border-border/60 rounded-xl p-4">
            <h3 className="text-xs font-bold text-foreground mb-2">Requisitos</h3>
            <div className="flex flex-wrap gap-1.5">
              {job.requirements.map((req, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{req}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Date */}
        <div className="bg-muted/30 rounded-xl p-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {format(new Date(job.job_date), "EEEE d 'de' MMMM, yyyy", { locale: es })}
          </span>
        </div>

        {/* Response Status */}
        {alreadyResponded && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-bold text-foreground">¡Respondiste a esta oportunidad!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Estado: <span className="font-semibold text-primary capitalize">{myResponse?.status}</span>
              </p>
            </div>
          </div>
        )}

        {/* Responses count for owner */}
        {isOwner && responses.length > 0 && (
          <div className="bg-card border border-border/60 rounded-xl p-4">
            <h3 className="text-xs font-bold text-foreground mb-2">
              Respuestas ({responses.length})
            </h3>
            <div className="space-y-2">
              {responses.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{r.user_id.slice(0, 8)}...</p>
                    {r.message && <p className="text-[10px] text-muted-foreground">{r.message}</p>}
                  </div>
                  <Badge variant="outline" className="text-[9px] capitalize">{r.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Response Form */}
        {showResponseForm && !alreadyResponded && (
          <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            <h3 className="text-sm font-bold text-foreground">Responder a esta oportunidad</h3>
            <Textarea
              value={responseMessage}
              onChange={(e) => setResponseMessage(e.target.value)}
              placeholder="Mensaje opcional (experiencia, disponibilidad...)"
              className="min-h-[60px] rounded-xl text-sm"
              maxLength={500}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowResponseForm(false)} className="flex-1 h-10 rounded-xl">
                Cancelar
              </Button>
              <Button onClick={handleRespond} disabled={responding} className="flex-1 h-10 rounded-xl text-primary-foreground">
                {responding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Estoy disponible"}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom CTA */}
      {!expired && !alreadyResponded && !isOwner && slotsLeft > 0 && !showResponseForm && (
        <footer className="sticky bottom-0 bg-card border-t border-border/40 px-4 py-3 safe-bottom">
          <div className="max-w-2xl mx-auto">
            <Button
              onClick={() => setShowResponseForm(true)}
              className="w-full h-12 rounded-xl text-primary-foreground text-base font-bold shadow-lg"
            >
              <Zap className="h-5 w-5 mr-2" /> Estoy disponible
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}
