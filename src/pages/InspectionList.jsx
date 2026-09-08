import React, { useState } from "react";
import { Inspection } from "@/api/entities";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/hooks/useUserRole";
import { format, parseISO } from "date-fns";
import { Plus, Search, ClipboardCheck, Calendar, User, Eye, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const RESULT_CONFIG = {
  aprovado: { label: "Aprovado", className: "bg-secondary/15 text-secondary border-secondary/20", icon: CheckCircle2 },
  aprovado_ressalvas: { label: "Aprovado c/ Ressalvas", className: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle },
  reprovado: { label: "Reprovado", className: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
};

export default function InspectionList() {
  const { canEdit } = useUserRole();
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("all");

  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ["inspections"],
    queryFn: () => Inspection.list("-inspection_date"),
  });

  const filtered = inspections.filter(i => {
    const s = search.toLowerCase();
    const matchSearch = !s || i.panel_name?.toLowerCase().includes(s) || i.inspector_name?.toLowerCase().includes(s);
    const matchResult = resultFilter === "all" || i.overall_result === resultFilter;
    return matchSearch && matchResult;
  });

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Checklists de Inspeção</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inspeções baseadas nas normas NR-10 e NBR 5410
          </p>
        </div>
        {canEdit && (
          <Link to="/inspecoes/nova">
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova Inspeção</Button>
          </Link>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por quadro ou inspetor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={resultFilter} onValueChange={setResultFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Resultado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Resultados</SelectItem>
            <SelectItem value="aprovado">Aprovado</SelectItem>
            <SelectItem value="aprovado_ressalvas">Aprovado c/ Ressalvas</SelectItem>
            <SelectItem value="reprovado">Reprovado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <ClipboardCheck className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">
              {search || resultFilter !== "all" ? "Nenhuma inspeção encontrada" : "Nenhuma inspeção registrada"}
            </p>
            {canEdit && !search && resultFilter === "all" && (
              <Link to="/inspecoes/nova"><Button size="sm" className="gap-2 mt-1"><Plus className="h-4 w-4" />Registrar primeira inspeção</Button></Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(insp => {
            const r = RESULT_CONFIG[insp.overall_result] || RESULT_CONFIG.aprovado;
            const ResultIcon = r.icon;
            return (
              <Card key={insp.id} className="hover:shadow-md transition-shadow border-border/60 hover:border-primary/20">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{insp.panel_name || "Quadro não identificado"}</span>
                          <Badge variant="outline" className={`text-xs flex items-center gap-1 ${r.className}`}>
                            <ResultIcon className="h-3 w-3" />{r.label}
                          </Badge>
                          {insp.frequency && (
                            <Badge variant="outline" className="text-xs capitalize">{insp.frequency}</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(parseISO(insp.inspection_date), "dd/MM/yyyy")}</span>
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{insp.inspector_name}</span>
                          {insp.next_inspection && (
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Próxima: {format(parseISO(insp.next_inspection), "dd/MM/yyyy")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Link to={`/inspecoes/${insp.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalhes">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}