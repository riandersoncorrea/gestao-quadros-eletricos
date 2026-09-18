import React from "react";
import logoSistema from "@/assets/logo-sistema.png";

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar px-4 py-10 gap-16">
      {/* Marca — flutua direto no fundo teal, sem caixa própria; só em
          telas grandes. No mobile a versão compacta aparece acima do
          formulário. */}
      <div className="hidden lg:flex flex-col items-start shrink-0">
        <img src={logoSistema} alt="Gestão de Quadros Elétricos" className="h-44 w-44 object-contain mb-4" />
        <p className="text-4xl font-bold tracking-tight text-primary leading-tight">Gestão de<br />Quadros Elétricos</p>
        <p className="text-sm text-sidebar-foreground/70 mt-2">Serv. Operacionais · São Luís EFC</p>
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src={logoSistema} alt="Gestão de Quadros Elétricos" className="lg:hidden h-24 w-24 object-contain mx-auto mb-1" />
          <p className="lg:hidden text-lg font-bold text-primary">Gestão de Quadros Elétricos</p>
          <p className="lg:hidden text-xs text-sidebar-foreground/70 mb-4">Serv. Operacionais · São Luís EFC</p>
          <h1 className="text-2xl font-bold tracking-tight text-primary">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-sidebar-foreground/70 mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
