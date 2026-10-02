// Responsáveis pelas ações automáticas, por site do quadro
// (electrical_panels.site) — ponto ÚNICO de configuração. Vincula pelo id
// do perfil (profiles.id, perfil "inspetor"); o nome é o texto gravado em
// actions.responsavel (exibido nas telas e no PDF de evidência).
//
// Site sem responsável mapeado (ou lista vazia): a ação é criada sem
// responsável, como "pendente de atribuição" — nunca gera erro.
// Funções puras — sem acesso a rede.

export const SITE_RESPONSIBLES = {
  oficina: [
    { id: "61037014-8c9d-4e51-9509-1a5e0a1b6ca1", nome: "Raphael Luz" },
    { id: "0ddd5189-7e76-4bac-be5d-4bd4177f7843", nome: "Kaio" },
  ],
  porto: [
    { id: "fece2220-94c6-4f4e-a857-a58a55d37e5c", nome: "Alessandro Gomes Martins" },
  ],
};

/** Candidatos a responsável para o site (lista vazia se não mapeado). */
export function responsiblesForSite(site) {
  return SITE_RESPONSIBLES[String(site || "").trim().toLowerCase()] || [];
}

/**
 * Escolhe o responsável de uma ação entre os candidatos do site:
 *  - nenhum candidato → null (pendente de atribuição);
 *  - um candidato → ele;
 *  - vários → quem tiver menos ações em aberto (`openCounts`: id → nº);
 *    em empate, quem recebeu ação automática há mais tempo (`lastAssignedAt`:
 *    id → timestamp ISO; quem nunca recebeu vem primeiro), alternando entre
 *    eles; persistindo o empate, a ordem da configuração.
 * Quem chama deve atualizar `openCounts`/`lastAssignedAt` a cada atribuição
 * (ver assignResponsibles) para equilibrar várias ações da mesma inspeção.
 */
export function pickResponsible(candidates, openCounts = {}, lastAssignedAt = {}) {
  if (!candidates.length) return null;
  return candidates.reduce((best, c) => {
    const diff = (openCounts[c.id] || 0) - (openCounts[best.id] || 0);
    if (diff !== 0) return diff < 0 ? c : best;
    const lc = lastAssignedAt[c.id] || "";
    const lb = lastAssignedAt[best.id] || "";
    return lc < lb ? c : best;
  });
}

/**
 * Atribui um responsável a cada uma de `count` ações do mesmo site,
 * equilibrando entre os candidatos. Retorna uma lista de candidatos (ou
 * null) na ordem das ações. Não altera os objetos recebidos.
 */
export function assignResponsibles(site, count, openCounts = {}, lastAssignedAt = {}) {
  const candidates = responsiblesForSite(site);
  const counts = { ...openCounts };
  const last = { ...lastAssignedAt };
  const result = [];
  for (let i = 0; i < count; i++) {
    const r = pickResponsible(candidates, counts, last);
    if (r) {
      counts[r.id] = (counts[r.id] || 0) + 1;
      // Marca como o mais recente: "~" ordena depois de qualquer timestamp
      // ISO do banco, e o sufixo cresce a cada ação desta inspeção.
      last[r.id] = `~${String(i).padStart(6, "0")}`;
    }
    result.push(r);
  }
  return result;
}
