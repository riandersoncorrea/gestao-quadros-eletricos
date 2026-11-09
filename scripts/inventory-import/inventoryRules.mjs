// Regras puras da importação de inventário de quadros a partir da planilha
// "Planos Quadros Elétricos Ser. Operacionais" (mesmo layout da base de São
// Luís importada em supabase/migrations/0002_phase1_import_inventory.sql).
//
// Sem dependências: usado pelo gerador (generate-inventory-sql.mjs) e pelos
// testes (inventoryRules.test.mjs, `node --test`).

/** Colunas da aba "Plano de Manutenção" e o campo interno de cada uma. */
export const COLUMN_MAP = {
  "Área": "area",
  "Prédio": "predio",
  "Local detalhado": "sublocal",
  // Só existe na base de São Luís; na base EFC a coluna não vem.
  "Local de Instalaçao SAP (TAG)": "sapLocal",
  "TAG": "tag",
  "Descrição do Ativo": "descricao",
  "Classificação do Ativo": "classe",
  "Nº SAP do ativo": "sapEquipamento",
};

export const REQUIRED_FIELDS = ["area", "predio", "sublocal", "tag", "descricao", "classe"];

/** Padrão de TAG: SIGLA_QD_NUMERO (sigla = letras/dígitos, sem tamanho fixo). */
export const TAG_PATTERN = /^([A-Z][A-Z0-9]*)_QD_(\d+)$/;

export const VALID_CLASSES = ["A", "B", "C", "D"];

/**
 * Mesma normalização da importação de São Luís (0002): remove espaços das
 * pontas e reduz espaços repetidos a um. Não altera grafia, acentos nem
 * caixa. Vazio vira null.
 */
export function normalizeText(value) {
  if (value == null) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Converte as linhas brutas (array de arrays, 1ª = cabeçalho) em objetos. */
export function parseRows(rawRows) {
  const [header, ...body] = rawRows;
  const unknown = header.filter((h) => h != null && !(String(h).trim() in COLUMN_MAP));
  if (unknown.length) throw new Error(`Colunas não reconhecidas: ${unknown.join(", ")}`);
  const index = Object.fromEntries(header.map((h, i) => [COLUMN_MAP[String(h).trim()], i]));
  for (const f of REQUIRED_FIELDS) {
    if (index[f] == null) throw new Error(`Coluna obrigatória ausente: ${f}`);
  }
  return body
    .map((r, i) => {
      const row = { linha: i + 2 };
      for (const field of Object.values(COLUMN_MAP)) {
        row[field] = index[field] == null ? null : normalizeText(r[index[field]]);
      }
      return row;
    })
    .filter((r) => Object.values(COLUMN_MAP).some((f) => r[f] != null));
}

/** Separa as linhas das áreas excluídas (comparação sem diferenciar caixa). */
export function splitByExcludedAreas(rows, excludedAreas) {
  const excluded = new Map(excludedAreas.map((a) => [a.toUpperCase(), []]));
  const kept = [];
  for (const r of rows) {
    const bucket = excluded.get(String(r.area ?? "").toUpperCase());
    if (bucket) bucket.push(r);
    else kept.push(r);
  }
  return {
    kept,
    excluded: Object.fromEntries(excludedAreas.map((a) => [a, excluded.get(a.toUpperCase())])),
  };
}

/**
 * Valida a base filtrada. `errors` bloqueiam a geração; `warnings` só são
 * relatadas. Cidade = coluna Área; sigla = prefixo da TAG, que precisa ser
 * única por cidade (e vice-versa) — nenhuma sigla é inventada.
 */
export function validate(rows) {
  const errors = [];
  const warnings = [];

  for (const r of rows) {
    for (const f of REQUIRED_FIELDS) {
      if (r[f] == null) errors.push(`Linha ${r.linha}: campo obrigatório vazio (${f})`);
    }
    if (r.tag && !TAG_PATTERN.test(r.tag)) errors.push(`Linha ${r.linha}: TAG fora do padrão SIGLA_QD_NNNN (${r.tag})`);
    if (r.classe && !VALID_CLASSES.includes(r.classe)) errors.push(`Linha ${r.linha}: classificação inválida (${r.classe})`);
  }

  const byTag = new Map();
  for (const r of rows) {
    if (!r.tag) continue;
    if (byTag.has(r.tag)) errors.push(`TAG duplicada: ${r.tag} (linhas ${byTag.get(r.tag)} e ${r.linha})`);
    else byTag.set(r.tag, r.linha);
  }

  const siglasPorCidade = new Map();
  const cidadesPorSigla = new Map();
  for (const r of rows) {
    const sigla = r.tag?.match(TAG_PATTERN)?.[1];
    if (!sigla || !r.area) continue;
    if (!siglasPorCidade.has(r.area)) siglasPorCidade.set(r.area, new Set());
    siglasPorCidade.get(r.area).add(sigla);
    if (!cidadesPorSigla.has(sigla)) cidadesPorSigla.set(sigla, new Set());
    cidadesPorSigla.get(sigla).add(r.area);
  }
  for (const [cidade, siglas] of siglasPorCidade) {
    if (siglas.size > 1) errors.push(`Cidade ${cidade} com mais de uma sigla na TAG: ${[...siglas].join(", ")}`);
  }
  for (const [sigla, cidades] of cidadesPorSigla) {
    if (cidades.size > 1) errors.push(`Sigla ${sigla} usada em mais de uma cidade: ${[...cidades].join(", ")}`);
  }

  const cidades = [...siglasPorCidade]
    .filter(([, s]) => s.size === 1)
    .map(([cidade, s]) => {
      const sigla = [...s][0];
      const nums = rows.filter((r) => r.area === cidade).map((r) => Number(r.tag.match(TAG_PATTERN)[2]));
      const max = Math.max(...nums);
      const lacunas = [];
      for (let n = 1; n <= max; n++) if (!nums.includes(n)) lacunas.push(n);
      if (lacunas.length) {
        warnings.push(`${cidade} (${sigla}): numeração sem ${lacunas.map((n) => `${sigla}_QD_${String(n).padStart(4, "0")}`).join(", ")}`);
      }
      return { cidade, sigla, quadros: nums.length, maior: max, lacunas };
    })
    .sort((a, b) => b.quadros - a.quadros || a.cidade.localeCompare(b.cidade, "pt-BR"));

  for (const r of rows) {
    if (r.sapLocal || r.sapEquipamento) {
      warnings.push(`Linha ${r.linha}: possui dado SAP (${r.sapLocal || r.sapEquipamento}) — será importado como está`);
    }
  }

  return { errors, warnings, cidades };
}

/** Literal SQL de texto (aspas simples escapadas) ou null. */
export function sqlText(value) {
  return value == null ? "null" : `'${String(value).replace(/'/g, "''")}'`;
}
