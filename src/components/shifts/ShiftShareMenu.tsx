/**
 * Three-action share menu for a shift link.
 *
 * Strict separation of intents (per UX decision):
 *   - "Copiar link"  → URL only.
 *   - "WhatsApp"     → wa.me with templated message + URL.
 *   - "Compartir"    → Web Share API (with wa.me fallback).
 *
 * Lazy-token: if the shift does not yet have a `shift_link_token`
 * (legacy rows created before the migration), we generate one on first
 * share via the trigger-equivalent helper.
 */
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Share2, Copy, MessageCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  shiftLinkUrl,
  copyLink,
  openWhatsApp,
  shareNative,
  type ShiftShareContext,
} from "@/lib/share-helpers";
import { toast } from "sonner";

interface ShiftShareMenuProps {
  shiftId: string;
  /** Already-known token. If null we'll fetch / lazy-create. */
  token?: string | null;
  title: string;
  date: string;
  startTime: string;
  recipientName?: string | null;
  recipientPhone?: string | null;
  /** Visual variant */
  variant?: "default" | "ghost" | "outline";
  size?: "sm" | "default";
  /** Hide the dropdown and render a single "Copy link" button (used in rides). */
  compact?: boolean;
  className?: string;
}

async function ensureToken(shiftId: string, known?: string | null): Promise<string | null> {
  if (known) return known;
  // Read it (trigger creates one on insert; for legacy rows we backfill).
  const { data, error } = await supabase
    .from("scheduled_shifts")
    .select("shift_link_token")
    .eq("id", shiftId)
    .maybeSingle();
  if (error) return null;
  if (data?.shift_link_token) return data.shift_link_token;

  // Legacy row → generate via DB function and persist.
  const { data: gen } = await supabase.rpc("generate_shift_link_token");
  const newTok = (gen as unknown as string) ?? null;
  if (!newTok) return null;
  const { error: upErr } = await supabase
    .from("scheduled_shifts")
    .update({ shift_link_token: newTok })
    .eq("id", shiftId);
  if (upErr) return null;
  return newTok;
}

export function ShiftShareMenu({
  shiftId,
  token,
  title,
  date,
  startTime,
  recipientName,
  recipientPhone,
  variant = "outline",
  size = "sm",
  compact = false,
  className,
}: ShiftShareMenuProps) {
  const [busy, setBusy] = useState(false);

  const withCtx = useCallback(
    async (fn: (ctx: ShiftShareContext) => void | Promise<void>) => {
      setBusy(true);
      try {
        const tok = await ensureToken(shiftId, token);
        if (!tok) {
          toast.error("No se pudo generar el link del turno");
          return;
        }
        const ctx: ShiftShareContext = {
          url: shiftLinkUrl(tok),
          title,
          date,
          startTime,
          recipientName,
        };
        await fn(ctx);
      } finally {
        setBusy(false);
      }
    },
    [shiftId, token, title, date, startTime, recipientName],
  );

  if (compact) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          withCtx((ctx) => copyLink(ctx.url));
        }}
        className={className}
        title="Copiar link del turno"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
        <span className="ml-1.5 text-xs">Copiar link</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          disabled={busy}
          className={className}
          onClick={(e) => e.stopPropagation()}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
          <span className="ml-1.5 text-xs">Compartir</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => withCtx((ctx) => copyLink(ctx.url))}>
          <Copy className="h-4 w-4 mr-2" /> Copiar link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => withCtx((ctx) => openWhatsApp(ctx, recipientPhone))}>
          <MessageCircle className="h-4 w-4 mr-2 text-[#25D366]" /> WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => withCtx((ctx) => shareNative(ctx))}>
          <Share2 className="h-4 w-4 mr-2" /> Compartir…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
