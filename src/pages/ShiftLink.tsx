/**
 * Public smart-shift-link landing page (/s/:token).
 *
 * Behavior:
 *   1. GET → `resolve-shift-link` returns minimal preview + routing decision.
 *   2. If `session_authorized` → auto-redirect.
 *   3. Else → show minimal preview + phone form. POST resolves identity
 *      via the existing `resolve-applicant-identity` flow and we navigate
 *      to register / activate / claim / detail.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CalendarDays, Clock, MapPin, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PreviewResp {
  ok: true;
  shift_id: string;
  company_id: string;
  company_slug: string;
  company_name: string;
  preview: {
    date: string;
    start_time: string;
    end_time: string;
    title: string;
    location_short: string | null;
  };
  routing:
    | { kind: "session_authorized"; redirect: string }
    | { kind: "needs_phone"; redirect: null };
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-shift-link`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function ShiftLink() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Link inválido");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Forward session if available — server uses it for session-first routing.
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {
          apikey: ANON,
          "Content-Type": "application/json",
        };
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        } else {
          headers.Authorization = `Bearer ${ANON}`;
        }
        const res = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, {
          method: "GET",
          headers,
        });
        const json = (await res.json()) as PreviewResp | { error: string };
        if (cancelled) return;
        if (!res.ok || !("ok" in json)) {
          setError((json as { error: string }).error ?? "No se pudo abrir el link");
          return;
        }
        setPreview(json);
        if (json.routing.kind === "session_authorized") {
          navigate(json.routing.redirect, { replace: true });
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !phone.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "No pudimos validar tu número");
        return;
      }
      navigate(json.redirect, { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full p-8 text-center space-y-3">
          <h1 className="text-xl font-semibold">No se pudo abrir el link</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (preview.routing.kind === "session_authorized") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Format the date/time minimally (no client-name, no money, no roster).
  const dateLabel = (() => {
    try {
      const [y, m, d] = preview.preview.date.split("-").map(Number);
      return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return preview.preview.date;
    }
  })();
  const timeLabel = `${preview.preview.start_time.slice(0, 5)} – ${preview.preview.end_time.slice(0, 5)}`;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-background to-muted/30">
      <Card className="max-w-md w-full p-6 space-y-5 shadow-lg">
        <header className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {preview.company_name}
          </p>
          <h1 className="text-lg font-semibold">
            {preview.preview.title || "Turno"}
          </h1>
        </header>

        {/* Minimal safe preview — date/time/short location only. */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="capitalize">{dateLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{timeLabel}</span>
          </div>
          {preview.preview.location_short && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{preview.preview.location_short}</span>
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="phone" className="text-xs">
              Tu número de teléfono
            </Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="3001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="mt-1"
            />
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              Lo usamos solo para identificarte de forma segura.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={submitting || phone.trim().length < 7}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Continuar
          </Button>
        </form>
      </Card>
    </div>
  );
}
