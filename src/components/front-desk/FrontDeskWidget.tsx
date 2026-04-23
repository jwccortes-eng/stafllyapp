/**
 * Compact widget for Operations Command Center showing today's Front Desk activity.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Star, AlertCircle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

interface Stats {
  total: number;
  uniqueEmployees: number;
  avgRating: number | null;
  pendingFollowups: number;
}

export function FrontDeskWidget() {
  const { selectedCompanyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ total: 0, uniqueEmployees: 0, avgRating: null, pendingFollowups: 0 });

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    supabase
      .from("office_visits")
      .select("employee_id, rating_score, status")
      .eq("company_id", selectedCompanyId)
      .gte("checked_in_at", since)
      .then(({ data, error }) => {
        if (error || !data) {
          setStats({ total: 0, uniqueEmployees: 0, avgRating: null, pendingFollowups: 0 });
        } else {
          const rated = data.filter((v) => v.rating_score != null);
          const avg = rated.length
            ? Math.round((rated.reduce((acc, v) => acc + (v.rating_score ?? 0), 0) / rated.length) * 10) / 10
            : null;
          setStats({
            total: data.length,
            uniqueEmployees: new Set(data.map((d) => d.employee_id)).size,
            avgRating: avg,
            pendingFollowups: data.filter((v) => v.status === "pending_followup").length,
          });
        }
        setLoading(false);
      });
  }, [selectedCompanyId]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Front Desk hoy
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="h-8 -mr-2">
          <Link to="/app/front-desk">
            Ver <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Mini label="Visitas" value={stats.total} />
            <Mini label="Empleados" value={stats.uniqueEmployees} />
            <Mini
              label="Satisfacción"
              value={stats.avgRating != null ? `${stats.avgRating}/5` : "—"}
              icon={<Star className="h-3 w-3" />}
            />
            <Mini
              label="Seguimientos"
              value={stats.pendingFollowups}
              icon={<AlertCircle className="h-3 w-3" />}
              warn={stats.pendingFollowups > 0}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Mini({ label, value, icon, warn }: { label: string; value: number | string; icon?: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`p-3 rounded-xl border ${warn ? "bg-amber-50 border-amber-200" : "bg-muted/30"}`}>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}
