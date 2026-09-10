import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ElectricalPanel } from "@/api/entities";
import { parseSpreadsheet, suggestMapping, buildOrders, SAP_FIELDS } from "@/lib/sapImport";
import { commitImport } from "@/api/sap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const fmtD = (d) => { try { return d ? format(parseISO(d), "dd/MM/yyyy") : "—"; } catch { return String(d); } };
import { ArrowLeft, ArrowRight, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle, Link2, Link2Off } from "lucide-react";

const STEPS = ["Arquivo", "Mapeamento", "Validação"];
const NONE = "__none__";

export default function SapImportWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canEdit } = useUserRole();

  const [step, setStep] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null); // { sheetNames, sheets }
  const [sheetName, setSheetName] = useState("");
  const [mapping, setMapping] = useState({});
  const [notes, setNotes] = useState("");

  const { data: panels = [] } = useQuery({
    queryKey: ["panels"],
    queryFn: () => ElectricalPanel.list("tag"),
  });

  const sheet = parsed?.sheets?.[sheetName];

  const { orders, stats } = useMemo(() => {
    if (!sheet) return { orders: [], stats: null };
    return buildOrders(sheet.rows, mapping, panels);
  }, [sheet, mapping, panels]);

  const commit = useMutation({
    mutationFn: () =>
      commitImport({ filename: file?.name, mapping, orders, stats, notes }),
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: ["sap-batches"] });
      toast.success("Importação concluída");
      navigate(`/importacao-sap/${batch.id}`);
    },
    onError: (e) => toast.error(`Falha ao importar: ${e.message}`),
  });

  if (!canEdit) { navigate("/importacao-sap"); return null; }

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setParsing(true);
    try {
      const result = await parseSpreadsheet(f);
      setFile(f);
      setParsed(result);
      const first = result.sheetNames[0] || "";
      setSheetName(first);
      setMapping(suggestMapping(result.sheets[first]?.columns || []));
    } catch (err) {
      toast.error(`Não foi possível ler o arquivo: ${err.message}`);
    } finally {
      setParsing(false);
    }
  };

  const onSheetChange = (name) => {
    setSheetName(name);
    setMapping(suggestMapping(parsed.sheets[name]?.columns || []));
  };

  const setField = (fieldKey, column) =>
    setMapping((m) => ({ ...m, [fieldKey]: column === NONE ? undefined : column }));

  const canAdvance =
    (step === 0 && sheet && sheet.rows.length > 0) ||
    (step === 1 && mapping.ordem) ||
    step === 2;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/importacao-sap")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nova Importação SAP</h1>
          <p className="text-sm text-muted-foreground">
            Carregue o plano de manutenção exportado do SAP (Excel ou CSV).
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-2 text-sm ${i === step ? "text-primary font-semibold" : i < step ? "text-secondary" : "text-muted-foreground"}`}>
              <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs border ${i === step ? "border-primary bg-primary/10" : i < step ? "border-secondary bg-secondary/10" : "border-border"}`}>
                {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {s}
            </div>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1 — arquivo */}
      {step === 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">1. Arquivo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="flex flex-col items-center justify-center gap-2 px-4 py-10 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/40 transition-colors">
              {parsing ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
              <span className="text-sm font-medium">{parsing ? "Lendo arquivo..." : file ? file.name : "Selecionar arquivo (.xlsx, .xls, .csv)"}</span>
              <span className="text-xs text-muted-foreground">O arquivo é processado no navegador; nada é enviado ao SAP.</span>
              <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFile} />
            </label>

            {parsed && (
              <div className="space-y-3">
                {parsed.sheetNames.length > 1 && (
                  <div className="space-y-2">
                    <Label>Aba da planilha</Label>
                    <Select value={sheetName} onValueChange={onSheetChange}>
                      <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {parsed.sheetNames.map((n) => (
                          <SelectItem key={n} value={n}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4 inline mr-1" />
                  {sheet?.rows.length ?? 0} linhas · {sheet?.columns.length ?? 0} colunas detectadas
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2 — mapeamento */}
      {step === 1 && sheet && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">2. Mapeamento de colunas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Associe cada campo da ordem SAP a uma coluna da planilha. <strong>Ordem</strong> é obrigatório.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SAP_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">
                    {f.label}{f.key === "ordem" && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select value={mapping[f.key] ?? NONE} onValueChange={(v) => setField(f.key, v)}>
                    <SelectTrigger><SelectValue placeholder="— não usar —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— não usar —</SelectItem>
                      {sheet.columns.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — validação */}
      {step === 2 && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Linhas" value={stats.total} />
            <Stat label="Vinculadas" value={stats.linked} tone="ok" icon={Link2} />
            <Stat label="Sem correspondência" value={stats.unlinked} tone="warn" icon={Link2Off} />
            <Stat label="Com erro" value={stats.withErrors} tone={stats.withErrors ? "err" : undefined} icon={AlertTriangle} />
          </div>

          {stats.newTags.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="p-4 text-sm">
                <p className="font-medium text-amber-800 mb-1">
                  {stats.newTags.length} TAG(s) sem quadro no inventário
                </p>
                <p className="text-xs text-amber-700 break-words">{stats.newTags.join(", ")}</p>
                <p className="text-xs text-amber-700 mt-1">
                  As ordens serão importadas como “sem correspondência” — vincule depois na tela do lote ou cadastre os quadros.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Prévia ({orders.length} linhas)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                      <th>#</th><th>Ordem</th><th>TAG</th><th>Quadro</th><th>Data</th><th>Freq.</th><th>Situação</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr]:border-t [&>tr>td]:px-3 [&>tr>td]:py-1.5">
                    {orders.slice(0, 300).map((o) => (
                      <tr key={o._row} className={o.errors.length ? "bg-destructive/5" : ""}>
                        <td className="text-muted-foreground">{o._row}</td>
                        <td className="font-mono">{o.ordem || "—"}</td>
                        <td className="font-mono">{o.tag || "—"}</td>
                        <td>{o.panel_tag ? <span className="font-mono text-secondary">{o.panel_tag}</span> : <span className="text-muted-foreground">—</span>}</td>
                        <td>{fmtD(o.data_planejada)}</td>
                        <td>{o.frequencia || "—"}</td>
                        <td>
                          {o.errors.length ? (
                            <span className="text-destructive" title={o.errors.join("; ")}>Erro</span>
                          ) : o.link_status === "auto" ? (
                            <Badge variant="outline" className="text-[10px] bg-secondary/15 text-secondary border-secondary/20">Vinculada</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">Sem quadro</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length > 300 && (
                  <p className="text-xs text-muted-foreground p-3">Mostrando as primeiras 300 linhas.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex: exportação de outubro/2026, revisão trimestral" />
          </div>

          {stats.withErrors > 0 && (
            <p className="text-xs text-muted-foreground">
              {stats.withErrors} linha(s) com erro serão ignoradas. {stats.total - stats.withErrors} ordens serão gravadas.
            </p>
          )}
        </div>
      )}

      {/* Nav */}
      <div className="flex justify-between pb-8">
        <Button variant="outline" onClick={() => (step === 0 ? navigate("/importacao-sap") : setStep(step - 1))}>
          {step === 0 ? "Cancelar" : "Voltar"}
        </Button>
        {step < 2 ? (
          <Button disabled={!canAdvance} onClick={() => setStep(step + 1)} className="gap-2">
            Avançar <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button disabled={commit.isPending || orders.length === stats?.withErrors} onClick={() => commit.mutate()} className="gap-2">
            {commit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmar importação
          </Button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, icon: Icon }) {
  const toneCls =
    tone === "ok" ? "text-secondary" : tone === "warn" ? "text-amber-700" : tone === "err" ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          {Icon && <Icon className="h-3 w-3" />}{label}
        </p>
        <p className={`text-xl font-bold ${toneCls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
