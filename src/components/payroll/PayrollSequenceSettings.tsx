import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hash, Save } from "lucide-react";
import {
  usePayrollSequenceConfig,
  formatSequence,
  PAYROLL_SEQUENCE_DEFAULTS,
  type PayrollSequenceConfig,
} from "@/hooks/usePayrollSequenceConfig";

/**
 * Per-company payroll consecutive number configuration UI.
 * Embed in PayPeriods header or company settings.
 */
export default function PayrollSequenceSettings() {
  const { config, updateConfig, loading, saving } = usePayrollSequenceConfig();
  const [draft, setDraft] = useState<PayrollSequenceConfig>(PAYROLL_SEQUENCE_DEFAULTS);

  useEffect(() => {
    if (!loading) setDraft(config);
  }, [loading, config]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  const preview = formatSequence(draft.next_number, draft);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Hash className="h-4 w-4 text-primary" />
          Consecutivo de payroll
        </CardTitle>
        <CardDescription className="text-xs">
          Cada empresa puede definir su propia numeración. El consecutivo se asigna automáticamente
          a todo periodo nuevo —orgánico, importado o reconciliado— por igual.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Usar numeración visible</p>
            <p className="text-xs text-muted-foreground">
              Si está desactivado, los periodos no reciben número automáticamente.
            </p>
          </div>
          <Switch
            checked={draft.use_payroll_sequence}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, use_payroll_sequence: v }))}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Prefijo</Label>
            <Input
              value={draft.prefix}
              onChange={(e) => setDraft((d) => ({ ...d, prefix: e.target.value }))}
              placeholder="P-"
              maxLength={6}
              disabled={!draft.use_payroll_sequence}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Iniciar en</Label>
            <Input
              type="number"
              min={1}
              value={draft.next_number}
              onChange={(e) =>
                setDraft((d) => ({ ...d, next_number: Math.max(1, Number(e.target.value) || 1) }))
              }
              disabled={!draft.use_payroll_sequence}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Padding</Label>
            <Input
              type="number"
              min={0}
              max={8}
              value={draft.padding}
              onChange={(e) =>
                setDraft((d) => ({ ...d, padding: Math.min(8, Math.max(0, Number(e.target.value) || 0)) }))
              }
              disabled={!draft.use_payroll_sequence}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Reinicia</Label>
            <Select
              value={draft.scope}
              onValueChange={(v) => setDraft((d) => ({ ...d, scope: v as "all_time" | "year" }))}
              disabled={!draft.use_payroll_sequence}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_time">Continuo</SelectItem>
                <SelectItem value="year">Por año</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {draft.use_payroll_sequence && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Vista previa del próximo periodo:</span>
            <span className="font-mono font-bold text-primary">{preview}</span>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button
            onClick={() => updateConfig(draft)}
            disabled={!dirty || saving || loading}
            size="sm"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
