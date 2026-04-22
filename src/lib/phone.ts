export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  return digits;
}

export function getPhoneLookupVariants(raw: string | null | undefined): string[] {
  const normalized = normalizePhone(raw);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);
  if (normalized.length === 10) {
    variants.add(`1${normalized}`);
  }

  return Array.from(variants);
}

export function buildWhatsAppTargets(rawPhone: string | null | undefined, message: string) {
  const normalized = normalizePhone(rawPhone);
  const phoneWithCountry = normalized.length === 10 ? `1${normalized}` : normalized;
  const encodedMessage = encodeURIComponent(message);

  return {
    phoneDigits: normalized,
    phoneWithCountry,
    waMeUrl: phoneWithCountry
      ? `https://wa.me/${phoneWithCountry}?text=${encodedMessage}`
      : `https://wa.me/?text=${encodedMessage}`,
    waWebUrl: phoneWithCountry
      ? `https://web.whatsapp.com/send?phone=${phoneWithCountry}&text=${encodedMessage}`
      : `https://web.whatsapp.com/send?text=${encodedMessage}`,
  };
}