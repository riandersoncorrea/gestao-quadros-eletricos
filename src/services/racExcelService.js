// Arquivo .xlsx da base RAC (tela de Não Conformidades). Usa `exceljs`, já
// usada no Form Segurança (services/safetyFormExportService.js) porque grava
// Tabela nativa do Excel, estilo de cabeçalho e formato de data. Carregado
// sob demanda (import dinâmico na tela).
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { RAC_COLUMNS, RAC_DATE_COLUMNS } from "@/domain/racExport";
import { getActiveUnit } from "@/lib/unitScope";
import { unitFileName, unitReportLabel } from "@/domain/unitScope";

const HEADER_FILL_ARGB = "FF189183"; // --primary do tema, como no Form Segurança
const HEADER_FONT_ARGB = "FFFFFFFF";

const WIDTHS = {
  "TAG": 16, "Site": 18, "Local": 26, "Sublocal": 26, "Categoria da NC": 24, "ID da NC": 38,
  "Descrição da NC": 60, "Data da última inspeção": 16, "Data da próxima inspeção": 16,
  "Risco de interdição?": 14, "Status da NC": 16,
};
const WRAP = new Set(["Local", "Sublocal", "Categoria da NC", "Descrição da NC"]);

/** Pasta de trabalho da base RAC (separada do download para os testes lerem). */
export function buildRacWorkbook(rows, unit = getActiveUnit()) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Base RAC", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addTable({
    name: "BaseRAC",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium9", showRowStripes: true },
    columns: RAC_COLUMNS.map((name) => ({ name, filterButton: true })),
    rows: rows.map((row) => RAC_COLUMNS.map((c) => row[c] ?? null)),
  });
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL_ARGB } };
    cell.font = { color: { argb: HEADER_FONT_ARGB }, bold: true };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  RAC_COLUMNS.forEach((name, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = WIDTHS[name] || 18;
    if (RAC_DATE_COLUMNS.includes(name)) col.numFmt = "dd/mm/yyyy";
    if (name === "TAG" || name === "ID da NC") col.numFmt = "@"; // texto: preserva zeros
    if (WRAP.has(name)) col.alignment = { vertical: "top", wrapText: true };
  });
  workbook.creator = "Gestão de Quadros Elétricos";
  workbook.title = `Base RAC — NCs por quadro — ${unitReportLabel(unit)}`;
  return workbook;
}

/** Gera e baixa o .xlsx; o nome leva o código da unidade, como os demais exports. */
export async function exportRacExcel(rows) {
  const unit = getActiveUnit();
  const buffer = await buildRacWorkbook(rows, unit).xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = unitFileName("Base_RAC_NCs_por_Quadro", unit, format(new Date(), "yyyy-MM-dd"), "xlsx");
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return a.download;
}
