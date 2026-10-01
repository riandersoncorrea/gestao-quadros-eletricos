import { jsPDF } from "jspdf";
import logoSistema from "@/assets/logo-sistema.png";

// PDF de evidência da correção de uma Não Conformidade, gerado quando a
// ação é concluída (ver completeAction em services/actionService.js) e
// guardado no mesmo bucket de uploads. Mesma identidade visual (cor
// primária, cabeçalho/rodapé, A4 em mm) dos relatórios existentes
// (inspectedPanelsPdfService.js / intelligentAnalysisPdfService.js) —
// utilitário próprio, como eles, para não acoplar/arriscar os relatórios
// já em uso.

const PAGE_W = 210, PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 22;
const FOOTER_SPACE = 14;
const PRIMARY = [24, 145, 131];
const PRIMARY_TINT = [235, 246, 245];
const LABEL_W = 48;
// Área máxima de cada foto: largura total e até ~metade da página, para
// caber 2 fotos por página sem cortar nem distorcer (a proporção original
// é sempre mantida — a foto é reduzida até caber nos dois limites).
const PHOTO_MAX_H = 105;
const PHOTO_JPEG_QUALITY = 0.85;
const SEV_LABEL = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" };

function fmtDate(d) {
  if (!d) return "—";
  try {
    const iso = String(d);
    return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("pt-BR");
  } catch { return String(d); }
}

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Baixa a foto (URL pública do storage) e a converte em JPEG para o PDF,
 * devolvendo também as dimensões reais (para manter a proporção). Usa
 * fetch → blob (o bucket público responde com CORS liberado), então o
 * canvas não fica "tainted".
 */
async function loadPhotoForPdf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não foi possível carregar a foto (${res.status})`);
  const objectUrl = URL.createObjectURL(await res.blob());
  try {
    const img = await loadImageEl(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return { dataUrl: canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY), width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Maior retângulo com a proporção da imagem que cabe em maxW × maxH. */
export function fitImage(width, height, maxW, maxH) {
  const scale = Math.min(maxW / width, maxH / height);
  return { w: width * scale, h: height * scale };
}

class EvidencePdf {
  constructor(doc, logoImg) {
    this.doc = doc;
    this.logoImg = logoImg;
    this.page = 0;
    this.y = 0;
  }

  newPage() {
    if (this.page > 0) this.doc.addPage();
    this.page += 1;
    const { doc, logoImg } = this;
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, PAGE_W, HEADER_H, "F");
    if (logoImg) doc.addImage(logoImg, "PNG", MARGIN, 3, 16, 16);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, "bold");
    doc.setFontSize(13);
    doc.text("Evidência de Correção de Não Conformidade", MARGIN + 20, 10);
    doc.setFont(undefined, "normal");
    doc.setFontSize(8.5);
    doc.text("Gestão de Quadros Elétricos · Serv. Operacionais · São Luís EFC", MARGIN + 20, 16);
    doc.setTextColor(0, 0, 0);
    this.y = HEADER_H + 9;
  }

  ensureSpace(h) {
    if (this.y + h > PAGE_H - MARGIN - FOOTER_SPACE) this.newPage();
  }

  sectionTitle(text) {
    this.ensureSpace(14);
    const { doc } = this;
    doc.setFillColor(...PRIMARY_TINT);
    doc.rect(MARGIN, this.y - 5, CONTENT_W, 8, "F");
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.setTextColor(...PRIMARY);
    doc.text(text, MARGIN + 2, this.y);
    doc.setTextColor(0);
    doc.setFont(undefined, "normal");
    this.y += 8;
  }

  /** Linha "Rótulo: valor" com o valor quebrado em várias linhas se preciso. */
  field(label, value) {
    const { doc } = this;
    const text = value == null || String(value).trim() === "" ? "—" : String(value);
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(text, CONTENT_W - LABEL_W);
    const h = Math.max(1, lines.length) * 4.8 + 1.5;
    this.ensureSpace(h);
    doc.setFont(undefined, "bold");
    doc.setTextColor(90);
    doc.text(label, MARGIN, this.y);
    doc.setFont(undefined, "normal");
    doc.setTextColor(0);
    doc.text(lines, MARGIN + LABEL_W, this.y);
    this.y += h;
  }

  photo({ dataUrl, width, height }, caption) {
    const { doc } = this;
    const { w, h } = fitImage(width, height, CONTENT_W, PHOTO_MAX_H);
    this.ensureSpace(h + 9);
    const x = MARGIN + (CONTENT_W - w) / 2;
    doc.addImage(dataUrl, "JPEG", x, this.y, w, h);
    doc.setDrawColor(210);
    doc.rect(x, this.y, w, h, "S");
    this.y += h + 4;
    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text(caption, PAGE_W / 2, this.y, { align: "center" });
    doc.setTextColor(0);
    this.y += 7;
  }

  footers(geradoEm) {
    const { doc } = this;
    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Página ${p} de ${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
      doc.text(`Documento gerado automaticamente na conclusão da ação · ${geradoEm}`, MARGIN, PAGE_H - 8);
      doc.setTextColor(0);
    }
  }
}

/**
 * Monta o PDF de evidência e devolve um Blob (application/pdf).
 *
 * data: {
 *   nc: { id, descricao, severidade, categoria, created_at, origem },
 *   action: { id, descricao, responsavel, prazo, created_at },
 *   quadro, localidade,                    // texto já resolvido, opcionais
 *   numeroNota, om, concluidaEm, concluidaPor,
 *   fotos: [url, ...]
 * }
 * deps (para teste fora do navegador): { loadPhoto, logo }
 */
export async function buildActionEvidencePdf(data, deps = {}) {
  const loadPhoto = deps.loadPhoto || loadPhotoForPdf;
  let logoImg = deps.logo;
  if (logoImg === undefined) {
    try { logoImg = await loadImageEl(logoSistema); } catch { logoImg = null; }
  }

  // Carrega todas as fotos antes de desenhar: se alguma falhar, a conclusão
  // é interrompida (o PDF não pode sair sem a evidência anexada).
  const fotos = await Promise.all((data.fotos || []).map((url) => loadPhoto(url)));

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pdf = new EvidencePdf(doc, logoImg);
  const { nc = {}, action = {} } = data;
  pdf.newPage();

  pdf.sectionTitle("Identificação");
  pdf.field("Não Conformidade", nc.descricao);
  pdf.field("ID da NC", nc.id);
  pdf.field("Severidade", SEV_LABEL[nc.severidade] || nc.severidade);
  if (nc.categoria) pdf.field("Categoria", nc.categoria);
  pdf.field("NC aberta em", fmtDate(nc.created_at));
  pdf.field("Ação", action.descricao);
  pdf.field("ID da Ação", action.id);
  pdf.field("Quadro / equipamento", data.quadro);
  pdf.field("Localidade", data.localidade);
  pdf.field("Responsável pela ação", action.responsavel);
  if (action.prazo) pdf.field("Prazo da ação", fmtDate(action.prazo));
  pdf.y += 3;

  pdf.sectionTitle("Dados da correção");
  pdf.field("Número da Nota", data.numeroNota);
  pdf.field("OM", data.om);
  pdf.field("Descrição da correção", action.descricao);
  pdf.field("Data da conclusão", fmtDate(data.concluidaEm));
  pdf.field("Concluída por", data.concluidaPor);
  pdf.y += 3;

  pdf.sectionTitle(`Evidências fotográficas (${fotos.length})`);
  fotos.forEach((f, i) => pdf.photo(f, `Foto ${i + 1} de ${fotos.length} — corretiva`));

  pdf.footers(new Date().toLocaleString("pt-BR"));
  return doc.output("blob");
}
