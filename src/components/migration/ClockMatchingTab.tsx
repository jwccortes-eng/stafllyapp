import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Clock } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  exact_match: { label: "Exact", variant: "default" },
  within_tolerance: { label: "Within Tolerance", variant: "secondary" },
  missing_clock_in: { label: "No Clock In", variant: "destructive" },
  missing_clock_out: { label: "No Clock Out", variant: "destructive" },
  orphan_clock: { label: "Orphan", variant: "outline" },
  duration_mismatch: { label: "Duration ≠", variant: "destructive" },
  manually_resolved: { label: "Resolved", variant: "default" },
  unresolved: { label: "Unresolved", variant: "destructive" },
  pending: { label: "Pending", variant: "outline" },
};

interface Props { companyId: string | null; onRefresh: () => void; }

export default function ClockMatchingTab({ companyId, onRefresh }: Props) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    supabase
      .from("migration_clock_mapping")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => { setRecords(data || []); setLoading(false); });
  }, [companyId]);

  const filtered = records.filter(r => {
    const d = r.connecteam_data || {};
    return `${d.employee_name || ""} ${d.date || ""} ${r.connecteam_ref}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2">
          <Badge variant="secondary">{records.length} total</Badge>
          <Badge variant="default">{records.filter(r => ["exact_match", "within_tolerance", "manually_resolved"].includes(r.match_status)).length} matched</Badge>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search clock records..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Clock} title="No clock mappings" description="Import Connecteam time clock data to start matching." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CT Ref</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>CT Hours</TableHead>
                <TableHead>Tolerance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 100).map(r => {
                const d = r.connecteam_data || {};
                const s = STATUS_MAP[r.match_status] || STATUS_MAP.pending;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground font-mono">{r.connecteam_ref?.slice(0, 12)}</TableCell>
                    <TableCell className="font-medium">{d.employee_name || "—"}</TableCell>
                    <TableCell>{d.date || "—"}</TableCell>
                    <TableCell>{d.hours != null ? `${d.hours}h` : "—"}</TableCell>
                    <TableCell>{r.tolerance_minutes != null ? `${r.tolerance_minutes}min` : "—"}</TableCell>
                    <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
