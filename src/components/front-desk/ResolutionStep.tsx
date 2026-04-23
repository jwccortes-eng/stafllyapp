import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Clock, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinalResolution } from "@/hooks/useFrontDesk";

interface Props {
  lang: "es" | "en";
  loading?: boolean;
  onContinue: (resolution: FinalResolution, note?: string) => void;
  onBack?: () => void;
}

export function ResolutionStep({ lang, loading, onContinue, onBack }: Props) {
  const [pick, setPick] = useState<FinalResolution | null>(null);
  const [note, setNote] = useState("");

  const t = {
    title: lang === "es" ? "¿Quedó resuelto?" : "Was it resolved?",
    sub:
      lang === "es"
        ? "Cuéntanos cómo terminó tu visita"
        : "Tell us how your visit ended",
    resolved: lang === "es" ? "Sí, quedó resuelto" : "Yes, it's resolved",
    resolvedSub:
      lang === "es"
        ? "Todo listo, no necesito seguimiento"
        : "All done, no follow-up needed",
    pending: lang === "es" ? "Queda pendiente" : "Still pending",
    pendingSub:
      lang === "es"
        ? "Necesito que el equipo continúe el proceso"
        : "I need the team to continue the process",
    notePlaceholder:
      lang === "es"
        ? "(Opcional) Nota corta del estado…"
        : "(Optional) Short status note…",
    continue: lang === "es" ? "Continuar" : "Continue",
  };

  const options: Array<{
    key: FinalResolution;
    icon: typeof CheckCircle2;
    title: string;
    desc: string;
    accent: string;
  }> = [
    {
      key: "resolved",
      icon: CheckCircle2,
      title: t.resolved,
      desc: t.resolvedSub,
      accent: "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500",
    },
    {
      key: "pending_followup",
      icon: Clock,
      title: t.pending,
      desc: t.pendingSub,
      accent: "border-amber-500/40 bg-amber-500/5 hover:border-amber-500",
    },
  ];

  return (
    <Card className="rounded-3xl border-2 border-border/50 bg-card/75 p-6 sm:p-8 shadow-xl backdrop-blur-xl">
      <div className="flex items-start gap-3 mb-6">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl flex-shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t.sub}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {options.map(({ key, icon: Icon, title, desc, accent }) => (
          <button
            key={key}
            onClick={() => setPick(key)}
            className={cn(
              "group text-left p-5 rounded-2xl border-2 transition-all bg-card",
              "hover:shadow-md active:scale-[0.98]",
              accent,
              pick === key && "ring-2 ring-primary border-primary",
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0",
                key === "resolved" ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600",
              )}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base leading-tight">{title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">{desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t.notePlaceholder}
        rows={2}
        className="resize-none rounded-xl text-sm mb-4"
      />

      <Button
        size="lg"
        className="w-full h-12 rounded-xl"
        disabled={!pick || loading}
        onClick={() => pick && onContinue(pick, note.trim() || undefined)}
      >
        {loading ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> …</>
        ) : (
          <>{t.continue} <ArrowRight className="h-4 w-4 ml-2" /></>
        )}
      </Button>
    </Card>
  );
}
