import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Clock,
  UserX,
  FileWarning,
  ShieldAlert,
  CalendarX,
  ArrowRight,
  Sparkles,
} from "lucide-react";

/**
 * /app/needs-attention — VISUAL WIREFRAME ONLY
 *
 * No real data, no detectors, no schema reads.
 * Mock cards illustrating the future "Smart Action Queue" surface.
 * Approved 2026-05-04 as design preview before functional Phase 1.
 */

type Severity = "critical" | "warn" | "info";

interface MockCard {
  id: string;
  severity: Severity;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  title: string;
  description: string;
  count: number;
  cta: string;
  href: string;
  examples: string[];
}

const SEV_STYLES: Record<Severity, { ring: string; chip: string; dot: string; iconBg: string }> = {
  critical: {
    ring: "ring-1 ring-destructive/20 hover:ring-destructive/40",
    chip: "bg-destructive/10 text-destructive border-destructive/20",
    dot: "bg-destructive",
    iconBg: "bg-destructive/10 text-destructive",
  },
  warn: {
    ring: "ring-1 ring-amber-500/20 hover:ring-amber-500/40",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
    iconBg: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  info: {
    ring: "ring-1 ring-border hover:ring-primary/30",
    chip: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
    iconBg: "bg-muted text-muted-foreground",
  },
};

const MOCK_CARDS: MockCard[] = [
  {
    id: "open-shifts-stale",
    severity: "critical",
    icon: Clock,
    category: "Time & Attendance",
    title: "Unclosed clock-ins",
    description: "Workers clocked in over 16 hours ago without a clock-out.",
    count: 4,
    cta: "Review entries",
    href: "/app/timeclock",
    examples: ["Carlos Mendez · 18h", "Juan Rivera · 22h", "+2 more"],
  },
  {
    id: "missing-docs",
    severity: "critical",
    icon: FileWarning,
    category: "Compliance",
    title: "Workers missing required docs",
    description: "Active workers without W-9, ID, or work authorization on file.",
    count: 7,
    cta: "Open documents center",
    href: "/app/documents",
    examples: ["3× missing W-9", "2× expired ID", "+2 more"],
  },
  {
    id: "no-show-yesterday",
    severity: "warn",
    icon: UserX,
    category: "Operations",
    title: "No-shows yesterday",
    description: "Confirmed assignments with no clock-in within the grace window.",
    count: 2,
    cta: "Review attendance",
    href: "/app/attendance",
    examples: ["María López · Shift #4821", "Edwin G. · Shift #4836"],
  },
  {
    id: "shift-tomorrow-unstaffed",
    severity: "warn",
    icon: CalendarX,
    category: "Scheduling",
    title: "Tomorrow's gaps",
    description: "Shifts scheduled for tomorrow with empty roster slots.",
    count: 3,
    cta: "Open shifts",
    href: "/app/shifts",
    examples: ["JKitchen · 6a-2p · 1 open", "Quality · 8a-4p · 2 open"],
  },
  {
    id: "duplicate-workers",
    severity: "warn",
    icon: AlertTriangle,
    category: "Data Quality",
    title: "Possible duplicate workers",
    description: "Profiles flagged by name, phone or email similarity.",
    count: 5,
    cta: "Resolve duplicates",
    href: "/app/workers/duplicates",
    examples: ["Angel Colon (#1205 ↔ #954)", "+4 candidates"],
  },
  {
    id: "portal-not-active",
    severity: "info",
    icon: ShieldAlert,
    category: "Onboarding",
    title: "Portal access not activated",
    description: "Active workers who never logged into the portal.",
    count: 12,
    cta: "Send reminders",
    href: "/app/workers",
    examples: ["8× no first login", "4× invite expired"],
  },
];

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warn: "Warning",
  info: "FYI",
};

export default function NeedsAttention() {
  const totals = MOCK_CARDS.reduce(
    (acc, c) => {
      acc[c.severity] += c.count;
      acc.total += c.count;
      return acc;
    },
    { critical: 0, warn: 0, info: 0, total: 0 } as Record<string, number>,
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Smart Action Queue
              <Badge variant="outline" className="ml-1 border-dashed text-[10px]">
                Wireframe
              </Badge>
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Needs attention
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              One operational inbox for everything that needs a human decision —
              ranked by impact, not by module.
            </p>
          </div>

          {/* Summary strip */}
          <div className="flex items-center gap-2">
            <SummaryPill severity="critical" count={totals.critical} />
            <SummaryPill severity="warn" count={totals.warn} />
            <SummaryPill severity="info" count={totals.info} />
          </div>
        </div>

        {/* Hero card — most urgent */}
        <Card className="mb-6 overflow-hidden border-destructive/20 bg-gradient-to-br from-destructive/[0.04] via-background to-background">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-destructive/10 p-3 text-destructive">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">
                    Top priority
                  </Badge>
                  <span className="text-xs text-muted-foreground">Time & Attendance</span>
                </div>
                <h2 className="font-display text-xl font-semibold">
                  4 workers still clocked in past 16h
                </h2>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  These entries will inflate payroll if not closed. Most likely missed clock-outs.
                </p>
              </div>
            </div>
            <Button asChild size="lg" variant="default" className="shrink-0">
              <Link to="/app/timeclock">
                Review now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Card>

        {/* Grid of cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MOCK_CARDS.map((card) => (
            <ActionCard key={card.id} card={card} />
          ))}
        </div>

        {/* Footer note */}
        <p className="mt-10 text-center text-xs text-muted-foreground">
          Visual mockup · No live data · Detectors and counts will be wired in Phase 1.
        </p>
      </div>
    </div>
  );
}

function SummaryPill({ severity, count }: { severity: Severity; count: number }) {
  const s = SEV_STYLES[severity];
  return (
    <div className={`flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 ${s.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      <span className="text-xs font-medium">{SEVERITY_LABEL[severity]}</span>
      <span className="font-mono text-sm font-semibold tabular-nums">{count}</span>
    </div>
  );
}

function ActionCard({ card }: { card: MockCard }) {
  const Icon = card.icon;
  const s = SEV_STYLES[card.severity];

  return (
    <Card className={`group relative overflow-hidden bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg ${s.ring}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className={`rounded-lg p-2 ${s.iconBg}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-semibold tabular-nums leading-none">
              {card.count}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {SEVERITY_LABEL[card.severity]}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {card.category}
          </div>
          <CardTitle className="mt-1 text-base font-semibold leading-snug">
            {card.title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="text-sm text-muted-foreground">{card.description}</p>

        {/* Examples preview */}
        <div className="space-y-1.5 rounded-lg border border-dashed border-border/60 bg-muted/30 p-3">
          {card.examples.map((ex, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`h-1 w-1 rounded-full ${s.dot} opacity-60`} />
              <span className="truncate">{ex}</span>
            </div>
          ))}
        </div>

        <Button asChild variant="ghost" size="sm" className="w-full justify-between">
          <Link to={card.href}>
            {card.cta}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
