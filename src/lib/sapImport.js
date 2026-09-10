import * as XLSX from "xlsx";

// Campos de destino em public.sap_orders que o usuário mapeia a partir das
// colunas da planilha. `key` bate com a coluna da tabela.
export const SAP_FIELDS = [
  { key: "ordem", label: "Ordem", hints: ["ordem", "order", "nº ordem", "num ordem"] },
  { key: "nota", label: "Nota", hints: ["nota", "notification", "aviso"] },
  { key: "plano", label: "Plano de manutenção", hints: ["plano", "plan", "maintenance plan"] },
  { key: "item", label: "Item do plano", hints: ["item", "posição", "posicao"] },
  { key: "tag", label: "TAG do quadro", hints: ["tag", "etiqueta", "local de instalação", "local de instalacao", "functional location", "loc.instal"] },
  { key: "equipamento", label: "Equipamento", hints: ["equipamento", "equipment", "nº equipamento", "num equipamento", "nº sap", "n sap"] },
  { key: "local_texto", label: "Local (texto)", hints: ["local", "descrição do local", "descricao do local", "location", "área", "area", "prédio", "predio"] },
  { key: "data_planejada", label: "Data planejada", hints: ["data", "date", "início", "inicio", "programada", "planejada", "vencimento"] },
  { key: "frequencia", label: "Frequência / Periodicidade", hints: ["frequência", "frequencia", "periodicidade", "ciclo", "cycle"] },
  { key: "centro_trabalho", label: "Centro de trabalho", hints: ["centro de trabalho", "centro trabalho", "work center", "ctrab"] },
  { key: "sap_status", label: "Status SAP", hints: ["status", "situação", "situacao", "sistema status", "status usuário", "status usuario"] },
];

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Lê um File (xlsx/xls/csv) e devolve { sheetNames, sheets: { [name]: { columns, rows } } }. */
export async function parseSpreadsheet(file) {
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  // CSV: ler como texto UTF-8 (SheetJS assume Windows-1252 para bytes crus,
  // o que quebra acentos). XLSX/XLS: ler binário.
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: "string", cellDates: true, raw: false })
    : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: false });
  const sheets = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const json = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
    const columns = json.length
      ? Object.keys(json[0])
      : (XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })[0] || []).map(String);
    sheets[name] = { columns, rows: json };
  }
  return { sheetNames: wb.SheetNames, sheets };
}

/** Sugere um mapeamento coluna->campo a partir dos nomes das colunas. */
export function suggestMapping(columns) {
  const mapping = {};
  const used = new Set();
  for (const field of SAP_FIELDS) {
    const hit = columns.find((c) => {
      if (used.has(c)) return false;
      const nc = norm(c);
      return field.hints.some((h) => nc === norm(h) || nc.includes(norm(h)));
    });
    if (hit) {
      mapping[field.key] = hit;
      used.add(hit);
    }
  }
  return mapping;
}

function toISODate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // dd/mm/yyyy
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(s);
  return isNaN(dt) ? null : dt.toISOString().slice(0, 10);
}

/**
 * Aplica o mapeamento às linhas e casa cada ordem a um quadro do inventário.
 * panels: array de electrical_panels (precisa de id, tag, sap_functional_location, sap_equipment_number).
 * Retorna { orders, stats }.
 */
export function buildOrders(rows, mapping, panels) {
  const byTag = new Map();
  const bySapLoc = new Map();
  const bySapEq = new Map();
  for (const p of panels) {
    if (p.tag) byTag.set(norm(p.tag), p);
    if (p.sap_functional_location) bySapLoc.set(norm(p.sap_functional_location), p);
    if (p.sap_equipment_number) bySapEq.set(norm(p.sap_equipment_number), p);
  }

  const get = (row, key) => {
    const col = mapping[key];
    return col ? String(row[col] ?? "").trim() : "";
  };

  const orders = rows.map((row, i) => {
    const ordem = get(row, "ordem");
    const item = get(row, "item");
    const tag = get(row, "tag");
    const equipamento = get(row, "equipamento");
    const rawDate = get(row, "data_planejada");
    const data_planejada = toISODate(rawDate);

    const errors = [];
    if (!ordem) errors.push("Sem número de ordem");
    if (rawDate && !data_planejada) errors.push(`Data inválida: "${rawDate}"`);

    let panel =
      byTag.get(norm(tag)) ||
      bySapLoc.get(norm(tag)) ||
      bySapEq.get(norm(equipamento)) ||
      null;

    return {
      _row: i + 2, // linha na planilha (1 = cabeçalho)
      ordem,
      nota: get(row, "nota"),
      plano: get(row, "plano"),
      item,
      tag,
      equipamento,
      local_texto: get(row, "local_texto"),
      data_planejada,
      frequencia: get(row, "frequencia"),
      centro_trabalho: get(row, "centro_trabalho"),
      sap_status: get(row, "sap_status"),
      raw_row: row,
      panel_id: panel?.id || null,
      panel_tag: panel?.tag || null,
      link_status: panel ? "auto" : "sem_correspondencia",
      errors,
    };
  });

  const linkedTags = new Set(orders.filter((o) => o.panel_id).map((o) => norm(o.tag)));
  const unknownTags = new Set(
    orders.filter((o) => !o.panel_id && o.tag).map((o) => o.tag)
  );

  const stats = {
    total: orders.length,
    linked: orders.filter((o) => o.link_status === "auto").length,
    unlinked: orders.filter((o) => o.link_status === "sem_correspondencia").length,
    withErrors: orders.filter((o) => o.errors.length).length,
    distinctPanels: linkedTags.size,
    newTags: [...unknownTags],
  };

  return { orders, stats };
}
