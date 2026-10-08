import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listInExecutionActions } from "@/services/actionService";
import { groupInExecutionByPanel } from "@/domain/actionRules";

export const IN_EXECUTION_ACTIONS_KEY = ["acoes-em-execucao"];

/**
 * Ações "Em execução" agrupadas por quadro (Map panelId → ações), para o
 * filtro "Com ações em execução" e o botão "Tratar ação" da página
 * Checklists. Uma consulta para todos os quadros.
 */
export function useInExecutionActionsByPanel({ enabled = true } = {}) {
  const { data: actions = [], isLoading } = useQuery({
    queryKey: IN_EXECUTION_ACTIONS_KEY,
    queryFn: listInExecutionActions,
    enabled,
  });
  const byPanel = useMemo(() => groupInExecutionByPanel(actions), [actions]);
  return { byPanel, isLoading };
}
