import React, { useState } from "react";
import { ElectricalPanel, fetchHierarchy } from "@/api/entities";
import { appUrl } from "@/lib/utils";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge, PhaseLabel } from "@/components/panels/StatusBadge";
import QRCodeGenerator, { getQRCodeDataUrl } from "@/components/panels/QRCodeGenerator";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft, Pencil, Trash2, MapPin, Zap, Calendar,
  Download, QrCode, ExternalLink, Image, FileText, Building2, Layers,
  ShieldCheck, Database, Gauge,
} from "lucide-react";

const TYPE_LABEL = {
  QDL: "QDL – Distribuição de Luz", QDF: "QDF – Distribuição de Força", QDC: "QDC – Comando",
  QGBT: "QGBT – Geral Baixa Tensão", QTA: "QTA – Transferência Automática", QF: "QF – Força", outro: "Outro",
};
const CRITICALITY_LABEL = { A: "A – Crítico", B: "B – Alto", C: "C – Médio", D: "D – Baixo" };
const CRITICALITY_STYLE = {
  A: "bg-destructive/10 text-destructive border-destructive/20",
  B: "bg-amber-100 text-amber-800 border-amber-200",
  C: "bg-primary/10 text-primary border-primary/20",
  D: "bg-muted text-muted-foreground border-border",
};

function fmtDate(d) {
  try { return d ? format(parseISO(d), "dd/MM/yyyy") : null; } catch { return d; }
}

function InfoRow({ icon: Icon, label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-primary/60 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export default function PanelDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canEdit, canDelete } = useUserRole();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false);

  const { data: panels, isLoading } = useQuery({
    queryKey: ["panel", id],
    queryFn: () => ElectricalPanel.filter({ id }),
  });

  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy"],
    queryFn: fetchHierarchy,
  });

  const panel = panels?.[0];

  const deleteMutation = useMutation({
    mutationFn: () => ElectricalPanel.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panels"] });
      toast.success("Quadro excluído");
      navigate("/inventario");
    },
  });

  const qrValue = `${appUrl}/quadro/${id}`;

  const downloadQR = () => {
    const url = getQRCodeDataUrl(qrValue, 600);
    const link = document.createElement("a");
    link.href = url;
    link.download = `QR_${panel?.tag || id}.png`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!panel) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Quadro não encontrado</p>
        <Link to="/inventario"><Button variant="outline" className="mt-4">Voltar</Button></Link>
      </div>
    );
  }

  const localidadeNome = hierarchy?.localidades?.find(l => l.id === panel.localidade_id)?.nome;
  const localNome = hierarchy?.locais?.find(l => l.id === panel.local_id)?.nome;
  const sublocalNome = hierarchy?.sublocais?.find(s => s.id === panel.sublocal_id)?.nome;
  const hierarchyPath = [localidadeNome, localNome, sublocalNome].filter(Boolean).join(" › ");
  const hierNames = new Set([localidadeNome, localNome, sublocalNome].filter(Boolean));
  const detalheLocal = [panel.installation_location, panel.location_floor, panel.location_room]
    .filter((v) => v && !hierNames.has(v))
    .join(", ");
  const protecoes = [
    panel.has_dr && "DR", panel.has_dps && "DPS", panel.has_grounding && "Aterramento",
  ].filter(Boolean).join(", ");

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{panel.name}</h1>
              <StatusBadge status={panel.status} />
              {panel.criticality && (
                <Badge variant="outline" className={`text-xs ${CRITICALITY_STYLE[panel.criticality]}`}>
                  Criticidade {panel.criticality}
                </Badge>
              )}
              {panel.health_index != null && (
                <Badge variant="outline" className="text-xs">
                  Índice de Saúde {Math.round(panel.health_index)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground font-mono">{panel.tag}</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link to={`/inventario/editar/${panel.id}`}>
              <Button variant="outline" size="sm" className="gap-2">
                <Pencil className="h-3 w-3" />
                Editar
              </Button>
            </Link>
            {canDelete && (
              <Button variant="outline" size="sm" className="gap-2 text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3 w-3" />
                Excluir
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Identificação e localização */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Identificação e Localização</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <InfoRow icon={FileText} label="Nomenclatura Oficial" value={panel.nomenclatura_oficial} />
            <InfoRow icon={Zap} label="Tipo" value={TYPE_LABEL[panel.panel_type] || panel.panel_type_custom || panel.panel_type} />
            <InfoRow icon={ShieldCheck} label="Criticidade" value={CRITICALITY_LABEL[panel.criticality] || panel.criticality} />
            <InfoRow icon={Building2} label="Site" value={panel.site ? panel.site[0].toUpperCase() + panel.site.slice(1) : null} />
            <InfoRow icon={MapPin} label="Hierarquia" value={hierarchyPath} />
            <InfoRow icon={MapPin} label="Detalhe do local" value={detalheLocal} />
            <InfoRow icon={MapPin} label="Coordenada (referência)" value={panel.coordinate} />
            <InfoRow icon={MapPin} label="Coordenadas GPS" value={panel.latitude && panel.longitude ? `${panel.latitude}, ${panel.longitude}` : null} />
            <InfoRow icon={ShieldCheck} label="Engenheiro Responsável" value={panel.responsible_engineer} />
          </CardContent>
        </Card>

        {/* Dados técnicos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dados Técnicos</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <InfoRow icon={Zap} label="Tensão Nominal" value={panel.voltage_nominal} />
            <InfoRow icon={Zap} label="Corrente Nominal" value={panel.current_nominal} />
            <InfoRow icon={Gauge} label="Frequência" value={panel.frequency_hz} />
            <InfoRow icon={Zap} label="Alimentação" value={panel.power_supply} />
            <InfoRow icon={Layers} label="Fases" value={<PhaseLabel phase={panel.phases} />} />
            <InfoRow icon={Zap} label="Nº de Circuitos" value={panel.circuit_count} />
            <InfoRow icon={Zap} label="Disjuntor Geral" value={[panel.main_breaker_type, panel.main_breaker_capacity, panel.main_breaker_brand].filter(Boolean).join(" • ")} />
            <InfoRow icon={ShieldCheck} label="Proteções" value={protecoes} />
            <InfoRow icon={Building2} label="Fabricante / Modelo" value={[panel.manufacturer, panel.model].filter(Boolean).join(" • ")} />
            <InfoRow icon={FileText} label="Nº de Série" value={panel.serial_number} />
          </CardContent>
        </Card>

        {/* SAP / Plano de manutenção */}
        {(panel.sap_functional_location || panel.sap_equipment_number || panel.inspection_frequency) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                SAP / Plano de Manutenção
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              <InfoRow icon={Database} label="Local de Instalação SAP" value={panel.sap_functional_location} />
              <InfoRow icon={Database} label="Nº do Equipamento SAP" value={panel.sap_equipment_number} />
              <InfoRow icon={Calendar} label="Frequência de Inspeção" value={panel.inspection_frequency} />
              <InfoRow icon={Calendar} label="Última Inspeção" value={fmtDate(panel.last_inspection_date)} />
              <InfoRow icon={Calendar} label="Próxima Inspeção" value={fmtDate(panel.next_inspection_date)} />
              <InfoRow icon={Calendar} label="Instalação" value={fmtDate(panel.installation_date)} />
            </CardContent>
          </Card>
        )}

        {/* QR Code */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" />
              QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-4">
            <div className="p-4 bg-white rounded-xl shadow-sm border border-border">
              <QRCodeGenerator value={qrValue} size={180} />
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-[200px]">
              Escaneie para acessar os dados deste quadro
            </p>
            <Button variant="outline" size="sm" onClick={downloadQR} className="gap-2">
              <Download className="h-3 w-3" />
              Baixar QR Code
            </Button>
          </CardContent>
        </Card>

        {/* Diagram */}
        {panel.diagram_url && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Diagrama Unifilar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-lg border border-border overflow-hidden cursor-pointer hover:opacity-90 transition-opacity bg-white"
                onClick={() => setDiagramOpen(true)}
              >
                <img
                  src={panel.diagram_url}
                  alt="Diagrama Unifilar"
                  className="w-full max-h-[400px] object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setDiagramOpen(true)}>
                  <ExternalLink className="h-3 w-3" />
                  Ampliar
                </Button>
                <a href={panel.diagram_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="h-3 w-3" />
                    Baixar
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Photo */}
        {panel.photo_url && (
          <Card className={panel.diagram_url ? "" : "md:col-span-2"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Image className="h-4 w-4 text-primary" />
                Foto do Quadro
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden bg-white">
                <img src={panel.photo_url} alt="Foto do quadro" className="w-full max-h-[300px] object-contain" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {panel.notes && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{panel.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Map preview */}
        {panel.latitude && panel.longitude && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Localização no Mapa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] rounded-lg overflow-hidden border border-border">
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${panel.longitude - 0.005}%2C${panel.latitude - 0.003}%2C${panel.longitude + 0.005}%2C${panel.latitude + 0.003}&layer=mapnik&marker=${panel.latitude}%2C${panel.longitude}`}
                  style={{ border: 0 }}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Diagram Fullscreen */}
      <Dialog open={diagramOpen} onOpenChange={setDiagramOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Diagrama Unifilar — {panel.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto">
            <img src={panel.diagram_url} alt="Diagrama" className="w-full object-contain" />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir o quadro <strong>{panel.name}</strong>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
