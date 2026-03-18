import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Users, Link2 } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  exact_match: { label: "Exact Match", variant: "default" },
  probable_match: { label: "Probable", variant: "secondary" },
  duplicate_candidate: { label: "Duplicate?", variant: "outline" },
  manually_resolved: { label: "Manual", variant: "default" },
  unresolved: { label: "Unresolved", variant: "destructive" },
  pending: { label: "Pending", variant: "outline" },
};

interface Props {
  companyId: string | null;
  onRefresh: () => void;
}

export default function EmployeeMatchingTab({ companyId, onRefresh }: Props) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    supabase
      .from("migration_employee_mapping")
      .select("*, employee:employees!migration_employee_mapping_stafly_employee_id_fkey(first_name, last_name)")
      .eq("company_id", companyId)
      .order("match_status")
      .then(({ data }) => {
        setRecords(data || []);
        setLoading(false);
      });
  }, [companyId]);

  const filtered = records.filter(r => {
    const text = `${r.connecteam_name || ""} ${r.connecteam_email || ""} ${r.employee?.first_name || ""} ${r.employee?.last_name || ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const counts = {
    total: records.length,
    matched: records.filter(r => ["exact_match", "probable_match", "manually_resolved"].includes(r.match_status)).length,
    unresolved: records.filter(r => r.match_status === "unresolved" || r.match_status === "pending").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2">
          <Badge variant="secondary">{counts.total} total</Badge>
          <Badge variant="default">{counts.matched} matched</Badge>
          {counts.unresolved > 0 && <Badge variant="destructive">{counts.unresolved} unresolved</Badge>}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No employee mappings" description="Import Connecteam data to start matching employees." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Connecteam Name</TableHead>
                <TableHead>Phone / Email</TableHead>
                <TableHead>StaflyApps Match</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const s = STATUS_MAP[r.match_status] || STATUS_MAP.pending;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.connecteam_name || r.connecteam_ref}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.connecteam_phone && <div>{r.connecteam_phone}</div>}
                      {r.connecteam_email && <div>{r.connecteam_email}</div>}
                    </TableCell>
                    <TableCell>
                      {r.employee ? (
                        <span className="flex items-center gap-1">
                          <Link2 className="h-3 w-3 text-primary" />
                          {r.employee.first_name} {r.employee.last_name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.match_method || "—"}</TableCell>
                    <TableCell>
                      {r.match_confidence != null ? `${r.match_confidence}%` : "—"}
                    </TableCell>
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
