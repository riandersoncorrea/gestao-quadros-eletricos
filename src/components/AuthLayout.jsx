import React from "react";
import logoSistema from "@/assets/logo-sistema.png";

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2 bg-background">
      {/* Painel de marca — só em telas grandes; no mobile a logo aparece
          compacta acima do formulário, mais abaixo. */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-sidebar px-12">
        <img src={logoSistema} alt="Gestão de Quadros Elétricos" className="h-56 w-56 object-contain mb-4" />
        <p className="text-lg font-semibold text-sidebar-foreground text-center">Gestão de Quadros Elétricos</p>
        <p className="text-sm text-sidebar-foreground/60 text-center">Serv. Operacionais · São Luís EFC</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src={logoSistema} alt="Gestão de Quadros Elétricos" className="lg:hidden h-28 w-28 object-contain mx-auto mb-1" />
            <p className="lg:hidden text-sm font-semibold text-foreground">Gestão de Quadros Elétricos</p>
            <p className="lg:hidden text-xs text-muted-foreground mb-3">Serv. Operacionais · São Luís EFC</p>
            <h1 className="text-3xl font-bold tracking-tight text-primary">{title}</h1>
            {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
          </div>
          <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
            {children}
          </div>
          {footer && (
            <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
          )}
        </div>
      </div>
    </div>
  );
}
