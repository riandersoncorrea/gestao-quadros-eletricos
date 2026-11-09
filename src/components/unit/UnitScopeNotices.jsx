import React from "react";
import { Link } from "react-router-dom";
import { Building2, Eye } from "lucide-react";
import { useUnitScope } from "@/hooks/useUnitScope";
import { Button } from "@/components/ui/button";

export function readOnlyMessage(unit) {
  return `Disponível em uma próxima etapa para a unidade ${unit?.nome ?? ""}.`.replace(/\s+\./, ".");
}

export const isUnitMismatchError = (err) => err?.name === "UnitMismatchError";
export const isReadOnlyUnitError = (err) => err?.name === "ReadOnlyUnitError";

/** Unidade que edita quadros, mas cadastra os novos por planilha (sem site — EFC). */
export function panelCreationMessage(unit) {
  return `O cadastro de quadros novos da unidade ${unit?.nome ?? ""} é feito por planilha (importação).`.replace(/\s+\(/, " (");
}

/**
 * Registro aberto por ID (link direto) que pertence a outra unidade: os
 * dados não são exibidos. Admin pode alternar para a unidade do registro
 * (o link continua válido); os demais perfis veem só o aviso.
 */
export function UnitMismatchNotice({ error, backTo = "/", backLabel = "Voltar" }) {
  const { allowedUnits, switchUnit, activeUnit } = useUnitScope();
  const recordUnit = error?.recordUnit;
  const canOpen = recordUnit && allowedUnits.some((u) => u.id === recordUnit.id);
  return (
    <div className="p-6 lg:p-8 max-w-xl" data-testid="unit-mismatch-notice">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-primary" />
          Registro de outra unidade operacional
        </div>
        {canOpen ? (
          <p className="text-sm text-muted-foreground">
            Este registro pertence à unidade <strong>{recordUnit.nome}</strong>. Unidade ativa:{" "}
            <strong>{activeUnit.nome}</strong>.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Registro indisponível para a sua unidade ({activeUnit.nome}).</p>
        )}
        <div className="flex gap-2">
          {canOpen && (
            <Button size="sm" onClick={() => switchUnit(recordUnit.id)}>Alternar para {recordUnit.nome}</Button>
          )}
          <Link to={backTo}><Button size="sm" variant="outline">{backLabel}</Button></Link>
        </div>
      </div>
    </div>
  );
}

/** Tela de cadastro/edição aberta numa unidade somente leitura. */
export function ReadOnlyUnitNotice({ backTo = "/", backLabel = "Voltar", what = "Esta funcionalidade" }) {
  const { activeUnit } = useUnitScope();
  return (
    <div className="p-6 lg:p-8 max-w-xl" data-testid="read-only-unit-notice">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 space-y-3 text-amber-900">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="h-4 w-4" />
          Unidade {activeUnit.nome} em modo consulta
        </div>
        <p className="text-sm">{what} não está disponível para a unidade {activeUnit.nome} nesta etapa. {readOnlyMessage(activeUnit)}</p>
        <Link to={backTo}><Button size="sm" variant="outline">{backLabel}</Button></Link>
      </div>
    </div>
  );
}

/**
 * Botão de cadastro desabilitado na unidade somente leitura, com a
 * indicação de que a funcionalidade virá numa próxima etapa (title no
 * wrapper: botão desabilitado não recebe eventos de mouse).
 */
export function ReadOnlyActionButton({ children, icon: Icon, size = "sm", variant, message }) {
  const { activeUnit } = useUnitScope();
  const msg = message || readOnlyMessage(activeUnit);
  return (
    <span title={msg} className="inline-flex" data-testid="read-only-action">
      <Button size={size} variant={variant} disabled className="gap-2" aria-label={`${typeof children === "string" ? children : ""} — ${msg}`}>
        {Icon && <Icon className="h-4 w-4" />}
        {children}
      </Button>
    </span>
  );
}

/** Tela de cadastro de quadro aberta numa unidade que cadastra por planilha. */
export function PanelCreationUnavailableNotice({ backTo = "/inventario", backLabel = "Voltar ao inventário" }) {
  const { activeUnit } = useUnitScope();
  return (
    <div className="p-6 lg:p-8 max-w-xl" data-testid="panel-creation-unavailable-notice">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-primary" />
          Cadastro de quadros por planilha
        </div>
        <p className="text-sm text-muted-foreground">
          {panelCreationMessage(activeUnit)} Para editar um quadro existente (por exemplo, incluir a coordenada), abra-o no inventário.
        </p>
        <Link to={backTo}><Button size="sm" variant="outline">{backLabel}</Button></Link>
      </div>
    </div>
  );
}
