// Filtros de visualização do Dashboard (localidade e período). Não afetam
// dados persistidos — apenas recortam o que já foi carregado do Supabase.
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, isWithinInterval, parseISO,
} from "date-fns";

export const PERIOD_OPTIONS = [
  { value: "todo", label: "Todo o período" },
  { value: "hoje", label: "Hoje" },
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "personalizado", label: "Personalizado" },
];

export const LOCALIDADE_ALL = "all";

/**
 * Resolve o período selecionado num intervalo { start, end } ou null
 * ("todo o período" = sem filtro de data). Para "personalizado", usa
 * customRange = { from, to } (strings yyyy-mm-dd) já validado.
 */
export function resolvePeriodRange(period, customRange, today = new Date()) {
  switch (period) {
    case "hoje":
      return { start: startOfDay(today), end: endOfDay(today) };
    case "semanal":
      return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
    case "mensal":
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case "trimestral":
      return { start: startOfQuarter(today), end: endOfQuarter(today) };
    case "personalizado":
      if (!customRange?.from || !customRange?.to) return null;
      return { start: startOfDay(parseISO(customRange.from)), end: endOfDay(parseISO(customRange.to)) };
    case "todo":
    default:
      return null;
  }
}

/** Valida um intervalo personalizado. Retorna null se ok, ou mensagem de erro. */
export function validateCustomRange({ from, to }) {
  if (!from || !to) return "Informe a data inicial e a data final.";
  if (parseISO(from) > parseISO(to)) return "A data inicial não pode ser posterior à data final.";
  return null;
}

/** true se `dateValue` (string ISO/date) cai dentro de `range` ({start,end} ou null = sem filtro). */
export function isWithinRange(dateValue, range) {
  if (!range) return true;
  if (!dateValue) return false;
  const d = typeof dateValue === "string" ? parseISO(dateValue) : dateValue;
  if (Number.isNaN(d.getTime())) return false;
  return isWithinInterval(d, { start: range.start, end: range.end });
}

/** true se o quadro dono de `panelId` pertence a `localidadeId` (ou "all"). */
export function matchesLocalidade(panelId, localidadeId, panelLocMap) {
  if (localidadeId === LOCALIDADE_ALL) return true;
  return panelLocMap.get(panelId) === localidadeId;
}
