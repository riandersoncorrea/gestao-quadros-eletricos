import { supabase } from "@/lib/supabaseClient";
import { fetchAllPages } from "@/repositories/pagination";
import { getActiveUnitId, getDefaultUnitId } from "@/lib/unitScope";
import { scopeHierarchy } from "@/domain/unitScope";

// Coluna de unidade operacional dos quadros (migration 0016). Toda leitura
// de LISTA de quadros é recortada pela unidade ativa (src/lib/unitScope.js);
// leituras por id não são recortadas aqui — a validação da unidade do
// registro fica nos serviços (src/services/unitScopeService.js).
const UNIT_COLUMN = "unidade_operacional_id";

const ORDER_COLUMN_ALIASES = {
  created_date: "created_at",
  updated_date: "updated_at",
};

function parseOrder(orderBy) {
  if (!orderBy) return null;
  const descending = orderBy.startsWith("-");
  const rawColumn = descending ? orderBy.slice(1) : orderBy;
  return { column: ORDER_COLUMN_ALIASES[rawColumn] || rawColumn, ascending: !descending };
}

/**
 * Fábrica de acesso genérico a uma tabela (list/filter/create/update/delete).
 * `unitColumn`: se informado, list() só traz linhas da unidade ativa.
 */
function makeEntity(table, { unitColumn } = {}) {
  return {
    async list(orderBy) {
      let query = supabase.from(table).select("*");
      if (unitColumn) query = query.eq(unitColumn, getActiveUnitId());
      const order = parseOrder(orderBy);
      if (order) query = query.order(order.column, { ascending: order.ascending });
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    async filter(criteria = {}) {
      let query = supabase.from(table).select("*");
      for (const [key, value] of Object.entries(criteria)) {
        query = query.eq(key, value);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    async create(values) {
      const { data, error } = await supabase.from(table).insert(values).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, values) {
      const { data, error } = await supabase.from(table).update(values).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      return true;
    },
  };
}

export const ElectricalPanel = makeEntity("electrical_panels", { unitColumn: UNIT_COLUMN });
export const Inspection = makeEntity("inspections");
export const Localidade = makeEntity("localidades");
export const Local = makeEntity("locais");
export const Sublocal = makeEntity("sublocais");

const hierarchyCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const byNome = (a, b) => hierarchyCollator.compare(a.nome, b.nome);

// Hierarquia LOCALIDADE -> LOCAL -> SUBLOCAL da unidade ativa, em ordem
// crescente natural ("AREA 2" antes de "AREA 10"), em uma chamada.
// localidades usa select("*") de propósito: as colunas unidade_operacional_id
// e sigla só existem depois da migration 0028 — antes dela, todas as
// localidades são de São Luís (ver localidadeInUnit em domain/unitScope.js).
export async function fetchHierarchy() {
  const [localidades, locais, sublocais] = await Promise.all([
    supabase.from("localidades").select("*"),
    fetchAllPages(() => supabase.from("locais").select("id, localidade_id, nome").order("id", { ascending: true })),
    fetchAllPages(() => supabase.from("sublocais").select("id, local_id, nome").order("id", { ascending: true })),
  ]);
  if (localidades.error) throw localidades.error;
  const scoped = scopeHierarchy(
    { localidades: localidades.data, locais, sublocais },
    getActiveUnitId(),
    getDefaultUnitId()
  );
  return {
    localidades: scoped.localidades.map(({ id, nome, sigla }) => ({ id, nome, sigla: sigla ?? null })).sort(byNome),
    locais: [...scoped.locais].sort(byNome),
    sublocais: [...scoped.sublocais].sort(byNome),
  };
}

/** Ids de todos os quadros da unidade ativa (recorte de inspeções/NCs/ações). */
export async function listPanelIdsForActiveUnit() {
  const rows = await fetchAllPages(() =>
    supabase.from("electrical_panels").select("id").eq(UNIT_COLUMN, getActiveUnitId()).order("id", { ascending: true })
  );
  return rows.map((r) => r.id);
}

/** Unidade de um quadro (undefined se o quadro não existir). */
export async function getPanelUnitId(panelId) {
  const { data, error } = await supabase
    .from("electrical_panels")
    .select(UNIT_COLUMN)
    .eq("id", panelId)
    .maybeSingle();
  if (error) throw error;
  return data ? data[UNIT_COLUMN] : undefined;
}

/**
 * Unidades operacionais (São Luís, EFC — tabela da migration 0016), só
 * leitura, para exibir a unidade do quadro (electrical_panels.unidade_operacional_id).
 */
export async function listUnidadesOperacionais() {
  // select("*"): permite_escrita/usa_site só existem depois da 0028/0029.
  const { data, error } = await supabase.from("unidades_operacionais").select("*");
  if (error) throw error;
  return data;
}

/**
 * Dados do quadro para a página pública (sem login, ver
 * src/pages/PublicPanelDetail.jsx): função get_public_panel(p_id)
 * (migration 0030) — devolve UM quadro pelo id do QR, sem como listar.
 * Antes da 0030 a função não existe: usa a view panel_public_info (0010),
 * que a 0030 fecha para a API. A whitelist de colunas públicas fica na
 * função/view; não ampliar aqui.
 */
export async function getPublicPanelInfo(panelId) {
  const rpc = await supabase.rpc("get_public_panel", { p_id: panelId });
  if (!rpc.error) return rpc.data ?? null;
  // PGRST202 = função inexistente (0030 ainda não aplicada).
  if (rpc.error.code !== "PGRST202" && rpc.error.code !== "42883") throw rpc.error;
  const { data, error } = await supabase
    .from("panel_public_info")
    .select("*")
    .eq("id", panelId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSnapshotFields(panelId) {
  const { data, error } = await supabase
    .from("electrical_panels")
    .select("status, criticality, latitude, longitude, localidade_id")
    .eq("id", panelId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Site do quadro (electrical_panels.site), ou null. */
export async function getSite(panelId) {
  const { data, error } = await supabase
    .from("electrical_panels")
    .select("site")
    .eq("id", panelId)
    .maybeSingle();
  if (error) throw error;
  return data?.site ?? null;
}

export async function updateHealthIndex(panelId, index) {
  const { error } = await supabase
    .from("electrical_panels")
    .update({ health_index: index, health_index_updated_at: new Date().toISOString() })
    .eq("id", panelId);
  if (error) throw error;
}

export async function updateAfterInspection(panelId, values) {
  const { error } = await supabase.from("electrical_panels").update(values).eq("id", panelId);
  if (error) throw error;
}

export async function updateCoordinates(panelId, latitude, longitude) {
  const { error } = await supabase
    .from("electrical_panels")
    .update({ latitude, longitude })
    .eq("id", panelId);
  if (error) throw error;
}

export async function listForDashboard() {
  const { data, error } = await supabase
    .from("electrical_panels")
    // responsible_engineer somado aqui (consulta em lote já existente) para
    // a Análise Inteligente poder exibir o responsável nos quadros com
    // risco de interdição, sem nova consulta por quadro.
    .select("id, tag, name, status, criticality, health_index, localidade_id, next_inspection_date, responsible_engineer")
    .eq(UNIT_COLUMN, getActiveUnitId());
  if (error) throw error;
  return data;
}

export async function listForMap() {
  const { data, error } = await supabase
    .from("electrical_panels")
    .select(
      "id, tag, name, nomenclatura_oficial, status, criticality, health_index, health_index_updated_at, " +
      "latitude, longitude, unidade_operacional_id, localidade_id, local_id, sublocal_id, last_inspection_date, next_inspection_date"
    )
    .eq(UNIT_COLUMN, getActiveUnitId());
  if (error) throw error;
  return data;
}

/**
 * Quadros do Inventário com os campos de identificação/localização usados
 * pelo relatório "Quadros sem checklist". Paginada: a base passa a crescer
 * com as cargas de outras unidades (EFC) e o PostgREST corta em 1000 linhas.
 */
export async function listForChecklistCoverage() {
  return fetchAllPages(() =>
    supabase
      .from("electrical_panels")
      .select(
        "id, tag, name, status, panel_type, panel_type_custom, voltage_nominal, frequency_hz, " +
        "unidade_operacional_id, localidade_id, local_id, sublocal_id, sap_functional_location, sap_equipment_number"
      )
      .eq(UNIT_COLUMN, getActiveUnitId())
      .order("id", { ascending: true })
  );
}
