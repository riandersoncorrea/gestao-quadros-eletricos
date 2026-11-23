// Nome descritivo do quadro (electrical_panels.name).
//
// Regra do cadastro (São Luís e EFC): `TAG / Prédio_Sublocal`. Quadros
// importados podem ter nomes que não seguem a regra à risca (grafias da base
// oficial — espaço antes do "_", "TAG/" sem espaço, prédio com outra grafia
// etc.). Esses nomes são preservados: na EDIÇÃO, o nome só é recalculado
// quando o prédio ou o sublocal do quadro mudam.

const idOrNull = (v) => (v === undefined || v === null || v === "" ? null : String(v));

/** `TAG / Prédio_Sublocal`; só com o prédio, `TAG / Prédio`; sem prédio, null. */
export function composePanelName(tag, localName, sublocalName) {
  if (!tag || !localName) return null;
  return sublocalName ? `${tag} / ${localName}_${sublocalName}` : `${tag} / ${localName}`;
}

/** Prédio ou sublocal diferentes ("" e null contam como vazio). */
export function panelLocationChanged(original, next) {
  return idOrNull(original?.local_id) !== idOrNull(next?.local_id)
    || idOrNull(original?.sublocal_id) !== idOrNull(next?.sublocal_id);
}

/**
 * Nome a gravar na edição de um quadro.
 * Retorna `undefined` quando o nome NÃO deve ser enviado — o atual fica
 * exatamente como está: localização igual, ou localização apagada (sem prédio
 * não há como compor). Com prédio/sublocal novos, compõe pela regra.
 */
export function panelNameForEdit({ original, next, localName, sublocalName }) {
  if (!panelLocationChanged(original, next)) return undefined;
  return composePanelName(original?.tag, localName, sublocalName) ?? undefined;
}

/** Prévia exibida no formulário de edição (mesma regra do que será gravado). */
export function panelNameEditPreview({ original, next, localName, sublocalName }) {
  const name = panelNameForEdit({ original, next, localName, sublocalName });
  return name === undefined ? (original?.name || original?.tag || "—") : name;
}
