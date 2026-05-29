// Stafly Core public contact info — single source of truth.
export const STAFLY_PHONE_DIGITS = "7187515197";
export const STAFLY_PHONE_E164 = "+17187515197";
export const STAFLY_PHONE_DISPLAY = "(718) 751-5197";
export const STAFLY_PHONE_DISPLAY_INTL = "+1 718 751 5197";
export const STAFLY_WHATSAPP_BASE = "https://wa.me/17187515197";

// Official public/support/commercial email (provisional).
export const STAFLY_EMAIL = "help@parceros.app";
export const STAFLY_MAILTO = "mailto:help@parceros.app";

export function buildStaflyWhatsAppUrl(message: string) {
  return `${STAFLY_WHATSAPP_BASE}?text=${encodeURIComponent(message)}`;
}

export const STAFLY_COMMERCIAL = {
  phoneDigits: STAFLY_PHONE_DIGITS,
  phoneDisplay: STAFLY_PHONE_DISPLAY,
  whatsappBase: STAFLY_WHATSAPP_BASE,
  guidedSetupLabel: "Start guided setup",
  bookDemoLabel: "Book a demo",
  bookSetupCallLabel: "Book setup call",
  contactSalesLabel: "Contact sales",
  setupPaymentUrl:
    (import.meta.env.VITE_STAFLY_SETUP_PAYMENT_URL as string) ||
    "https://buy.stripe.com/dRm14hd879A9d69c8pcs800",
  starterPaymentUrl: (import.meta.env.VITE_STAFLY_STARTER_PAYMENT_URL as string) || "",
  operationsPaymentUrl: (import.meta.env.VITE_STAFLY_OPERATIONS_PAYMENT_URL as string) || "",
  scaleContactUrl: "",
};

export function bookDemo() {
  return buildStaflyWhatsAppUrl("Hi, I'd like to book a StaflyApps demo.");
}

export function bookSetupCall() {
  return buildStaflyWhatsAppUrl("Hi, I'd like to start the StaflyApps guided setup.");
}

export function contactSales() {
  return buildStaflyWhatsAppUrl("Hi, I'd like to talk about StaflyApps plans for my company.");
}

export function guidedSetupPaymentOrWhatsApp() {
  if (STAFLY_COMMERCIAL.setupPaymentUrl) return STAFLY_COMMERCIAL.setupPaymentUrl;
  return buildStaflyWhatsAppUrl(
    "Hi, I'd like to start the StaflyApps guided setup for $299."
  );
}

export function starterPaymentOrWhatsApp() {
  if (STAFLY_COMMERCIAL.starterPaymentUrl) return STAFLY_COMMERCIAL.starterPaymentUrl;
  return buildStaflyWhatsAppUrl(
    "Hi, I'd like to talk about the StaflyApps Starter plan at $149/month."
  );
}

export function operationsPaymentOrWhatsApp() {
  if (STAFLY_COMMERCIAL.operationsPaymentUrl) return STAFLY_COMMERCIAL.operationsPaymentUrl;
  return buildStaflyWhatsAppUrl(
    "Hi, I'd like to talk about the StaflyApps Operations plan at $299/month."
  );
}

// Legacy WhatsApp message presets — keep for backward compatibility.
export const STAFLY_WHATSAPP = {
  bookDemo: bookDemo(),
  bookSetupCall: bookSetupCall(),
  contactSales: contactSales(),
  billingInquiry: buildStaflyWhatsAppUrl(
    "Hola, quiero información sobre los planes de Stafly Core."
  ),
};
