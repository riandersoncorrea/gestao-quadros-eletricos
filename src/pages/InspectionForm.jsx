import React, { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ElectricalPanel, fetchHierarchy } from "@/api/entities";
import { getActiveTemplate, ordersForPanel, createInspection, computeOverall } from "@/api/inspections";
import { uploadFile } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { addMonths, format, parseISO } from "date-fns";
import { ArrowLeft, Loader2, Save, Plus, Trash2, Upload, ClipboardCheck, Gauge, Thermometer, ListChecks, AlertTriangle, Eraser, PenLine } from "lucide-react";

const RESP = [
  { v: "conforme", label: "Conforme", cls: "bg-secondary text-white border-secondary" },
  { v: "nao_conforme", label: "Não Conforme", cls: "bg-destructive text-white border-destructive" },
  { v: "nao_aplicavel", label: "N/A", cls: "bg-muted text-muted-foreground border-border" },
  { v: "nao_verificado", label: "Não Verificado", cls: "bg-amber-100 text-amber-800 border-amber-300" },
];

const MEAS_CAT = [
  { v: "tensao", label: "Tensão", units: ["V", "kV"] },
  { v: "corrente", label: "Corrente", units: ["A", "mA"] },
  { v: "corrente_fuga", label: "Corrente de fuga", units: ["A", "mA", "µA"] },
  { v: "resistencia_aterramento", label: "Resistência de aterramento", units: ["Ω", "mΩ"] },
  { v: "isolacao", label: "Resistência de isolação", units: ["MΩ", "GΩ"] },
  { v: "outro", label: "Outro", units: ["V", "A", "°C", "%"] },
];
const CRIT = ["A", "B", "C", "D"];
const FREQ_MONTHS = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
const SEV = [
  { v: "baixa", label: "Baixa" },
  { v: "media", label: "Média" },
  { v: "alta", label: "Alta" },
  { v: "critica", label: "Crítica" },
];
const PARAM_OPTIONS = ["R-N", "S-N", "T-N", "R-S", "S-T", "R-T"];
const RESULT_BADGE = {
  conforme: { label: "Conforme", cls: "bg-secondary/15 text-secondary border-secondary/20" },
  fora_limite: { label: "Fora do limite", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  nao_aplicavel: { label: "N/A", cls: "bg-muted text-muted-foreground border-border" },
};

function autoResultado(valor, min, max) {
  if (valor === "" || valor == null) return "";
  const v = Number(valor);
  if (Number.isNaN(v)) return "";
  if ((min === "" || min == null) && (max === "" || max == null)) return "nao_aplicavel";
  const lo = min === "" || min == null ? -Infinity : Number(min);
  const hi = max === "" || max == null ? Infinity : Number(max);
  return v >= lo && v <= hi ? "conforme" : "fora_limite";
}

const emptyMeas = () => ({ categoria: "", parametro: "", valor: "", unidade: "", instrumento: "", limite_min: "", limite_max: "", resultado: "", observacao: "" });
const emptyThermo = () => ({ equipamento: "", ponto: "", temperatura: "", temperatura_ambiente: "", instrumento: "", criticidade: "", diagnostico: "", observacao: "", imagem_url: "", imagem_termografica_url: "" });

export default function InspectionForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canEdit } = useUserRole();

  const [header, setHeader] = useState({
    panel_id: "", panel_name: "", panel_tag: "",
    inspection_date: new Date().toISOString().slice(0, 10),
    inspector_name: "", frequency: "", next_inspection: "", sap_order_id: "", observacoes: "",
  });
  const [responses, setResponses] = useState({}); // itemId -> {resposta, justificativa, motivo, observacao, descricao, recomendacao, severidade, evidencia_url}
  const [measurements, setMeasurements] = useState([]);
  const [thermography, setThermography] = useState([]);
  const [tab, setTab] = useState("dados");
  const [uploadingKey, setUploadingKey] = useState(null);
  const [locFilter, setLocFilter] = useState({ localidade_id: "", local_id: "", sublocal_id: "" });
  const [hasSignature, setHasSignature] = useState(false);
  const sigCanvasRef = useRef(null);
  const sigDrawing = useRef(false);

  const { data: panels = [] } = useQuery({ queryKey: ["panels"], queryFn: () => ElectricalPanel.list("tag") });
  const { data: hierarchy } = useQuery({ queryKey: ["hierarchy"], queryFn: fetchHierarchy });
  const { data: tpl } = useQuery({ queryKey: ["active-template"], queryFn: getActiveTemplate });
  const { data: sapOrders = [] } = useQuery({
    queryKey: ["orders-for-panel", header.panel_id],
    queryFn: () => ordersForPanel(header.panel_id),
    enabled: !!header.panel_id,
  });

  const items = tpl?.items || [];
  const modules = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (!m.has(it.modulo)) m.set(it.modulo, { modulo: it.modulo, nome: it.modulo_nome, items: [] });
      m.get(it.modulo).items.push(it);
    }
    return [...m.values()];
  }, [items]);

  const localidadeOptions = useMemo(
    () => (hierarchy?.localidades || []).map((l) => ({ value: l.id, label: l.nome })),
    [hierarchy]
  );
  const localOptions = useMemo(
    () => (hierarchy?.locais || [])
      .filter((l) => l.localidade_id === locFilter.localidade_id)
      .map((l) => ({ value: l.id, label: l.nome })),
    [hierarchy, locFilter.localidade_id]
  );
  const sublocalOptions = useMemo(
    () => (hierarchy?.sublocais || [])
      .filter((s) => s.local_id === locFilter.local_id)
      .map((s) => ({ value: s.id, label: s.nome })),
    [hierarchy, locFilter.local_id]
  );

  const filteredPanels = useMemo(
    () => panels.filter((p) =>
      (!locFilter.localidade_id || p.localidade_id === locFilter.localidade_id) &&
      (!locFilter.local_id || p.local_id === locFilter.local_id) &&
      (!locFilter.sublocal_id || p.sublocal_id === locFilter.sublocal_id)
    ),
    [panels, locFilter]
  );

  const panelOptions = useMemo(
    () => filteredPanels.map((p) => ({ value: p.id, label: p.tag ? `${p.tag} — ${p.name}` : p.name })),
    [filteredPanels]
  );

  const answeredList = useMemo(
    () => Object.entries(responses).filter(([, r]) => r.resposta).map(([template_item_id, r]) => ({ template_item_id, ...r })),
    [responses]
  );
  const ncCount = answeredList.filter((r) => r.resposta === "nao_conforme").length;
  const answeredCount = answeredList.length;
  const overall = computeOverall(answeredList, items);

  const create = useMutation({
    mutationFn: async () => {
      let assinatura_url = null;
      if (hasSignature) {
        const blob = await new Promise((resolve) => sigCanvasRef.current.toBlob(resolve, "image/png"));
        const file = new File([blob], `assinatura-${Date.now()}.png`, { type: "image/png" });
        ({ file_url: assinatura_url } = await uploadFile({ file }));
      }
      return createInspection({ header: { ...header, assinatura_url }, responses: answeredList, measurements, thermography, template: tpl?.template, items });
    },
    onSuccess: (insp) => {
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      queryClient.invalidateQueries({ queryKey: ["nonconformities"] });
      queryClient.invalidateQueries({ queryKey: ["panels"] });
      toast.success("Inspeção registrada" + (ncCount ? ` · ${ncCount} não-conformidade(s) gerada(s)` : ""));
      navigate(`/inspecoes/${insp.id}`);
    },
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  if (!canEdit) { navigate("/inspecoes"); return null; }

  const h = (k, v) => setHeader((s) => ({ ...s, [k]: v }));
  const setPanel = (id) => {
    const p = panels.find((x) => x.id === id);
    setHeader((s) => ({ ...s, panel_id: id, panel_tag: p?.tag || "", panel_name: p ? `${p.tag} — ${p.name}` : "", sap_order_id: "" }));
  };
  const clearPanelSelection = () => setHeader((s) => ({ ...s, panel_id: "", panel_tag: "", panel_name: "", sap_order_id: "" }));
  const setLocalidadeFilter = (v) => { setLocFilter({ localidade_id: v, local_id: "", sublocal_id: "" }); clearPanelSelection(); };
  const setLocalFilter = (v) => { setLocFilter((f) => ({ ...f, local_id: v, sublocal_id: "" })); clearPanelSelection(); };
  const setSublocalFilter = (v) => { setLocFilter((f) => ({ ...f, sublocal_id: v })); clearPanelSelection(); };
  const nextInspectionFor = (dateStr, freq) => {
    const months = FREQ_MONTHS[freq];
    if (!months || !dateStr) return "";
    try {
      return format(addMonths(parseISO(dateStr), months), "yyyy-MM-dd");
    } catch {
      return "";
    }
  };
  const setFrequency = (freq) => setHeader((s) => ({ ...s, frequency: freq, next_inspection: nextInspectionFor(s.inspection_date, freq) }));
  const setInspectionDate = (date) =>
    setHeader((s) => ({ ...s, inspection_date: date, next_inspection: s.frequency ? nextInspectionFor(date, s.frequency) : s.next_inspection }));

  const sigPoint = (e) => {
    const canvas = sigCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (p.clientX - rect.left) * scaleX, y: (p.clientY - rect.top) * scaleY };
  };
  const sigStart = (e) => {
    e.preventDefault();
    sigDrawing.current = true;
    const { x, y } = sigPoint(e);
    const ctx = sigCanvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const sigMove = (e) => {
    if (!sigDrawing.current) return;
    e.preventDefault();
    const { x, y } = sigPoint(e);
    const ctx = sigCanvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setHasSignature(true);
  };
  const sigEnd = () => { sigDrawing.current = false; };
  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    canvas?.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };
  const setResp = (itemId, patch) => setResponses((s) => ({ ...s, [itemId]: { ...s[itemId], ...patch } }));

  const uploadEvidence = async (e, key, apply) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingKey(key);
    try {
      const { file_url } = await uploadFile({ file });
      apply(file_url);
      toast.success("Evidência enviada");
    } catch (err) {
      toast.error(`Falha no upload: ${err.message}`);
    } finally {
      setUploadingKey(null);
    }
  };

  const validate = () => {
    if (!header.panel_id || !header.inspection_date || !header.inspector_name) {
      setTab("dados");
      toast.error("Preencha quadro, data e inspetor");
      return false;
    }
    for (const r of answeredList) {
      if (r.resposta === "nao_aplicavel" && !(r.justificativa || "").trim()) {
        setTab("checklist");
        toast.error("Itens marcados como N/A precisam de justificativa");
        return false;
      }
      if (r.resposta === "nao_verificado" && !(r.motivo || "").trim()) {
        setTab("checklist");
        toast.error("Itens 'Não Verificado' precisam de motivo");
        return false;
      }
    }
    if (answeredCount === 0) {
      setTab("checklist");
      toast.error("Responda ao menos um item do checklist");
      return false;
    }
    if (!hasSignature) {
      setTab("finalizar");
      toast.error("Assinatura do inspetor é obrigatória");
      return false;
    }
    return true;
  };

  const missingRequired = items.filter((i) => i.obrigatorio && !responses[i.id]?.resposta).length;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/inspecoes")}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold">Nova Inspeção</h1>
          <p className="text-sm text-muted-foreground">
            {tpl?.template ? `${tpl.template.nome} v${tpl.template.versao} · ${items.length} itens` : "Carregando template..."}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dados" className="gap-1"><ClipboardCheck className="h-3.5 w-3.5" />Dados</TabsTrigger>
          <TabsTrigger value="checklist" className="gap-1">
            <ListChecks className="h-3.5 w-3.5" />Checklist
            <Badge variant="outline" className="ml-1 text-[10px]">{answeredCount}/{items.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="medicoes" className="gap-1"><Gauge className="h-3.5 w-3.5" />Medições
            {measurements.length > 0 && <Badge variant="outline" className="ml-1 text-[10px]">{measurements.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="termografia" className="gap-1"><Thermometer className="h-3.5 w-3.5" />Termografia
            {thermography.length > 0 && <Badge variant="outline" className="ml-1 text-[10px]">{thermography.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="finalizar" className="gap-1"><Save className="h-3.5 w-3.5" />Finalizar</TabsTrigger>
        </TabsList>

        {/* DADOS */}
        <TabsContent value="dados" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Dados da inspeção</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2 grid gap-4 sm:grid-cols-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="space-y-2">
                  <Label>Site (Localidade)</Label>
                  <Combobox options={localidadeOptions} value={locFilter.localidade_id} onChange={setLocalidadeFilter}
                    placeholder="Todas" searchPlaceholder="Buscar localidade..." />
                </div>
                <div className="space-y-2">
                  <Label>Local (Prédio)</Label>
                  <Combobox options={localOptions} value={locFilter.local_id} onChange={setLocalFilter}
                    placeholder={locFilter.localidade_id ? "Todos" : "Selecione o site primeiro"}
                    searchPlaceholder="Buscar prédio..." disabled={!locFilter.localidade_id} />
                </div>
                <div className="space-y-2">
                  <Label>Sublocal</Label>
                  <Combobox options={sublocalOptions} value={locFilter.sublocal_id} onChange={setSublocalFilter}
                    placeholder={locFilter.local_id ? "Todos" : "Selecione o prédio primeiro"}
                    searchPlaceholder="Buscar sublocal..." disabled={!locFilter.local_id} />
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Quadro elétrico *</Label>
                <Combobox options={panelOptions} value={header.panel_id} onChange={setPanel}
                  placeholder="Selecione o quadro" searchPlaceholder="Buscar por TAG ou nome..." />
                {(locFilter.localidade_id || locFilter.local_id || locFilter.sublocal_id) && (
                  <p className="text-xs text-muted-foreground">{panelOptions.length} quadro(s) na localização filtrada</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Data *</Label>
                <Input type="date" value={header.inspection_date} onChange={(e) => setInspectionDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Inspetor *</Label>
                <Input value={header.inspector_name} onChange={(e) => h("inspector_name", e.target.value)} placeholder="Nome do inspetor" />
              </div>
              <div className="space-y-2">
                <Label>Frequência</Label>
                <Select value={header.frequency} onValueChange={setFrequency}>
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
                <Label>Próxima inspeção</Label>
                <Input type="date" value={header.next_inspection} onChange={(e) => h("next_inspection", e.target.value)} />
              </div>
              {header.panel_id && sapOrders.length > 0 && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Vincular a ordem SAP (opcional)</Label>
                  <Select value={header.sap_order_id || "__none__"} onValueChange={(v) => h("sap_order_id", v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {sapOrders.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.ordem || "s/ ordem"}{o.plano ? ` · ${o.plano}` : ""}{o.data_planejada ? ` · ${o.data_planejada}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CHECKLIST */}
        <TabsContent value="checklist" className="space-y-4 mt-4">
          {modules.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item de template disponível.</p>}
          {modules.map((mod) => (
            <Card key={mod.modulo}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{mod.modulo}. {mod.nome}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {mod.items.map((it) => {
                  const r = responses[it.id] || {};
                  return (
                    <div key={it.id} className="py-3 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {it.codigo && <span className="font-mono text-xs text-muted-foreground mr-2">{it.codigo}</span>}
                            {it.titulo}
                            {it.obrigatorio && <span className="text-destructive ml-1">*</span>}
                          </p>
                          {it.descricao && <p className="text-xs text-muted-foreground mt-0.5">{it.descricao}</p>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {RESP.map((o) => (
                            <button key={o.v} type="button"
                              onClick={() => setResp(it.id, { resposta: r.resposta === o.v ? undefined : o.v })}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                                r.resposta === o.v ? o.cls + " shadow-sm" : "bg-background border-border text-muted-foreground hover:bg-muted"
                              }`}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {r.resposta === "nao_aplicavel" && (
                        <Input placeholder="Justificativa (obrigatória) — por que não se aplica?"
                          value={r.justificativa || ""} onChange={(e) => setResp(it.id, { justificativa: e.target.value })} />
                      )}
                      {r.resposta === "nao_verificado" && (
                        <Input placeholder="Motivo (obrigatório) — por que não foi verificado?"
                          value={r.motivo || ""} onChange={(e) => setResp(it.id, { motivo: e.target.value })} />
                      )}
                      {r.resposta === "nao_conforme" && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                          <p className="text-xs font-medium text-destructive flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Gera uma não-conformidade automaticamente
                          </p>
                          <Textarea rows={2} placeholder="Descrição da não-conformidade (opcional — usa o título do item se vazio)"
                            value={r.descricao || ""} onChange={(e) => setResp(it.id, { descricao: e.target.value })} />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input placeholder="Recomendação / ação sugerida"
                              value={r.recomendacao || ""} onChange={(e) => setResp(it.id, { recomendacao: e.target.value })} />
                            <Select value={r.severidade || "media"} onValueChange={(v) => setResp(it.id, { severidade: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {SEV.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {r.resposta && (
                        <div className="flex flex-wrap items-center gap-3">
                          <Input className="flex-1 min-w-[200px]" placeholder="Observação (opcional)"
                            value={r.observacao || ""} onChange={(e) => setResp(it.id, { observacao: e.target.value })} />
                          <label className="flex items-center gap-1.5 px-3 h-9 border border-dashed border-border rounded-md cursor-pointer hover:bg-muted/50 text-xs text-muted-foreground shrink-0">
                            {uploadingKey === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {r.evidencia_url ? "Trocar evidência" : "Evidência"}
                            <input type="file" className="hidden" accept="image/*,.pdf"
                              onChange={(e) => uploadEvidence(e, it.id, (url) => setResp(it.id, { evidencia_url: url }))} />
                          </label>
                          {r.evidencia_url && <span className="text-xs text-secondary">✓ anexada</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* MEDIÇÕES */}
        <TabsContent value="medicoes" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base">Medições</CardTitle>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setMeasurements((m) => [...m, emptyMeas()])}>
                <Plus className="h-3.5 w-3.5" />Adicionar
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {measurements.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma medição registrada.</p>}
              {measurements.map((m, i) => {
                const cat = MEAS_CAT.find((c) => c.v === m.categoria);
                return (
                  <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Medição {i + 1}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                        onClick={() => setMeasurements((arr) => arr.filter((_, x) => x !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select value={m.categoria} onValueChange={(v) => setMeasurements((arr) => arr.map((x, xi) => xi === i ? { ...x, categoria: v, unidade: "" } : x))}>
                        <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                        <SelectContent>{MEAS_CAT.map((c) => <SelectItem key={c.v} value={c.v}>{c.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={m.parametro} onValueChange={(v) => setMeasurements((arr) => arr.map((x, xi) => xi === i ? { ...x, parametro: v } : x))}>
                        <SelectTrigger><SelectValue placeholder="Parâmetro" /></SelectTrigger>
                        <SelectContent>{PARAM_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Input type="number" step="any" placeholder="Valor" value={m.valor}
                        onChange={(e) => setMeasurements((arr) => arr.map((x, xi) => xi === i ? { ...x, valor: e.target.value, resultado: autoResultado(e.target.value, x.limite_min, x.limite_max) } : x))} />
                      <Select value={m.unidade} onValueChange={(v) => setMeasurements((arr) => arr.map((x, xi) => xi === i ? { ...x, unidade: v } : x))}>
                        <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
                        <SelectContent>{(cat?.units || []).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" step="any" placeholder="Limite mín." value={m.limite_min}
                        onChange={(e) => setMeasurements((arr) => arr.map((x, xi) => xi === i ? { ...x, limite_min: e.target.value, resultado: autoResultado(x.valor, e.target.value, x.limite_max) } : x))} />
                      <Input type="number" step="any" placeholder="Limite máx." value={m.limite_max}
                        onChange={(e) => setMeasurements((arr) => arr.map((x, xi) => xi === i ? { ...x, limite_max: e.target.value, resultado: autoResultado(x.valor, x.limite_min, e.target.value) } : x))} />
                    </div>
                    {m.categoria === "corrente_fuga" && (
                      <p className="text-[11px] text-muted-foreground">Corrente de fuga sempre em A, mA ou µA — nunca em Volts.</p>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2 items-center">
                      <div className="flex items-center gap-2 h-9">
                        <span className="text-xs text-muted-foreground">Resultado:</span>
                        {m.resultado ? (
                          <Badge variant="outline" className={`text-[10px] ${RESULT_BADGE[m.resultado]?.cls || ""}`}>
                            {RESULT_BADGE[m.resultado]?.label || m.resultado}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">preencha valor e limites</span>
                        )}
                      </div>
                      <Input placeholder="Instrumento" value={m.instrumento}
                        onChange={(e) => setMeasurements((arr) => arr.map((x, xi) => xi === i ? { ...x, instrumento: e.target.value } : x))} />
                    </div>
                    <Input placeholder="Observação" value={m.observacao}
                      onChange={(e) => setMeasurements((arr) => arr.map((x, xi) => xi === i ? { ...x, observacao: e.target.value } : x))} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TERMOGRAFIA */}
        <TabsContent value="termografia" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base">Pontos de termografia</CardTitle>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setThermography((t) => [...t, emptyThermo()])}>
                <Plus className="h-3.5 w-3.5" />Adicionar ponto
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {thermography.length === 0 && <p className="text-sm text-muted-foreground">Nenhum ponto registrado.</p>}
              {thermography.map((t, i) => {
                const dt = t.temperatura !== "" && t.temperatura_ambiente !== "" ? (Number(t.temperatura) - Number(t.temperatura_ambiente)).toFixed(1) : null;
                return (
                  <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Ponto {i + 1}{dt != null && ` · ΔT ${dt} °C`}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                        onClick={() => setThermography((arr) => arr.filter((_, x) => x !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input placeholder="Equipamento (ex: disjuntor geral)" value={t.equipamento}
                        onChange={(e) => setThermography((arr) => arr.map((x, xi) => xi === i ? { ...x, equipamento: e.target.value } : x))} />
                      <Input placeholder="Ponto (ex: borne L1)" value={t.ponto}
                        onChange={(e) => setThermography((arr) => arr.map((x, xi) => xi === i ? { ...x, ponto: e.target.value } : x))} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input type="number" step="any" placeholder="Temp. medida (°C)" value={t.temperatura}
                        onChange={(e) => setThermography((arr) => arr.map((x, xi) => xi === i ? { ...x, temperatura: e.target.value } : x))} />
                      <Input type="number" step="any" placeholder="Temp. ambiente (°C)" value={t.temperatura_ambiente}
                        onChange={(e) => setThermography((arr) => arr.map((x, xi) => xi === i ? { ...x, temperatura_ambiente: e.target.value } : x))} />
                      <Select value={t.criticidade || "__none__"} onValueChange={(v) => setThermography((arr) => arr.map((x, xi) => xi === i ? { ...x, criticidade: v === "__none__" ? "" : v } : x))}>
                        <SelectTrigger><SelectValue placeholder="Criticidade" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {CRIT.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input placeholder="Diagnóstico" value={t.diagnostico}
                      onChange={(e) => setThermography((arr) => arr.map((x, xi) => xi === i ? { ...x, diagnostico: e.target.value } : x))} />
                    <div className="flex flex-wrap items-center gap-3">
                      <Input className="flex-1 min-w-[200px]" placeholder="Observação" value={t.observacao}
                        onChange={(e) => setThermography((arr) => arr.map((x, xi) => xi === i ? { ...x, observacao: e.target.value } : x))} />
                      <label className="flex items-center gap-1.5 px-3 h-9 border border-dashed border-border rounded-md cursor-pointer hover:bg-muted/50 text-xs text-muted-foreground shrink-0">
                        {uploadingKey === `thermo-${i}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {t.imagem_termografica_url ? "Trocar imagem" : "Imagem térmica"}
                        <input type="file" className="hidden" accept="image/*"
                          onChange={(e) => uploadEvidence(e, `thermo-${i}`, (url) => setThermography((arr) => arr.map((x, xi) => xi === i ? { ...x, imagem_termografica_url: url } : x)))} />
                      </label>
                      {t.imagem_termografica_url && <span className="text-xs text-secondary">✓ anexada</span>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FINALIZAR */}
        <TabsContent value="finalizar" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Itens respondidos</p><p className="text-xl font-bold">{answeredCount}/{items.length}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Não conformidades</p><p className="text-xl font-bold text-destructive">{ncCount}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Medições</p><p className="text-xl font-bold">{measurements.length}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Termografia</p><p className="text-xl font-bold">{thermography.length}</p></CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Resultado calculado:</span>
                <Badge variant="outline" className={
                  overall === "aprovado" ? "bg-secondary/15 text-secondary border-secondary/20"
                    : overall === "aprovado_ressalvas" ? "bg-amber-100 text-amber-800 border-amber-200"
                      : "bg-destructive/10 text-destructive border-destructive/20"
                }>
                  {overall === "aprovado" ? "Aprovado" : overall === "aprovado_ressalvas" ? "Aprovado c/ ressalvas" : "Reprovado"}
                </Badge>
              </div>
              {missingRequired > 0 && (
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />{missingRequired} item(ns) obrigatório(s) ainda sem resposta
                </p>
              )}
              <div className="space-y-2">
                <Label>Observações gerais</Label>
                <Textarea rows={3} value={header.observacoes} onChange={(e) => h("observacoes", e.target.value)}
                  placeholder="Resumo, diagnóstico geral, recomendações..." />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><PenLine className="h-4 w-4 text-primary" />Assinatura do inspetor *</CardTitle>
              <Button size="sm" variant="outline" className="gap-1" onClick={clearSignature}>
                <Eraser className="h-3.5 w-3.5" />Limpar
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <canvas
                ref={sigCanvasRef}
                width={600}
                height={160}
                className="w-full h-40 rounded-md border border-border bg-white touch-none cursor-crosshair"
                onMouseDown={sigStart} onMouseMove={sigMove} onMouseUp={sigEnd} onMouseLeave={sigEnd}
                onTouchStart={sigStart} onTouchMove={sigMove} onTouchEnd={sigEnd}
              />
              <p className="text-xs text-muted-foreground">Assine com o mouse ou o dedo (tela sensível ao toque).</p>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pb-8">
            <Button variant="outline" onClick={() => navigate("/inspecoes")}>Cancelar</Button>
            <Button className="gap-2" disabled={create.isPending}
              onClick={() => { if (validate()) create.mutate(); }}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Registrar inspeção
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
