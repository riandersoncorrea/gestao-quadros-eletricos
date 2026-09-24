import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import logoSistema from "@/assets/logo-sistema.png";
import { ANALYSIS_PERIOD_OPTIONS, LOCALIDADE_ALL } from "@/domain/intelligentAnalysisFilters";

// Layout do relatório em PDF (A4, mm). Não é uma captura de tela — cada
// seção é desenhada num layout próprio de página (cabeçalho/rodapé fixos,
// margens, quebras de página controladas). Os gráficos reaproveitam o
// próprio SVG renderizado na tela (via html2canvas), garantindo que o PDF
// mostre exatamente os mesmos números já calculados pela página.
const PAGE_W = 210, PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 22;
const FOOTER_SPACE = 14;
const PRIMARY = [24, 145, 131]; // aprox. --primary do tema (teal)

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function pct(v, digits = 1) { return v == null ? "-" : `${v.toFixed(digits)}%`; }
function fmtDate(d) {
  if (!d) return "-";
  try { return new Date(d + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return d; }
}

class PdfBuilder {
  constructor(doc, logoImg) {
    this.doc = doc;
    this.logoImg = logoImg;
    this.page = 0;
    this.y = 0;
  }

  newPage() {
    if (this.page > 0) this.doc.addPage();
    this.page += 1;
    this.drawHeader();
    this.y = HEADER_H + 8;
  }

  drawHeader() {
    const { doc, logoImg } = this;
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, PAGE_W, HEADER_H, "F");
    if (logoImg) doc.addImage(logoImg, "PNG", MARGIN, 3, 16, 16);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, "bold");
    doc.setFontSize(13);
    doc.text("Análise Inteligente dos Dados", MARGIN + 20, 10);
    doc.setFont(undefined, "normal");
    doc.setFontSize(8.5);
    doc.text("Gestão de Quadros Elétricos · Serv. Operacionais · São Luís EFC", MARGIN + 20, 16);
    doc.setTextColor(0, 0, 0);
  }

  drawFooters() {
    const { doc } = this;
    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Página ${p} de ${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
      doc.text("Gerado em " + new Date().toLocaleString("pt-BR"), MARGIN, PAGE_H - 8);
      doc.setTextColor(0);
    }
  }

  ensureSpace(neededH) {
    if (this.y + neededH > PAGE_H - MARGIN - FOOTER_SPACE) this.newPage();
  }

  sectionTitle(text) {
    this.ensureSpace(12);
    const { doc } = this;
    doc.setFontSize(12.5);
    doc.setFont(undefined, "bold");
    doc.setTextColor(...PRIMARY);
    doc.text(text, MARGIN, this.y);
    doc.setTextColor(0);
    doc.setFont(undefined, "normal");
    this.y += 6;
  }

  paragraph(text, size = 9.5) {
    const { doc } = this;
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, CONTENT_W);
    for (const line of lines) {
      this.ensureSpace(5.5);
      doc.text(line, MARGIN, this.y);
      this.y += 5;
    }
    this.y += 1.5;
  }

  bullet(text, size = 9.5) {
    const { doc } = this;
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, CONTENT_W - 5);
    this.ensureSpace(5.5);
    doc.text("•", MARGIN, this.y);
    for (const [i, line] of lines.entries()) {
      this.ensureSpace(5.5);
      doc.text(line, MARGIN + 4, this.y);
      this.y += 5;
    }
    this.y += 0.5;
  }

  kpiRow(items) {
    const { doc } = this;
    const w = CONTENT_W / items.length;
    this.ensureSpace(20);
    const top = this.y;
    items.forEach((it, i) => {
      const x = MARGIN + i * w;
      doc.setDrawColor(220);
      doc.roundedRect(x + 1, top, w - 2, 18, 1.5, 1.5, "S");
      doc.setFontSize(7.5);
      doc.setTextColor(110);
      doc.text(it.label, x + 3, top + 5, { maxWidth: w - 6 });
      doc.setTextColor(0);
      doc.setFont(undefined, "bold");
      doc.setFontSize(12);
      doc.text(String(it.value), x + 3, top + 13);
      doc.setFont(undefined, "normal");
    });
    this.y = top + 22;
  }

  table(headers, rows, colWidths) {
    const { doc } = this;
    const totalW = colWidths.reduce((a, b) => a + b, 0);
    const scale = CONTENT_W / totalW;
    const widths = colWidths.map((w) => w * scale);
    const rowH = 6.5;

    const drawHeaderRow = () => {
      doc.setFillColor(240, 240, 240);
      doc.rect(MARGIN, this.y, CONTENT_W, rowH, "F");
      doc.setFont(undefined, "bold");
      doc.setFontSize(8.5);
      let x = MARGIN;
      headers.forEach((h, i) => { doc.text(h, x + 1.5, this.y + 4.5); x += widths[i]; });
      doc.setFont(undefined, "normal");
      this.y += rowH;
    };

    this.ensureSpace(rowH * 2);
    drawHeaderRow();
    doc.setFontSize(8);
    for (const row of rows) {
      if (this.y + rowH > PAGE_H - MARGIN - FOOTER_SPACE) {
        this.newPage();
        drawHeaderRow();
        doc.setFontSize(8);
      }
      let x = MARGIN;
      row.forEach((cell, i) => {
        const text = doc.splitTextToSize(String(cell ?? "-"), widths[i] - 3)[0] || "";
        doc.text(text, x + 1.5, this.y + 4.5);
        x += widths[i];
      });
      doc.setDrawColor(230);
      doc.line(MARGIN, this.y + rowH, MARGIN + CONTENT_W, this.y + rowH);
      this.y += rowH;
    }
    this.y += 3;
  }

  async chartImage(elementId, maxHeightMm = 90) {
    const el = document.getElementById(elementId);
    if (!el) return;
    // scale 1.5 já garante boa nitidez de impressão sem gerar canvases
    // enormes; JPEG (o fundo é sempre branco opaco, não há transparência a
    // preservar) reduz o PDF em várias vezes o tamanho de um PNG equivalente.
    const canvas = await html2canvas(el, { scale: 1.5, backgroundColor: "#ffffff", logging: false });
    let imgW = CONTENT_W;
    let imgH = (canvas.height * imgW) / canvas.width;
    if (imgH > maxHeightMm) {
      const ratio = maxHeightMm / imgH;
      imgH = maxHeightMm;
      imgW = imgW * ratio; // mantém a proporção original — nunca esticar/deformar o gráfico
    }
    this.ensureSpace(imgH + 4);
    const x = MARGIN + (CONTENT_W - imgW) / 2;
    this.doc.addImage(canvas.toDataURL("image/jpeg", 0.82), "JPEG", x, this.y, imgW, imgH);
    this.y += imgH + 6;
  }
}

/**
 * Gera e baixa o relatório executivo em PDF a partir do resultado já
 * calculado pela página (mesmos números exibidos em tela). Não recalcula
 * nada — só formata para impressão/apresentação.
 */
export async function exportIntelligentAnalysisPdf({ analysis, filters, localidades, panelOptions }) {
  if (!analysis?.hasData) throw new Error("Não há dados para exportar com os filtros atuais.");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let logoImg = null;
  try { logoImg = await loadImageEl(logoSistema); } catch { /* segue sem logo se falhar */ }

  const pdf = new PdfBuilder(doc, logoImg);
  const periodLabel = ANALYSIS_PERIOD_OPTIONS.find((o) => o.value === filters.period)?.label || "Todo o período";
  const localidadeLabel = filters.localidadeId === LOCALIDADE_ALL
    ? "Todas as localidades"
    : (localidades.find((l) => l.id === filters.localidadeId)?.nome || "-");
  const panelLabel = filters.panelId === "all" ? "Todos os quadros" : (panelOptions.find((p) => p.value === filters.panelId)?.label || "-");

  // Capa / cabeçalho de contexto
  pdf.newPage();
  doc.setFontSize(10);
  doc.text(`Período analisado: ${periodLabel}`, MARGIN, pdf.y); pdf.y += 6;
  doc.text(`Localidade: ${localidadeLabel}`, MARGIN, pdf.y); pdf.y += 6;
  doc.text(`Quadro: ${panelLabel}`, MARGIN, pdf.y); pdf.y += 6;
  doc.text(`Data de geração: ${new Date().toLocaleString("pt-BR")}`, MARGIN, pdf.y); pdf.y += 10;

  // 1. Resumo executivo
  pdf.sectionTitle("1. Resumo Executivo");
  const k = analysis.kpis;
  const locMap = new Map(k.inspecoesPorLocalidade.map((l) => [l.localidade, l.inspecoes]));
  pdf.kpiRow([
    { label: "Inspeções realizadas", value: k.inspecoesRealizadas },
    { label: "Inspeções no Porto", value: locMap.get("Porto") ?? 0 },
    { label: "Inspeções na Oficina", value: locMap.get("Oficina") ?? 0 },
    { label: "Taxa de conformidade", value: pct(k.taxaConformidade) },
  ]);
  pdf.kpiRow([
    { label: "Não conformidades abertas", value: k.naoConformidades },
    { label: "Taxa de NC / 100 insp.", value: k.taxaNcPorInspecao != null ? k.taxaNcPorInspecao.toFixed(1) : "-" },
    { label: "Reincidências", value: analysis.recurrence.resumo.totalCasos },
    { label: "Índice de Saúde médio", value: k.indiceSaudeMedio != null ? Math.round(k.indiceSaudeMedio) : "-" },
  ]);
  const risk = analysis.interdictionRisk;
  pdf.kpiRow([
    { label: "Quadros com risco de interdição", value: risk.quadrosAfetados },
    { label: "Condições críticas (ocorrências)", value: risk.condicoesCriticas },
  ]);
  pdf.paragraph("Não conformidades: registros da tabela de Não Conformidades com status Aberta ou Em Tratamento, abertos dentro do período selecionado, mesma definição usada no Painel (Dashboard).", 8);
  pdf.paragraph(`Risco de interdição: quadros com NC aberta em ${risk.condicoesCatalogo.map((c) => c.label).join(" ou ")}. Um quadro com as duas condições conta uma única vez.`, 8);

  // 2. Conformidade por dimensão
  pdf.sectionTitle("2. Conformidade por Dimensão");
  await pdf.chartImage("conformidade-dimensao", 100);
  pdf.paragraph(analysis.chartDescriptions.dimensions, 9);

  // 3. Principais não conformidades (Pareto)
  pdf.sectionTitle("3. Principais Não Conformidades");
  if (analysis.pareto.itens.length) {
    await pdf.chartImage("pareto-nc", 100);
    pdf.paragraph(analysis.chartDescriptions.pareto, 9);
    // Significado dos códigos exibidos no gráfico acima — texto nativo do
    // jsPDF (não faz parte da imagem capturada do gráfico), para não
    // depender de comprimir a legenda dentro do limite de altura da
    // captura e arriscar ficar ilegível. Mesma fonte de dados da legenda
    // exibida na tela (analysis.pareto.itens, já resolvida com a descrição
    // oficial do catálogo), então acompanha automaticamente o recorte
    // atual; NCs manuais sem código ficam de fora, como na tela.
    const codigosLegenda = analysis.pareto.itens.filter((it) => it.codigo && it.titulo);
    if (codigosLegenda.length) {
      pdf.ensureSpace(7);
      doc.setFont(undefined, "bold"); doc.setFontSize(9.5);
      doc.text("Significado dos códigos", MARGIN, pdf.y); pdf.y += 5.5;
      doc.setFont(undefined, "normal");
      for (const it of codigosLegenda) pdf.bullet(`${it.codigo}: ${it.titulo}`, 8.5);
    }
  } else {
    pdf.paragraph("Nenhuma não conformidade aberta no período selecionado.");
  }

  // 4. Distribuição por localidade
  pdf.sectionTitle("4. Distribuição por Localidade");
  if (analysis.byLocalidade.length) {
    await pdf.chartImage("localidades", 110);
    pdf.paragraph(analysis.chartDescriptions.localidade, 9);
  } else {
    pdf.paragraph("Sem dados de localidade para o recorte selecionado.");
  }

  // 5. Evolução temporal
  pdf.sectionTitle("5. Evolução Temporal");
  if (analysis.temporal.pontos.length >= 2) {
    await pdf.chartImage("evolucao-temporal", 100);
    pdf.paragraph(analysis.chartDescriptions.temporal, 9);
  } else {
    pdf.paragraph("Histórico insuficiente para traçar evolução temporal (é necessário mais de um período com inspeções).");
  }

  // 5b. Quadros críticos
  pdf.sectionTitle("5b. Quadros Críticos");
  if (analysis.rankingQuadros.itens.length) {
    pdf.table(
      ["Quadro", "Localidade", "NCs abertas"],
      analysis.rankingQuadros.itens.slice(0, 15).map((q) => [q.panelTag, q.localidade, q.naoConformidades]),
      [50, 90, 30]
    );
  } else {
    pdf.paragraph("Nenhum quadro com não conformidade aberta no período selecionado.");
  }

  // 5c. Condições críticas de interdição
  // Reserva o espaço do gráfico junto com o título — sem isso, o título
  // pode ficar sozinho no fim de uma página e o gráfico "solto" na
  // seguinte (Etapa 11 do pedido: nada importante quebrado entre páginas).
  pdf.ensureSpace(105);
  pdf.sectionTitle("5c. Condições Críticas de Interdição");
  if (risk.quadrosAfetados > 0) {
    await pdf.chartImage("risco-interdicao-chart", 100);
    pdf.table(
      ["Quadro", "Nome", "Localidade", "Condição", "Última ocorrência", "Responsável", "Status"],
      risk.quadros.map((q) => [
        q.panelTag,
        q.panelName,
        q.localidade,
        q.condicoesLabel,
        fmtDate(q.ultimaOcorrencia),
        q.responsavel || "-",
        q.status === "aberta" ? "Aberta" : "Em tratamento",
      ]),
      [20, 34, 20, 20, 30, 32, 24]
    );
  } else {
    pdf.paragraph("Nenhum quadro com condição crítica de interdição identificada no período selecionado.");
  }

  // 6. Reincidências
  pdf.sectionTitle("6. Reincidências");
  pdf.paragraph(analysis.chartDescriptions.recurrence, 9);
  if (analysis.recurrence.casos.length) {
    pdf.table(
      ["Quadro", "Requisito", "Ocorrências", "Última ocorrência", "Taxa de recorrência"],
      analysis.recurrence.casos.slice(0, 25).map((c) => [
        c.panelTag,
        `${c.codigo ? c.codigo + ": " : ""}${c.titulo}`.slice(0, 60),
        c.ocorrencias,
        fmtDate(c.ultimaOcorrencia),
        c.taxa?.insuficiente ? "dados insuficientes" : `${c.taxa.taxa.toFixed(0)}%`,
      ]),
      [22, 90, 22, 30, 30]
    );
  } else {
    pdf.paragraph("Nenhuma reincidência identificada no período selecionado.");
  }

  // 7. Diagnóstico dos dados
  pdf.sectionTitle("7. Diagnóstico dos Dados");
  const categorias = analysis.diagnostics.categorias || [];
  if (categorias.length) {
    for (const cat of categorias) {
      pdf.ensureSpace(7);
      doc.setFont(undefined, "bold"); doc.setFontSize(10);
      doc.text(cat.titulo, MARGIN, pdf.y); pdf.y += 5.5;
      doc.setFont(undefined, "normal");
      for (const a of cat.achados) pdf.bullet(a.texto);
    }
  } else {
    pdf.paragraph("Sem padrões relevantes a destacar no período selecionado.");
  }

  // 8. Índice de Saúde × Conformidade
  pdf.sectionTitle("8. Índice de Saúde × Conformidade");
  if (analysis.healthVsConformity.pontos.length) {
    await pdf.chartImage("is-vs-conformidade", 100);
    pdf.paragraph(
      analysis.healthVsConformity.dadosSuficientes
        ? `Correlação observada: r = ${analysis.healthVsConformity.correlacao.toFixed(2)} (coeficiente de Pearson). Correlação não implica causalidade.`
        : "Dados insuficientes para calcular correlação estatística (mínimo de 5 inspeções com Índice de Saúde)."
    );
  } else {
    pdf.paragraph("Nenhuma inspeção com Índice de Saúde calculado no período selecionado.");
  }

  // 9. Análise preditiva
  pdf.sectionTitle("9. Análise Preditiva");
  const pred = analysis.predictive;
  if (!pred.enoughForTrend) {
    pdf.paragraph("Dados históricos insuficientes para gerar projeção confiável (mínimo de 6 inspeções no recorte filtrado).");
  } else {
    if (!pred.conformityProjection.insuficiente) {
      const cp = pred.conformityProjection;
      pdf.paragraph(
        `Projeção da taxa de conformidade: tendência estimada de ${cp.tendencia}. ` +
        `Cenário projetado: ${cp.projecao.map((p) => `${p.valor.toFixed(1)}% (intervalo aproximado ${p.intervaloMin.toFixed(1)}%–${p.intervaloMax.toFixed(1)}%)`).join("; ")}. ` +
        `Projeção calculada por regressão linear sobre o histórico do recorte filtrado, representa um cenário estimado, não uma garantia.`
      );
    } else {
      pdf.paragraph(pred.conformityProjection.motivo);
    }
    if (!pred.ncTrend.insuficiente) {
      pdf.paragraph(`Tendência da quantidade de não conformidades: ${pred.ncTrend.tendencia}. Não representa garantia de continuidade.`);
    } else {
      pdf.paragraph(pred.ncTrend.motivo);
    }
  }

  // 10. Insights gerenciais
  pdf.sectionTitle("10. Insights Gerenciais");
  const groups = [
    ["Destaques", analysis.insights.destaques],
    ["Pontos de atenção", analysis.insights.pontosDeAtencao],
    ["Evolução", analysis.insights.evolucao],
    ["Recorrências", analysis.insights.recorrencias],
    ["Concentração", analysis.insights.concentracao],
  ];
  for (const [label, items] of groups) {
    if (!items.length) continue;
    pdf.ensureSpace(7);
    doc.setFont(undefined, "bold"); doc.setFontSize(10);
    doc.text(label, MARGIN, pdf.y); pdf.y += 5.5;
    doc.setFont(undefined, "normal");
    for (const it of items) pdf.bullet(`${it.titulo}: ${it.descricao}`);
  }

  // 11. Observações metodológicas
  pdf.sectionTitle("11. Observações Metodológicas");
  pdf.paragraph(`Período analisado: ${periodLabel}. Localidade: ${localidadeLabel}. Quadro: ${panelLabel}.`);
  pdf.paragraph(`Total de inspeções consideradas no recorte: ${k.inspecoesRealizadas}.`);
  pdf.paragraph("Duas métricas distintas, nunca misturadas: (A) 'Não conformidades', registros da tabela de Não Conformidades do processo, com status Aberta ou Em Tratamento, dentro do período selecionado (mesma definição usada no Painel/Dashboard); (B) 'Taxa de conformidade', respostas Conforme / (Conforme + Não Conforme) do checklist, sem ciclo de vida próprio. Respostas 'Não Aplicável' e 'Não Verificado' não entram no denominador de (B).");
  pdf.paragraph("Taxa de NC = Não conformidades abertas / inspeções realizadas no recorte (não é NCs sobre respostas de checklist).");
  pdf.paragraph("Reincidência = mesmo requisito com NC aberta em 2 ou mais inspeções diferentes do mesmo quadro.");
  pdf.paragraph(`Risco de interdição = quadros distintos com NC aberta em ${risk.condicoesCatalogo.map((c) => c.label).join(" ou ")}. "Quadros afetados" conta cada quadro uma única vez, mesmo com as duas condições; "condições críticas" conta as ocorrências.`);
  pdf.paragraph("Método preditivo: regressão linear simples (mínimos quadrados) sobre a série temporal de cada indicador, método determinístico, reproduzível e auditável. Projeções exigem histórico mínimo (6 inspeções e 4 períodos de tempo com dados); abaixo disso, a página informa 'dados insuficientes' em vez de projetar.");
  pdf.paragraph("Correlações estatísticas (Índice de Saúde × Conformidade) são sempre apresentadas como associação observada, nunca como relação de causa e efeito.");
  pdf.paragraph("Limitações: a análise reflete somente os dados registrados dentro do recorte de filtros selecionado; quadros ou períodos sem inspeção não são representados.");

  pdf.drawFooters();

  const fileSuffix = new Date().toISOString().slice(0, 10);
  doc.save(`analise-inteligente-${fileSuffix}.pdf`);
}
