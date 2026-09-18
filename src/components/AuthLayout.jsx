import React from "react";
import logoSistema from "@/assets/logo-sistema.png";

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-4xl">
        <div className="lg:grid lg:grid-cols-2 bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          {/* Painel de marca — só em telas grandes; contido dentro do card,
              não ocupa metade da tela inteira. */}
          <div className="hidden lg:flex flex-col items-center justify-center bg-sidebar px-10 py-12">
            <img src={logoSistema} alt="Gestão de Quadros Elétricos" className="h-40 w-40 object-contain mb-4" />
            <p className="text-base font-semibold text-sidebar-foreground text-center">Gestão de Quadros Elétricos</p>
            <p className="text-xs text-sidebar-foreground/60 text-center">Serv. Operacionais · São Luís EFC</p>
          </div>

          <div className="flex flex-col justify-center px-6 py-10 sm:px-10">
            <div className="text-center mb-6">
              <img src={logoSistema} alt="Gestão de Quadros Elétricos" className="lg:hidden h-24 w-24 object-contain mx-auto mb-1" />
              <p className="lg:hidden text-sm font-semibold text-foreground">Gestão de Quadros Elétricos</p>
              <p className="lg:hidden text-xs text-muted-foreground mb-3">Serv. Operacionais · São Luís EFC</p>
              <h1 className="text-2xl font-bold tracking-tight text-primary">{title}</h1>
              {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
            </div>
            {children}
          </div>
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
