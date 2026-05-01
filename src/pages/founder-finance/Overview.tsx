import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, CreditCard, AlertTriangle, Repeat } from "lucide-react";

export default function FounderFinanceOverview() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ accounts: 0, debts: 0, recurring: 0, txns: 0 });

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [a, d, r, t] = await Promise.all([
        supabase.from("finance_accounts" as any).select("id", { count: "exact", head: true }).eq("owner_user_id", user.id),
        supabase.from("finance_debts" as any).select("id", { count: "exact", head: true }).eq("owner_user_id", user.id),
        supabase.from("finance_recurring_expenses" as any).select("id", { count: "exact", head: true }).eq("owner_user_id", user.id),
        supabase.from("finance_transactions_manual" as any).select("id", { count: "exact", head: true }).eq("owner_user_id", user.id),
      ]);
      setCounts({
        accounts: a.count ?? 0,
        debts: d.count ?? 0,
        recurring: r.count ?? 0,
        txns: t.count ?? 0,
      });
    })();
  }, [user?.id]);

  const cards = [
    { label: "Accounts", value: counts.accounts, icon: CreditCard },
    { label: "Debts", value: counts.debts, icon: AlertTriangle },
    { label: "Recurring", value: counts.recurring, icon: Repeat },
    { label: "Transactions", value: counts.txns, icon: Wallet },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</span>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-semibold tabular-nums">{c.value}</div>
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <h3 className="font-medium mb-2">Welcome to Founder Finance</h3>
        <p className="text-sm text-muted-foreground">
          Private financial command center. Use <strong>Smart Import</strong> to bring in bank statements,
          credit cards, invoices and receipts. CSV is supported now; PDF parsing is coming soon.
        </p>
      </Card>
    </div>
  );
}
