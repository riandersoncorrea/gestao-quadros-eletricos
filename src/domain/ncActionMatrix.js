// Matriz de criticidade e ação padrão das perguntas do checklist — fonte
// única de verdade para a NC e a ação geradas automaticamente quando uma
// pergunta é respondida "Não Conforme" (ver domain/inspectionRules.js).
// A chave é o código da pergunta (inspection_template_items.codigo, com
// hífen). Funções puras — sem acesso a rede.
//
// Critério de criticidade:
//  - critica: risco iminente de choque, arco ou incêndio;
//  - alta:    proteção ou isolamento comprometido, risco significativo;
//  - media:   desvio normativo ou degradação sem risco imediato;
//  - baixa:   conservação, organização ou documentação de apoio.
//
// PRO-01 e ATR-01 seguem a regra própria já existente (ALWAYS_CRITICAL_CODES
// e risco de interdição em domain/inspectionRules.js) — aqui só têm a ação
// padrão (texto proposto pelo desenvolvimento — a demanda não definiu a
// ação dessas duas; ajustar aqui se necessário). Ser 'critica' NÃO estende a outros itens os efeitos de
// interdição, que dependem do código da pergunta, não do nível.

export const NC_ACTION_MATRIX = {
  // Identificação
  "ID-01": { severidade: "media", norma: "NR-10 10.10.1; NBR 5410 6.5.4", acao: "Atualizar a identificação de circuitos e disjuntores conforme o diagrama." },
  "ID-02": { severidade: "baixa", norma: "NBR 5410 6.5.4; NBR IEC 61439-1", acao: "Instalar ou repor a placa de identificação do quadro." },
  "ID-03": { severidade: "baixa", norma: "NBR 5410 6.5.4; NR-10 10.2.3", acao: "Afixar diagrama/etiqueta de circuitos atualizado na parte interna da porta." },
  "ID-04": { severidade: "media", norma: "NR-10 10.2.3; NBR 5410", acao: "Identificar no quadro a tensão nominal e o esquema de aterramento." },
  "ID-05": { severidade: "baixa", norma: "Gestão de ativos (regra interna)", acao: "Regularizar a TAG do quadro conforme inventário/plano SAP." },

  // Segurança
  "SEG-01": { severidade: "media", norma: "NR-10 10.10.1; NR-26", acao: "Instalar ou repor sinalização e placas de advertência." },
  "SEG-02": { severidade: "critica", norma: "NR-10 10.2.8; NBR 5410 5.1", acao: "Eliminar imediatamente a exposição de partes vivas; restringir o acesso até a correção." },
  "SEG-03": { severidade: "alta", norma: "NBR IEC 60529; NBR 5410 (influências externas)", acao: "Adequar o grau de proteção (IP) do invólucro ao ambiente." },
  "SEG-04": { severidade: "media", norma: "NR-10 (espaço seguro e acesso)", acao: "Desobstruir o espaço de trabalho e o acesso ao quadro." },
  "SEG-05": { severidade: "alta", norma: "NR-10 10.2.8; NBR 5410 5.1", acao: "Instalar ou repor barreiras/anteparos contra contato acidental." },
  "SEG-06": { severidade: "alta", norma: "NR-10 10.3.1, 10.5.1 e 10.10.1", acao: "Adequar o disjuntor/dispositivo para permitir bloqueio e etiquetagem (LOTO)." },
  "SEG-07": { severidade: "media", norma: "NR-23; NR-10 10.9", acao: "Providenciar extintor de CO2/pó químico próximo e dentro da validade." },

  // Integridade física
  "INT-01": { severidade: "media", norma: "NBR IEC 61439-1; NBR 5410 8.3", acao: "Reparar ou substituir o invólucro." },
  "INT-02": { severidade: "media", norma: "NBR IEC 61439-1; NBR IEC 60529", acao: "Reparar o fechamento de portas, tampas e selos." },
  "INT-03": { severidade: "baixa", norma: "NBR 5410 8.3", acao: "Executar limpeza interna e externa conforme procedimento de segurança." },
  "INT-04": { severidade: "alta", norma: "NBR 5410 (influências externas); NBR IEC 60529", acao: "Eliminar a fonte de umidade/poeira, limpar e restabelecer a vedação." },
  "INT-05": { severidade: "baixa", norma: "NBR IEC 61439-1", acao: "Recuperar pintura/tratamento anticorrosivo." },
  "INT-06": { severidade: "media", norma: "NBR IEC 60529", acao: "Vedar prensa-cabos e aberturas para manter o grau IP." },
  "INT-07": { severidade: "baixa", norma: "NBR 5410 8.3", acao: "Reparar ou substituir dobradiças, fecho e maçaneta." },
  "INT-08": { severidade: "alta", norma: "NBR IEC 60529; NBR 5410", acao: "Eliminar infiltração/entrada de animais, vedar e inspecionar componentes afetados." },

  // Proteções
  "PRO-01": { severidade: "critica", norma: "NBR 5410 5.1.3.2", acao: "Adequar ou instalar DR." },
  "PRO-02": { severidade: "media", norma: "NBR 5410 6.3.5; NBR 5419-4", acao: "Substituir o DPS com indicação de fim de vida/atuação." },
  "PRO-03": { severidade: "alta", norma: "NBR 5410 5.3; NBR IEC 60947-2", acao: "Adequar ou substituir o disjuntor geral conforme a instalação." },
  "PRO-04": { severidade: "media", norma: "NBR 5410 5.3", acao: "Investigar sobrecarga do circuito e adequar carga/proteção; substituir disjuntor degradado." },
  "PRO-05": { severidade: "media", norma: "NBR 5410 (seletividade/coordenação)", acao: "Revisar o estudo de seletividade e ajustar os dispositivos." },
  "PRO-06": { severidade: "critica", norma: "NR-10 10.4.4; NBR 5410 5.3", acao: "Remover imediatamente shunt/jumper/travamento e restabelecer a proteção." },

  // Barramentos e conexões
  "BAR-01": { severidade: "alta", norma: "NBR 5410 6.2.8; NBR IEC 61439-1", acao: "Refazer a conexão, substituir componentes danificados e verificar por termografia." },
  "BAR-02": { severidade: "alta", norma: "NBR IEC 61439-1", acao: "Fixar/reapertar, tratar oxidação ou substituir o barramento." },
  "BAR-03": { severidade: "media", norma: "NBR 5410 6.2.8 e 8.3", acao: "Realizar reaperto com torquímetro conforme fabricante e registrar." },
  "BAR-04": { severidade: "alta", norma: "NBR IEC 61439-1", acao: "Substituir isoladores/suportes de barramento danificados." },
  "BAR-05": { severidade: "critica", norma: "NR-10 10.4.4; NBR IEC 61439-1", acao: "Avaliar imediatamente com o quadro desenergizado, identificar a origem do arco/aquecimento e substituir componentes." },
  "BAR-06": { severidade: "media", norma: "NBR 5410 6.2.8", acao: "Substituir terminais/conectores por modelos adequados à seção do condutor." },
  "BAR-07": { severidade: "alta", norma: "NBR IEC 61439-1", acao: "Adequar distâncias de isolamento e escoamento." },
  "BAR-08": { severidade: "alta", norma: "NBR 5410 6.4 (esquema TN-S)", acao: "Separar neutro e PE em barramentos distintos." },

  // Cabos e isolação
  "CAB-01": { severidade: "baixa", norma: "NBR 5410 6.2 e 8.3", acao: "Reorganizar, fixar e rotear os cabos." },
  "CAB-02": { severidade: "alta", norma: "NBR 5410 5.1 e 6.2", acao: "Substituir condutores com isolação danificada/ressecada." },
  "CAB-03": { severidade: "alta", norma: "NBR 5410 5.3.4", acao: "Adequar a seção do condutor ou o dispositivo de proteção." },
  "CAB-06": { severidade: "media", norma: "NBR 5410 6.2.8", acao: "Eliminar emendas dentro do quadro (substituir o trecho ou usar bornes)." },
  "CAB-07": { severidade: "baixa", norma: "NBR 5410 6.1.5.3", acao: "Adequar a identificação por cores dos condutores." },
  "CAB-08": { severidade: "baixa", norma: "NBR 5410 6.5.4.7", acao: "Avaliar ampliação para garantir reserva técnica de espaço." },

  // Aterramento
  "ATR-01": { severidade: "critica", norma: "NBR 5410 6.4; NR-10 10.2.8.3", acao: "Instalar ou reconectar o condutor de proteção (PE) e garantir sua continuidade até o barramento de terra." },
  "ATR-02": { severidade: "alta", norma: "NBR 5410 6.4 e 7.3", acao: "Realizar ensaio de continuidade e corrigir o aterramento." },
  "ATR-03": { severidade: "alta", norma: "NBR 5410 6.4", acao: "Identificar e recuperar o barramento de terra." },
  "ATR-05": { severidade: "alta", norma: "NBR 5410 5.1 e 6.4; NR-10 10.2.8.3", acao: "Aterrar todas as massas metálicas (porta, painel, trilhos)." },
  "ATR-06": { severidade: "media", norma: "NBR 5410 6.4.2", acao: "Instalar condutor de equipotencialização." },
  "ATR-07": { severidade: "media", norma: "NBR 5410 6.4 e 8.3", acao: "Tratar a corrosão ou substituir as conexões de aterramento." },

  // Documentação
  "DOC-01": { severidade: "media", norma: "NR-10 10.2.3", acao: "Elaborar/atualizar o diagrama unifilar e disponibilizá-lo no quadro." },
};

/** Severidade provisória para pergunta fora da matriz — não quebra o fluxo. */
export const DEFAULT_SEVERIDADE = "media";

/**
 * Prazo padrão da ação automática, em dias corridos a partir da data em
 * que a inspeção é finalizada (e não da data da inspeção, para que uma
 * inspeção lançada com atraso não gere ações já atrasadas).
 */
export const PRAZO_DIAS_POR_SEVERIDADE = { critica: 1, alta: 7, media: 30, baixa: 90 };

/** Entrada da matriz para o código da pergunta, ou null se não mapeado. */
export function matrixEntry(codigo) {
  return (codigo && NC_ACTION_MATRIX[codigo]) || null;
}

/** Severidade da NC pela matriz (DEFAULT_SEVERIDADE se fora da matriz). */
export function matrixSeveridade(codigo) {
  return matrixEntry(codigo)?.severidade || DEFAULT_SEVERIDADE;
}

/**
 * Descrição padrão da ação, sempre com a referência normativa. Pergunta
 * fora da matriz: descrição genérica a partir do título da pergunta.
 */
export function defaultActionDescription(codigo, titulo) {
  const e = matrixEntry(codigo);
  const prefix = codigo ? `${codigo} - ` : "";
  if (!e) return `${prefix}Corrigir a não conformidade: ${titulo || "item do checklist"}.`;
  return `${prefix}${e.acao} Referência: ${e.norma}.`;
}

/** Prazo ("yyyy-mm-dd", data local) a partir de `baseDate` conforme a severidade. */
export function defaultPrazo(severidade, baseDate = new Date()) {
  const dias = PRAZO_DIAS_POR_SEVERIDADE[severidade] ?? PRAZO_DIAS_POR_SEVERIDADE[DEFAULT_SEVERIDADE];
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + dias);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
