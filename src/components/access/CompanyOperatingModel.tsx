/**
 * COMPANY OPERATING MODEL — flujo de trabajo de la empresa, no organigrama.
 * Solo lectura sobre `operating-model.ts`. No escribe ni cambia permisos.
 */
import { Badge } from "@/components/ui/badge";
import { ArrowDown, AlertTriangle } from "lucide-react";
import { companyOperatingFlow, type OperatingPerson } from "@/lib/auth/operating-model";

interface Props {
  companyName: string;
  people: readonly OperatingPerson[];
  onSelectPerson?: (userId: string) => void;
}

export function CompanyOperatingModel({ companyName, people, onSelectPerson }: Props) {
  const flow = companyOperatingFlow(people);
  const uncovered = flow.filter((r) => r.people.length === 0);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Modelo operativo de {companyName}</p>
        <p className="text-xs text-muted-foreground">
          Cliente → Servicio → Programación → Operación → Control de horas → Payroll → Aprobación → Pago.
          Cada etapa tiene un responsable. El modelo es el mismo en todas las empresas: solo cambian las personas.
        </p>
      </div>

      {uncovered.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Etapas sin responsable: <strong>{uncovered.map((r) => r.stage.label).join(", ")}</strong>. Asigna
            el rol correspondiente en la pestaña Usuarios.
          </span>
        </p>
      )}

      <div className="space-y-1">
        {flow.map((row, i) => (
          <div key={row.stage.key}>
            <div className="rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {row.stage.label}
                  </p>
                  <p className="text-sm font-medium">{row.roleLabel}</p>
                  <p className="text-[11px] text-muted-foreground">{row.scopeLabel}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {row.people.length ? (
                    row.people.map((p) => (
                      <button
                        key={p.userId}
                        type="button"
                        onClick={() => onSelectPerson?.(p.userId)}
                        className="rounded-full border bg-background px-2.5 py-1 text-xs transition-colors hover:bg-muted"
                      >
                        {p.name}
                        {p.custom && (
                          <Badge variant="outline" className="ml-1.5 text-[9px]">
                            excepciones
                          </Badge>
                        )}
                      </button>
                    ))
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Sin responsable
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            {i < flow.length - 1 && (
              <div className="flex justify-center py-0.5">
                <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
