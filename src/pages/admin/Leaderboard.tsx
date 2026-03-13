import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Star, Search, TrendingUp, Shield, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { calcReputationScore, calcTrustScore, getLevel, LEVEL_CONFIG } from "@/hooks/useEmployeeReputation";

interface LeaderEntry {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  reputationScore: number;
  reviewAvg: number;
  trustScore: number;
  shiftsCompleted: number;
  level: string;
  levelEmoji: string;
  levelColor: string;
  badges: { badge_emoji: string; badge_label: string }[];
}

export default function Leaderboard() {
  const { selectedCompanyId } = useCompany();
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!selectedCompanyId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Get active employees
      const { data: employees } = await supabase
        .from("employees")
        .select("id, first_name, last_name, avatar_url")
        .eq("company_id", selectedCompanyId)
        .eq("is_active", true)
        .order("first_name")
        .limit(100);

      if (!employees?.length || cancelled) { setLoading(false); return; }

      // Get all badges at once
      const { data: allBadges } = await supabase
        .from("employee_badges")
        .select("employee_id, badge_emoji, badge_label")
        .eq("company_id", selectedCompanyId);

      const badgeMap = new Map<string, { badge_emoji: string; badge_label: string }[]>();
      (allBadges ?? []).forEach(b => {
        const list = badgeMap.get(b.employee_id) ?? [];
        list.push({ badge_emoji: b.badge_emoji, badge_label: b.badge_label });
        badgeMap.set(b.employee_id, list);
      });

      // Calculate scores (batch — limited to first 100)
      const results: LeaderEntry[] = [];
      for (const emp of employees) {
        const rep = await calcReputationScore(emp.id, selectedCompanyId);
        const level = getLevel(rep.reputationScore, rep.shiftsCompleted);
        const cfg = LEVEL_CONFIG[level];
        results.push({
          ...emp,
          ...rep,
          level: cfg.label,
          levelEmoji: cfg.emoji,
          levelColor: cfg.color,
          badges: badgeMap.get(emp.id) ?? [],
        });
      }

      // Sort by reputation score descending
      results.sort((a, b) => b.reputationScore - a.reputationScore);

      if (!cancelled) {
        setEntries(results);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedCompanyId]);

  const filtered = search
    ? entries.filter(e => `${e.first_name} ${e.last_name}`.toLowerCase().includes(search.toLowerCase()))
    : entries;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        variant="1"
        icon={Award}
        title="Leaderboard"
        subtitle="Ranking de trabajadores por reputación y desempeño"
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar empleado..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 rounded-xl"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Sin resultados</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry, idx) => (
            <Card key={entry.id} className="rounded-xl border-border/40 hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                {/* Rank */}
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                  idx === 0 && "bg-amber-400/20 text-amber-600",
                  idx === 1 && "bg-slate-300/20 text-slate-500",
                  idx === 2 && "bg-amber-700/20 text-amber-800",
                  idx > 2 && "bg-muted text-muted-foreground",
                )}>
                  {idx + 1}
                </div>

                <EmployeeAvatar firstName={entry.first_name} lastName={entry.last_name} size="sm" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{entry.first_name} {entry.last_name}</p>
                    <span className={cn("text-xs font-medium", entry.levelColor)}>
                      {entry.levelEmoji} {entry.level}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {entry.reviewAvg || "—"}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <TrendingUp className="h-3 w-3" /> {entry.reputationScore}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Shield className="h-3 w-3" /> {entry.trustScore}%
                    </span>
                    {entry.badges.slice(0, 3).map((b, i) => (
                      <span key={i} title={b.badge_label}>{b.badge_emoji}</span>
                    ))}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className={cn(
                    "text-lg font-bold tabular-nums",
                    entry.reputationScore >= 85 ? "text-emerald-500" : entry.reputationScore >= 60 ? "text-amber-500" : "text-destructive"
                  )}>
                    {entry.reputationScore}
                  </p>
                  <p className="text-[10px] text-muted-foreground">reputation</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
