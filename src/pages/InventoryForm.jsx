import React, { useState, useEffect, useMemo } from "react";
import { ElectricalPanel, fetchHierarchy } from "@/api/entities";
import { uploadFile } from "@/lib/storage";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Save, ArrowLeft, Upload, MapPin, Loader2, Zap, Hash, Database } from "lucide-react";

const SITE_PREFIX = { porto: "PRT", oficina: "OFC", pelotizacao: "PEL" };

const CRITICALITY_LABEL = {
  A: "A – Crítico",
  B: "B – Alto",
  C: "C – Médio",
  D: "D – Baixo",
};

const VOLTAGE_OPTIONS = ["440V", "380V", "220V"];

const BREAKER_TYPE_OPTIONS = [
  "Termomagnético (MCB)", "Caixa moldada (MCCB)", "Aberto (ACB)", "Disjuntor-motor", "DR/IDR", "Outro", "Não identificado",
];

const BRAND_OPTIONS = [
  "Schneider Electric", "Siemens", "ABB", "WEG", "Eaton", "GE", "Legrand", "Steck", "Tramontina", "Soprano",
  "Lorenzetti", "Siemens/ITE", "Merlin Gerin", "Square D", "Outra", "Não identificado",
];

const EMPTY_FORM = {
  name: "", nomenclatura_oficial: "", criticality: "", site: "",
  localidade_id: "", local_id: "", sublocal_id: "",
  installation_location: "", location_floor: "", location_room: "", coordinate: "",
  panel_type: "", panel_type_custom: "", voltage_nominal: "", current_nominal: "",
  frequency_hz: "60hz", power_supply: "", main_breaker_type: "", main_breaker_capacity: "", main_breaker_brand: "", phases: "",
  circuit_count: "", has_dr: false, has_dps: false, has_grounding: false,
  diagram_status: "inexistente", diagram_url: "", photo_url: "", installation_date: "",
  last_inspection_date: "", next_inspection_date: "", inspection_frequency: "",
  sap_functional_location: "", sap_equipment_number: "",
  latitude: "", longitude: "", status: "ativo", responsible_engineer: "Francisco Josadack", notes: "",
};

export default function InventoryForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canEdit, isAdmin } = useUserRole();
  const isEditing = !!id;
  const criticidadeLocked = !isEditing && !isAdmin;
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const { data: panels } = useQuery({
    queryKey: ["panel", id],
    queryFn: () => ElectricalPanel.filter({ id }),
    enabled: !!id,
  });

  const { data: allPanels = [] } = useQuery({
    queryKey: ["panels"],
    queryFn: () => ElectricalPanel.list("tag"),
  });

  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy"],
    queryFn: fetchHierarchy,
  });

  useEffect(() => {
    if (panels?.[0]) {
      const p = panels[0];
      setForm(Object.fromEntries(
        Object.keys(EMPTY_FORM).map(k => [k, p[k] ?? EMPTY_FORM[k]])
      ));
    }
  }, [panels]);

  const localOptions = useMemo(
    () => (hierarchy?.locais || []).map(l => ({ value: l.id, label: l.nome })),
    [hierarchy]
  );
  const sublocalOptions = useMemo(
    () => (hierarchy?.sublocais || [])
      .filter(s => s.local_id === form.local_id)
      .map(s => ({ value: s.id, label: s.nome })),
    [hierarchy, form.local_id]
  );
  const powerSupplyOptions = useMemo(
    () => allPanels
      .filter(p => p.id !== id && p.tag)
      .map(p => ({ value: `Alimentado pelo ${p.tag}`, label: `Alimentado pelo ${p.tag}` })),
    [allPanels, id]
  );

  const localName = useMemo(() => (hierarchy?.locais || []).find(l => l.id === form.local_id)?.nome || "", [hierarchy, form.local_id]);
  const sublocalName = useMemo(() => (hierarchy?.sublocais || []).find(s => s.id === form.sublocal_id)?.nome || "", [hierarchy, form.sublocal_id]);
  const nameSuffix = localName && sublocalName ? `${localName}_${sublocalName}` : "";

  const mutation = useMutation({
    mutationFn: async (data) => {
      const clean = { ...data };
      // Placeholder até sabermos a tag real (gerada pelo banco no insert);
      // a coluna name é not-null, então não dá pra mandar vazia.
      clean.name = `${tagPreview || "QD"} / ${nameSuffix}`;
      if (clean.latitude) clean.latitude = parseFloat(clean.latitude);
      if (clean.longitude) clean.longitude = parseFloat(clean.longitude);
      if (clean.circuit_count) clean.circuit_count = parseInt(clean.circuit_count);
      const selectedLocal = (hierarchy?.locais || []).find(l => l.id === clean.local_id);
      clean.localidade_id = selectedLocal?.localidade_id || "";
      Object.keys(clean).forEach(k => {
        if (clean[k] === "") clean[k] = isEditing ? null : undefined;
      });
      Object.keys(clean).forEach(k => { if (clean[k] === undefined) delete clean[k]; });

      // A Tag é gerada automaticamente pelo banco (trigger) com base no Site.
      // O Nome Descritivo depende da Tag, então para um cadastro novo só dá
      // para calcular o nome final depois que o insert retorna a tag real.
      if (isEditing) {
        const tag = panels?.[0]?.tag;
        return ElectricalPanel.update(id, { ...clean, name: `${tag} / ${nameSuffix}` });
      }
      const created = await ElectricalPanel.create(clean);
      return ElectricalPanel.update(created.id, { name: `${created.tag} / ${nameSuffix}` });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panels"] });
      queryClient.invalidateQueries({ queryKey: ["panel", id] });
      queryClient.invalidateQueries({ queryKey: ["spatial"] });
      toast.success(isEditing ? "Quadro atualizado!" : "Quadro cadastrado no inventário!");
      navigate("/inventario");
    },
    onError: () => toast.error("Erro ao salvar o quadro"),
  });

  const handleFileUpload = async (e, field) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const setLoad = field === "diagram_url" ? setUploading : setUploadingPhoto;
    setLoad(true);
    const { file_url } = await uploadFile({ file });
    setForm(prev => ({ ...prev, [field]: file_url }));
    setLoad(false);
    toast.success("Arquivo enviado!");
  };

  const getMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setForm(prev => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        toast.success("Localização obtida!");
      },
      () => toast.error("Não foi possível obter a localização")
    );
  };

  if (!canEdit) { navigate("/inventario"); return null; }

  const f = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const tagPreview = form.site ? `${SITE_PREFIX[form.site]}_QD_XXXX` : "";
  const namePreview = isEditing
    ? (panels?.[0]?.tag ? `${panels[0].tag} / ${nameSuffix || "…"}` : "—")
    : (tagPreview ? `${tagPreview} / ${nameSuffix || "…"}` : "Selecione o Site, o Prédio e o Sublocal");

  const setLocal = (v) => setForm(prev => ({ ...prev, local_id: v, sublocal_id: "" }));

  const validate = () => {
    if (isEditing) return true; // campos obrigatórios valem só para novos cadastros
    const required = [
      [form.nomenclatura_oficial, "Nomenclatura Oficial"],
      [criticidadeLocked || form.criticality, "Criticidade do Ativo"],
      [form.panel_type, "Tipo de Quadro"],
      [form.panel_type !== "outro" || form.panel_type_custom, "Tipo Personalizado"],
      [form.status, "Status Operacional"],
      [form.responsible_engineer, "Engenheiro Responsável"],
      [form.site, "Site"],
      [form.local_id, "Local (Prédio)"],
      [form.sublocal_id, "Sublocal"],
      [form.location_floor, "Andar / Pavimento"],
      [form.coordinate, "Coordenada (referência)"],
      [form.voltage_nominal, "Tensão Nominal"],
      [form.current_nominal, "Corrente Nominal"],
      [form.frequency_hz, "Frequência"],
      [form.power_supply, "Alimentação"],
      [form.main_breaker_type, "Tipo de Disjuntor Geral"],
      [form.main_breaker_capacity, "Capacidade do Disjuntor"],
      [form.main_breaker_brand, "Marca / Modelo Disjuntor"],
      [form.phases, "Fases"],
      [form.circuit_count, "Número de Circuitos"],
      [form.diagram_status, "Status do Diagrama Unifilar"],
      [form.photo_url, "Foto do Quadro"],
    ];
    const missing = required.find(([v]) => !v);
    if (missing) {
      toast.error(`Campo obrigatório: ${missing[1]}`);
      return false;
    }
    return true;
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{isEditing ? "Editar Inventário" : "Cadastrar no Inventário"}</h1>
          <p className="text-sm text-muted-foreground">Conforme campos definidos no processo de gerenciamento</p>
        </div>
      </div>

      <form onSubmit={(e) => {
        e.preventDefault();
        if (!validate()) return;
        mutation.mutate(form);
      }} className="space-y-6">

        {/* Identificação */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-primary" />Identificação</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>ID / Tag do Quadro</Label>
              <div className="flex items-center gap-2 px-3 h-9 rounded-md border border-dashed border-border bg-muted/40 text-sm text-muted-foreground">
                <Hash className="h-3.5 w-3.5 text-primary/60" />
                {isEditing
                  ? <span className="font-mono">{panels?.[0]?.tag || "—"}</span>
                  : tagPreview
                    ? <span className="font-mono">{tagPreview} <span className="text-xs">(gerado automaticamente)</span></span>
                    : <span>Selecione o Site para gerar a Tag</span>}
              </div>
              {!isEditing && (
                <p className="text-xs text-muted-foreground">
                  A Tag é gerada automaticamente ao salvar, conforme o Site selecionado.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Nome Descritivo</Label>
              <div className="flex items-center gap-2 px-3 h-9 rounded-md border border-dashed border-border bg-muted/40 text-sm text-muted-foreground">
                <span className="font-mono truncate">{namePreview}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Gerado automaticamente: Tag / Prédio_Sublocal.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Nomenclatura Oficial{isEditing ? "" : " *"}</Label>
              <Input value={form.nomenclatura_oficial} onChange={e => f("nomenclatura_oficial", e.target.value)} placeholder="Identificação oficial do ativo" />
            </div>
            <div className="space-y-2">
              <Label>Criticidade do Ativo {!isEditing && !criticidadeLocked && "*"}</Label>
              <Select value={form.criticality} onValueChange={v => f("criticality", v)} disabled={criticidadeLocked}>
                <SelectTrigger disabled={criticidadeLocked}><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CRITICALITY_LABEL).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {criticidadeLocked && (
                <p className="text-xs text-muted-foreground">Somente um administrador pode definir a criticidade.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tipo de Quadro{isEditing ? "" : " *"}</Label>
              <Select value={form.panel_type} onValueChange={v => f("panel_type", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="QDL">QDL – Distribuição de Luz</SelectItem>
                  <SelectItem value="QDF">QDF – Distribuição de Força</SelectItem>
                  <SelectItem value="QDC">QDC – Comando</SelectItem>
                  <SelectItem value="QGBT">QGBT – Geral Baixa Tensão</SelectItem>
                  <SelectItem value="QTA">QTA – Transferência Automática</SelectItem>
                  <SelectItem value="QF">QF – Força</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.panel_type === "outro" && (
              <div className="space-y-2">
                <Label>Tipo Personalizado{isEditing ? "" : " *"}</Label>
                <Input value={form.panel_type_custom} onChange={e => f("panel_type_custom", e.target.value)} placeholder="Descreva o tipo" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Status Operacional{isEditing ? "" : " *"}</Label>
              <Select value={form.status} onValueChange={v => f("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="manutencao">Em Manutenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Engenheiro Responsável{isEditing ? "" : " *"}</Label>
              <Input value={form.responsible_engineer} onChange={e => f("responsible_engineer", e.target.value)} placeholder="Nome do engenheiro" />
            </div>
          </CardContent>
        </Card>

        {/* Localização */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Localização</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Site{isEditing ? "" : " *"}</Label>
              <Select value={form.site} onValueChange={v => f("site", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o site" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="porto">Porto</SelectItem>
                  <SelectItem value="oficina">Oficina</SelectItem>
                  <SelectItem value="pelotizacao">Pelotização</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="hidden sm:block" />
            <div className="space-y-2">
              <Label>Local (Prédio){isEditing ? "" : " *"}</Label>
              <Combobox
                options={localOptions}
                value={form.local_id}
                onChange={setLocal}
                placeholder="Selecione o prédio"
                searchPlaceholder="Buscar prédio..."
              />
            </div>
            <div className="space-y-2">
              <Label>Sublocal{isEditing ? "" : " *"}</Label>
              <Combobox
                options={sublocalOptions}
                value={form.sublocal_id}
                onChange={v => f("sublocal_id", v)}
                placeholder={form.local_id ? "Selecione o sublocal" : "Selecione o prédio primeiro"}
                searchPlaceholder="Buscar sublocal..."
                disabled={!form.local_id}
              />
            </div>
            <div className="space-y-2">
              <Label>Andar / Pavimento{isEditing ? "" : " *"}</Label>
              <Input value={form.location_floor} onChange={e => f("location_floor", e.target.value)} placeholder="Ex: 3º Andar, Térreo" />
            </div>
            <div className="space-y-2">
              <Label>Coordenada (referência){isEditing ? "" : " *"}</Label>
              <Input value={form.coordinate} onChange={e => f("coordinate", e.target.value)} placeholder="Ex: eixo/coluna, cota" />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Coordenadas GPS (opcional)</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={getMyLocation}>
                  <MapPin className="h-3 w-3" />Usar minha localização
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input value={form.latitude} onChange={e => f("latitude", e.target.value)} placeholder="Latitude" type="number" step="any" />
                <Input value={form.longitude} onChange={e => f("longitude", e.target.value)} placeholder="Longitude" type="number" step="any" />
              </div>
              <p className="text-xs text-muted-foreground">Pode ser preenchida depois direto pelo mapa (posicionar quadro).</p>
            </div>
          </CardContent>
        </Card>

        {/* Dados Técnicos */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Dados Técnicos</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tensão Nominal{isEditing ? "" : " *"}</Label>
              <Select value={form.voltage_nominal} onValueChange={v => f("voltage_nominal", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {VOLTAGE_OPTIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Corrente Nominal{isEditing ? "" : " *"}</Label>
              <Input value={form.current_nominal} onChange={e => f("current_nominal", e.target.value)} placeholder="Ex: 100A" />
            </div>
            <div className="space-y-2">
              <Label>Frequência{isEditing ? "" : " *"}</Label>
              <Select value={form.frequency_hz} onValueChange={v => f("frequency_hz", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="60hz">60 Hz (padrão)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Alimentação (fonte){isEditing ? "" : " *"}</Label>
              <Combobox
                options={powerSupplyOptions}
                value={form.power_supply}
                onChange={v => f("power_supply", v)}
                placeholder="Selecione o quadro de origem"
                searchPlaceholder="Buscar por TAG..."
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Disjuntor Geral{isEditing ? "" : " *"}</Label>
              <Select value={form.main_breaker_type} onValueChange={v => f("main_breaker_type", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {BREAKER_TYPE_OPTIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Capacidade do Disjuntor{isEditing ? "" : " *"}</Label>
              <Input value={form.main_breaker_capacity} onChange={e => f("main_breaker_capacity", e.target.value)} placeholder="Ex: 100A, Curva C" />
            </div>
            <div className="space-y-2">
              <Label>Marca / Modelo Disjuntor{isEditing ? "" : " *"}</Label>
              <Select value={form.main_breaker_brand} onValueChange={v => f("main_breaker_brand", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {BRAND_OPTIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fases{isEditing ? "" : " *"}</Label>
              <Select value={form.phases} onValueChange={v => f("phases", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monofasico">Monofásico</SelectItem>
                  <SelectItem value="bifasico">Bifásico</SelectItem>
                  <SelectItem value="trifasico">Trifásico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Número de Circuitos{isEditing ? "" : " *"}</Label>
              <Input value={form.circuit_count} onChange={e => f("circuit_count", e.target.value)} placeholder="Ex: 24" type="number" />
            </div>
          </CardContent>
        </Card>

        {/* Dados SAP */}
        <Card className={!isAdmin ? "opacity-60" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" />Dados SAP (Plano de Manutenção)</span>
              {!isAdmin && <span className="text-xs font-normal text-muted-foreground">Somente administrador</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Local de Instalação SAP</Label>
              <Input value={form.sap_functional_location} onChange={e => f("sap_functional_location", e.target.value)} placeholder="TAG do local funcional SAP" disabled={!isAdmin} />
            </div>
            <div className="space-y-2">
              <Label>Nº do Equipamento SAP</Label>
              <Input value={form.sap_equipment_number} onChange={e => f("sap_equipment_number", e.target.value)} placeholder="Nº SAP do ativo" disabled={!isAdmin} />
            </div>
          </CardContent>
        </Card>

        {/* Proteções */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Dispositivos de Proteção</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { field: "has_dr", label: "Possui DR", desc: "Dispositivo Diferencial Residual" },
              { field: "has_dps", label: "Possui DPS", desc: "Dispositivo de Proteção contra Surtos" },
              { field: "has_grounding", label: "Possui Aterramento", desc: "Sistema de aterramento elétrico" },
            ].map(({ field, label, desc }) => (
              <div key={field} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button" size="sm"
                    variant={form[field] ? "default" : "outline"}
                    className={form[field] ? "bg-secondary hover:bg-secondary/90" : ""}
                    onClick={() => f(field, true)}
                  >
                    Sim
                  </Button>
                  <Button
                    type="button" size="sm"
                    variant={!form[field] ? "default" : "outline"}
                    onClick={() => f(field, false)}
                  >
                    Não
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Inspeções (desabilitado) */}
        <Card className="opacity-60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Inspeções Programadas</span>
              <span className="text-xs font-normal text-muted-foreground">Indisponível no momento</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Frequência de Inspeção</Label>
              <Select value={form.inspection_frequency} onValueChange={v => f("inspection_frequency", v)} disabled>
                <SelectTrigger disabled><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="semestral">Semestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data de Instalação</Label>
              <Input type="date" value={form.installation_date} onChange={e => f("installation_date", e.target.value)} disabled />
            </div>
            <div className="space-y-2">
              <Label>Última Inspeção</Label>
              <Input type="date" value={form.last_inspection_date} onChange={e => f("last_inspection_date", e.target.value)} disabled />
            </div>
            <div className="space-y-2">
              <Label>Próxima Inspeção</Label>
              <Input type="date" value={form.next_inspection_date} onChange={e => f("next_inspection_date", e.target.value)} disabled />
            </div>
          </CardContent>
        </Card>

        {/* Diagrama e Documentação */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Documentação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Status do Diagrama Unifilar{isEditing ? "" : " *"}</Label>
              <Select value={form.diagram_status} onValueChange={v => f("diagram_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="atualizado">Atualizado</SelectItem>
                  <SelectItem value="desatualizado">Desatualizado</SelectItem>
                  <SelectItem value="inexistente">Inexistente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Upload do Diagrama Unifilar</Label>
              <label className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors w-fit">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span className="text-sm text-muted-foreground">{uploading ? "Enviando..." : "Selecionar arquivo (PDF ou imagem)"}</span>
                <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => handleFileUpload(e, "diagram_url")} />
              </label>
              {form.diagram_url && <p className="text-xs text-secondary font-medium">✓ Diagrama enviado</p>}
            </div>
            <div className="space-y-2">
              <Label>Foto do Quadro{isEditing ? "" : " *"}</Label>
              <label className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors w-fit">
                {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span className="text-sm text-muted-foreground">{uploadingPhoto ? "Enviando..." : "Selecionar foto"}</span>
                <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, "photo_url")} />
              </label>
              {form.photo_url && <p className="text-xs text-secondary font-medium">✓ Foto enviada</p>}
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => f("notes", e.target.value)} placeholder="Informações adicionais, não conformidades, necessidades de adequação..." rows={3} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pb-8">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEditing ? "Salvar Alterações" : "Cadastrar no Inventário"}
          </Button>
        </div>
      </form>
    </div>
  );
}
