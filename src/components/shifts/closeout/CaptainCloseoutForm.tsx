import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Save, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  type ShiftCloseout,
  type CloseoutRole,
  type EvidencePacket,
  upsertShiftCloseoutDraft,
} from "@/lib/shifts/closeout";
import {
  evaluateCloseoutGateFromEvidence,
  RECONCILIATION_LABEL,
} from "@/lib/shifts/closeout-gate";

interface Props {
  companyId: string;
  shiftId: string;
  userId: string;
  employeeId?: string | null;
  role: CloseoutRole;
  current: ShiftCloseout | null;
  evidence?: EvidencePacket | null;
  onSaved: (next: ShiftCloseout) => void;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

// ── Optional browser-native dictation. No storage, no upload. ─────────────
function getSpeechRecognitionCtor():
  | (new () => any)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) ?? null;
}

export function CaptainCloseoutForm({
  companyId,
  shiftId,
  userId,
  employeeId,
  role,
  current,
  evidence,
  onSaved,
}: Props) {
  const [staffCount, setStaffCount] = useState<string>(
    String(current?.staff_count_reported ?? 0),
  );
  const [noShows, setNoShows] = useState<string>(
    String(current?.no_show_count ?? 0),
  );
  const [late, setLate] = useState<string>(String(current?.late_count ?? 0));
  const [incidents, setIncidents] = useState<string>(
    String(current?.incident_count ?? 0),
  );
  const [uniformOk, setUniformOk] = useState<boolean>(
    current?.uniform_ok ?? true,
  );
  const [notes, setNotes] = useState<string>(current?.notes ?? "");
  const [feedback, setFeedback] = useState<string>(
    current?.client_feedback ?? "",
  );
  const [readyForReview, setReadyForReview] = useState<boolean>(
    current?.ready_for_admin_review ?? false,
  );
  const [acknowledged, setAcknowledged] = useState<boolean>(false);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  // Confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecks, setConfirmChecks] = useState({
    entries: false,
    exits: false,
    extras: false,
    incidents: false,
    notes: false,
    understand: false,
    final: false,
  });

  const locked =
    current?.status === "reviewed" || current?.status === "rejected";

  // P0-B · SINGLE CLOSEOUT GATE — un único validador canónico. El capitán
  // puede entregar su cierre operativo, pero eso jamás equivale a
  // FULLY_RECONCILED ni a PAYROLL_READY.
  const gate = useMemo(
    () =>
      evaluateCloseoutGateFromEvidence({
        shiftId,
        evidence: evidence
          ? {
              assigned: evidence.assigned,
              accepted: evidence.accepted,
              clockIns: evidence.clockIns,
              clockOuts: evidence.clockOuts,
              missingClockOut: evidence.missingClockOut,
              incidents: Math.max(evidence.incidents, num(incidents)),
              pendingReviewHours: evidence.pendingReviewHours,
            }
          : null,
        closeout: current,
        shiftEnded: true,
      }),
    [evidence, current, shiftId, incidents],
  );

  const hasUnresolved = useMemo(() => {
    const missingClockOut = evidence?.missingClockOut ?? 0;
    const noShow = num(noShows);
    const inc = num(incidents);
    return (
      !gate.canFullyReconcile || missingClockOut > 0 || noShow > 0 || inc > 0
    );
  }, [gate.canFullyReconcile, evidence?.missingClockOut, noShows, incidents]);

  // Dictation (Web Speech API only — optional, no storage)
  const SpeechRecognitionCtor = useMemo(() => getSpeechRecognitionCtor(), []);
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const notesBaseRef = useRef<string>("");

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  function toggleDictation() {
    if (!SpeechRecognitionCtor) return;
    if (listening) {
      try {
        recognitionRef.current?.stop?.();
      } catch {
        /* noop */
      }
      setListening(false);
      return;
    }
    try {
      const rec = new SpeechRecognitionCtor();
      rec.lang = "es-ES";
      rec.continuous = true;
      rec.interimResults = true;
      notesBaseRef.current = notes ? notes.replace(/\s+$/, "") + " " : "";
      rec.onresult = (e: any) => {
        let finalText = "";
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        setNotes(
          (notesBaseRef.current + finalText + interim).replace(/\s+/g, " "),
        );
        if (finalText) notesBaseRef.current += finalText;
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
      toast.info("Dictando… toca el micrófono para detener.");
    } catch {
      toast.error("Dictado no disponible en este navegador.");
      setListening(false);
    }
  }

  async function persist(status: "draft" | "submitted") {
    if (locked) return;
    if (status === "submitted" && hasUnresolved && !acknowledged) {
      toast.error("Confirma el aviso de pendientes antes de enviar.");
      return;
    }
    setBusy(status === "draft" ? "draft" : "submit");
    try {
      const next = await upsertShiftCloseoutDraft({
        company_id: companyId,
        shift_id: shiftId,
        submitted_by: userId,
        submitted_employee_id: employeeId ?? null,
        role,
        status,
        staff_count_reported: num(staffCount),
        no_show_count: num(noShows),
        late_count: num(late),
        incident_count: num(incidents),
        uniform_ok: uniformOk,
        notes: notes.trim() || null,
        client_feedback: feedback.trim() || null,
        ready_for_admin_review: status === "submitted" ? true : readyForReview,
      });
      toast.success(
        status === "submitted"
          ? "Cierre enviado a revisión de horas"
          : "Borrador guardado",
      );
      setConfirmOpen(false);
      onSaved(next);
    } catch (e: any) {
      const msg = e?.message ?? "No se pudo guardar el cierre";
      if (msg.includes("closeout_review_admin_only")) {
        toast.error("Solo administradores pueden modificar la revisión.");
      } else if (msg.includes("closeout_locked_for_review")) {
        toast.error("El cierre está bloqueado tras la revisión.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(null);
    }
  }

  function openConfirm() {
    if (hasUnresolved && !acknowledged) {
      toast.error("Confirma el aviso de pendientes antes de enviar.");
      return;
    }
    setConfirmChecks({
      entries: false,
      exits: false,
      extras: false,
      incidents: false,
      notes: false,
      understand: false,
      final: false,
    });
    setConfirmOpen(true);
  }

  const confirmReady = confirmChecks.final;

  return (
    <div className="space-y-4 rounded-2xl border border-border/50 bg-card p-4">
      <div>
        <p className="text-sm font-semibold">Cierre del turno</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
          Evidencia operativa. No aprueba payroll ni crea fichajes.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Personal presente">
          <Input
            inputMode="numeric"
            value={staffCount}
            onChange={(e) => setStaffCount(e.target.value)}
            disabled={locked}
          />
        </Field>
        <Field label="Faltas">
          <Input
            inputMode="numeric"
            value={noShows}
            onChange={(e) => setNoShows(e.target.value)}
            disabled={locked}
          />
        </Field>
        <Field label="Tarde">
          <Input
            inputMode="numeric"
            value={late}
            onChange={(e) => setLate(e.target.value)}
            disabled={locked}
          />
        </Field>
        <Field label="Incidencias">
          <Input
            inputMode="numeric"
            value={incidents}
            onChange={(e) => setIncidents(e.target.value)}
            disabled={locked}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={uniformOk}
          onCheckedChange={(v) => setUniformOk(v === true)}
          disabled={locked}
        />
        <span>Uniforme OK</span>
      </label>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Notas finales del encargado
          </Label>
          {SpeechRecognitionCtor ? (
            <Button
              type="button"
              size="sm"
              variant={listening ? "default" : "outline"}
              className="h-7 px-2 text-[11px] gap-1"
              onClick={toggleDictation}
              disabled={locked}
              aria-pressed={listening}
            >
              {listening ? (
                <>
                  <MicOff className="h-3 w-3" />
                  Detener
                </>
              ) : (
                <>
                  <Mic className="h-3 w-3" />
                  Dictar nota
                </>
              )}
            </Button>
          ) : null}
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={locked}
          placeholder="Agrega cualquier novedad importante para quien revisa las horas."
        />
        <p className="text-[10.5px] text-muted-foreground leading-snug">
          Recomendado cuando hay faltas, incidencias, salidas sin fichar o
          ajustes manuales.
        </p>
      </div>

      <Field label="Comentario del cliente">
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
          disabled={locked}
          placeholder="Citas o comentarios del cliente (opcional)"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={readyForReview}
          onCheckedChange={(v) => setReadyForReview(v === true)}
          disabled={locked}
        />
        <span>Listo para revisión de horas</span>
      </label>

      {hasUnresolved ? (
        <label className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-[12px]">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
            disabled={locked}
            className="mt-0.5"
          />
          <span className="text-amber-900 dark:text-amber-200 leading-snug">
            Acepto que los pendientes mostrados quedan registrados (faltas,
            incidencias y/o salidas sin fichar).
          </span>
        </label>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="flex-1 h-11 rounded-xl gap-2"
          onClick={() => persist("draft")}
          disabled={busy !== null || locked}
        >
          {busy === "draft" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Guardar borrador
        </Button>
        <Button
          className="flex-1 h-11 rounded-xl gap-2"
          onClick={openConfirm}
          disabled={busy !== null || locked}
        >
          <Send className="h-4 w-4" />
          Enviar a revisión
        </Button>
      </div>

      {/* Pre-submit confirmation */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !busy && setConfirmOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar cierre del turno</DialogTitle>
            <DialogDescription className="text-[12.5px] leading-snug">
              Revisa que entradas, salidas, novedades y notas estén correctas.
              Después de enviar, el cierre pasará a revisión de horas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-1">
            {(
              [
                ["entries", "Entradas revisadas"],
                ["exits", "Salidas revisadas"],
                ["extras", "Personas extras / no-shows revisados"],
                ["incidents", "Incidencias registradas"],
                ["notes", "Notas del turno agregadas"],
                ["understand", "Entiendo que este cierre pasará a revisión"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-start gap-2 text-[12.5px] leading-snug"
              >
                <Checkbox
                  checked={confirmChecks[key]}
                  onCheckedChange={(v) =>
                    setConfirmChecks((c) => ({ ...c, [key]: v === true }))
                  }
                  className="mt-0.5"
                />
                <span>{label}</span>
              </label>
            ))}

            <label className="mt-2 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-[12.5px] leading-snug">
              <Checkbox
                checked={confirmChecks.final}
                onCheckedChange={(v) =>
                  setConfirmChecks((c) => ({ ...c, final: v === true }))
                }
                className="mt-0.5"
              />
              <span className="font-medium">
                Confirmo que revisé el cierre y deseo enviarlo.
              </span>
            </label>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="sm:flex-1 h-11"
              onClick={() => setConfirmOpen(false)}
              disabled={busy !== null}
            >
              Seguir revisando
            </Button>
            <Button
              className="sm:flex-1 h-11 gap-2"
              onClick={() => persist("submitted")}
              disabled={!confirmReady || busy !== null}
            >
              {busy === "submit" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar a revisión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
