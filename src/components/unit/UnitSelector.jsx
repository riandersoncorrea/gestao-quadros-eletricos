import React from "react";
import { Building2, Eye } from "lucide-react";
import { useUnitScope } from "@/hooks/useUnitScope";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Unidade operacional ativa, sempre visível. Admin (canSwitch) vê um
 * seletor; os demais perfis, só o selo da unidade (São Luís nesta etapa).
 */
export function UnitSelector({ className, tone = "sidebar" }) {
  const { activeUnit, allowedUnits, canSwitch, switchUnit, canWrite } = useUnitScope();
  const label = (
    <span className="flex items-center gap-1.5 min-w-0">
      <Building2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Unidade: <strong>{activeUnit.nome}</strong></span>
      {!canWrite && <Eye className="h-3 w-3 shrink-0" aria-label="modo consulta" />}
    </span>
  );
  const toneClass = tone === "sidebar"
    ? "bg-sidebar-accent text-sidebar-foreground border-sidebar-border"
    : "bg-muted text-foreground border-border";

  if (!canSwitch) {
    return (
      <div
        className={cn("flex items-center h-8 px-2.5 rounded-md border text-xs", toneClass, className)}
        data-testid="unit-badge"
      >
        {label}
      </div>
    );
  }

  return (
    <Select value={activeUnit.id} onValueChange={switchUnit}>
      <SelectTrigger
        className={cn("h-8 text-xs", toneClass, className)}
        aria-label="Unidade operacional ativa"
        data-testid="unit-selector"
      >
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allowedUnits.map((u) => (
          <SelectItem key={u.id} value={u.id} className="text-xs">{u.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Faixa permanente quando a unidade ativa está em modo consulta (EFC nesta etapa). */
export function ReadOnlyUnitBanner() {
  const { activeUnit, canWrite } = useUnitScope();
  if (canWrite) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 px-4 lg:px-6 py-2 text-xs bg-amber-50 text-amber-900 border-b border-amber-200 print:hidden"
      data-testid="read-only-unit-banner"
    >
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span>
        <strong>Unidade {activeUnit.nome} — modo consulta.</strong> Cadastro e edição de quadros e checklists
        desta unidade serão disponibilizados em uma próxima etapa.
      </span>
    </div>
  );
}
