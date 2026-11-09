// Unidade operacional ativa — estado de módulo lido pelos repositórios e
// serviços (que não são componentes React). Quem configura é o
// UnitScopeProvider (src/hooks/useUnitScope.jsx), antes de renderizar
// qualquer página autenticada; trocar de unidade passa sempre por ele
// (limpa o cache do react-query e remonta as páginas).
//
// Regras (padrão, permissões, escrita) ficam em src/domain/unitScope.js.

import { isWritableUnit } from "@/domain/unitScope";

let scope = null; // { units, activeUnit, defaultUnit }

export function configureUnitScope(next) {
  scope = next;
}

export function clearUnitScope() {
  scope = null;
}

function requireScope() {
  if (!scope?.activeUnit) {
    // Proteção: nenhuma leitura recortada roda sem unidade definida —
    // melhor falhar do que devolver dados de todas as unidades.
    throw new Error("Unidade operacional ativa não definida");
  }
  return scope;
}

export function getActiveUnit() {
  return requireScope().activeUnit;
}

export function getActiveUnitId() {
  return requireScope().activeUnit.id;
}

export function getDefaultUnitId() {
  return requireScope().defaultUnit?.id ?? null;
}

export function isActiveDefaultUnit() {
  const s = requireScope();
  return s.activeUnit.id === s.defaultUnit?.id;
}

export function getUnitById(id) {
  return requireScope().units.find((u) => u.id === id) || null;
}

/** Registro de outra unidade aberto por ID (link direto). */
export class UnitMismatchError extends Error {
  constructor(recordUnit, activeUnit) {
    super(`Registro da unidade ${recordUnit?.nome ?? "desconhecida"}; unidade ativa: ${activeUnit?.nome}`);
    this.name = "UnitMismatchError";
    this.isUnitScopeError = true;
    this.recordUnit = recordUnit;
    this.activeUnit = activeUnit;
  }
}

/** Tentativa de gravar em unidade somente leitura (EFC nesta etapa). */
export class ReadOnlyUnitError extends Error {
  constructor(unit) {
    super(`A unidade ${unit?.nome ?? ""} está em modo consulta: cadastro e edição serão disponibilizados em uma próxima etapa.`);
    this.name = "ReadOnlyUnitError";
    this.isUnitScopeError = true;
    this.unit = unit;
  }
}

/** Garante que o registro (pela unidade do seu quadro) é da unidade ativa. */
export function assertUnitIsActive(recordUnitId) {
  const s = requireScope();
  const effective = recordUnitId ?? s.defaultUnit?.id; // sem quadro = comportamento atual (unidade padrão)
  if (effective !== s.activeUnit.id) throw new UnitMismatchError(getUnitById(effective), s.activeUnit);
}

/**
 * Registro com unidade própria (coluna da 0029): tem de ser a ativa. NULL =
 * registro sem quadro pendente de classificação — não pertence a nenhuma
 * unidade (nunca é tratado como da unidade padrão).
 */
export function assertOwnUnitIsActive(recordUnitId) {
  const s = requireScope();
  if (recordUnitId !== s.activeUnit.id) throw new UnitMismatchError(getUnitById(recordUnitId), s.activeUnit);
}

/** Garante que a unidade (do registro, ou a ativa) aceita gravação. */
export function assertUnitWritable(recordUnitId) {
  const s = requireScope();
  const unit = getUnitById(recordUnitId ?? s.activeUnit.id) || s.activeUnit;
  if (!isWritableUnit(unit)) throw new ReadOnlyUnitError(unit);
  if (unit.id !== s.activeUnit.id) throw new UnitMismatchError(unit, s.activeUnit);
}
