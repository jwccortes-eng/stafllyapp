import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RatingValue } from "@/hooks/useFrontDesk";

interface Props {
  lang: "es" | "en";
  loading?: boolean;
  onSubmit: (rating: RatingValue, comment?: string) => void;
  onSkip?: () => void;
}

const RATINGS: Array<{ key: RatingValue; emoji: string; es: string; en: string; ring: string }> = [
  { key: "excellent", emoji: "🤩", es: "Excelente", en: "Excellent", ring: "hover:border-emerald-500 data-[active=true]:border-emerald-500 data-[active=true]:bg-emerald-500/10" },
  { key: "good", emoji: "🙂", es: "Buena", en: "Good", ring: "hover:border-sky-500 data-[active=true]:border-sky-500 data-[active=true]:bg-sky-500/10" },
  { key: "regular", emoji: "😐", es: "Regular", en: "Okay", ring: "hover:border-amber-500 data-[active=true]:border-amber-500 data-[active=true]:bg-amber-500/10" },
  { key: "bad", emoji: "😞", es: "Mala", en: "Bad", ring: "hover:border-rose-500 data-[active=true]:border-rose-500 data-[active=true]:bg-rose-500/10" },
];

export function RatingStep({ lang, loading, onSubmit, onSkip }: Props) {
  const [pick, setPick] = useState<RatingValue | null>(null);
  const [comment, setComment] = useState("");

  const t = {
    title: lang === "es" ? "¿Cómo fue tu atención?" : "How was your visit?",
    sub: lang === "es" ? "Tu respuesta nos ayuda a mejorar" : "Your answer helps us improve",
    placeholder: lang === "es" ? "(Opcional) Comparte un comentario…" : "(Optional) Leave a comment…",
    submit: lang === "es" ? "Enviar" : "Submit",
    skip: lang === "es" ? "Omitir" : "Skip",
  };

  return (
    <Card className="rounded-3xl border-2 border-border/50 bg-card/75 p-6 sm:p-8 shadow-xl backdrop-blur-xl">
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t.sub}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {RATINGS.map((r) => (
          <button
            key={r.key}
            data-active={pick === r.key}
            onClick={() => setPick(r.key)}
            className={cn(
              "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-border bg-card",
              "transition-all active:scale-[0.97]",
              r.ring,
            )}
          >
            <span className="text-4xl leading-none">{r.emoji}</span>
            <span className="text-sm font-semibold">{lang === "es" ? r.es : r.en}</span>
          </button>
        ))}
      </div>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t.placeholder}
        rows={2}
        className="resize-none rounded-xl text-sm mb-4"
      />

      <div className="flex gap-3">
        {onSkip && (
          <Button variant="ghost" size="lg" onClick={onSkip} className="h-12 px-5 rounded-xl" disabled={loading}>
            {t.skip}
          </Button>
        )}
        <Button
          size="lg"
          className="flex-1 h-12 rounded-xl"
          disabled={!pick || loading}
          onClick={() => pick && onSubmit(pick, comment.trim() || undefined)}
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> …</>
          ) : (
            <>{t.submit} <ArrowRight className="h-4 w-4 ml-2" /></>
          )}
        </Button>
      </div>
    </Card>
  );
}
