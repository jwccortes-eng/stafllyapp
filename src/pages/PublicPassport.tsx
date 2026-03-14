import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, MapPin, Clock, Building2, Star, Award, Briefcase, Globe, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

interface PassportData {
  passport: any;
  workHistory: any[];
  metrics: any[];
  publications: any;
  workerProfile: any;
}

export default function PublicPassport() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    const fetchPublicPassport = async () => {
      setLoading(true);

      // Fetch passport profile by slug
      const { data: passport, error } = await supabase
        .from("passport_profiles")
        .select("*")
        .eq("passport_slug", slug)
        .maybeSingle();

      if (error || !passport) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Check visibility
      if (passport.passport_visibility === "private") {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Fetch related data in parallel
      const [historyRes, metricsRes, pubsRes, wpRes] = await Promise.all([
        supabase
          .from("passport_work_history")
          .select("*")
          .eq("passport_id", passport.id)
          .order("date_start", { ascending: false }),
        supabase
          .from("passport_metrics")
          .select("*")
          .eq("passport_id", passport.id)
          .order("metric_display_order", { ascending: true }),
        supabase
          .from("passport_publications")
          .select("*")
          .eq("passport_id", passport.id)
          .maybeSingle(),
        supabase
          .from("worker_profiles")
          .select("city, skills, languages, avatar_url")
          .eq("id", passport.worker_profile_id)
          .maybeSingle(),
      ]);

      setData({
        passport,
        workHistory: historyRes.data ?? [],
        metrics: metricsRes.data ?? [],
        publications: pubsRes.data,
        workerProfile: wpRes.data,
      });
      setLoading(false);
    };

    fetchPublicPassport();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 gap-4 p-6 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
          <Shield className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Passport no disponible</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Este perfil no existe o es privado.
        </p>
        <a href="/" className="text-sm text-primary hover:underline font-medium mt-2">
          ← Ir a StaflyApps
        </a>
      </div>
    );
  }

  const { passport, workHistory, metrics, publications, workerProfile } = data;
  const pub = publications ?? {};
  const pageUrl = window.location.href;

  // Reputation tier
  const repScore = passport.overall_reputation_score ?? 50;
  const tier = repScore >= 90 ? { label: "Elite", color: "text-amber-500", bg: "bg-amber-500/10" }
    : repScore >= 75 ? { label: "Gold", color: "text-yellow-600", bg: "bg-yellow-500/10" }
    : repScore >= 60 ? { label: "Silver", color: "text-slate-500", bg: "bg-slate-500/10" }
    : { label: "Bronze", color: "text-orange-700", bg: "bg-orange-500/10" };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-2xl mx-auto flex items-center justify-between px-5 h-14">
          <a href="/" className="flex items-center gap-2">
            <StaflyLogo size={24} />
            <span className="text-xs font-medium text-muted-foreground">Worker Passport</span>
          </a>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Shield className="h-3 w-3" /> Verified
          </Badge>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8 space-y-6">
        {/* Profile card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            {pub.publish_photo !== false && workerProfile?.avatar_url ? (
              <img
                src={workerProfile.avatar_url}
                alt={passport.display_name}
                className="h-16 w-16 rounded-2xl object-cover border-2 border-primary/10"
              />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                {passport.display_name?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate">{passport.display_name}</h1>
              {passport.primary_role && (
                <p className="text-sm text-muted-foreground mt-0.5">{passport.primary_role}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {pub.publish_city !== false && workerProfile?.city && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {workerProfile.city}
                  </span>
                )}
                {pub.publish_reputation !== false && (
                  <Badge className={cn("text-[10px] font-semibold gap-1", tier.bg, tier.color, "border-0")}>
                    <Award className="h-3 w-3" /> {tier.label} · {repScore}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {passport.summary_text && (
            <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{passport.summary_text}</p>
          )}
        </div>

        {/* KPI metrics */}
        {metrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {metrics
              .filter(m => {
                if (m.metric_code === "total_hours" && pub.publish_hours === false) return false;
                if (m.metric_code === "total_companies" && pub.publish_companies_count === false) return false;
                if (m.metric_code === "rep_score" && pub.publish_reputation === false) return false;
                return true;
              })
              .map(m => (
                <div key={m.id} className="rounded-xl border border-border bg-card p-3.5 text-center">
                  <p className="text-2xl font-bold text-foreground">{m.metric_value}</p>
                  <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{m.metric_label}</p>
                </div>
              ))}
          </div>
        )}

        {/* Skills */}
        {pub.publish_skills !== false && workerProfile?.skills?.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-primary" /> Habilidades
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {workerProfile.skills.map((skill: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {pub.publish_languages !== false && workerProfile?.languages?.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-primary" /> Idiomas
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {workerProfile.languages.map((lang: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {lang}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Work History */}
        {pub.publish_work_history !== false && workHistory.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Briefcase className="h-4 w-4 text-primary" /> Historial Laboral
            </h2>
            <div className="space-y-4">
              {workHistory.map((wh, i) => (
                <div key={wh.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{wh.company_name}</p>
                      {wh.role_name && (
                        <p className="text-xs text-muted-foreground">{wh.role_name}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {wh.date_start ?? "—"} → {wh.date_end ?? "Presente"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {pub.publish_hours !== false && wh.total_hours != null && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {Math.round(wh.total_hours)}h
                        </span>
                      )}
                      {wh.is_verified && (
                        <CheckCircle2 className="h-4 w-4 text-earning shrink-0" />
                      )}
                    </div>
                  </div>
                  {i < workHistory.length - 1 && <Separator className="mt-4" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QR Code */}
        <div className="rounded-2xl border border-border bg-card p-5 flex flex-col items-center gap-3">
          <p className="text-xs font-semibold text-foreground">Compartir este Passport</p>
          <QRCodeSVG
            value={pageUrl}
            size={140}
            bgColor="transparent"
            fgColor="hsl(220,25%,15%)"
            level="M"
            includeMargin={false}
          />
          <p className="text-[10px] text-muted-foreground text-center max-w-xs">
            Escanea el código QR o comparte el enlace para verificar este perfil profesional.
          </p>
          <button
            onClick={() => { navigator.clipboard.writeText(pageUrl); }}
            className="text-xs text-primary hover:underline font-medium"
          >
            Copiar enlace
          </button>
        </div>

        {/* Footer */}
        <div className="text-center pt-4 pb-8">
          <p className="text-[10px] text-muted-foreground">
            Perfil verificado por <a href="/" className="text-primary hover:underline font-medium">StaflyApps</a> · Generado {passport.generated_at ? new Date(passport.generated_at).toLocaleDateString("es") : "—"}
          </p>
        </div>
      </main>
    </div>
  );
}
