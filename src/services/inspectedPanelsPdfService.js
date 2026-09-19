import { jsPDF } from "jspdf";
import logoSistema from "@/assets/logo-sistema.png";

// Layout do relatório em PDF (A4, mm). Mesma identidade visual (cor
// primária, cabeçalho/rodapé) do relatório de Análise Inteligente
// (src/services/intelligentAnalysisPdfService.js) — mantido como um
// utilitário próprio e independente aqui (em vez de compartilhar módulo)
// para não alterar/arriscar o relatório já existente.
const PAGE_W = 210, PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 22;
const FOOTER_SPACE = 14;
const PRIMARY = [24, 145, 131]; // aprox. --primary do tema (teal)
const PRIMARY_TINT = [235, 246, 245];

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return d; }
}

class ReportPdf {
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
    doc.text("Relatório de Quadros Inspecionados", MARGIN + 20, 10);
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

  // Cabeçalho visual de cada grupo de localidade (seção 9 do pedido):
  // bloco destacado com o nome da localidade e a contagem de quadros,
  // para a equipe identificar rapidamente cada grupo ao folhear o PDF.
  localidadeHeader(nome, count) {
    this.ensureSpace(20);
    const { doc } = this;
    doc.setFillColor(...PRIMARY_TINT);
    doc.setDrawColor(...PRIMARY);
    doc.roundedRect(MARGIN, this.y, CONTENT_W, 12, 1.5, 1.5, "FD");
    doc.setTextColor(...PRIMARY);
    doc.setFont(undefined, "bold");
    doc.setFontSize(11);
    doc.text(nome.toUpperCase(), MARGIN + 3, this.y + 5);
    doc.setFont(undefined, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(80);
    doc.text(`${count} quadro${count === 1 ? "" : "s"} inspecionado${count === 1 ? "" : "s"}`, MARGIN + 3, this.y + 9.5);
    doc.setTextColor(0);
    this.y += 16;
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
      headers.forEach((h, i) => {
        const text = doc.splitTextToSize(String(h), widths[i] - 3)[0] || "";
        doc.text(text, x + 1.5, this.y + 4.5);
        x += widths[i];
      });
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
        const text = doc.splitTextToSize(String(cell ?? "—"), widths[i] - 3)[0] || "";
        doc.text(text, x + 1.5, this.y + 4.5);
        x += widths[i];
      });
      doc.setDrawColor(230);
      doc.line(MARGIN, this.y + rowH, MARGIN + CONTENT_W, this.y + rowH);
      this.y += rowH;
    }
    this.y += 3;
  }
}

/**
 * Gera e baixa o relatório de quadros já inspecionados (material de apoio
 * ao planejamento/divisão de inspeções). `report` vem de
 * domain/inspectedPanelsReport.js#buildInspectedPanelsReport — esta função
 * só formata para impressão, não recalcula nenhuma regra de negócio.
 */
export async function exportInspectedPanelsPdf(report, { filtrosLabel } = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let logoImg = null;
  try { logoImg = await loadImageEl(logoSistema); } catch { /* segue sem logo se falhar */ }

  const pdf = new ReportPdf(doc, logoImg);
  pdf.newPage();

  doc.setFontSize(9.5);
  doc.setTextColor(90);
  doc.text(`Data de geração: ${report.generatedAt.toLocaleString("pt-BR")}`, MARGIN, pdf.y);
  pdf.y += 5;
  if (filtrosLabel) {
    doc.text(filtrosLabel, MARGIN, pdf.y);
    pdf.y += 5;
  }
  doc.setTextColor(0);
  pdf.y += 2;

  if (report.totalQuadros === 0) {
    pdf.sectionTitle("Resumo");
    pdf.paragraph("Nenhum quadro com inspeção vigente encontrado para os filtros selecionados.");
    pdf.drawFooters();
    doc.save(`quadros-inspecionados-${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  pdf.sectionTitle("Resumo");
  pdf.kpiRow([
    { label: "Quadros com inspeção vigente", value: report.totalQuadros },
    { label: "Localidades", value: report.totalLocalidades },
  ]);
  pdf.table(
    ["Localidade", "Quadros inspecionados"],
    report.groups.map((g) => [g.nome, g.quadros.length]),
    [140, 60]
  );

  for (const group of report.groups) {
    pdf.ensureSpace(28);
    pdf.localidadeHeader(group.nome, group.quadros.length);
    pdf.table(
      ["Quadro", "Última inspeção", "Próxima inspeção", "Responsável", "Status"],
      group.quadros.map((q) => [q.tag, fmtDate(q.ultimaInspecao), fmtDate(q.proximaInspecao), q.responsavel, q.statusLabel]),
      // Responsável costuma ser um e-mail (bastante usado como inspector_name
      // nos dados reais) — largura maior para reduzir truncamento na tabela.
      // Última/Próxima inspeção precisam de espaço mínimo para o cabeçalho
      // da coluna não estourar em cima da coluna seguinte.
      [26, 32, 32, 50, 40]
    );
  }

  pdf.drawFooters();
  doc.save(`quadros-inspecionados-${new Date().toISOString().slice(0, 10)}.pdf`);
}
