import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchAuditLog, AUDIT_PAGE_SIZE, AUDITED_TABLES } from "@/api/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { format, parseISO } from "date-fns";
import { Search, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";

const ACAO = {
  insert: { label: "Criação", cls: "bg-secondary/15 text-secondary border-secondary/20" },
  update: { label: "Alteração", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  delete: { label: "Exclusão", cls: "bg-destructive/10 text-destructive border-destructive/20" },
};
const TABLE_LABEL = Object.fromEntries(AUDITED_TABLES.map((t) => [t.value, t.label]));
const ALL = "all";
const trunc = (s, n = 60) => (s == null ? "—" : s.length > n ? s.slice(0, n) + "…" : s);

export default function AuditLog() {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [page, setPage] = useState(0);
  const [tabela, setTabela] = useState(ALL);
  const [acao, setAcao] = useState(ALL);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  React.useEffect(() => {
    const t = setTimeout(() => { setQDebounced(q); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit", page, tabela, acao, qDebounced],
    queryFn: () => fetchAuditLog({
      page,
      tabela: tabela === ALL ? "" : tabela,
      acao: acao === ALL ? "" : acao,
      q: qDebounced,
    }),
    placeholderData: keepPreviousData,
    enabled: isAdmin,
  });

  if (!isAdmin) { navigate("/"); return null; }

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />Auditoria
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Toda alteração de dados — quem, quando, campo, valor anterior e novo. {total} registro(s).
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por usuário ou campo..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={tabela} onValueChange={(v) => { setTabela(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Tabela" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as tabelas</SelectItem>
            {AUDITED_TABLES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={acao} onValueChange={(v) => { setAcao(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Ação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toda ação</SelectItem>
            <SelectItem value="insert">Criação</SelectItem>
            <SelectItem value="update">Alteração</SelectItem>
            <SelectItem value="delete">Exclusão</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : isError ? (
            <p className="p-6 text-sm text-destructive">Sem permissão para ver a auditoria.</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">Nenhum registro para o filtro atual.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                  <th>Quando</th><th>Usuário</th><th>Tabela</th><th>Ação</th><th>Campo</th><th>Antes → Depois</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr>td]:px-3 [&>tr>td]:py-2 [&>tr>td]:align-top">
                {rows.map((r) => {
                  const a = ACAO[r.acao] || ACAO.update;
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap text-muted-foreground">{format(parseISO(r.created_at), "dd/MM/yy HH:mm")}</td>
                      <td className="max-w-[160px] truncate">{r.usuario_email || "—"}</td>
                      <td>{TABLE_LABEL[r.tabela] || r.tabela}</td>
                      <td><Badge variant="outline" className={`text-[10px] ${a.cls}`}>{a.label}</Badge></td>
                      <td className="font-mono">{r.campo || "—"}</td>
                      <td className="max-w-[280px]">
                        {r.acao === "update" ? (
                          <span>
                            <span className="text-muted-foreground line-through">{trunc(r.valor_anterior)}</span>
                            {" → "}
                            <span className="font-medium">{trunc(r.valor_novo)}</span>
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Página {page + 1} de {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
              Próxima<ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
