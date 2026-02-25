import React, { createContext, useContext, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const SidebarContext = createContext<{ collapsed: boolean; setCollapsed: (v: boolean) => void }>({ collapsed: false, setCollapsed: () => {} });

export function useSidebarCollapsed() {
  return useContext(SidebarContext);
}

export default function AdminLayout() {
  const { user, role, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (role !== 'owner' && role !== 'admin' && role !== 'manager') return <Navigate to="/auth" replace />;

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="min-h-screen bg-background">
        <AdminSidebar />
        <main className={cn("transition-all duration-200 p-6 lg:p-8 animate-fade-in", collapsed ? "ml-14" : "ml-60")}>
          <Outlet />
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
