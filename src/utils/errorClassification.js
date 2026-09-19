// Classificação de erros capturados pelo ErrorBoundary (ver
// src/components/ErrorBoundary.jsx). Função pura e isolada para poder ser
// testada/lida independente da classe do Error Boundary.
//
// Este projeto usa Vite/Rollup + import() dinâmico nativo do ESM — não
// Webpack. Não existe aqui um `error.name === "ChunkLoadError"` (isso é
// uma convenção específica do Webpack). Quando um `import()` dinâmico
// falha (ex.: rede instável, chunk removido de um deploy anterior), o
// próprio motor do navegador lança um `TypeError` nativo. Confirmado
// reproduzindo o cenário contra o build de produção real deste projeto:
//
//   TypeError: Failed to fetch dynamically imported module: <url>.js
//
// Firefox e Safari usam mensagens equivalentes, mas com texto diferente
// ("error loading dynamically imported module", "Importing a module
// script failed") — por isso o padrão abaixo cobre as variações
// conhecidas em vez de comparar a mensagem inteira.
const DYNAMIC_IMPORT_ERROR_PATTERN =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

/**
 * true se `error` for uma falha de carregamento de um chunk lazy
 * (React.lazy/import() dinâmico) — não classifica outros `TypeError`
 * (ex.: "Cannot read properties of undefined") como erro de chunk.
 */
export function isDynamicImportError(error) {
  if (!(error instanceof TypeError)) return false;
  return DYNAMIC_IMPORT_ERROR_PATTERN.test(error.message || "");
}

/** Extrai a URL do chunk da mensagem de erro, se presente (só para diagnóstico/log). */
export function extractChunkUrl(message) {
  const match = /:\s*(https?:\/\/\S+\.js)\s*$/i.exec(message || "");
  return match ? match[1] : null;
}
