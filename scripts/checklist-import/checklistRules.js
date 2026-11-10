// Regras da importação de checklists históricos exportados do ValeForms
// ("Checklist - Quadros Elétricos EFC") para inspeções do sistema.
//
// Usa as MESMAS regras de domínio do app (severidade da NC, descrição e prazo
// da ação automática, flags de análise), para a inspeção importada ficar
// igual a uma feita pela tela. Os dados reais nunca ficam no repositório: o
// SQL gerado vai para supabase/private/ (ignorado pelo git).
//
// Empacotado com esbuild por generate-checklist-sql.mjs (resolve o alias "@/").

import { resolveSeveridade } from "@/domain/inspectionRules";
import { defaultActionDescription, defaultPrazo } from "@/domain/ncActionMatrix";
import { analysisFlags } from "@/domain/healthIndex";

/** Linha (0-based) do cabeçalho com as perguntas na aba "Forms". */
export const HEADER_ROW = 4;

/**
 * Itens do "Checklist Padrão BT" (migrations 0003/0004/0012–0014): código,
 * módulo e texto. O SQL gerado confere, no banco, que cada código existe no
 * modelo ativo com o mesmo módulo — e usa o título do banco nas respostas.
 */
export const TEMPLATE_ITEMS = [
  ["ID-01", 1, "Identificação", "Identificação de circuitos e disjuntores clara e atualizada"],
  ["ID-02", 1, "Identificação", "Placa de identificação do quadro presente e legível"],
  ["ID-03", 1, "Identificação", "Diagrama/etiqueta de circuitos afixado na parte interna da porta"],
  ["ID-04", 1, "Identificação", "Tensão nominal e esquema de aterramento (TN/TT/IT) identificados"],
  ["ID-05", 1, "Identificação", "TAG do quadro corresponde ao inventário / plano SAP"],
  ["SEG-01", 2, "Segurança", "Sinalização e placas de advertência presentes e visíveis"],
  ["SEG-02", 2, "Segurança", "Ausência de partes vivas expostas / risco de contato direto"],
  ["SEG-03", 2, "Segurança", "Grau de proteção (IP) adequado ao ambiente de instalação"],
  ["SEG-04", 2, "Segurança", "Espaço de trabalho e acesso ao quadro desobstruídos"],
  ["SEG-05", 2, "Segurança", "Barreiras/anteparos contra contato acidental instalados"],
  ["SEG-06", 2, "Segurança", "Disjuntor possibilita aplicação do dispositivo/travamento (LOTO)?"],
  ["SEG-07", 2, "Segurança", "Extintor de CO2/pó químico próximo e dentro da validade"],
  ["INT-01", 3, "Integridade física", "Integridade do invólucro (sem corrosão, amassados, furos)"],
  ["INT-02", 3, "Integridade física", "Fechamento de portas, tampas e selos"],
  ["INT-03", 3, "Integridade física", "Limpeza interna e externa"],
  ["INT-04", 3, "Integridade física", "Ausência de umidade ou poeira excessiva"],
  ["INT-05", 3, "Integridade física", "Pintura/tratamento anticorrosivo do invólucro preservado"],
  ["INT-06", 3, "Integridade física", "Prensa-cabos e aberturas vedados (grau IP mantido)"],
  ["INT-07", 3, "Integridade física", "Dobradiças, fecho e maçaneta funcionando"],
  ["INT-08", 3, "Integridade física", "Ausência de sinais de infiltração de água ou entrada de animais"],
  ["PRO-01", 4, "Proteções", "DR — teste funcional (botão de teste)"],
  ["PRO-02", 4, "Proteções", "DPS — inspeção visual (sem indicação de fim de vida / atuação)"],
  ["PRO-03", 4, "Proteções", "Disjuntor geral termomagnético/caixa moldada, compatível com a instalação"],
  ["PRO-04", 4, "Proteções", "Disjuntores de circuito sem sinais de atuação térmica repetida"],
  ["PRO-05", 4, "Proteções", "Seletividade/coordenação entre disjuntor geral e ramais mantida"],
  ["PRO-06", 4, "Proteções", 'Ausência de proteções shuntadas, travadas ou "jumpeadas"'],
  ["BAR-01", 5, "Barramentos e conexões", "Conexões sem sinais de superaquecimento ou carbonização"],
  ["BAR-02", 5, "Barramentos e conexões", "Barramentos firmes, sem folga, oxidação ou deformação"],
  ["BAR-03", 5, "Barramentos e conexões", "Torque das conexões principais verificado"],
  ["BAR-04", 5, "Barramentos e conexões", "Isoladores e suportes de barramento íntegros"],
  ["BAR-05", 5, "Barramentos e conexões", "Ausência de descoloração, marcas de arco ou odor de queimado"],
  ["BAR-06", 5, "Barramentos e conexões", "Terminais e conectores adequados à seção do condutor"],
  ["BAR-07", 5, "Barramentos e conexões", "Distâncias de isolamento e escoamento respeitadas"],
  ["BAR-08", 5, "Barramentos e conexões", "Neutro e PE em barramentos distintos (esquema TN-S)"],
  ["CAB-01", 6, "Cabos e isolação", "Organização, fixação e roteamento dos cabos"],
  ["CAB-02", 6, "Cabos e isolação", "Isolação dos condutores íntegra (sem ressecamento / dano)"],
  ["CAB-03", 6, "Cabos e isolação", "Bitola dos condutores compatível com a proteção"],
  ["CAB-06", 6, "Cabos e isolação", "Ausência de emendas dentro do quadro"],
  ["CAB-07", 6, "Cabos e isolação", "Cores da isolação conforme norma (fase, neutro azul-claro, PE verde-amarelo)"],
  ["CAB-08", 6, "Cabos e isolação", "Reserva técnica de espaço para novos circuitos"],
  ["ATR-01", 7, "Aterramento", "Condutor de proteção(PE) presente, conectado e funcional"],
  ["ATR-02", 7, "Aterramento", "Continuidade do aterramento verificada"],
  ["ATR-03", 7, "Aterramento", "Barramento de terra identificado e íntegro"],
  ["ATR-05", 7, "Aterramento", "Todas as massas metálicas (porta, painel, trilhos) aterradas"],
  ["ATR-06", 7, "Aterramento", "Condutor de equipotencialização presente onde aplicável"],
  ["ATR-07", 7, "Aterramento", "Ausência de corrosão nas conexões de aterramento"],
  ["DOC-01", 10, "Documentação", "Diagrama unifilar presente e atualizado"],
].map(([codigo, modulo, modulo_nome, titulo]) => ({ id: codigo, codigo, modulo, modulo_nome, titulo }));

/** Onde cada foto do ValeForms vira evidência (o item mais próximo do que a foto mostra). */
export const PHOTO_EVIDENCE = { externa: "ID-02", interna: "ID-01", diagrama: "DOC-01" };

/** Colunas fixas do formulário (cabeçalho da linha HEADER_ROW). */
const FIXED = {
  submitted: "Date / Time",
  completedBy: "Completed By",
  formId: "Id",
  date: "Dia da inspeção",
  regional: "Regional",
  patio: "Pátio",
  tag: "TAG do quadro",
  inspector: "Responsável pelo preenchimento do checklist",
  om: "OM preventiva (número da OM caso tenha)",
  externa: "Registros da parte externa do quadro",
  interna: "Registro da parte interna do quadro",
  diagrama: "Diagrama unifilar",
  servicos: "Selecione os itens realizados",
};
const OBS_PREFIX = "Foi encontrado alguma não conformidade?";

export const normText = (s) =>
  String(s ?? "").normalize("NFC").replace(/\s+/g, " ").replace(/\s*-\s*/g, "-").trim().toLowerCase();

const clean = (s) => String(s ?? "").replace(/\r/g, "").trim();
const firstLine = (s) => clean(s).split("\n")[0].trim();

/** "Não conforme\nComentários: xxx" -> { resposta: 'nao_conforme', comentario: 'xxx' } */
export function parseAnswer(raw) {
  const text = clean(raw);
  if (!text) return null;
  if (/^Coment[aá]rios?:/i.test(text)) {
    return { resposta: null, comentario: text.replace(/^\s*Coment[aá]rios?:\s*/i, "").trim() || null };
  }
  const [head, ...rest] = text.split("\n");
  const h = head.trim().toLowerCase();
  let resposta;
  if (h === "conforme") resposta = "conforme";
  else if (h === "não conforme" || h === "nao conforme") resposta = "nao_conforme";
  else if (h === "não aplicável" || h === "nao aplicavel" || h === "n/a") resposta = "nao_aplicavel";
  else throw new Error(`Resposta desconhecida: "${head}"`);
  const comentario = rest.join("\n").replace(/^\s*Coment[aá]rios?:\s*/i, "").trim() || null;
  return { resposta, comentario };
}

/**
 * CAB-07 (cores da isolação) não tinha opção Conforme/Não conforme no
 * ValeForms — só comentário livre. A resposta é inferida do comentário
 * quando ele é inequívoco; senão o item fica sem resposta (não respondido).
 */
export const COMMENT_ONLY_CODES = ["CAB-07"];
export const BLANK_MOTIVO = "Item em branco no checklist do ValeForms (importação)";
export const INFERRED_NOTE = "(resposta inferida do comentário: no ValeForms este item não tinha a opção Conforme/Não conforme)";

export function inferFromComment(comentario) {
  const c = String(comentario || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (!c) return null;
  if (/nao conforme|fora (do|de) padr|nao segue|irregular|errad/.test(c)) return "nao_conforme";
  if (/^(conforme( norma)?|ok|sim|cores (ok|conforme)|cores conforme)\.?$/.test(c)) return "conforme";
  return null;
}

/** "15/10/2026" -> "2026-10-15" */
export function parseDateBR(s) {
  const m = clean(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) throw new Error(`Data inválida: "${s}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "16/10/2026 10:47" (horário de Brasília) -> timestamptz ISO */
export function parseDateTimeBR(s) {
  const m = clean(s).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) throw new Error(`Data/hora inválida: "${s}"`);
  return `${m[3]}-${m[2]}-${m[1]}T${m[4].padStart(2, "0")}:${m[5]}:00-03:00`;
}

/** CPF nunca entra no sistema. */
export const stripCpf = (s) => clean(s).replace(/\s*-?\s*\d{3}\.?\d{3}\.?\d{3}-?\d{2}\s*/g, " ").replace(/\s*-\s*$/, "").trim();

/**
 * Nome do inspetor: sem CPF; variações de grafia unificadas por `aliases`
 * (chave = nome normalizado sem acento/caixa); valor que não é nome
 * (só CPF, uma TAG) vira "Não informado".
 */
export function normalizeInspector(raw, aliases = {}) {
  const name = stripCpf(raw);
  const key = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (aliases[key]) return aliases[key];
  if (!name || !/[a-zà-ú]{3,}/i.test(name) || /\d/.test(name)) return "Não informado";
  return name;
}

/** Mapeia as colunas do cabeçalho: fixas + uma por item do checklist (pelo texto). */
export function mapColumns(header) {
  const idx = {};
  header.forEach((h, i) => {
    if (h == null) return;
    const n = normText(h);
    for (const [k, label] of Object.entries(FIXED)) if (n === normText(label) && idx[k] === undefined) idx[k] = i;
    if (n.startsWith(normText(OBS_PREFIX))) idx.observacao = i;
  });
  for (const k of [...Object.keys(FIXED), "observacao"]) {
    if (idx[k] === undefined) throw new Error(`Coluna não encontrada: ${FIXED[k] || OBS_PREFIX}`);
  }
  const items = {};
  for (const it of TEMPLATE_ITEMS) {
    const i = header.findIndex((h) => h != null && normText(h) === normText(it.titulo));
    if (i < 0) throw new Error(`Pergunta do checklist sem coluna na planilha: ${it.codigo} — ${it.titulo}`);
    items[it.codigo] = i;
  }
  return { fixed: idx, items };
}

/**
 * Converte as linhas da planilha em registros. `links(row, col)` devolve o
 * hyperlink da célula (as fotos). Só lê; validações interrompem.
 */
export function parseRecords(rows, links, aliases = {}) {
  const header = rows[HEADER_ROW];
  const cols = mapColumns(header);
  const records = [];
  for (let r = HEADER_ROW + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.some((v) => v != null && String(v).trim() !== "")) continue;
    const cell = (k) => row[cols.fixed[k]];
    const tag = firstLine(cell("tag"));
    if (!/^[A-Z]{3,4}_QD_\d{4}$/.test(tag)) throw new Error(`Linha ${r + 1}: TAG fora do padrão: "${tag}"`);
    const patioRaw = clean(cell("patio"));
    const answers = {};
    for (const [codigo, c] of Object.entries(cols.items)) {
      const a = parseAnswer(row[c]);
      if (!a) {
        // Em branco: "Não verificado", com o motivo (o app exige motivo nesse caso).
        answers[codigo] = { resposta: "nao_verificado", comentario: null, motivo: BLANK_MOTIVO };
        continue;
      }
      if (!a.resposta) {
        if (!COMMENT_ONLY_CODES.includes(codigo)) throw new Error(`Linha ${r + 1}: ${codigo} só com comentário, sem resposta`);
        const inferred = inferFromComment(a.comentario);
        if (!inferred) {
          // Comentário ambíguo: "Não verificado", mantendo o comentário.
          answers[codigo] = { resposta: "nao_verificado", comentario: a.comentario, motivo: BLANK_MOTIVO };
          continue;
        }
        answers[codigo] = { resposta: inferred, comentario: `${a.comentario} ${INFERRED_NOTE}`, inferida: true };
        continue;
      }
      answers[codigo] = a;
    }
    const photos = {};
    for (const k of ["externa", "interna", "diagrama"]) photos[k] = links(r, cols.fixed[k]) ? clean(row[cols.fixed[k]]) : null;
    records.push({
      linha: r + 1,
      formId: clean(cell("formId")),
      submittedAt: parseDateTimeBR(cell("submitted")),
      inspectionDate: parseDateBR(cell("date")),
      regional: firstLine(cell("regional")),
      patio: firstLine(patioRaw),
      patioNota: patioRaw.split("\n").slice(1).join(" ").replace(/^\s*Coment[aá]rios?:\s*/i, "").trim() || null,
      tag,
      inspector: normalizeInspector(cell("inspector"), aliases),
      om: firstLine(cell("om")) || null,
      servicos: clean(cell("servicos")).split(",").map((s) => s.trim()).filter(Boolean),
      observacao: clean(cell("observacao")) || null,
      answers,
      photos,
    });
  }
  const seen = new Set();
  for (const rec of records) {
    if (seen.has(rec.tag)) throw new Error(`TAG repetida na planilha: ${rec.tag}`);
    seen.add(rec.tag);
  }
  return records;
}

const fmtBR = (iso) => iso.slice(0, 10).split("-").reverse().join("/");

/** Texto de observações da inspeção (origem, OM, serviços, observação do inspetor). */
export function inspectionNotes(rec) {
  const lines = [
    `Checklist importado do ValeForms ("Checklist - Quadros Elétricos EFC"), registro ${rec.formId}, enviado em ${fmtBR(rec.submittedAt)}.`,
    `Regional: ${rec.regional || "—"} · Pátio: ${rec.patio || "—"}`,
  ];
  if (rec.patioNota) lines.push(`Nota: ${rec.patioNota}`);
  if (rec.om) lines.push(`OM preventiva: ${rec.om}`);
  if (rec.servicos.length) lines.push(`Serviços realizados: ${rec.servicos.join("; ")}.`);
  if (rec.observacao) lines.push(`Observações do inspetor: ${rec.observacao}`);
  return lines.join("\n");
}

/**
 * Plano completo: inspeção, respostas, NCs, ações automáticas e flags, com
 * os ids já gerados (`uuid()`), e as fotos já como URL do Storage
 * (`photoUrl(tag, tipo)`). `prazoBase(rec)` = data-base do prazo das ações.
 */
export function buildPlan(records, { uuid, photoUrl, prazoBase }) {
  const itemByCode = new Map(TEMPLATE_ITEMS.map((i) => [i.codigo, i]));
  const plan = { inspections: [], responses: [], ncs: [], actions: [], flags: [], panels: [] };
  for (const rec of records) {
    const inspectionId = uuid();
    const urls = {};
    for (const k of ["externa", "interna", "diagrama"]) {
      urls[k] = rec.photos[k] ? photoUrl(rec.tag, k) : null;
      if (rec.photos[k] && !urls[k]) throw new Error(`${rec.tag}: foto ${k} sem arquivo no Storage`);
    }
    const evidenceByCode = {};
    for (const [k, codigo] of Object.entries(PHOTO_EVIDENCE)) if (urls[k]) evidenceByCode[codigo] = urls[k];

    plan.inspections.push({
      id: inspectionId,
      tag: rec.tag,
      inspection_date: rec.inspectionDate,
      inspector_name: rec.inspector,
      observacoes: inspectionNotes(rec),
      photo_url: urls.externa,
      created_at: rec.submittedAt,
    });

    const responses = [];
    for (const it of TEMPLATE_ITEMS) {
      const a = rec.answers[it.codigo];
      if (!a) continue;
      const resp = {
        inspection_id: inspectionId,
        codigo: it.codigo,
        template_item_id: it.id,
        modulo: it.modulo,
        titulo: it.titulo,
        resposta: a.resposta,
        observacao: a.comentario,
        justificativa: a.resposta === "nao_aplicavel" ? a.comentario || "Não aplicável (ValeForms)" : null,
        motivo: a.motivo || null,
        evidencia_url: evidenceByCode[it.codigo] || null,
        created_at: rec.submittedAt,
      };
      responses.push(resp);
      plan.responses.push(resp);
    }

    // NCs e ações: mesmas regras de buildAutoNonconformities/buildAutoActions.
    for (const r of responses.filter((x) => x.resposta === "nao_conforme")) {
      const it = itemByCode.get(r.codigo);
      const severidade = resolveSeveridade(it);
      const ncId = uuid();
      plan.ncs.push({
        id: ncId,
        inspection_id: inspectionId,
        tag: rec.tag,
        codigo: it.codigo,
        categoria: it.modulo_nome,
        descricao: r.observacao || `${it.codigo} — ${it.titulo}`,
        evidencia_url: r.evidencia_url,
        severidade,
        created_at: rec.submittedAt,
      });
      plan.actions.push({
        nonconformity_id: ncId,
        tag: rec.tag,
        descricao: defaultActionDescription(it.codigo, it.titulo),
        prazo: defaultPrazo(severidade, prazoBase(rec)),
        created_at: rec.submittedAt,
      });
    }

    for (const f of analysisFlags({ responses, measurements: [], thermography: [], items: TEMPLATE_ITEMS })) {
      plan.flags.push({ inspection_id: inspectionId, tag: rec.tag, ...f, created_at: rec.submittedAt });
    }

    plan.panels.push({ tag: rec.tag, inspection_id: inspectionId, photo_url: urls.externa, photo_interna_url: urls.interna, diagrama_url: urls.diagrama, inspection_date: rec.inspectionDate });
  }
  return plan;
}
