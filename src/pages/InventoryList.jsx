import React, { useState, useMemo } from "react";
import { ElectricalPanel, fetchHierarchy } from "@/api/entities";
import { appUrl } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/hooks/useUserRole";
import { format, parseISO } from "date-fns";
import {
  Plus, Search, Zap, MapPin, Calendar, Eye, Pencil, Trash2, QrCode
} from "lucide-react";
import { toast } from "sonner";
import QRCodeGenerator from "@/components/panels/QRCodeGenerator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS_STYLE = {
  ativo: "bg-secondary/15 text-secondary border-secondary/20",
  inativo: "bg-muted text-muted-foreground border-border",
  manutencao: "bg-amber-100 text-amber-800 border-amber-200",
};
const STATUS_LABEL = { ativo: "Ativo", inativo: "Inativo", manutencao: "Manutenção" };

const DIAGRAM_STYLE = {
  atualizado: "bg-secondary/15 text-secondary",
  desatualizado: "bg-amber-100 text-amber-800",
  inexistente: "bg-destructive/10 text-destructive",
};
const DIAGRAM_LABEL = { atualizado: "Unifilar OK", desatualizado: "Desatualizado", inexistente: "Sem Unifilar" };

const TYPE_LABEL = { QDL: "QDL", QDF: "QDF", QDC: "QDC", QGBT: "QGBT", QTA: "QTA", QF: "QF", outro: "Outro" };

const CRITICALITY_STYLE = {
  A: "bg-destructive/10 text-destructive border-destructive/20",
  B: "bg-amber-100 text-amber-800 border-amber-200",
  C: "bg-primary/10 text-primary border-primary/20",
  D: "bg-muted text-muted-foreground border-border",
};

function healthStyle(hi) {
  if (hi == null) return "bg-muted text-muted-foreground border-border";
  if (hi >= 80) return "bg-secondary/15 text-secondary border-secondary/20";
  if (hi >= 50) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-destructive/10 text-destructive border-destructive/20";
}

export default function InventoryList() {
  const { canEdit, canDelete } = useUserRole();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [localidadeFilter, setLocalidadeFilter] = useState("all");
  const [qrPanel, setQrPanel] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const { data: panels = [], isLoading } = useQuery({
    queryKey: ["panels"],
    queryFn: () => ElectricalPanel.list("-created_date"),
  });

  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy"],
    queryFn: fetchHierarchy,
  });

  const { locName, locaName, subName, localidades } = useMemo(() => {
    const localidades = hierarchy?.localidades || [];
    return {
      localidades,
      locName: new Map(localidades.map((l) => [l.id, l.nome])),
      locaName: new Map((hierarchy?.locais || []).map((l) => [l.id, l.nome])),
      subName: new Map((hierarchy?.sublocais || []).map((s) => [s.id, s.nome])),
    };
  }, [hierarchy]);

  const deleteMutation = useMutation({
    mutationFn: (id) => ElectricalPanel.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panels"] });
      toast.success("Quadro removido do inventário");
      setDeleteId(null);
    },
  });

  const filtered = panels.filter(p => {
    const s = search.toLowerCase();
    const hay = [
      p.tag, p.name, p.nomenclatura_oficial, p.installation_location, p.location_room,
      p.sap_functional_location, p.sap_equipment_number,
      locName.get(p.localidade_id), locaName.get(p.local_id), subName.get(p.sublocal_id),
    ].filter(Boolean).join(" ").toLowerCase();
    const matchSearch = !s || hay.includes(s);
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const matchLocalidade = localidadeFilter === "all" || p.localidade_id === localidadeFilter;
    return matchSearch && matchStatus && matchLocalidade;
  });


  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventário de Quadros</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {panels.length} quadro{panels.length !== 1 ? "s" : ""} cadastrado{panels.length !== 1 ? "s" : ""} — base do processo de gerenciamento
          </p>
        </div>
        {canEdit && (
          <Link to="/inventario/novo">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />Cadastrar Quadro
            </Button>
          </Link>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por tag, nome, setor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={localidadeFilter} onValueChange={setLocalidadeFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Localidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Localidades</SelectItem>
            {localidades.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="manutencao">Manutenção</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Zap className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">
              {search || statusFilter !== "all" || localidadeFilter !== "all" ? "Nenhum resultado encontrado" : "Nenhum quadro no inventário"}
            </p>
            {canEdit && !search && statusFilter === "all" && localidadeFilter === "all" && (
              <Link to="/inventario/novo"><Button size="sm" className="gap-2 mt-1"><Plus className="h-4 w-4" />Cadastrar primeiro quadro</Button></Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(panel => (
            <Card key={panel.id} className="hover:shadow-md transition-shadow border-border/60 hover:border-primary/20">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-primary">{panel.tag}</span>
                        <span className="font-semibold text-sm truncate">{panel.name}</span>
                        <Badge variant="outline" className={`text-xs ${STATUS_STYLE[panel.status]}`}>{STATUS_LABEL[panel.status]}</Badge>
                        {panel.criticality && (
                          <Badge variant="outline" className={`text-xs ${CRITICALITY_STYLE[panel.criticality]}`}>
                            Crit. {panel.criticality}
                          </Badge>
                        )}
                        {panel.health_index != null && (
                          <Badge variant="outline" className={`text-xs ${healthStyle(panel.health_index)}`}>
                            IS {Math.round(panel.health_index)}
                          </Badge>
                        )}
                        {panel.panel_type && <Badge variant="outline" className="text-xs">{TYPE_LABEL[panel.panel_type] || panel.panel_type}</Badge>}
                        {panel.diagram_status && (
                          <Badge variant="outline" className={`text-xs ${DIAGRAM_STYLE[panel.diagram_status]}`}>
                            {DIAGRAM_LABEL[panel.diagram_status]}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {(() => {
                          const path = [
                            locName.get(panel.localidade_id),
                            locaName.get(panel.local_id),
                            subName.get(panel.sublocal_id),
                          ].filter(Boolean);
                          const parts = path.length
                            ? path
                            : [panel.installation_location, panel.location_room].filter(Boolean);
                          return parts.length ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {parts.join(" › ")}
                            </span>
                          ) : null;
                        })()}
                        {panel.voltage_nominal && <span><Zap className="h-3 w-3 inline mr-0.5" />{panel.voltage_nominal}</span>}
                        {panel.current_nominal && <span>{panel.current_nominal}</span>}
                        {panel.next_inspection_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Próx. inspeção: {format(parseISO(panel.next_inspection_date), "dd/MM/yyyy")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQrPanel(panel)} title="QR Code">
                      <QrCode className="h-4 w-4" />
                    </Button>
                    <Link to={`/quadro/${panel.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalhes">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    {canEdit && (
                      <Link to={`/inventario/editar/${panel.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(panel.id)} title="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* QR Code Dialog */}
      <Dialog open={!!qrPanel} onOpenChange={() => setQrPanel(null)}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader><DialogTitle>QR Code — {qrPanel?.tag}</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="p-4 bg-white rounded-xl border border-border shadow-sm">
              {qrPanel && <QRCodeGenerator value={`${appUrl}/quadro/${qrPanel.id}`} size={180} />}
            </div>
            <p className="text-xs text-muted-foreground">{qrPanel?.name}</p>
            <Button variant="outline" size="sm" onClick={() => {
              const url = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${appUrl}/quadro/${qrPanel?.id}`)}&color=0C2340&bgcolor=FFFFFF`;
              const a = document.createElement("a"); a.href = url; a.download = `QR_${qrPanel?.tag}.png`; a.click();
            }} className="gap-2 w-full">Baixar QR Code</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja remover este quadro do inventário? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}