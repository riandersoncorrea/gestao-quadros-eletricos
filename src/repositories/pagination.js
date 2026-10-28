// O PostgREST do Supabase devolve no máximo 1000 linhas por requisição
// (max_rows do projeto) e corta o excedente SEM erro — por isso consultas
// que podem passar disso precisam paginar com .range().
export const SUPABASE_MAX_ROWS = 1000;

/**
 * Lê TODAS as linhas de uma consulta, página a página (SUPABASE_MAX_ROWS
 * por vez). `buildQuery` devolve a consulta já filtrada e com ordenação
 * estável (necessária para as páginas não se sobreporem nem pularem
 * linhas).
 */
export async function fetchAllPages(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += SUPABASE_MAX_ROWS) {
    const { data, error } = await buildQuery().range(from, from + SUPABASE_MAX_ROWS - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < SUPABASE_MAX_ROWS) return rows;
  }
}

/**
 * Lê as linhas de uma consulta filtrada por uma lista de ids (`.in(...)`),
 * em lotes de `chunkSize` ids — mantém a URL da requisição (GET com todos
 * os ids) num tamanho seguro — e cada lote paginado (fetchAllPages).
 * `buildQuery(ids)` recebe os ids do lote e devolve a consulta já filtrada
 * e com ordenação estável.
 */
export async function fetchAllPagesByIds(ids, buildQuery, chunkSize = 100) {
  const unique = [...new Set(ids.filter(Boolean))];
  const lotes = [];
  for (let i = 0; i < unique.length; i += chunkSize) lotes.push(unique.slice(i, i + chunkSize));
  const results = await Promise.all(lotes.map((lote) => fetchAllPages(() => buildQuery(lote))));
  return results.flat();
}
