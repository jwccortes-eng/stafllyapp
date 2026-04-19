import { useRequestFulfillment } from "@/hooks/useServiceRequests";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { requestId: string | null; }

const COLS: Array<{ key: "requested" | "scheduled" | "accepted" | "worked" | "payable"; label: string; hint: string }> = [
  { key: "requested", label: "Requested", hint: "Asked by client" },
  { key: "scheduled", label: "Scheduled", hint: "Assigned in shift" },
  { key: "accepted", label: "Accepted", hint: "Worker accepted" },
  { key: "worked", label: "Worked", hint: "Clocked-in & out" },
  { key: "payable", label: "Payable", hint: "Approved entries" },
];

export function FulfillmentTable({ requestId }: Props) {
  const { data, isLoading } = useRequestFulfillment(requestId);

  if (isLoading) {
    return <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>;
  }
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">No roles requested yet.</p>;
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left font-medium text-muted-foreground py-2 pl-2">Role</th>
            {COLS.map(c => (
              <th key={c.key} className="text-right font-medium text-muted-foreground py-2 px-2 whitespace-nowrap">
                <div>{c.label}</div>
                <div className="text-[10px] font-normal text-muted-foreground/70">{c.hint}</div>
              </th>
            ))}
            <th className="text-center font-medium text-muted-foreground py-2 px-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => {
            const fullyMet = row.payable >= row.requested;
            const anyGap = row.scheduled < row.requested || row.accepted < row.scheduled || row.worked < row.accepted || row.payable < row.worked;
            return (
              <tr key={idx} className="border-b border-border/50 last:border-0">
                <td className="py-2.5 pl-2 font-medium">{row.role_label}</td>
                {COLS.map(c => {
                  const v = row[c.key] as number;
                  const prev = c.key === "requested" ? null : row[COLS[COLS.findIndex(x => x.key === c.key) - 1].key] as number;
                  const isGap = prev !== null && v < prev;
                  return (
                    <td key={c.key} className={cn(
                      "text-right py-2.5 px-2 tabular-nums",
                      isGap && "text-amber-600 font-semibold"
                    )}>
                      {v}
                    </td>
                  );
                })}
                <td className="text-center py-2.5 px-2">
                  {fullyMet ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                      <Check className="size-3.5" /> OK
                    </span>
                  ) : anyGap ? (
                    <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                      <AlertTriangle className="size-3.5" /> Gap
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
