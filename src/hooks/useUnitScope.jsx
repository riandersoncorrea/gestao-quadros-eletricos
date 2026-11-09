import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { listUnidadesOperacionais } from "@/services/panelService";
import { configureUnitScope } from "@/lib/unitScope";
import { DEFAULT_UNIT_CODE, getAllowedUnits, resolveActiveUnit, isWritableUnit, isGlobalAdmin, canCreatePanelsInUnit, unitUsesSite, localidadeLabel } from "@/domain/unitScope";
import { getMyAccess } from "@/repositories/unitAccessRepository";
import PageLoadingFallback from "@/components/PageLoadingFallback";
import { Button } from "@/components/ui/button";

// Unidade operacional ativa da sessão (São Luís por padrão). Configura o
// estado lido por repositórios/serviços (src/lib/unitScope.js) ANTES de
// renderizar as páginas — nenhuma consulta recortada roda sem unidade.
//
// Quem pode usar cada unidade: getAllowedUnits (domain/unitScope.js) a
// partir do acesso gravado no banco (0029: profiles.acesso_todas_unidades +
// profile_unidades — o mesmo que a RLS aplica). Antes da 0029: regra
// anterior (admin troca; demais perfis só São Luís). A escolha da unidade
// ativa fica no navegador (por usuário) e só vale se for permitida.

const UnitScopeContext = createContext(null);

// Consultas que não dependem da unidade e sobrevivem à troca.
const UNIT_INDEPENDENT_QUERIES = new Set(["unidades-operacionais", "meu-acesso-unidades", "acessos-unidades", "pending-users-count", "profiles"]);

const storageKey = (userId) => `gqe.unidadeAtiva.${userId}`;

function readStoredUnit(userId) {
  try {
    return userId ? localStorage.getItem(storageKey(userId)) : null;
  } catch {
    return null;
  }
}

function writeStoredUnit(userId, unitId) {
  try {
    if (userId) localStorage.setItem(storageKey(userId), unitId);
  } catch {
    // navegador sem storage: a escolha vale só até recarregar
  }
}

export function UnitScopeProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [storedUnitId, setStoredUnitId] = useState(() => readStoredUnit(user?.id));

  const { data: units, error: unitsError, isLoading: unitsLoading, refetch } = useQuery({
    queryKey: ["unidades-operacionais"],
    queryFn: listUnidadesOperacionais,
    staleTime: Infinity,
  });
  // null = banco sem a 0029 (modelo anterior).
  const { data: access, error: accessError, isLoading: accessLoading } = useQuery({
    queryKey: ["meu-acesso-unidades", user?.id],
    queryFn: () => getMyAccess(user.id),
    enabled: !!user?.id,
    staleTime: Infinity,
  });
  const isLoading = unitsLoading || accessLoading;
  const error = unitsError || accessError;

  const scope = useMemo(() => {
    if (!units || access === undefined) return null;
    const allowedUnits = getAllowedUnits(units, user, access);
    const activeUnit = resolveActiveUnit(allowedUnits, storedUnitId);
    const defaultUnit = units.find((u) => u.codigo === DEFAULT_UNIT_CODE) || null;
    if (!activeUnit) return { units, allowedUnits, activeUnit: null, defaultUnit };
    const next = { units, allowedUnits, activeUnit, defaultUnit };
    // Configurado durante o render (e não num efeito) de propósito: os
    // efeitos dos filhos — onde o react-query dispara as consultas — rodam
    // antes dos efeitos do pai.
    configureUnitScope(next);
    return next;
  }, [units, user, access, storedUnitId]);

  const switchUnit = useCallback(
    (unitId) => {
      if (!scope || unitId === scope.activeUnit?.id) return;
      const target = scope.allowedUnits.find((u) => u.id === unitId);
      if (!target) return;
      // 1) nova unidade vale imediatamente para qualquer consulta;
      // 2) consultas em andamento da unidade anterior são canceladas e todo
      //    o cache dependente de unidade é descartado;
      // 3) as páginas remontam (Outlet com key = unidade) e recarregam.
      configureUnitScope({ ...scope, activeUnit: target });
      const dependsOnUnit = (q) => !UNIT_INDEPENDENT_QUERIES.has(q.queryKey?.[0]);
      queryClient.cancelQueries({ predicate: dependsOnUnit });
      queryClient.removeQueries({ predicate: dependsOnUnit });
      writeStoredUnit(user?.id, unitId);
      setStoredUnitId(unitId);
    },
    [scope, queryClient, user]
  );

  const value = useMemo(() => {
    if (!scope?.activeUnit) return null;
    const { units: all, allowedUnits, activeUnit, defaultUnit } = scope;
    return {
      units: all,
      allowedUnits,
      activeUnit,
      defaultUnit,
      isDefaultUnit: activeUnit.id === defaultUnit?.id,
      canWrite: isWritableUnit(activeUnit),
      // Quadro NOVO pela tela só em unidade com site (TAG gerada pelo banco).
      canCreatePanels: canCreatePanelsInUnit(activeUnit),
      usesSite: unitUsesSite(activeUnit),
      localidadeLabel: localidadeLabel(activeUnit),
      canSwitch: allowedUnits.length > 1,
      switchUnit,
      // Modelo de acesso por unidade do banco (0029) disponível?
      accessModel: access ? "unidades" : "legado",
      isGlobalAdmin: isGlobalAdmin(user, access),
    };
  }, [scope, switchUnit, access, user]);

  if (isLoading) return <PageLoadingFallback />;

  if (error || !value) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-sm font-medium">Não foi possível identificar a unidade operacional.</p>
          <p className="text-xs text-muted-foreground">
            {error
              ? "Falha ao carregar as unidades operacionais."
              : "Seu usuário ainda não tem unidade operacional autorizada. Peça a um administrador geral para liberar o acesso."}
          </p>
          {error && <Button size="sm" onClick={() => refetch()}>Tentar novamente</Button>}
        </div>
      </div>
    );
  }

  return <UnitScopeContext.Provider value={value}>{children}</UnitScopeContext.Provider>;
}

/**
 * { units, allowedUnits, activeUnit, defaultUnit, isDefaultUnit, canWrite,
 *   canCreatePanels, usesSite, localidadeLabel, canSwitch, switchUnit,
 *   accessModel, isGlobalAdmin }. `canWrite` = a
 * unidade ativa aceita cadastro e edição (permite_escrita da unidade; nesta
 * etapa a EFC é somente leitura).
 */
export function useUnitScope() {
  const ctx = useContext(UnitScopeContext);
  if (!ctx) throw new Error("useUnitScope precisa estar dentro de UnitScopeProvider");
  return ctx;
}
