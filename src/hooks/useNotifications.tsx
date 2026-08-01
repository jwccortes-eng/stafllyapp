import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useSoundContext } from "@/hooks/useSound";
import { toast } from "sonner";
import {
  BurstWindow,
  burstToastMessage,
  evaluateBurst,
  isCriticalNotification,
  sortByPriorityThenDate,
} from "@/lib/notifications/priority";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
  company_id: string;
}

const BURST_TOAST_ID = "stafly-notification-burst";

export function useNotifications() {
  const { user, role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { effectiveEmployeeId } = useEffectiveEmployee();
  const { play } = useSoundContext();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const notifPermissionRef = useRef<NotificationPermission>("default");
  const burstRef = useRef<BurstWindow>({ start: 0, count: 0 });
  // Kept in a ref so realtime handlers always compare against the ACTIVE company.
  const activeCompanyRef = useRef<string | null>(selectedCompanyId ?? null);
  activeCompanyRef.current = selectedCompanyId ?? null;

  // Request browser notification permission
  useEffect(() => {
    if ("Notification" in window) {
      notifPermissionRef.current = Notification.permission;
      if (Notification.permission === "default") {
        Notification.requestPermission().then((perm) => {
          notifPermissionRef.current = perm;
        });
      }
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    // F0 — MULTI-TENANT ISOLATION:
    // every notification query is scoped to the ACTIVE company_id.
    // Never load notifications by user.id alone.
    if (!selectedCompanyId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    const isAdmin = role === "developer" || role === "owner" || role === "admin" || role === "manager";

    if (isAdmin) {
      const [userResult, companyResult] = await Promise.all([
        supabase
          .from("notifications")
          .select("id, title, body, type, read_at, created_at, metadata, company_id")
          .eq("recipient_id", user.id)
          .eq("company_id", selectedCompanyId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("notifications")
          .select("id, title, body, type, read_at, created_at, metadata, company_id")
          .eq("company_id", selectedCompanyId)
          .eq("recipient_type", "user")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const all = [...(userResult.data ?? []), ...(companyResult.data ?? [])]
        .filter((n) => n.company_id === selectedCompanyId);
      const unique = Array.from(new Map(all.map((n) => [n.id, n])).values()) as AppNotification[];
      const ordered = sortByPriorityThenDate(unique).slice(0, 30);

      setNotifications(ordered);
      setUnreadCount(ordered.filter((n) => !n.read_at).length);
    } else {
      const recipientIds = [user.id, ...(effectiveEmployeeId ? [effectiveEmployeeId] : [])];

      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, type, read_at, created_at, metadata, company_id")
        .in("recipient_id", recipientIds)
        .eq("company_id", selectedCompanyId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!error && data) {
        const ordered = sortByPriorityThenDate(
          (data as AppNotification[]).filter((n) => n.company_id === selectedCompanyId)
        );
        setNotifications(ordered);
        setUnreadCount(ordered.filter((n) => !n.read_at).length);
      }
    }
    setLoading(false);
  }, [user, role, selectedCompanyId, effectiveEmployeeId]);

  // Determine sound type based on notification type
  const getSoundType = useCallback((notifType: string): "notification" | "chat" | "alert" => {
    if (isCriticalNotification(notifType)) return "alert";
    if (["shift_chat", "chat_message"].includes(notifType)) return "chat";
    return "notification";
  }, []);

  // Show native browser/OS notification (appears in notification shade on mobile)
  const showSystemNotification = useCallback((title: string, body: string) => {
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        const options: NotificationOptions = {
          body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          tag: `stafly-${Date.now()}`,
          requireInteraction: false,
        };
        const notif = new Notification(title, options);
        setTimeout(() => notif.close(), 6000);
      }
    } catch {
      // System notifications not supported in this context
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    if (!selectedCompanyId) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", selectedCompanyId);

    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [selectedCompanyId]);

  const markAllAsRead = useCallback(async () => {
    if (!user || !selectedCompanyId) return;
    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .eq("company_id", selectedCompanyId);

    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnreadCount(0);
  }, [user, notifications, selectedCompanyId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Reset burst window when the active company changes
  useEffect(() => {
    burstRef.current = { start: 0, count: 0 };
  }, [selectedCompanyId]);

  /**
   * Handle an incoming realtime notification:
   *  1. drop anything outside the ACTIVE company (multi-tenant isolation)
   *  2. always persist it in the bell (no traceability loss)
   *  3. coalesce bursts (3+ in 10s -> one grouped toast, no repeated sound)
   *  4. never coalesce or silence critical alerts
   */
  const handleIncoming = useCallback((newNotif: AppNotification) => {
    const activeCompany = activeCompanyRef.current;
    if (!activeCompany || newNotif.company_id !== activeCompany) {
      console.info("[notifications] dropped cross-company realtime event", {
        notificationId: newNotif.id,
        notificationCompany: newNotif.company_id,
        activeCompany,
      });
      return;
    }

    setNotifications(prev => {
      if (prev.some(n => n.id === newNotif.id)) return prev;
      return sortByPriorityThenDate([newNotif, ...prev]).slice(0, 30);
    });
    setUnreadCount(prev => prev + 1);

    const { window: nextWindow, decision, playSound } = evaluateBurst(
      burstRef.current,
      newNotif.type,
      Date.now()
    );
    burstRef.current = nextWindow;

    if (playSound) void play(getSoundType(newNotif.type));

    if (decision.mode === "grouped") {
      toast(burstToastMessage(decision.count), {
        id: BURST_TOAST_ID,
        description: "Abre la campana para revisarlas.",
        duration: 6000,
      });
      return;
    }

    showSystemNotification(newNotif.title, newNotif.body);
    if (isCriticalNotification(newNotif.type)) {
      toast.error(newNotif.title, { description: newNotif.body, duration: 12000, important: true });
    } else {
      toast(newNotif.title, { description: newNotif.body, duration: 5000 });
    }
  }, [play, getSoundType, showSystemNotification]);

  // Realtime subscription — scoped per active company
  useEffect(() => {
    if (!user || !selectedCompanyId) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    const userChannel = supabase
      .channel(`user-notifications-${selectedCompanyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        (payload) => handleIncoming(payload.new as AppNotification)
      )
      .subscribe();
    channels.push(userChannel);

    if (effectiveEmployeeId && effectiveEmployeeId !== user.id) {
      const empChannel = supabase
        .channel(`employee-notifications-${selectedCompanyId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${effectiveEmployeeId}` },
          (payload) => handleIncoming(payload.new as AppNotification)
        )
        .subscribe();
      channels.push(empChannel);
    }

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [user, effectiveEmployeeId, selectedCompanyId, handleIncoming]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
