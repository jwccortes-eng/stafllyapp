import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";

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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    // Admins/owners: show notifications targeted to them (user) AND recent company notifications
    const isAdmin = role === "owner" || role === "admin" || role === "manager";

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

  // ... keep existing code (playSound, markAsRead, markAllAsRead)
  const playSound = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio("data:audio/wav;base64,UklGRl9vT19teleVklVRg==");
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      // Audio not available
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

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("user-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          setNotifications(prev => [newNotif, ...prev].slice(0, 30));
          setUnreadCount(prev => prev + 1);
          playSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, playSound]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
