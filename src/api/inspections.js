import { supabase } from "@/lib/supabaseClient";

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

export async function getActiveTemplate() {
  const { data: tpl, error: e1 } = await supabase
    .from("inspection_templates")
    .select("*")
    .eq("ativo", true)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;
  if (!tpl) return { template: null, items: [] };

  const { data: items, error: e2 } = await supabase
    .from("inspection_template_items")
    .select("*")
    .eq("template_id", tpl.id)
    .eq("ativo", true)
    .order("modulo", { ascending: true })
    .order("ordem", { ascending: true });
  if (e2) throw e2;
  return { template: tpl, items };
}

export async function ordersForPanel(panelId) {
  if (!panelId) return [];
  const { data, error } = await supabase
    .from("sap_orders")
    .select("id, ordem, plano, data_planejada, frequencia")
    .eq("panel_id", panelId)
    .order("data_planejada", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getInspectionFull(id) {
  const [insp, responses, measurements, thermo, ncs] = await Promise.all([
    supabase.from("inspections").select("*").eq("id", id).single(),
    supabase.from("inspection_responses").select("*").eq("inspection_id", id),
    supabase.from("measurements").select("*").eq("inspection_id", id),
    supabase.from("thermography_points").select("*").eq("inspection_id", id),
    supabase.from("nonconformities").select("*").eq("inspection_id", id).order("created_at", { ascending: true }),
  ]);
  const err = insp.error || responses.error || measurements.error || thermo.error || ncs.error;
  if (err) throw err;
  return {
    inspection: insp.data,
    responses: responses.data,
    measurements: measurements.data,
    thermography: thermo.data,
    nonconformities: ncs.data,
  };
}

export function computeOverall(responses, items) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const ncs = responses.filter((r) => r.resposta === "nao_conforme");
  if (ncs.some((r) => itemById.get(r.template_item_id)?.obrigatorio)) return "reprovado";
  if (ncs.length) return "aprovado_ressalvas";
  return "aprovado";
}

/**
 * Cria a inspeção com respostas, medições, termografia e gera automaticamente
 * uma não-conformidade para cada item respondido como "Não Conforme".
 * (Supabase JS não tem transação — inserts são sequenciais.)
 */
export async function createInspection({ header, responses, measurements, thermography, template, items }) {
  const { data: user } = await supabase.auth.getUser();
  const uid = user?.user?.id ?? null;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const answered = responses.filter((r) => r.resposta);
  const overall = computeOverall(answered, items);

  const { data: insp, error: ie } = await supabase
    .from("inspections")
    .insert({
      panel_id: header.panel_id,
      panel_ref_id: header.panel_id,
      panel_name: header.panel_name,
      inspection_date: header.inspection_date,
      inspector_name: header.inspector_name,
      frequency: header.frequency || null,
      next_inspection: header.next_inspection || null,
      overall_result: overall,
      observacoes: header.observacoes || null,
      template_id: template?.id ?? null,
      sap_order_id: header.sap_order_id || null,
      status: "executada",
      created_by: uid,
    })
    .select()
    .single();
  if (ie) throw ie;

  const respRows = answered.map((r) => {
    const it = itemById.get(r.template_item_id);
    return {
      inspection_id: insp.id,
      template_item_id: r.template_item_id,
      modulo: it?.modulo ?? null,
      titulo: it?.titulo ?? null,
      resposta: r.resposta,
      justificativa: r.justificativa || null,
      motivo: r.motivo || null,
      observacao: r.observacao || null,
      evidencia_url: r.evidencia_url || null,
    };
  });
  if (respRows.length) {
    const { error } = await supabase.from("inspection_responses").insert(respRows);
    if (error) throw error;
  }

  const measRows = measurements
    .filter((m) => m.categoria && m.unidade)
    .map((m) => ({
      inspection_id: insp.id,
      panel_id: header.panel_id,
      categoria: m.categoria,
      parametro: m.parametro || null,
      fase: m.fase || null,
      valor: num(m.valor),
      unidade: m.unidade,
      instrumento: m.instrumento || null,
      instrumento_serie: m.instrumento_serie || null,
      limite_min: num(m.limite_min),
      limite_max: num(m.limite_max),
      resultado: m.resultado || null,
      observacao: m.observacao || null,
    }));
  if (measRows.length) {
    const { error } = await supabase.from("measurements").insert(measRows);
    if (error) throw error;
  }

  const thermoRows = thermography
    .filter((t) => t.equipamento || t.ponto || t.temperatura !== "")
    .map((t) => ({
      inspection_id: insp.id,
      panel_id: header.panel_id,
      equipamento: t.equipamento || null,
      ponto: t.ponto || null,
      temperatura: num(t.temperatura),
      temperatura_ambiente: num(t.temperatura_ambiente),
      delta_t:
        t.temperatura !== "" && t.temperatura_ambiente !== ""
          ? Number(t.temperatura) - Number(t.temperatura_ambiente)
          : null,
      instrumento: t.instrumento || null,
      imagem_url: t.imagem_url || null,
      imagem_termografica_url: t.imagem_termografica_url || null,
      observacao: t.observacao || null,
      diagnostico: t.diagnostico || null,
      criticidade: t.criticidade || null,
    }));
  if (thermoRows.length) {
    const { error } = await supabase.from("thermography_points").insert(thermoRows);
    if (error) throw error;
  }

  const ncRows = answered
    .filter((r) => r.resposta === "nao_conforme")
    .map((r) => {
      const it = itemById.get(r.template_item_id);
      return {
        panel_id: header.panel_id,
        tag: header.panel_tag || null,
        inspection_id: insp.id,
        sap_order_id: header.sap_order_id || null,
        template_item_id: r.template_item_id,
        categoria: it?.modulo_nome || null,
        descricao:
          (r.descricao || "").trim() ||
          `${it?.codigo ? it.codigo + " — " : ""}${it?.titulo || "Item não conforme"}`,
        evidencia_url: r.evidencia_url || null,
        severidade: r.severidade || "media",
        recomendacao: r.recomendacao || null,
        status: "aberta",
        origem: "inspecao",
        created_by: uid,
      };
    });
  if (ncRows.length) {
    const { error } = await supabase.from("nonconformities").insert(ncRows);
    if (error) throw error;
  }

  await supabase
    .from("electrical_panels")
    .update({
      last_inspection_date: header.inspection_date,
      ...(header.next_inspection ? { next_inspection_date: header.next_inspection } : {}),
    })
    .eq("id", header.panel_id);

  return insp;
}
