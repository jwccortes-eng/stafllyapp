import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  UserCog, AlertCircle, Wallet, FileText, KeyRound,
  Send, MessageSquare, HandCoins, MoreHorizontal, ArrowLeft, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IntakeReason } from "@/hooks/useFrontDesk";

interface Props {
  lang: "es" | "en";
  loading?: boolean;
  employeeName: string;
  onPick: (reason: IntakeReason) => void;
  onBack: () => void;
}

const OPTIONS: Array<{
  key: IntakeReason;
  icon: typeof UserCog;
  iconWrap: string;
  es: { title: string; desc: string };
  en: { title: string; desc: string };
}> = [
  {
    key: "update_data", icon: UserCog, iconWrap: "bg-primary/12 text-primary",
    es: { title: "Actualizar mis datos", desc: "Teléfono, dirección, contacto de emergencia" },
    en: { title: "Update my info", desc: "Phone, address, emergency contact" },
  },
  {
    key: "check_pending", icon: AlertCircle, iconWrap: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    es: { title: "Consultar pendientes", desc: "Documentos o información por completar" },
    en: { title: "Check pending items", desc: "Missing documents or info" },
  },
  {
    key: "payment_issue", icon: Wallet, iconWrap: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    es: { title: "Resolver tema de pago", desc: "Dudas sobre cheques o pagos" },
    en: { title: "Resolve a payment issue", desc: "Questions about checks or pay" },
  },
  {
    key: "documents_help", icon: FileText, iconWrap: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    es: { title: "Ayuda con documentos", desc: "Subir, corregir o entregar papeles" },
    en: { title: "Help with documents", desc: "Upload, fix or hand in papers" },
  },
  {
    key: "portal_help", icon: KeyRound, iconWrap: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    es: { title: "Ayuda con el portal", desc: "Acceso, contraseña o invitación" },
    en: { title: "Portal help", desc: "Access, password or invite" },
  },
  {
    key: "pickup_check", icon: HandCoins, iconWrap: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    es: { title: "Recoger un cheque", desc: "Vienes por tu pago" },
    en: { title: "Pick up a check", desc: "You're here for your pay" },
  },
  {
    key: "leave_request", icon: Send, iconWrap: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    es: { title: "Dejar una solicitud", desc: "Pedir algo al equipo" },
    en: { title: "Leave a request", desc: "Ask the team for something" },
  },
  {
    key: "leave_comment", icon: MessageSquare, iconWrap: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    es: { title: "Dejar un comentario", desc: "Sugerencias o feedback" },
    en: { title: "Leave a comment", desc: "Suggestions or feedback" },
  },
  {
    key: "other", icon: MoreHorizontal, iconWrap: "bg-muted text-muted-foreground",
    es: { title: "Otro motivo", desc: "Cuéntanos en pocas palabras" },
    en: { title: "Other reason", desc: "Tell us briefly" },
  },
];

export function IntakeReasonStep({ lang, loading, employeeName, onPick, onBack }: Props) {
  const title = lang === "es" ? "¿A qué viniste hoy?" : "What brings you here today?";
  const sub =
    lang === "es"
      ? `Hola ${employeeName.split(" ")[0]} 👋 Cuéntanos en qué te ayudamos`
      : `Hi ${employeeName.split(" ")[0]} 👋 Tell us how we can help`;

  return (
    <Card className="rounded-3xl border-2 border-border/50 bg-card/72 p-6 sm:p-8 shadow-xl backdrop-blur-xl">
      <div className="flex items-start gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{sub}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {OPTIONS.map(({ key, icon: Icon, iconWrap, es, en }) => {
          const t = lang === "es" ? es : en;
          return (
            <button
              key={key}
              disabled={loading}
              onClick={() => onPick(key)}
              className={cn(
                "group text-left p-4 rounded-2xl border-2 border-border bg-card",
                "hover:border-primary/60 hover:shadow-md hover:-translate-y-0.5",
                "active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm", iconWrap)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight">{t.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex justify-center mt-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </Card>
  );
}
