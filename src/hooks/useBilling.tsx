import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "@/hooks/use-toast";

/**
 * Hook to create a Stripe Checkout session for upgrading.
 * Returns a mutation that accepts { priceId }.
 */
export function useCreateCheckoutSession() {
  const { selectedCompanyId } = useCompany();

  return useMutation({
    mutationFn: async ({ priceId }: { priceId: string }) => {
      if (!selectedCompanyId) throw new Error("No company selected");

      const { data, error } = await supabase.functions.invoke("billing-checkout", {
        body: { priceId, companyId: selectedCompanyId },
      });

      if (error) throw error;
      return data as { url?: string; stub?: boolean; message?: string };
    },
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast({
        title: "Error",
        description: "No se recibió URL de checkout. Verifica la configuración de Stripe.",
        variant: "destructive",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo iniciar el checkout.",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to open the Stripe Customer Portal for managing subscriptions.
 */
export function useOpenCustomerPortal() {
  const { selectedCompanyId } = useCompany();

  return useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company selected");

      const { data, error } = await supabase.functions.invoke("billing-customer-portal", {
        body: { companyId: selectedCompanyId },
      });

      if (error) throw error;
      return data as { url?: string; stub?: boolean; message?: string };
    },
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast({
        title: "Error",
        description: "No se pudo abrir el portal. Asegúrate de tener una suscripción activa.",
        variant: "destructive",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo abrir el portal de cliente.",
        variant: "destructive",
      });
    },
  });
}
