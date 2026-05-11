/**
 * Sharing helpers for shift links.
 *
 * Three explicitly-separated actions — never mix them:
 *   - copyLink:    URL only (for clipboard).
 *   - openWhatsApp: wa.me with a templated Spanish message + URL.
 *   - shareNative: Web Share API (text + URL) with wa.me fallback on desktop.
 *
 * If we later want a "Copy message" action, add a new helper rather than
 * overloading copyLink.
 */
import { APP_BASE_URL } from "@/lib/app-url";
import { toast } from "sonner";

export function shiftLinkUrl(token: string): string {
  return `${APP_BASE_URL}/s/${token}`;
}

export interface ShiftShareContext {
  url: string;
  title: string;
  date: string; // ISO date
  startTime: string; // HH:mm[:ss]
  recipientName?: string | null;
  // ── Work Route extensions (all optional; omit lines when missing). ──────
  endTime?: string | null;        // muted "Termina aprox.", never used for pay
  meetingPoint?: string | null;   // free-text address
  meetingTime?: string | null;    // HH:mm[:ss]
  jobSite?: string | null;        // resolved job-site / location label
  instructions?: string | null;
  clientName?: string | null;
}

function formatDateEs(iso: string): string {
  // Lazy: avoid pulling date-fns into this tiny helper. Caller can pre-format.
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

function formatTime(t: string): string {
  return (t ?? "").slice(0, 5);
}

function clean(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

/**
 * Stafly Work Route message. Lines are appended only when the underlying
 * field is present, so legacy callers that only pass {title,date,startTime,url}
 * still get a sensible compact message.
 *
 * Never represents scheduled hours as payroll. `endTime` is shown as
 * "Termina aprox." to signal it's an estimate.
 */
export function buildShiftMessage(ctx: ShiftShareContext): string {
  const greeting = ctx.recipientName
    ? `Hola ${ctx.recipientName.trim().split(/\s+/)[0]},`
    : "Hola,";

  const lines: string[] = [];
  const client = clean(ctx.clientName);
  const title = clean(ctx.title);
  // Client takes precedence; fall back to title if no client.
  if (client) lines.push(`Cliente: ${client}`);
  else if (title) lines.push(`Turno: ${title}`);

  const date = clean(ctx.date);
  if (date) lines.push(`Fecha: ${formatDateEs(date)}`);

  const start = clean(ctx.startTime);
  if (start) lines.push(`Entrada: ${formatTime(start)}`);

  const mp = clean(ctx.meetingPoint);
  if (mp) lines.push(`Punto de encuentro: ${mp}`);

  const mt = clean(ctx.meetingTime);
  if (mt) lines.push(`Hora de encuentro: ${formatTime(mt)}`);

  const job = clean(ctx.jobSite);
  if (job && job !== mp) lines.push(`Trabajo: ${job}`);

  const end = clean(ctx.endTime);
  if (end) lines.push(`Termina aprox.: ${formatTime(end)}`);

  const instr = clean(ctx.instructions);
  if (instr) lines.push(`Instrucciones: ${instr}`);

  return `${greeting}\n\nTienes un turno:\n${lines.join("\n")}\n\nConfirma tu disponibilidad en Stafly:\n${ctx.url}`;
}

export async function copyLink(url: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast.success("Link copiado");
  } catch {
    toast.error("No se pudo copiar el link");
  }
}

/**
 * Open WhatsApp with the templated message.
 *
 * We always use `wa.me` (never `api.whatsapp.com/send`) — `api.whatsapp.com`
 * sends `X-Frame-Options: DENY` and gets blocked with `ERR_BLOCKED_BY_RESPONSE`
 * when opened from inside an iframe (Lovable preview, embedded contexts).
 *
 * If `window.open` returns null (popup blocker, sandboxed iframe, in-app browser)
 * we copy the full message to the clipboard and surface a clear toast so the
 * admin can paste it manually instead of getting silently nothing.
 */
export async function openWhatsApp(
  ctx: ShiftShareContext,
  phone?: string | null,
): Promise<void> {
  const message = buildShiftMessage(ctx);
  const text = encodeURIComponent(message);
  const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
  const base = cleanPhone ? `https://wa.me/${cleanPhone}` : "https://wa.me/";
  const url = `${base}?text=${text}`;

  let win: Window | null = null;
  try {
    win = window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    win = null;
  }

  if (!win) {
    // Popup blocked / iframe sandbox / in-app browser → degrade gracefully.
    try {
      await navigator.clipboard.writeText(`${message}`);
      toast.error("No pudimos abrir WhatsApp. Copiamos el mensaje al portapapeles.");
    } catch {
      toast.error("No pudimos abrir WhatsApp. Copia el link manualmente: " + ctx.url);
    }
  }
}

export async function shareNative(ctx: ShiftShareContext): Promise<void> {
  const text = buildShiftMessage(ctx);
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await (navigator as Navigator & {
        share: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
      }).share({
        title: ctx.title || "Turno",
        text,
        url: ctx.url,
      });
      return;
    } catch (err) {
      // User cancelled, or share unavailable — fall back to WhatsApp.
      if ((err as DOMException)?.name === "AbortError") return;
    }
  }
  openWhatsApp(ctx);
}
