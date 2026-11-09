// jsPDF FALSO para os testes (run.mjs substitui "jspdf" por este arquivo):
// registra os textos escritos e o nome do arquivo salvo, sem gerar PDF.
export const pdfLog = { texts: [], saved: [] };

export function resetPdfLog() {
  pdfLog.texts.length = 0;
  pdfLog.saved.length = 0;
}

export class jsPDF {
  constructor() {
    this.pages = 1;
    this.internal = {
      getNumberOfPages: () => this.pages,
      pageSize: { getWidth: () => 210, getHeight: () => 297 },
    };
    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return () => target; // setFont, setFontSize, rect, line... -> no-op encadeável
      },
    });
  }
  text(value) {
    pdfLog.texts.push(Array.isArray(value) ? value.join(" ") : String(value));
    return this;
  }
  splitTextToSize(value) {
    return [String(value)];
  }
  getTextWidth(value) {
    return String(value).length;
  }
  addPage() {
    this.pages += 1;
    return this;
  }
  save(name) {
    pdfLog.saved.push(name);
  }
}

export default jsPDF;
