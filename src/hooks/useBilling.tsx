import { useCompany } from "@/hooks/useCompany";
import { toast } from "@/hooks/use-toast";

const SALES_WHATSAPP = "https://wa.me/18493330000?text=Hola%2C%20quiero%20información%20sobre%20los%20planes%20de%20StaflyApps";
const SALES_EMAIL = "sales@staflyapps.com";

/**
 * Opens the sales contact flow (WhatsApp or email).
 * Stripe checkout is disabled — all upgrades are manual for now.
 */
export function useContactSales() {
  const { selectedCompanyId } = useCompany();

  const contactSales = (channel: "whatsapp" | "email" = "whatsapp") => {
    if (channel === "whatsapp") {
      window.open(SALES_WHATSAPP, "_blank");
    } else {
      window.location.href = `mailto:${SALES_EMAIL}?subject=Solicitud de plan - ${selectedCompanyId || "nueva empresa"}`;
    }
    toast({
      title: "Solicitud enviada",
      description: "Nuestro equipo se pondrá en contacto contigo pronto.",
    });
  };

  return { contactSales, salesWhatsApp: SALES_WHATSAPP, salesEmail: SALES_EMAIL };
}

/**
 * @deprecated — Stripe checkout is disabled. Use useContactSales() instead.
 */
export function useCreateCheckoutSession() {
  return {
    mutate: () => {
      toast({
        title: "Pasarela no disponible",
        description: "El pago automático aún no está activo. Contacta a ventas para activar tu plan.",
      });
    },
    isPending: false,
  };
}

/**
 * @deprecated — Stripe portal is disabled. Use useContactSales() instead.
 */
export function useOpenCustomerPortal() {
  return {
    mutate: () => {
      toast({
        title: "Portal no disponible",
        description: "Contacta a ventas para gestionar tu suscripción.",
      });
    },
    isPending: false,
  };
}
