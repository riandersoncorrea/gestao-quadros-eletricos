// Filtro de período da Análise Inteligente dos Dados. Reaproveita
// integralmente a lógica temporal já usada no Dashboard/Checklist/Ações
// (src/domain/dashboardFilters.js) — não duplica "hoje/semanal/mensal/
// trimestral/personalizado". A única regra nova é "semestral", que os
// outros módulos não usam; ela é resolvida aqui, sem tocar no arquivo
// compartilhado (evita mudar o dropdown de período do Dashboard/Checklist).
import { startOfMonth, endOfMonth } from "date-fns";
import { resolvePeriodRange, validateCustomRange, isWithinRange, LOCALIDADE_ALL } from "@/domain/dashboardFilters";

export { validateCustomRange, isWithinRange, LOCALIDADE_ALL };

export const ANALYSIS_PERIOD_OPTIONS = [
  { value: "todo", label: "Todo o período" },
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "personalizado", label: "Personalizado" },
];

export const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "aprovado", label: "Aprovado" },
  { value: "aprovado_ressalvas", label: "Aprovado c/ Ressalvas" },
  { value: "reprovado", label: "Reprovado" },
];

/** Igual a resolvePeriodRange, com o caso adicional "semestral" (6 meses corridos, a partir do 1º ou 7º mês do ano). */
export function resolveAnalysisPeriodRange(period, customRange, today = new Date()) {
  if (period === "semestral") {
    const year = today.getFullYear();
    const semesterStartMonth = today.getMonth() < 6 ? 0 : 6;
    return {
      start: startOfMonth(new Date(year, semesterStartMonth, 1)),
      end: endOfMonth(new Date(year, semesterStartMonth + 5, 1)),
    };
  }
  return resolvePeriodRange(period, customRange, today);
}
