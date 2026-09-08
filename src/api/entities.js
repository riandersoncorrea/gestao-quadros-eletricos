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
