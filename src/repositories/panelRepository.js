import { supabase } from "@/lib/supabaseClient";

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

/** Fábrica de acesso genérico a uma tabela (list/filter/create/update/delete). */
function makeEntity(table) {
  return {
    async list(orderBy) {
      let query = supabase.from(table).select("*");
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

export const ElectricalPanel = makeEntity("electrical_panels");
export const Inspection = makeEntity("inspections");
export const Localidade = makeEntity("localidades");
export const Local = makeEntity("locais");
export const Sublocal = makeEntity("sublocais");

const hierarchyCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const byNome = (a, b) => hierarchyCollator.compare(a.nome, b.nome);

// Hierarquia LOCALIDADE -> LOCAL -> SUBLOCAL, em ordem crescente natural
// ("AREA 2" antes de "AREA 10"), em uma chamada.
export async function fetchHierarchy() {
  const [localidades, locais, sublocais] = await Promise.all([
    supabase.from("localidades").select("id, nome"),
    supabase.from("locais").select("id, localidade_id, nome"),
    supabase.from("sublocais").select("id, local_id, nome"),
  ]);
  const err = localidades.error || locais.error || sublocais.error;
  if (err) throw err;
  return {
    localidades: [...localidades.data].sort(byNome),
    locais: [...locais.data].sort(byNome),
    sublocais: [...sublocais.data].sort(byNome),
  };
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
    .select("id, tag, name, status, criticality, health_index, localidade_id, next_inspection_date");
  if (error) throw error;
  return data;
}

export async function listForMap() {
  const { data, error } = await supabase
    .from("electrical_panels")
    .select(
      "id, tag, name, nomenclatura_oficial, status, criticality, health_index, health_index_updated_at, " +
      "latitude, longitude, localidade_id, local_id, sublocal_id, last_inspection_date, next_inspection_date"
    );
  if (error) throw error;
  return data;
}
