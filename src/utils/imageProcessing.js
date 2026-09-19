// Redimensionamento client-side de fotos antes do upload (hoje usado pela
// Termografia e pela Evidência de checklist em InspectionForm.jsx, via
// uploadEvidence — mesmo fluxo de upload para os dois, ver
// storage/storageService.js#uploadFile). Fotos de câmera de celular
// (Android em particular) costumam vir em resoluções muito altas
// (8-12+ MP, vários MB), aumentando tempo de upload, uso de rede e
// consumo de memória — especialmente sensível em dispositivos Android
// sob pressão de memória.
//
// Só redimensiona quando a imagem excede MAX_DIMENSION no maior lado —
// nunca aumenta uma imagem que já esteja dentro do limite, nunca corta
// nem estica (sempre preserva a proporção original), e nunca mexe no
// `File` de entrada (um novo File é criado; o original não é mutado).

// Maior lado, em px. Calibrado para preservar detalhe suficiente para
// leitura de pontos quentes de termografia e de defeitos em fotos de
// evidência (equivalente a ~Full HD/2K) — bem acima do que uma tela de
// celular exibe, mas uma fração do tamanho de uma foto de câmera não
// comprimida (tipicamente 3000-4000px+ no lado maior).
const MAX_DIMENSION = 1920;

// Qualidade JPEG (0-1). Mais alta que a usada para capturas de gráficos
// de PDF (0.82 em intelligentAnalysisPdfService.js) — aqui a imagem é uma
// fotografia real (não uma UI sintética), e a nitidez de detalhes finos
// (bordas de corrosão, texto em etiquetas, gradientes de calor) importa
// mais para a inspeção.
const JPEG_QUALITY = 0.85;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function withExtension(name, ext) {
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return `${base}.${ext}`;
}

/**
 * Redimensiona `file` se ela exceder `maxDimension` no maior lado,
 * preservando a proporção original. Devolve o próprio `file`, sem
 * nenhuma alteração, se: não for uma imagem, já estiver dentro do
 * limite, ou se qualquer etapa do processamento falhar (formato não
 * suportado pelo navegador, canvas indisponível etc.) — a otimização
 * nunca impede o upload de acontecer com o arquivo original.
 *
 * PNG de origem continua PNG (preserva transparência/losslessness, útil
 * para capturas de tela com sobreposições/texto); qualquer outro formato
 * (o caso comum: JPEG de câmera) vira JPEG na qualidade definida.
 */
export async function resizeImageIfNeeded(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  if (!file?.type?.startsWith("image/")) return file;

  let objectUrl;
  try {
    objectUrl = URL.createObjectURL(file);
    const img = await loadImage(objectUrl);
    const { naturalWidth: width, naturalHeight: height } = img;

    if (!width || !height || Math.max(width, height) <= maxDimension) {
      return file;
    }

    const scale = maxDimension / Math.max(width, height);
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem redimensionada"))),
        outputType,
        quality
      );
    });

    const resized = new File(
      [blob],
      withExtension(file.name, outputType === "image/png" ? "png" : "jpg"),
      { type: outputType }
    );

    console.info(
      `[imageProcessing] ${file.name}: ${width}x${height} (${(file.size / 1024).toFixed(0)}KB) -> ` +
      `${targetWidth}x${targetHeight} (${(resized.size / 1024).toFixed(0)}KB)`
    );

    // Em imagens já bem comprimidas, reprocessar às vezes não reduz o
    // tamanho — nesse caso o original permanece a melhor opção.
    return resized.size < file.size ? resized : file;
  } catch (error) {
    console.error("[imageProcessing] Falha ao redimensionar imagem, enviando arquivo original:", error);
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
