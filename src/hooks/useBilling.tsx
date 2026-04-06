import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const SALES_WHATSAPP = "https://wa.me/18493330000?text=Hola%2C%20quiero%20información%20sobre%20los%20planes%20de%20StaflyApps";
const SALES_EMAIL = "sales@staflyapps.com";

/**
 * Opens the sales contact flow (WhatsApp or email).
 */
export function useContactSales() {
  const { selectedCompanyId } = useCompany();

  const contactSales = (channel: "whatsapp" | "email" = "whatsapp") => {
    if (channel === "whatsapp") {
      window.open(SALES_WHATSAPP, "_blank");
    } else {
      window.location.href = `mailto:${SALES_EMAIL}?subject=Solicitud de plan - ${selectedCompanyId || "nueva empresa"}`;
    }
  };

  return { contactSales, salesWhatsApp: SALES_WHATSAPP, salesEmail: SALES_EMAIL };
}

/**
 * Request upgrade — saves interest in DB and updates company billing_status.
 */
export function useRequestUpgrade() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ notes }: { notes?: string } = {}) => {
      if (!selectedCompanyId || !user) throw new Error("Missing context");

      // Insert upgrade request
      await supabase.from("upgrade_requests" as any).insert({
        company_id: selectedCompanyId,
        requested_by: user.id,
        plan_requested: "paid_manual",
        status: "pending",
        notes: notes || null,
      } as any);

      // Update company billing_status
      await supabase
        .from("companies")
        .update({
          billing_status: "contact_requested",
          upgrade_requested_at: new Date().toISOString(),
        } as any)
        .eq("id", selectedCompanyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-plan"] });
      toast({
        title: "Solicitud enviada",
        description: "Nuestro equipo se pondrá en contacto contigo pronto para activar tu plan.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo enviar la solicitud. Intenta de nuevo.",
        variant: "destructive",
      });
    },
  });
}

/**
 * @deprecated — Stripe checkout is disabled. Use useContactSales() + useRequestUpgrade() instead.
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
