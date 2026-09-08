import React, { useState } from "react";
import { ElectricalPanel, Inspection } from "@/api/entities";
import { uploadFile } from "@/lib/storage";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Save, ArrowLeft, Loader2, ClipboardCheck, Upload } from "lucide-react";

const ITEM_OPTIONS = [
  { value: "ok", label: "OK ✓", className: "text-secondary" },
  { value: "nao_conforme", label: "Não Conforme ✗", className: "text-destructive" },
  { value: "nao_aplicavel", label: "N/A", className: "text-muted-foreground" },
];

function CheckItem({ label, desc, field, value, onChange }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-border last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <div className="flex gap-2">
        {ITEM_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(field, opt.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
              value === opt.value
                ? opt.value === "ok" ? "bg-secondary text-white border-secondary shadow-sm"
                  : opt.value === "nao_conforme" ? "bg-destructive text-white border-destructive shadow-sm"
                  : "bg-muted text-muted-foreground border-border shadow-sm"
                : "bg-background border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function InspectionForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canEdit } = useUserRole();
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    panel_id: "", panel_name: "", inspection_date: new Date().toISOString().split("T")[0],
    inspector_name: "", frequency: "", next_inspection: "", overall_result: "",
    estado_geral_involucro: "nao_aplicavel", fechamento_portas_selos: "nao_aplicavel",
    limpeza_interna_externa: "nao_aplicavel", ausencia_umidade_poeira: "nao_aplicavel",
    identificacao_circuitos: "nao_aplicavel", conexoes_superaquecimento: "nao_aplicavel",
    dispositivos_dr_dps: "nao_aplicavel", fiacao_cabos: "nao_aplicavel",
    sinalizacao_seguranca: "nao_aplicavel", termografia_realizada: false,
    termografia_resultado: "nao_realizada", diagrama_atualizado: "nao_aplicavel",
    observacoes: "", photo_url: "",
  });

  const { data: panels = [] } = useQuery({
    queryKey: ["panels"],
    queryFn: () => ElectricalPanel.list("name"),
  });

  const mutation = useMutation({
    mutationFn: (data) => {
      const clean = { ...data };
      Object.keys(clean).forEach(k => { if (clean[k] === "") delete clean[k]; });
      return Inspection.create(clean);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      // Update panel's last inspection date
      if (form.panel_id) {
        ElectricalPanel.update(form.panel_id, {
          last_inspection_date: form.inspection_date,
          ...(form.next_inspection ? { next_inspection_date: form.next_inspection } : {}),
        });
      }
      toast.success("Checklist de inspeção registrado!");
      navigate("/inspecoes");
    },
  });

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await uploadFile({ file });
    setForm(prev => ({ ...prev, photo_url: file_url }));
    setUploading(false);
    toast.success("Foto enviada!");
  };

  const f = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handlePanelSelect = (id) => {
    const p = panels.find(x => x.id === id);
    setForm(prev => ({ ...prev, panel_id: id, panel_name: p ? `${p.tag} – ${p.name}` : "" }));
  };

  if (!canEdit) { navigate("/inspecoes"); return null; }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.panel_id || !form.inspection_date || !form.inspector_name || !form.overall_result) {
      toast.error("Preencha os campos obrigatórios: Quadro, Data, Inspetor e Resultado");
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold">Novo Checklist de Inspeção</h1>
          <p className="text-sm text-muted-foreground">Baseado nas normas NR-10 e NBR 5410</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identificação da Inspeção */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />Dados da Inspeção
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Quadro Elétrico *</Label>
              <Select value={form.panel_id} onValueChange={handlePanelSelect}>
                <SelectTrigger><SelectValue placeholder="Selecione o quadro inspecionado" /></SelectTrigger>
                <SelectContent>
                  {panels.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs text-primary mr-2">{p.tag}</span>{p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data da Inspeção *</Label>
              <Input type="date" value={form.inspection_date} onChange={e => f("inspection_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Inspetor Responsável *</Label>
              <Input value={form.inspector_name} onChange={e => f("inspector_name", e.target.value)} placeholder="Nome do inspetor" />
            </div>
            <div className="space-y-2">
              <Label>Frequência desta Inspeção</Label>
              <Select value={form.frequency} onValueChange={v => f("frequency", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="semestral">Semestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data da Próxima Inspeção</Label>
              <Input type="date" value={form.next_inspection} onChange={e => f("next_inspection", e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Resultado Geral *</Label>
              <div className="flex gap-3 flex-wrap">
                {[
                  { v: "aprovado", label: "✓ Aprovado", cls: "border-secondary text-secondary bg-secondary/10" },
                  { v: "aprovado_ressalvas", label: "⚠ Aprovado c/ Ressalvas", cls: "border-amber-400 text-amber-700 bg-amber-50" },
                  { v: "reprovado", label: "✗ Reprovado", cls: "border-destructive text-destructive bg-destructive/10" },
                ].map(opt => (
                  <button key={opt.v} type="button" onClick={() => f("overall_result", opt.v)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                      form.overall_result === opt.v ? opt.cls + " shadow-sm" : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estado Geral */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">1. Estado Geral do Invólucro</CardTitle></CardHeader>
          <CardContent>
            <CheckItem label="Integridade física do invólucro" desc="Sem corrosão, amassados, furos ou danos visíveis" field="estado_geral_involucro" value={form.estado_geral_involucro} onChange={f} />
            <CheckItem label="Fechamento de portas e selos" desc="Portas fechando corretamente, selos íntegros" field="fechamento_portas_selos" value={form.fechamento_portas_selos} onChange={f} />
            <CheckItem label="Limpeza interna e externa" desc="Ausência de sujeira, detritos e resíduos" field="limpeza_interna_externa" value={form.limpeza_interna_externa} onChange={f} />
            <CheckItem label="Ausência de umidade ou poeira excessiva" desc="Sem condensação, infiltração ou acúmulo de poeira" field="ausencia_umidade_poeira" value={form.ausencia_umidade_poeira} onChange={f} />
          </CardContent>
        </Card>

        {/* Identificação */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">2. Identificação dos Circuitos</CardTitle></CardHeader>
          <CardContent>
            <CheckItem label="Identificação de circuitos e disjuntores" desc="Etiquetas claras, legíveis e atualizadas em todos os circuitos e disjuntores" field="identificacao_circuitos" value={form.identificacao_circuitos} onChange={f} />
          </CardContent>
        </Card>

        {/* Conexões */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">3. Conexões Elétricas</CardTitle></CardHeader>
          <CardContent>
            <CheckItem label="Inspeção visual de pontos de conexão" desc="Ausência de descoloração, isolamento derretido ou sinais de superaquecimento" field="conexoes_superaquecimento" value={form.conexoes_superaquecimento} onChange={f} />
          </CardContent>
        </Card>

        {/* Dispositivos de Proteção */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">4. Dispositivos de Proteção</CardTitle></CardHeader>
          <CardContent>
            <CheckItem label="Teste funcional de DRs / inspeção de DPSs" desc="DRs testados com botão de teste; DPSs inspecionados visualmente para sinais de falha" field="dispositivos_dr_dps" value={form.dispositivos_dr_dps} onChange={f} />
          </CardContent>
        </Card>

        {/* Fiação e Cabos */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">5. Fiação e Cabos</CardTitle></CardHeader>
          <CardContent>
            <CheckItem label="Organização, isolamento e integridade dos cabos" desc="Cabos organizados, sem emendas improvisadas, isolamento íntegro, sem cabos soltos" field="fiacao_cabos" value={form.fiacao_cabos} onChange={f} />
          </CardContent>
        </Card>

        {/* Sinalização */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">6. Sinalização de Segurança</CardTitle></CardHeader>
          <CardContent>
            <CheckItem label="Placas de advertência e segurança" desc="Presença e visibilidade das placas: 'Perigo – Choque Elétrico', tensão nominal, etc." field="sinalizacao_seguranca" value={form.sinalizacao_seguranca} onChange={f} />
          </CardContent>
        </Card>

        {/* Termografia */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">7. Inspeção Termográfica</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Termografia realizada nesta inspeção?</p>
                <p className="text-xs text-muted-foreground">Recomendada para inspeções semestrais e anuais</p>
              </div>
              <Switch checked={form.termografia_realizada} onCheckedChange={v => f("termografia_realizada", v)} />
            </div>
            {form.termografia_realizada && (
              <div className="space-y-2">
                <Label>Resultado da Termografia</Label>
                <div className="flex gap-3 flex-wrap">
                  {[
                    { v: "normal", label: "Normal – sem anomalias" },
                    { v: "pontos_quentes", label: "Pontos quentes identificados" },
                  ].map(opt => (
                    <button key={opt.v} type="button" onClick={() => f("termografia_resultado", opt.v)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                        form.termografia_resultado === opt.v
                          ? opt.v === "normal" ? "border-secondary text-secondary bg-secondary/10" : "border-destructive text-destructive bg-destructive/10"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documentação */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">8. Documentação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Diagrama Unifilar está atualizado?</Label>
              <div className="flex gap-3 flex-wrap">
                {[
                  { v: "sim", label: "Sim, atualizado" },
                  { v: "nao", label: "Não, desatualizado" },
                  { v: "nao_aplicavel", label: "N/A" },
                ].map(opt => (
                  <button key={opt.v} type="button" onClick={() => f("diagrama_atualizado", opt.v)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${
                      form.diagrama_atualizado === opt.v
                        ? opt.v === "sim" ? "border-secondary text-secondary bg-secondary/10"
                          : opt.v === "nao" ? "border-destructive text-destructive bg-destructive/10"
                          : "border-border bg-muted"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Observações e Foto */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Observações e Registros</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Não conformidades e observações detalhadas</Label>
              <Textarea value={form.observacoes} onChange={e => f("observacoes", e.target.value)} placeholder="Descreva as não conformidades encontradas, ações recomendadas, etc." rows={4} />
            </div>
            <div className="space-y-2">
              <Label>Foto da Inspeção</Label>
              <label className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors w-fit">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span className="text-sm text-muted-foreground">{uploading ? "Enviando..." : "Selecionar foto"}</span>
                <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
              </label>
              {form.photo_url && <p className="text-xs text-secondary font-medium">✓ Foto enviada</p>}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pb-8">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Registrar Inspeção
          </Button>
        </div>
      </form>
    </div>
  );
}