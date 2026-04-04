import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useSoundContext } from "@/hooks/useSound";
import { toast } from "sonner";

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

export function useNotifications() {
  const { user, role } = useAuth();
  const { selectedCompanyId } = useCompany();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const notifPermissionRef = useRef<NotificationPermission>("default");

  // Request browser notification permission + warm-up AudioContext on first interaction
  useEffect(() => {
    // Request notification permission
    if ("Notification" in window) {
      notifPermissionRef.current = Notification.permission;
      if (Notification.permission === "default") {
        Notification.requestPermission().then((perm) => {
          notifPermissionRef.current = perm;
        });
      }
    }

    const unlock = () => {
      if (audioUnlockedRef.current) return;
      try {
        const ctx = new AudioContext();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        audioCtxRef.current = ctx;
        audioUnlockedRef.current = true;
      } catch {
        // ignore
      }
      // Re-request notification permission on interaction if still default
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().then((perm) => {
          notifPermissionRef.current = perm;
        });
      }
    };
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    // Admins/owners: show notifications targeted to them (user) AND recent company notifications
    const isAdmin = role === "developer" || role === "owner" || role === "admin" || role === "manager";

    if (isAdmin && selectedCompanyId) {
      // Fetch both: user-targeted + company-wide (for the bell)
      const [userResult, companyResult] = await Promise.all([
        supabase
          .from("notifications")
          .select("id, title, body, type, read_at, created_at, metadata, company_id")
          .eq("recipient_id", user.id)
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

      const all = [...(userResult.data ?? []), ...(companyResult.data ?? [])];
      // Deduplicate and sort
      const unique = Array.from(new Map(all.map(n => [n.id, n])).values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 30) as AppNotification[];

      setNotifications(unique);
      setUnreadCount(unique.filter(n => !n.read_at).length);
    } else {
      // Employee portal or non-admin: find by employee linked to user
      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      const employeeId = empData?.[0]?.id;
      const recipientIds = [user.id, ...(employeeId ? [employeeId] : [])];

      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, type, read_at, created_at, metadata, company_id")
        .in("recipient_id", recipientIds)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!error && data) {
        setNotifications(data as AppNotification[]);
        setUnreadCount(data.filter((n: any) => !n.read_at).length);
      }
    }
    setLoading(false);
  }, [user, role, selectedCompanyId]);

  const playSound = useCallback(() => {
    try {
      // Reuse unlocked context if available, else create new one
      const ctx = audioCtxRef.current?.state !== "closed"
        ? audioCtxRef.current ?? new AudioContext()
        : new AudioContext();

      // Resume if suspended (autoplay policy)
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;

      const playTone = (freq: number, startAt: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(0.5, startAt + 0.02);
        gain.gain.setValueAtTime(0.5, startAt + duration * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
        osc.start(startAt);
        osc.stop(startAt + duration);
      };

      // Three-tone ascending alert for urgency
      playTone(880, now, 0.12);
      playTone(1109, now + 0.14, 0.12);
      playTone(1319, now + 0.28, 0.2);
    } catch {
      // Audio not available
    }
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
        // Auto-close after 6 seconds
        setTimeout(() => notif.close(), 6000);
      }
    } catch {
      // System notifications not supported in this context
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);

    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);

    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnreadCount(0);
  }, [user, notifications]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription — listen for both user.id and employeeId recipients
  useEffect(() => {
    if (!user) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Channel for user-targeted notifications
    const userChannel = supabase
      .channel("user-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          setNotifications(prev => [newNotif, ...prev].slice(0, 30));
          setUnreadCount(prev => prev + 1);
          playSound();
          showSystemNotification(newNotif.title, newNotif.body);
          toast(newNotif.title, { description: newNotif.body, duration: 5000 });
        }
      )
      .subscribe();
    channels.push(userChannel);

    // Channel for employee-targeted notifications (different recipient_id)
    const getEmployeeId = async () => {
      const { data } = await supabase.from("employees").select("id").eq("user_id", user.id).limit(1);
      const empId = data?.[0]?.id;
      if (empId && empId !== user.id) {
        const empChannel = supabase
          .channel("employee-notifications")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${empId}` },
            (payload) => {
              const newNotif = payload.new as AppNotification;
              setNotifications(prev => [newNotif, ...prev].slice(0, 30));
              setUnreadCount(prev => prev + 1);
              playSound();
              showSystemNotification(newNotif.title, newNotif.body);
              toast(newNotif.title, { description: newNotif.body, duration: 5000 });
            }
          )
          .subscribe();
        channels.push(empChannel);
      }
    };
    getEmployeeId();

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [user, playSound, showSystemNotification]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
