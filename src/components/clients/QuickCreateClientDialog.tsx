/**
 * CLIENT TRUTH LAYER V1 — Quick Create canónico de Clientes.
 *
 * Único componente de creación rápida. Se usa desde Clientes, Crear/Editar
 * Servicio, Smart Intake y Bulk Service Creation.
 *
 *  - Sólo exige NOMBRE. Nada más.
 *  - Nunca crea en silencio: si hay coincidencia, la persona decide.
 *  - Al crear, selecciona inmediatamente y devuelve el control a la superficie
 *    de origen (no navega, no pierde contexto).
 */
import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  createClientCanonical,
  type CanonicalClient,
} from "@/lib/clients/create-client";
import type { ClientDuplicateWarning } from "@/lib/clients/client-truth";

const REASON_LABEL: Record<ClientDuplicateWarning["reason"], string> = {
  same_normalized_name: "Mismo nombre",
  similar_name: "Nombre muy parecido",
  same_email: "Mismo email",
  same_phone: "Mismo teléfono",
};

export interface QuickCreateClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  initialName?: string;
  /** Se llama con el cliente creado o con el existente elegido. */
  onResolved: (client: CanonicalClient, origin: "created" | "existing") => void;
}

export function QuickCreateClientDialog({
  open,
  onOpenChange,
  companyId,
  initialName = "",
  onResolved,
}: QuickCreateClientDialogProps) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<ClientDuplicateWarning[]>([]);
  const [exact, setExact] = useState<CanonicalClient | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setCandidates([]);
      setExact(null);
    }
  }, [open, initialName]);

  const submit = async (allowDuplicate: boolean) => {
    if (!companyId || !name.trim()) return;
    setSaving(true);
    const result = await createClientCanonical({ companyId, name, allowDuplicate });
    setSaving(false);

    if (result.status === "created") {
      toast.success(`Cliente "${result.client.name}" creado`, {
        description: `${result.client.clientCode ?? "Sin código"} · seleccionado en este contexto.`,
      });
      onResolved(result.client, "created");
      onOpenChange(false);
      return;
    }
    if (result.status === "exact_match") {
      setExact(result.client);
      setCandidates(result.candidates);
      return;
    }
    if (result.status === "possible_duplicate") {
      setExact(null);
      setCandidates(result.candidates);
      return;
    }
    toast.error("No se pudo crear el cliente", { description: result.reason });
  };

  const useExisting = (id: string, label: string, code?: string | null) => {
    onResolved({ id, name: label, clientCode: code ?? null }, "existing");
    onOpenChange(false);
  };

  const showWarning = Boolean(exact) || candidates.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear cliente</DialogTitle>
          <DialogDescription>
            Basta el nombre. Los datos de contacto, lugares y facturación se completan después.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quick-client-name">Nombre</Label>
            <Input
              id="quick-client-name"
              value={name}
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setCandidates([]);
                setExact(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !showWarning) submit(false);
              }}
              placeholder="Nombre del cliente"
            />
          </div>

          {showWarning && (
            <div className="rounded-md border border-warning/40 bg-warning/5 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <p className="text-sm font-medium">Creo que este cliente ya existe.</p>
              </div>
              <div className="space-y-2">
                {(exact
                  ? [
                      {
                        clientId: exact.id,
                        name: exact.name,
                        clientCode: exact.clientCode,
                        reason: "same_normalized_name" as const,
                        score: 1,
                      },
                      ...candidates,
                    ]
                  : candidates
                ).map((c) => (
                  <div
                    key={c.clientId}
                    className="flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.clientCode ?? "—"} · {REASON_LABEL[c.reason]}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="xs" onClick={() => useExisting(c.clientId, c.name, c.clientCode)}>
                        Usar existente
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => window.open(`/app/clients?focus=${c.clientId}`, "_blank")}
                        title="Revisar en Clientes"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={saving}
                onClick={() => submit(true)}
              >
                Crear de todas formas
              </Button>
            </div>
          )}

          {!showWarning && (
            <Button className="w-full" disabled={saving || !name.trim()} onClick={() => submit(false)}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Crear y usar
            </Button>
          )}

          <p className="text-[11px] text-muted-foreground">
            <Badge variant="secondary" className="mr-1 text-[9px]">
              Cliente ≠ Lugar
            </Badge>
            No se crea ningún lugar ni mapping de Connecteam al crear el cliente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default QuickCreateClientDialog;
