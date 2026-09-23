// Geração do arquivo .xlsx da base do Form Segurança — único ponto do
// projeto que usa `exceljs`. A lib `xlsx` (usada no resto do app, ex.
// InventoryList.jsx) não grava estilo de célula nem Tabela nativa do
// Excel na edição gratuita (testado e confirmado: o estilo volta vazio
// ao reabrir o arquivo) — por isso este export específico usa `exceljs`
// (MIT, gratuita, mantida), que suporta os dois. Módulo inteiro carregado
// sob demanda pelo componente (import dinâmico, ver InspectionList.jsx),
// não no carregamento inicial da aplicação — mesmo padrão já usado para
// o PDF de quadros inspecionados (services/inspectedPanelsPdfService.js).
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { PHOTO_HEADER } from "@/domain/safetyFormExport";

// Mesma cor --primary do tema (hsl(173 72% 33%) = #189183), já usada nos
// relatórios em PDF (ver PRIMARY em inspectedPanelsPdfService.js /
// intelligentAnalysisPdfService.js) — identidade visual consistente.
const HEADER_FILL_ARGB = "FF189183";
const HEADER_FONT_ARGB = "FFFFFFFF";

export async function exportSafetyFormExcel(rows) {
  const headers = Object.keys(rows[0] || {});

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Form Segurança");

  // Tabela nativa do Excel (não só células soltas): dá filtro por coluna e
  // faixas de cor alternadas; o cabeçalho (abaixo) é sobrescrito com a cor
  // do sistema por cima do estilo padrão da tabela.
  sheet.addTable({
    name: "FormSeguranca",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium9", showRowStripes: true },
    columns: headers.map((h) => ({ name: h, filterButton: true })),
    rows: rows.map((row) => headers.map((h) => row[h] ?? "")),
  });

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL_ARGB } };
    cell.font = { color: { argb: HEADER_FONT_ARGB }, bold: true };
  });

  headers.forEach((h, i) => {
    sheet.getColumn(i + 1).width = Math.min(Math.max(h.length, 22), 70);
  });

  // Coluna da foto: a tabela (acima) já gravou a URL como texto simples em
  // cada célula; aqui soma o hyperlink clicável do Excel por cima da
  // mesma célula. Nunca mexe em célula vazia (sem foto fica vazia, sem
  // link "quebrado").
  const photoColIdx = headers.indexOf(PHOTO_HEADER);
  if (photoColIdx !== -1) {
    rows.forEach((row, i) => {
      const url = row[PHOTO_HEADER];
      if (!url) return;
      sheet.getRow(i + 2).getCell(photoColIdx + 1).value = { text: url, hyperlink: url };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `base-form-seguranca_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
