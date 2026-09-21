import React from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getPublicPanelInfo } from "@/services/panelService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, PhaseLabel } from "@/components/panels/StatusBadge";
import {
  Zap, MapPin, ShieldCheck, Building2, Layers, FileText, Image, LogIn, Database, Calendar,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import logoSistema from "@/assets/logo-sistema.png";

/**
 * Página pública do quadro (sem login) — para onde o QR Code físico aponta
 * (ver panelPublicUrl em src/lib/utils.js). Mostra só o subconjunto de
 * dados aprovado como público, vindo da view `panel_public_info`
 * (supabase/migrations/0010_public_panel_view.sql e
 * 0011_public_panel_sap_fields.sql) — nunca buscar dados de
 * electrical_panels diretamente aqui. Rota fora do ProtectedRoute/
 * AppLayout em src/App.jsx: sem sidebar, sem verificação de sessão.
 */

function fmtDate(d) {
  try { return d ? format(parseISO(d), "dd/MM/yyyy") : null; } catch { return d; }
}

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

export default function PublicPanelDetail() {
  const { id } = useParams();

  const { data: panel, isLoading } = useQuery({
    queryKey: ["public-panel", id],
    queryFn: () => getPublicPanelInfo(id),
  });

  const hierarchyPath = panel
    ? [panel.localidade_nome, panel.local_nome, panel.sublocal_nome].filter(Boolean).join(" › ")
    : "";
  const hierNames = new Set([panel?.localidade_nome, panel?.local_nome, panel?.sublocal_nome].filter(Boolean));
  const detalheLocal = panel
    ? [panel.installation_location, panel.location_floor, panel.location_room]
        .filter((v) => v && !hierNames.has(v))
        .join(", ")
    : "";
  const protecoes = panel
    ? [panel.has_dr && "DR", panel.has_dps && "DPS", panel.has_grounding && "Aterramento"].filter(Boolean).join(", ")
    : "";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <img src={logoSistema} alt="" className="h-9 w-9 object-contain shrink-0 rounded" />
          <div>
            <p className="text-sm font-bold leading-tight">Gestão de Quadros Elétricos</p>
            <p className="text-xs text-primary-foreground/70 leading-tight">Consulta pública do quadro</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 lg:p-8 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : !panel ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              Quadro não encontrado.
            </CardContent>
          </Card>
        ) : (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-primary">{panel.name}</h1>
                <StatusBadge status={panel.status} />
                {panel.criticality && (
                  <Badge variant="outline" className={`text-xs ${CRITICALITY_STYLE[panel.criticality]}`}>
                    Criticidade {panel.criticality}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground font-mono">{panel.tag}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
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

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Dados Técnicos</CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  <InfoRow icon={Zap} label="Tensão Nominal" value={panel.voltage_nominal} />
                  <InfoRow icon={Zap} label="Corrente Nominal" value={panel.current_nominal} />
                  <InfoRow icon={Zap} label="Frequência" value={panel.frequency_hz} />
                  <InfoRow icon={Zap} label="Alimentação" value={panel.power_supply} />
                  <InfoRow icon={Layers} label="Fases" value={<PhaseLabel phase={panel.phases} />} />
                  <InfoRow icon={Zap} label="Nº de Circuitos" value={panel.circuit_count} />
                  <InfoRow icon={Zap} label="Disjuntor Geral" value={[panel.main_breaker_type, panel.main_breaker_capacity, panel.main_breaker_brand].filter(Boolean).join(" • ")} />
                  <InfoRow icon={ShieldCheck} label="Proteções" value={protecoes} />
                  <InfoRow icon={Building2} label="Fabricante / Modelo" value={[panel.manufacturer, panel.model].filter(Boolean).join(" • ")} />
                  <InfoRow icon={FileText} label="Nº de Série" value={panel.serial_number} />
                </CardContent>
              </Card>

              {(panel.sap_functional_location || panel.sap_equipment_number || panel.inspection_frequency
                || panel.last_inspection_date || panel.next_inspection_date || panel.installation_date) && (
                <Card className="md:col-span-2">
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

              {panel.diagram_url && (
                <Card className="md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      Diagrama Unifilar
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <a href={panel.diagram_url} target="_blank" rel="noopener noreferrer">
                      <div className="rounded-lg border border-border overflow-hidden bg-white hover:opacity-90 transition-opacity">
                        <img
                          src={panel.diagram_url}
                          alt="Diagrama Unifilar"
                          className="w-full max-h-[400px] object-contain"
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      </div>
                    </a>
                  </CardContent>
                </Card>
              )}

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
            </div>
          </>
        )}

        <div className="pt-4 text-center">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
            <LogIn className="h-3 w-3" />
            Entrar no sistema
          </Link>
        </div>
      </main>
    </div>
  );
}
