/**
 * P0.4 — CREATE SHIFT SESSION compartida (móvil + desktop).
 * Un turno no existe hasta que el operador pulsa "Crear turno".
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  sessionKey,
  readSessionWith,
  writeSessionWith,
  clearSessionWith,
  parseRecordWith,
  CREATE_SHIFT_SESSION_VERSION,
  CREATE_SHIFT_SESSION_TTL_MS,
} from "@/lib/shifts/create-shift-session";

interface DesktopDraft { title: string; date: string }
const normalize = (raw: unknown): DesktopDraft | null => {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<DesktopDraft>;
  if (typeof d.title !== "string" || typeof d.date !== "string") return null;
  return { title: d.title, date: d.date };
};

const U = "user-1";
const C_QK = "company-quality";
const C_MSS = "company-mystaff";
const io = (userId: string, companyId: string) =>
  ({ userId, companyId, surface: "desktop" as const, normalize });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("create shift session — motor compartido", () => {
  it("desktop y móvil no comparten clave, pero usan el mismo motor", () => {
    expect(sessionKey(U, C_QK, "mobile")).not.toBe(sessionKey(U, C_QK, "desktop"));
    expect(sessionKey(U, C_QK)).toBe(sessionKey(U, C_QK, "mobile"));
  });

  it("CASO 1/3 · guarda y recupera el trabajo del operador", () => {
    writeSessionWith({ sessionId: "s1", userId: U, companyId: C_QK, surface: "desktop", draft: { title: "Banquete", date: "2026-08-01" } });
    const found = readSessionWith(io(U, C_QK));
    expect(found?.draft.title).toBe("Banquete");
    expect(found?.source).toBe("tab");
    expect(found?.sessionId).toBe("s1");
  });

  it("CASO 4 · cambiar de empresa nunca mezcla sesiones", () => {
    writeSessionWith({ sessionId: "s1", userId: U, companyId: C_QK, surface: "desktop", draft: { title: "Quality", date: "2026-08-01" } });
    expect(readSessionWith(io(U, C_MSS))).toBeNull();
  });

  it("CASO 5 · dos empresas conservan cada una su propia sesión", () => {
    writeSessionWith({ sessionId: "a", userId: U, companyId: C_QK, surface: "desktop", draft: { title: "Quality", date: "2026-08-01" } });
    writeSessionWith({ sessionId: "b", userId: U, companyId: C_MSS, surface: "desktop", draft: { title: "My Staff", date: "2026-08-02" } });
    expect(readSessionWith(io(U, C_QK))?.draft.title).toBe("Quality");
    expect(readSessionWith(io(U, C_MSS))?.draft.title).toBe("My Staff");
  });

  it("otro usuario nunca hereda la sesión", () => {
    writeSessionWith({ sessionId: "a", userId: U, companyId: C_QK, surface: "desktop", draft: { title: "Quality", date: "2026-08-01" } });
    expect(readSessionWith(io("user-2", C_QK))).toBeNull();
  });

  it("CASO 6/7 · al crear o descartar no queda nada (ni copia durable)", () => {
    writeSessionWith({ sessionId: "a", userId: U, companyId: C_QK, surface: "desktop", draft: { title: "Quality", date: "2026-08-01" } });
    clearSessionWith({ userId: U, companyId: C_QK, surface: "desktop" });
    expect(readSessionWith(io(U, C_QK))).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it("CASO 8 · cerrar el navegador: la copia durable permite recuperar", () => {
    writeSessionWith({ sessionId: "a", userId: U, companyId: C_QK, surface: "desktop", draft: { title: "Quality", date: "2026-08-01" } });
    sessionStorage.clear(); // el navegador se cerró: la pestaña murió
    const found = readSessionWith(io(U, C_QK));
    expect(found?.draft.title).toBe("Quality");
    expect(found?.source).toBe("durable");
  });

  it("CASO 9 · TTL vencido: el sistema limpia automáticamente", () => {
    const stale = JSON.stringify({
      version: CREATE_SHIFT_SESSION_VERSION,
      sessionId: "old",
      userId: U,
      companyId: C_QK,
      updatedAt: Date.now() - CREATE_SHIFT_SESSION_TTL_MS - 1000,
      draft: { title: "Viejo", date: "2026-01-01" },
    });
    sessionStorage.setItem(sessionKey(U, C_QK, "desktop"), stale);
    expect(readSessionWith(io(U, C_QK))).toBeNull();
    expect(sessionStorage.getItem(sessionKey(U, C_QK, "desktop"))).toBeNull();
  });

  it("un registro corrupto o de otra versión se ignora sin romper", () => {
    expect(parseRecordWith("no-json", { userId: U, companyId: C_QK }, normalize)).toBeNull();
    expect(parseRecordWith(null, { userId: U, companyId: C_QK }, normalize)).toBeNull();
    const wrongVersion = JSON.stringify({ version: 99, sessionId: "x", userId: U, companyId: C_QK, updatedAt: Date.now(), draft: { title: "", date: "" } });
    expect(parseRecordWith(wrongVersion, { userId: U, companyId: C_QK }, normalize)).toBeNull();
  });

  it("una foto con forma inválida no se rehidrata", () => {
    const bad = JSON.stringify({ version: CREATE_SHIFT_SESSION_VERSION, sessionId: "x", userId: U, companyId: C_QK, updatedAt: Date.now(), draft: { title: 5 } });
    expect(parseRecordWith(bad, { userId: U, companyId: C_QK }, normalize)).toBeNull();
  });

  it("sin usuario o sin empresa no se escribe ni se lee nada", () => {
    writeSessionWith({ sessionId: "a", userId: null, companyId: C_QK, surface: "desktop", draft: { title: "x", date: "y" } });
    expect(sessionStorage.length).toBe(0);
    expect(readSessionWith({ userId: U, companyId: null, surface: "desktop", normalize })).toBeNull();
  });
});
