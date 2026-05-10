import { useState } from "react";
import { Loader2, Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  type ShiftCloseout,
  type CloseoutRole,
  upsertShiftCloseoutDraft,
} from "@/lib/shifts/closeout";

interface Props {
  companyId: string;
  shiftId: string;
  userId: string;
  employeeId?: string | null;
  role: CloseoutRole;
  current: ShiftCloseout | null;
  onSaved: (next: ShiftCloseout) => void;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function CaptainCloseoutForm({
  companyId,
  shiftId,
  userId,
  employeeId,
  role,
  current,
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
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  const locked =
    current?.status === "reviewed" || current?.status === "rejected";

  async function save(status: "draft" | "submitted") {
    if (locked) return;
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
        status === "submitted" ? "Closeout submitted for review" : "Draft saved",
      );
      onSaved(next);
    } catch (e: any) {
      const msg = e?.message ?? "Failed to save closeout";
      if (msg.includes("closeout_review_admin_only")) {
        toast.error("Only admins can write review fields.");
      } else if (msg.includes("closeout_locked_for_review")) {
        toast.error("Closeout is locked after admin review.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/50 bg-card p-4">
      <div>
        <p className="text-sm font-semibold">Captain closeout</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
          Operational evidence only. This does not approve payroll or create
          time entries.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Staff present">
          <Input
            inputMode="numeric"
            value={staffCount}
            onChange={(e) => setStaffCount(e.target.value)}
            disabled={locked}
          />
        </Field>
        <Field label="No-shows">
          <Input
            inputMode="numeric"
            value={noShows}
            onChange={(e) => setNoShows(e.target.value)}
            disabled={locked}
          />
        </Field>
        <Field label="Late">
          <Input
            inputMode="numeric"
            value={late}
            onChange={(e) => setLate(e.target.value)}
            disabled={locked}
          />
        </Field>
        <Field label="Incidents">
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
        <span>Uniform OK</span>
      </label>

      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={locked}
          placeholder="Anything important about this shift…"
        />
      </Field>

      <Field label="Client feedback">
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
          disabled={locked}
          placeholder="Quotes or comments from the client (optional)"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={readyForReview}
          onCheckedChange={(v) => setReadyForReview(v === true)}
          disabled={locked}
        />
        <span>Ready for admin review</span>
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="flex-1 h-11 rounded-xl gap-2"
          onClick={() => save("draft")}
          disabled={busy !== null || locked}
        >
          {busy === "draft" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save draft
        </Button>
        <Button
          className="flex-1 h-11 rounded-xl gap-2"
          onClick={() => save("submitted")}
          disabled={busy !== null || locked}
        >
          {busy === "submit" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Submit for admin review
        </Button>
      </div>
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
