
import React, { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  LayoutDashboard,
  Map,
  ClipboardList,
  ClipboardCheck,
  QrCode,
  Menu,
  X,
  LogOut,
  Zap,
  ChevronRight,
  BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", icon: LayoutDashboard, label: "Painel", roles: ["admin", "editor", "viewer"] },
  { path: "/mapa", icon: Map, label: "Mapa", roles: ["admin", "editor", "viewer"] },
  { path: "/inventario", icon: ClipboardList, label: "Inventário", roles: ["admin", "editor", "viewer"] },
  { path: "/inspecoes", icon: ClipboardCheck, label: "Checklists", roles: ["admin", "editor", "viewer"] },
  { path: "/qrcode", icon: QrCode, label: "QR Codes", roles: ["admin", "editor"] },
  { path: "/informacoes", icon: BookOpen, label: "Informações", roles: ["admin", "editor", "viewer"] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const userRole = user?.role || "viewer";

  const filteredNav = NAV_ITEMS.filter((item) => item.roles.includes(userRole));

  const roleLabel = {
    admin: "Administrador",
    editor: "Editor",
    viewer: "Visualizador",
  };

  const roleBadgeColor = {
    admin: "bg-primary/15 text-primary",
    editor: "bg-secondary/15 text-secondary",
    viewer: "bg-accent/15 text-accent-foreground",
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-sidebar border-r border-sidebar-border">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-sidebar-primary/20 flex items-center justify-center">
              <Zap className="h-5 w-5 text-sidebar-primary" />
            </div>
            <div>
              <h1 className="text-xs font-bold text-sidebar-foreground tracking-tight leading-tight">
                Gestão de Quadros Elétricos
              </h1>
              <p className="text-[10px] text-sidebar-foreground/50 leading-tight">Serv. Operacionais · São Luís EFC</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
                {isActive && <ChevronRight className="h-3 w-3 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-xs font-bold text-sidebar-primary">
              {user?.full_name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">
                {user?.full_name || user?.email}
              </p>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", roleBadgeColor[userRole])}>
                {roleLabel[userRole]}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs"
            onClick={() => logout()}
          >
            <LogOut className="h-3 w-3 mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="lg:hidden flex items-center justify-between px-4 h-14 bg-card border-b border-border">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <span className="text-sm font-bold">Quadros Elétricos</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </header>

        {/* Mobile Nav Overlay */}
        {mobileOpen && (
          <div className="lg:hidden absolute inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b border-sidebar-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-sidebar-primary" />
                  <span className="text-sm font-bold text-sidebar-foreground">Menu</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="text-sidebar-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <nav className="p-3 space-y-1 overflow-y-auto">
                {filteredNav.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      location.pathname === item.path
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-sidebar-foreground/50 text-xs"
                  onClick={() => logout()}
                >
                  <LogOut className="h-3 w-3 mr-2" />
                  Sair
                </Button>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}