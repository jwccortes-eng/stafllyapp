/**
 * Worker W-9 Guided Form v1 — shared types + validation.
 *
 * Sensitive data rules:
 *  - Raw TIN (SSN/EIN) is NEVER persisted in any DB column.
 *  - Only `tinLast4` is stored. The PDF rendered + saved to private storage
 *    shows the masked form `***-**-1234`.
 *  - Raw `tin` lives only in browser memory during submission, is fed once to
 *    the PDF builder for masking, then discarded.
 */
import { z } from "zod";

export const TAX_CLASSIFICATIONS = [
  { value: "individual", label: "Individual / Sole Proprietor" },
  { value: "c_corp", label: "C Corporation" },
  { value: "s_corp", label: "S Corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "trust", label: "Trust / Estate" },
  { value: "llc", label: "Limited Liability Company (LLC)" },
  { value: "other", label: "Other" },
] as const;

export type TaxClassification = (typeof TAX_CLASSIFICATIONS)[number]["value"];

export const LLC_TAX_CLASSES = [
  { value: "C", label: "C — C Corporation" },
  { value: "S", label: "S — S Corporation" },
  { value: "P", label: "P — Partnership" },
] as const;

export const TAX_ID_TYPES = [
  { value: "ssn", label: "SSN (Individual)" },
  { value: "ein", label: "EIN (Business)" },
] as const;

export const w9Schema = z.object({
  legal_name: z.string().trim().min(1, "Nombre legal requerido").max(120),
  business_name: z.string().trim().max(120).optional().or(z.literal("")),
  tax_classification: z.enum([
    "individual", "c_corp", "s_corp", "partnership", "trust", "llc", "other",
  ]),
  llc_tax_classification: z.enum(["C", "S", "P"]).optional().nullable(),
  exempt_payee_code: z.string().trim().max(10).optional().or(z.literal("")),
  fatca_code: z.string().trim().max(10).optional().or(z.literal("")),
  address_line1: z.string().trim().min(1, "Dirección requerida").max(160),
  address_line2: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().min(1, "Ciudad requerida").max(80),
  state: z.string().trim().length(2, "Usa código de 2 letras").toUpperCase(),
  zip_code: z.string().trim().min(5, "ZIP requerido").max(10),
  account_numbers: z.string().trim().max(120).optional().or(z.literal("")),
  tax_id_type: z.enum(["ssn", "ein"]),
  tin: z.string().regex(/^\d{9}$/, "El número debe tener 9 dígitos (sin guiones)"),
  certification_accepted: z.literal(true, {
    errorMap: () => ({ message: "Debes aceptar la certificación" }),
  }),
  signature_name: z.string().trim().min(1, "Firma requerida"),
});

export type W9FormValues = z.infer<typeof w9Schema>;

export function maskTin(tin: string): string {
  const digits = (tin || "").replace(/\D/g, "");
  if (digits.length < 4) return "***-**-****";
  return `***-**-${digits.slice(-4)}`;
}

export function lastFour(tin: string): string {
  return (tin || "").replace(/\D/g, "").slice(-4);
}

export function tinTypeLabel(t: "ssn" | "ein"): string {
  return t === "ssn" ? "SSN" : "EIN";
}
