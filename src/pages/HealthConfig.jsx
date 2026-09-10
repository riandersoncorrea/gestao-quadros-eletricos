import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getHealthConfig, saveHealthConfig } from "@/api/analysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Save, Loader2, Gauge, RotateCcw } from "lucide-react";

const DEFAULTS = {
  seguranca: 20, integridade_fisica: 15, conexoes_barramentos: 15, protecoes: 15,
  aterramento: 10, medicoes: 10, termografia: 10, documentacao: 5,
};

export default function HealthConfig() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const [rows, setRows] = useState([]);

  const { data, isLoading } = useQuery({ queryKey: ["health-config"], queryFn: getHealthConfig });

  useEffect(() => {
    if (data) setRows(data.map((r) => ({ ...r })));
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveHealthConfig(rows),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-config"] });
      toast.success("Pesos atualizados. Novas inspeções usarão a configuração; recalcule as anteriores se necessário.");
    },
    onError: (e) => toast.error(`Falha ao salvar: ${e.message}`),
  });

  if (!isAdmin) { navigate("/"); return null; }

  const set = (id, patch) => setRows((s) => s.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const soma = rows.filter((r) => r.ativo !== false).reduce((a, r) => a + Number(r.peso || 0), 0);
  const dirty = data && JSON.stringify(rows.map((r) => [r.id, Number(r.peso), r.ativo !== false]))
    !== JSON.stringify(data.map((r) => [r.id, Number(r.peso), r.ativo !== false]));

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Gauge className="h-6 w-6 text-primary" />Índice de Saúde — pesos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Peso de cada dimensão no cálculo 0–100. Dimensões sem dados na inspeção são excluídas e os pesos são renormalizados.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : (
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-base">Dimensões</CardTitle>
            <Badge variant="outline" className={soma === 100 ? "bg-secondary/15 text-secondary border-secondary/20" : "bg-amber-100 text-amber-800 border-amber-200"}>
              Soma dos pesos ativos: {soma}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.rotulo}</p>
                  <p className="text-xs text-muted-foreground">
                    padrão {DEFAULTS[r.dimensao] ?? "—"}
                    {DEFAULTS[r.dimensao] != null && Number(r.peso) !== DEFAULTS[r.dimensao] && (
                      <button className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5"
                        onClick={() => set(r.id, { peso: DEFAULTS[r.dimensao] })}>
                        <RotateCcw className="h-3 w-3" />restaurar
                      </button>
                    )}
                  </p>
                </div>
                <Input type="number" min="0" max="100" className="w-20"
                  value={r.peso} onChange={(e) => set(r.id, { peso: e.target.value })}
                  disabled={r.ativo === false} />
                <Switch checked={r.ativo !== false} onCheckedChange={(v) => set(r.id, { ativo: v })} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setRows(data.map((r) => ({ ...r })))} disabled={!dirty}>Descartar</Button>
        <Button className="gap-2" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar pesos
        </Button>
      </div>
    </div>
  );
}
