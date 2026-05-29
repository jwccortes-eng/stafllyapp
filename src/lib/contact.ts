// Stafly Core public contact info — single source of truth.
export const STAFLY_PHONE_DIGITS = "7187515197";
export const STAFLY_PHONE_E164 = "+17187515197";
export const STAFLY_PHONE_DISPLAY = "718-751-5197";
export const STAFLY_PHONE_DISPLAY_INTL = "+1 718 751 5197";
export const STAFLY_WHATSAPP_BASE = "https://wa.me/17187515197";

const wa = (text: string) =>
  `${STAFLY_WHATSAPP_BASE}?text=${encodeURIComponent(text)}`;

export const STAFLY_WHATSAPP = {
  bookDemo: wa(
    "Hi, I'm interested in booking a Stafly Core demo. I'd like to learn how it can help with shifts, attendance and payroll-ready hours."
  ),
  bookSetupCall: wa(
    "Hi, I'm interested in setting up Stafly Core for my team. Can we schedule a setup call?"
  ),
  contactSales: wa(
    "Hi, I'm interested in Stafly Core for a larger team or multi-company operation. Can someone contact me?"
  ),
};
