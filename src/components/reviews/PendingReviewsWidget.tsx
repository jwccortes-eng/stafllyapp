import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { ShiftReviewForm } from "./ShiftReviewForm";
import { Star, Clock, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface PendingReview {
  shift_id: string;
  employee_id: string;
  employee_name: string;
  employee_avatar: string | null;
  shift_title: string;
  shift_date: string;
  clock_out: string;
}

export function PendingReviewsWidget() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewTarget, setReviewTarget] = useState<PendingReview | null>(null);

  useEffect(() => {
    if (!selectedCompanyId || !user) return;
    loadPending();
  }, [selectedCompanyId, user]);

  async function loadPending() {
    setLoading(true);

    // Get recent completed time entries (last 14 days) that don't have a manager review
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const { data: entries } = await supabase
      .from("time_entries")
      .select("id, employee_id, shift_id, clock_out, company_id")
      .eq("company_id", selectedCompanyId!)
      .eq("status", "approved")
      .not("clock_out", "is", null)
      .gte("clock_out", twoWeeksAgo.toISOString())
      .order("clock_out", { ascending: false })
      .limit(100);

    if (!entries || entries.length === 0) {
      setPending([]);
      setLoading(false);
      return;
    }

    // Get existing reviews for these shifts
    const shiftIds = [...new Set(entries.filter(e => e.shift_id).map(e => e.shift_id!))];
    const employeeIds = [...new Set(entries.map(e => e.employee_id))];

    const [reviewsRes, empsRes, shiftsRes] = await Promise.all([
      shiftIds.length > 0
        ? supabase
            .from("shift_reviews")
            .select("shift_id, reviewed_employee_id")
            .in("shift_id", shiftIds)
            .eq("reviewer_type", "manager")
        : Promise.resolve({ data: [] }),
      supabase
        .from("employees")
        .select("id, first_name, last_name, avatar_url")
        .in("id", employeeIds),
      shiftIds.length > 0
        ? supabase
            .from("scheduled_shifts")
            .select("id, title, date")
            .in("id", shiftIds)
        : Promise.resolve({ data: [] }),
    ]);

    const reviewed = new Set(
      (reviewsRes.data ?? []).map(r => `${r.shift_id}_${r.reviewed_employee_id}`)
    );
    const empMap: Record<string, any> = {};
    (empsRes.data ?? []).forEach(e => { empMap[e.id] = e; });
    const shiftMap: Record<string, any> = {};
    (shiftsRes.data ?? []).forEach(s => { shiftMap[s.id] = s; });

    const pendingList: PendingReview[] = [];
    for (const entry of entries) {
      if (!entry.shift_id) continue;
      const key = `${entry.shift_id}_${entry.employee_id}`;
      if (reviewed.has(key)) continue;
      // Avoid duplicates (same shift+employee)
      if (pendingList.some(p => p.shift_id === entry.shift_id && p.employee_id === entry.employee_id)) continue;

      const emp = empMap[entry.employee_id];
      const shift = shiftMap[entry.shift_id];
      if (!emp) continue;

      pendingList.push({
        shift_id: entry.shift_id,
        employee_id: entry.employee_id,
        employee_name: `${emp.first_name} ${emp.last_name}`,
        employee_avatar: emp.avatar_url,
        shift_title: shift?.title || "Turno",
        shift_date: shift?.date || entry.clock_out!.split("T")[0],
        clock_out: entry.clock_out!,
      });
    }

    setPending(pendingList);
    setLoading(false);
  }

  if (loading || pending.length === 0) return null;

  return (
    <>
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            Evaluaciones pendientes
            <span className="ml-auto bg-amber-500 text-amber-50 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {pending.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.slice(0, 5).map((p) => {
            const nameParts = p.employee_name.split(" ");
            return (
              <button
                key={`${p.shift_id}_${p.employee_id}`}
                onClick={() => setReviewTarget(p)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-background/80 transition-colors text-left group"
              >
                <EmployeeAvatar
                  firstName={nameParts[0]}
                  lastName={nameParts[1] || ""}
                  avatarUrl={p.employee_avatar}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.employee_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {p.shift_title} · {format(parseISO(p.shift_date), "d MMM", { locale: es })}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
              </button>
            );
          })}
          {pending.length > 5 && (
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              +{pending.length - 5} más pendientes
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Evaluar a {reviewTarget?.employee_name}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {reviewTarget?.shift_title} · {reviewTarget?.shift_date && format(parseISO(reviewTarget.shift_date), "d MMMM yyyy", { locale: es })}
            </p>
          </DialogHeader>
          {reviewTarget && user && (
            <ShiftReviewForm
              shiftId={reviewTarget.shift_id}
              companyId={selectedCompanyId!}
              reviewerType="manager"
              reviewerId={user.id}
              reviewedEmployeeId={reviewTarget.employee_id}
              onSuccess={() => {
                setReviewTarget(null);
                setPending(prev => prev.filter(
                  p => !(p.shift_id === reviewTarget.shift_id && p.employee_id === reviewTarget.employee_id)
                ));
              }}
              onCancel={() => setReviewTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
