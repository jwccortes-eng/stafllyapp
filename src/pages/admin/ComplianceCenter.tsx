/**
 * /app/compliance-center — Phase 1 read-only preview.
 *
 * Intentionally minimal: surfaces the new Worker Update Center catalog
 * and routes admins to existing flows (Workers risk panel, Documents).
 * No new data, no actions, no enforcement. Phase 2 adds the live queue.
 */
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Users,
  FileText,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { OperationalWorkspace } from "@/components/stafly-ui/OperationalWorkspace";
import { Badge } from "@/components/ui/badge";
import {
  REQUIREMENT_CATALOG,
  CATEGORY_LABELS,
  LEVEL_LABELS,
} from "@/lib/compliance/requirement-catalog";

export default function ComplianceCenter() {
  return (
    <OperationalWorkspace
      title="Cumplimiento"
      context="Vista de solo lectura: define qué datos pediremos al equipo. Las acciones llegan en fases siguientes."
      action={
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
          Vista previa
        </Badge>
      }
      adminTitle="Alcance de esta vista"
      admin={
        <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Esta vista no bloquea personas, no cambia pagos, no cambia turnos ni
            notificaciones. El equipo ya puede ver su checklist en su portal.
          </p>
        </div>
      }
    >

      {/* Quick links to existing tools */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/app/employees"
          className="group rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <p className="font-semibold">Workers risk panel</p>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Cola actual de calidad de datos por trabajador.
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold text-primary">
            Abrir Equipo <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
        <Link
          to="/app/documents"
          className="group rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <p className="font-semibold">Documentos y revisión</p>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Aprobaciones, rechazos y expiraciones de documentos.
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold text-primary">
            Abrir Documentos <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
      </div>

      {/* Requirement catalog */}
      <Card className="overflow-hidden">
        <div className="border-b border-border/60 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">
            Catálogo de requerimientos
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {REQUIREMENT_CATALOG.length} requerimientos definidos en código.
            Se moverán a base de datos en Phase 2.
          </p>
        </div>
        <div className="divide-y divide-border/50">
          {REQUIREMENT_CATALOG.map((r) => (
            <div
              key={r.key}
              className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[13px]">{r.label}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    {CATEGORY_LABELS[r.category]}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {LEVEL_LABELS[r.level]}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {r.description}
                </p>
                <p className="mt-1 font-mono text-[10.5px] text-muted-foreground/55">
                  {r.key}
                </p>
              </div>
              <div className="text-right text-[10.5px] text-muted-foreground/70 shrink-0">
                {r.blocksScope.length > 0 ? (
                  <div className="space-y-0.5">
                    <p className="font-bold uppercase tracking-wider text-[9.5px] text-muted-foreground/60">
                      Bloquea (futuro)
                    </p>
                    {r.blocksScope.map((s) => (
                      <p key={s} className="font-mono">
                        {s}
                      </p>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground/45">Sin bloqueo</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </OperationalWorkspace>
  );
}
