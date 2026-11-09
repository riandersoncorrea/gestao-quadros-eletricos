// Cliente Supabase FALSO, em memória, para os testes de isolamento por
// unidade (run.mjs substitui "@/lib/supabaseClient" por este arquivo).
// Implementa só o subconjunto do query builder usado pelos repositórios:
// select / eq / neq / in / order / range / limit / single / maybeSingle /
// insert / update / delete. Registra cada gravação em `writes` para os
// testes provarem que nada foi gravado quando a unidade é somente leitura.

let db = {};
export const writes = [];
// Simula banco sem uma migration: colunas ausentes por tabela e RPCs existentes.
let missingColumns = {};
let rpcs = {};

export function resetDb(tables, { missing = {}, rpc = {} } = {}) {
  db = structuredClone(tables);
  writes.length = 0;
  missingColumns = missing;
  rpcs = rpc;
}

export function table(name) {
  return db[name] || [];
}

function attachEmbeds(name, rows, columns) {
  if (name === "actions" && /nonconformity:nonconformities\(/.test(columns)) {
    return rows.map((a) => {
      const nc = table("nonconformities").find((n) => n.id === a.nonconformity_id);
      return { ...a, nonconformity: nc ? { panel_id: nc.panel_id, descricao: nc.descricao, tag: nc.tag } : null };
    });
  }
  if (name === "inspection_responses" && /inspection_template_items\(/.test(columns)) {
    return rows.map((r) => ({ ...r, inspection_template_items: null }));
  }
  return rows;
}

class Query {
  constructor(name) {
    this.name = name;
    this.filters = [];
    this.op = "select";
    this.columns = "*";
    this.rangeArgs = null;
    this.limitN = null;
    this.mode = "many";
  }
  select(columns = "*") {
    if (this.op === "select") this.columns = columns;
    this.returning = true;
    return this;
  }
  eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
  neq(col, val) { this.filters.push((r) => r[col] !== val); return this; }
  in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this; }
  or(expr) {
    // "a.eq.X,b.eq.Y"
    const parts = expr.split(",").map((p) => p.split(".eq."));
    this.filters.push((r) => parts.some(([c, v]) => String(r[c.trim()]) === v));
    return this;
  }
  order() { return this; }
  range(from, to) { this.rangeArgs = [from, to]; return this; }
  limit(n) { this.limitN = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  insert(values) { this.op = "insert"; this.values = values; return this; }
  update(values) { this.op = "update"; this.values = values; return this; }
  delete() { this.op = "delete"; return this; }

  run() {
    const rowsOf = () => table(this.name).filter((r) => this.filters.every((f) => f(r)));
    let data;
    if (this.op === "insert") {
      const absent = (missingColumns[this.name] || []).find((c) =>
        (Array.isArray(this.values) ? this.values : [this.values]).some((v) => c in v));
      if (absent) {
        return { data: null, error: { code: "PGRST204", message: `Could not find the '${absent}' column of '${this.name}' in the schema cache` } };
      }
      const list = (Array.isArray(this.values) ? this.values : [this.values]).map((v) => ({ id: `new-${writes.length}`, ...v }));
      writes.push({ op: "insert", table: this.name, rows: list });
      db[this.name] = [...table(this.name), ...list];
      data = list;
    } else if (this.op === "update") {
      const hit = rowsOf();
      writes.push({ op: "update", table: this.name, ids: hit.map((r) => r.id), values: this.values });
      for (const r of hit) Object.assign(r, this.values);
      data = hit;
    } else if (this.op === "delete") {
      const hit = rowsOf();
      writes.push({ op: "delete", table: this.name, ids: hit.map((r) => r.id) });
      db[this.name] = table(this.name).filter((r) => !hit.includes(r));
      data = hit;
    } else {
      data = attachEmbeds(this.name, rowsOf().map((r) => ({ ...r })), this.columns);
      if (this.rangeArgs) data = data.slice(this.rangeArgs[0], this.rangeArgs[1] + 1);
      if (this.limitN != null) data = data.slice(0, this.limitN);
    }
    if (this.mode === "single") {
      return data.length === 1 ? { data: data[0], error: null } : { data: null, error: new Error(`single: ${data.length} linhas`) };
    }
    if (this.mode === "maybe") return { data: data[0] ?? null, error: null };
    return { data, error: null };
  }
  then(resolve, reject) {
    try { resolve(this.run()); } catch (e) { reject(e); }
  }
}

export const supabase = {
  from: (name) => new Query(name),
  rpc: async (name, args) => (rpcs[name]
    ? { data: rpcs[name](args), error: null }
    : { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } }),
  auth: {
    getUser: async () => ({ data: { user: { id: "user-teste" } } }),
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { unsubscribe() {} } }),
  },
  storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }), remove: async () => ({ error: null }) }) },
};
