// Geração do arquivo .xlsx da base do Form Segurança — único ponto do
// projeto que importa `xlsx` para esta funcionalidade. Este módulo inteiro
// é carregado sob demanda pelo componente (import dinâmico, ver
// InspectionList.jsx), não no carregamento inicial da aplicação — mesmo
// padrão já usado para o PDF de quadros inspecionados
// (services/inspectedPanelsPdfService.js).
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { PHOTO_HEADER } from "@/domain/safetyFormExport";

export async function exportSafetyFormExcel(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);

  // Coluna da foto: o valor da célula já é a URL pública (texto simples,
  // funciona em qualquer leitor); aqui só soma o hyperlink clicável do
  // Excel por cima da mesma célula. Células sem foto (string vazia) ficam
  // vazias, sem link — nunca um link "quebrado".
  const headers = Object.keys(rows[0] || {});
  const photoColIdx = headers.indexOf(PHOTO_HEADER);
  if (photoColIdx !== -1) {
    rows.forEach((row, i) => {
      const url = row[PHOTO_HEADER];
      if (!url) return;
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: photoColIdx });
      if (ws[cellRef]) ws[cellRef].l = { Target: url };
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Form Segurança");
  XLSX.writeFile(wb, `base-form-seguranca_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}
