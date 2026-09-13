// Aderência ao plano de manutenção: ordens SAP planejadas x inspeções realizadas.
// Função pura.

const DAY = 86400000;

function daysBetween(a, b) {
  return Math.round((new Date(a) - new Date(b)) / DAY);
}

/**
 * orders: sap_orders do quadro (com data_planejada).
 * inspections: inspections do quadro (com inspection_date, status).
 * toleranceDays: janela ± em torno da data planejada (default 23 ≈ 25% de 13 semanas).
 *
 * Uma ordem vencida (data_planejada <= hoje) é "cumprida" se existe uma
 * inspeção não cancelada dentro da janela. Ordens futuras não entram no cálculo.
 *
 * Retorna { due, cumpridas, atrasadas, pendentes, percent, itens: [...] }.
 */
export function panelAdherence(orders = [], inspections = [], { toleranceDays = 23, today = new Date() } = {}) {
  const insp = inspections
    .filter((i) => i.inspection_date && i.status !== "cancelada")
    .map((i) => i.inspection_date)
    .sort();

  const todayStr = today.toISOString().slice(0, 10);
  const itens = [];
  let cumpridas = 0;
  let atrasadas = 0;

  for (const o of orders) {
    if (!o.data_planejada) continue;
    const vencida = o.data_planejada <= todayStr;
    if (!vencida) {
      itens.push({ ordem: o.ordem, data_planejada: o.data_planejada, situacao: "futura" });
      continue;
    }
    const match = insp.find((d) => Math.abs(daysBetween(d, o.data_planejada)) <= toleranceDays);
    if (match) {
      cumpridas += 1;
      itens.push({ ordem: o.ordem, data_planejada: o.data_planejada, situacao: "cumprida", inspecao: match });
    } else {
      atrasadas += 1;
      itens.push({ ordem: o.ordem, data_planejada: o.data_planejada, situacao: "atrasada" });
    }
  }

  const due = cumpridas + atrasadas;
  return {
    due,
    cumpridas,
    atrasadas,
    pendentes: atrasadas,
    percent: due ? Math.round((100 * cumpridas) / due) : null,
    itens,
  };
}

/** Agrega a aderência de vários quadros. panelsData: [{ orders, inspections }]. */
export function overallAdherence(panelsData, opts) {
  let cumpridas = 0;
  let due = 0;
  for (const p of panelsData) {
    const a = panelAdherence(p.orders, p.inspections, opts);
    cumpridas += a.cumpridas;
    due += a.due;
  }
  return { cumpridas, due, percent: due ? Math.round((100 * cumpridas) / due) : null };
}
