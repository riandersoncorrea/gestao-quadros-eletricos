import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listBatches } from "@/api/sap";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/hooks/useUserRole";
import { format, parseISO } from "date-fns";
import { Plus, FileSpreadsheet, Link2, Link2Off, AlertTriangle, Calendar } from "lucide-react";

const STATUS = {
  rascunho: { label: "Rascunho", cls: "bg-muted text-muted-foreground border-border" },
  validado: { label: "Validado", cls: "bg-primary/10 text-primary border-primary/20" },
  importado: { label: "Importado", cls: "bg-secondary/15 text-secondary border-secondary/20" },
  cancelado: { label: "Cancelado", cls: "bg-destructive/10 text-destructive border-destructive/20" },
};

export default function SapImportList() {
  const { canEdit } = useUserRole();
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["sap-batches"],
    queryFn: listBatches,
  });

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importação SAP</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Planos de manutenção importados do SAP via Excel/CSV.
          </p>
        </div>
        {canEdit && (
          <Link to="/importacao-sap/nova">
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova importação</Button>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : batches.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">Nenhuma importação ainda</p>
            {canEdit && (
              <Link to="/importacao-sap/nova"><Button size="sm" className="gap-2 mt-1"><Plus className="h-4 w-4" />Importar plano SAP</Button></Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => {
            const st = STATUS[b.status] || STATUS.rascunho;
            return (
              <Link key={b.id} to={`/importacao-sap/${b.id}`}>
                <Card className="hover:shadow-md transition-shadow border-border/60 hover:border-primary/20">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold text-sm truncate">{b.filename || "(sem nome)"}</span>
                      <Badge variant="outline" className={`text-xs ${st.cls}`}>{st.label}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span><FileSpreadsheet className="h-3 w-3 inline mr-1" />{b.total_rows} linhas</span>
                      <span className="text-secondary"><Link2 className="h-3 w-3 inline mr-1" />{b.existing_count} vinculadas</span>
                      <span className="text-amber-700"><Link2Off className="h-3 w-3 inline mr-1" />{b.unlinked_count} sem quadro</span>
                      {b.error_count > 0 && <span className="text-destructive"><AlertTriangle className="h-3 w-3 inline mr-1" />{b.error_count} com erro</span>}
                      {b.imported_at && (
                        <span><Calendar className="h-3 w-3 inline mr-1" />{format(parseISO(b.imported_at), "dd/MM/yyyy HH:mm")}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
