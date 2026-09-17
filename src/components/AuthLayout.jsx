import React from "react";
import logoSistema from "@/assets/logo-sistema.png";

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img src={logoSistema} alt="Gestão de Quadros Elétricos" className="h-28 w-28 object-contain mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">Gestão de Quadros Elétricos</p>
          <p className="text-xs text-muted-foreground mb-5">Serv. Operacionais · São Luís EFC</p>
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
  );
}