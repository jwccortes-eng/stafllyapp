import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, MapPin, Clock, Star, Award, Briefcase, Globe, Shield, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { downloadPassportPDF } from "@/lib/passport-pdf";

/**
 * Payload shape returned by `public.get_public_passport(p_slug)`.
 * Server-side gates (passport_publications + worker_visibility_settings) are
 * already applied — gated-off fields arrive as null/[]. The frontend only renders.
 *
 * The RPC NEVER returns: phone, email, address, employee_id, company_id,
 * user_id, payroll, time_entries, shifts, documents, SSN/EIN, PIN, internal IDs.
 */
interface PassportPayload {
  slug: string;
  display_name: string | null;
  primary_role: string | null;
  summary_text: string | null;
  passport_visibility: "public" | "limited";
  generated_at: string | null;
  english_level: string | null;
  avatar_url: string | null;
  city: string | null;
  overall_reputation_score: number | null;
  total_verified_jobs: number | null;
  total_verified_hours: number | null;
  total_companies_worked: number | null;
  skills: string[];
  languages: string[];
  metrics: Array<{
    metric_code: string;
    metric_label: string;
    metric_value: string | number;
    metric_display_order: number | null;
  }>;
  work_history: Array<{
    id: string;
    company_name: string | null;
    role_name: string | null;
    date_start: string | null;
    date_end: string | null;
    total_hours: number | null;
    is_verified: boolean;
  }>;
}

export default function PublicPassport() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PassportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const fetchPublicPassport = async () => {
      setLoading(true);
      const { data: payload, error } = await supabase.rpc("get_public_passport", {
        p_slug: slug,
      });

      if (error || !payload) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setData(payload as unknown as PassportPayload);
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
          ← Ir a Stafly Core
        </a>
      </div>
    );
  }

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const displayName = data.display_name ?? "Stafly Worker";

  // Reputation tier (only when score is exposed by the RPC).
  const repScore = data.overall_reputation_score;
  const tier = repScore == null
    ? null
    : repScore >= 90 ? { label: "Elite", color: "text-amber-500", bg: "bg-amber-500/10" }
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
            {data.avatar_url ? (
              <img
                src={data.avatar_url}
                alt={displayName}
                className="h-16 w-16 rounded-2xl object-cover border-2 border-primary/10"
              />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                {displayName[0]?.toUpperCase() ?? "?"}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate">{displayName}</h1>
              {data.primary_role && (
                <p className="text-sm text-muted-foreground mt-0.5">{data.primary_role}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {data.city && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {data.city}
                  </span>
                )}
                {tier && repScore != null && (
                  <Badge className={cn("text-[10px] font-semibold gap-1", tier.bg, tier.color, "border-0")}>
                    <Award className="h-3 w-3" /> {tier.label} · {repScore}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {data.summary_text && (
            <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{data.summary_text}</p>
          )}
        </div>

        {/* KPI metrics (server already filtered by gates) */}
        {data.metrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.metrics.map((m, i) => (
              <div key={`${m.metric_code}-${i}`} className="rounded-xl border border-border bg-card p-3.5 text-center">
                <p className="text-2xl font-bold text-foreground">{m.metric_value}</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{m.metric_label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-primary" /> Habilidades
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {data.skills.map((skill, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {data.languages.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-primary" /> Idiomas
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {data.languages.map((lang, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {lang}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Work History (server already gated) */}
        {data.work_history.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Briefcase className="h-4 w-4 text-primary" /> Historial Laboral
            </h2>
            <div className="space-y-4">
              {data.work_history.map((wh, i) => (
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
                      {wh.total_hours != null && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {Math.round(wh.total_hours)}h
                        </span>
                      )}
                      {wh.is_verified && (
                        <CheckCircle2 className="h-4 w-4 text-earning shrink-0" />
                      )}
                    </div>
                  </div>
                  {i < data.work_history.length - 1 && <Separator className="mt-4" />}
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
          <div className="flex items-center gap-4">
            <button
              onClick={() => { navigator.clipboard.writeText(pageUrl); }}
              className="text-xs text-primary hover:underline font-medium"
            >
              Copiar enlace
            </button>
            <button
              onClick={() => {
                downloadPassportPDF({
                  displayName,
                  primaryRole: data.primary_role,
                  summaryText: data.summary_text,
                  city: data.city,
                  repScore: data.overall_reputation_score,
                  tier: tier?.label ?? null,
                  metrics: data.metrics.map(m => ({ label: m.metric_label, value: String(m.metric_value) })),
                  skills: data.skills,
                  languages: data.languages,
                  workHistory: data.work_history.map(wh => ({
                    companyName: wh.company_name,
                    roleName: wh.role_name,
                    dateStart: wh.date_start,
                    dateEnd: wh.date_end,
                    totalHours: wh.total_hours,
                    isVerified: wh.is_verified,
                  })),
                  pageUrl,
                  generatedAt: data.generated_at,
                });
              }}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              <Download className="h-3.5 w-3.5" /> Descargar PDF
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-4 pb-8">
          <p className="text-[10px] text-muted-foreground">
            Perfil verificado por <a href="/" className="text-primary hover:underline font-medium">Stafly Core</a> · Generado {data.generated_at ? new Date(data.generated_at).toLocaleDateString("es") : "—"}
          </p>
        </div>
      </main>
    </div>
  );
}
