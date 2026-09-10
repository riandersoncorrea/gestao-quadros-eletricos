import React, { useState } from "react";
import { ElectricalPanel } from "@/api/entities";
import { appUrl } from "@/lib/utils";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge, PanelTypeLabel, PhaseLabel } from "@/components/panels/StatusBadge";
import QRCodeGenerator, { getQRCodeDataUrl } from "@/components/panels/QRCodeGenerator";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft, Pencil, Trash2, MapPin, Zap, Calendar,
  Download, QrCode, ExternalLink, Image, FileText, Building2, Layers
} from "lucide-react";

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
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

  const panel = panels?.[0];

  const deleteMutation = useMutation({
    mutationFn: () => ElectricalPanel.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panels"] });
      toast.success("Quadro excluído");
      navigate("/quadros");
    },
  });

  const qrValue = `${appUrl}/quadro/${id}`;

  const downloadQR = () => {
    const url = getQRCodeDataUrl(qrValue, 600);
    const link = document.createElement("a");
    link.href = url;
    link.download = `QR_${panel?.code || id}.png`;
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
        <Link to="/quadros"><Button variant="outline" className="mt-4">Voltar</Button></Link>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{panel.name}</h1>
              <StatusBadge status={panel.status} />
            </div>
            <p className="text-sm text-muted-foreground font-mono">{panel.code}</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link to={`/editar/${panel.id}`}>
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
        {/* Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Informações Gerais</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <InfoRow icon={Zap} label="Tipo" value={<PanelTypeLabel type={panel.panel_type} />} />
            <InfoRow icon={MapPin} label="Local" value={[panel.location_name, panel.building, panel.floor].filter(Boolean).join(" • ")} />
            <InfoRow icon={Zap} label="Tensão" value={panel.voltage ? `${panel.voltage}V` : null} />
            <InfoRow icon={Zap} label="Corrente Geral" value={panel.amperage ? `${panel.amperage}A` : null} />
            <InfoRow icon={Layers} label="Fases" value={<PhaseLabel phase={panel.phases} />} />
            <InfoRow icon={Zap} label="Nº Circuitos" value={panel.circuit_count} />
            <InfoRow icon={Zap} label="Disjuntor Geral" value={panel.main_breaker} />
            <InfoRow icon={Building2} label="Alimentado por" value={panel.fed_by} />
            <InfoRow icon={Calendar} label="Instalação" value={panel.installation_date ? format(parseISO(panel.installation_date), "dd/MM/yyyy") : null} />
            <InfoRow icon={Calendar} label="Última Manutenção" value={panel.last_maintenance ? format(parseISO(panel.last_maintenance), "dd/MM/yyyy") : null} />
          </CardContent>
        </Card>

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