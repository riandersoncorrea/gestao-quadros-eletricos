# EFC em operação — levantamento (Fase 1, 2026-11-09)

Situação de partida: EFC em produção com 202 quadros / 9 cidades, **somente leitura**
(`unidades_operacionais.permite_escrita = false`), segurança por unidade (0029/0030) ativa, nenhum usuário com a
EFC atribuída além dos 5 administradores gerais.

Liberar a escrita é um comando (`update public.unidades_operacionais set permite_escrita = true where codigo = 'EFC'`),
mas **libera tudo de uma vez**: no frontend, `canWrite` / `isWritableUnit` é por unidade, então inspeção, NC, ação
**e** cadastro/edição de quadros passam a valer juntos. Os itens abaixo precisam estar resolvidos (ou bloqueados
individualmente) antes disso.

## Bloqueadores

| # | Fluxo | Situação hoje | Onde |
|---|---|---|---|
| B1 | **Cadastro de quadro** | O banco gera a TAG só por site (`next_panel_tag` → PRT/OFC/PEL). Quadro da EFC (sem site) cai em `Site desconhecido`. O formulário é o de São Luís: Site obrigatório (Porto/Oficina/Pelotização), prévia `PRT_QD_XXXX`. | `supabase/schema.sql` (`set_panel_tag`), `0002` (`next_panel_tag`), `src/pages/InventoryForm.jsx` |
| B2 | **Edição de quadro** | Mesmo formulário: mostra o seletor de Site; escolher um site num quadro da EFC é recusado pelo trigger da 0028 (erro, sem dano). Não há campo "Cidade". | `src/pages/InventoryForm.jsx` |
| B3 | **Responsável das ações automáticas** | Mapeado por site (Oficina: Raphael Luz, Kaio; Porto: Alessandro). Quadro da EFC não tem site → toda ação automática nasce "pendente de atribuição". | `src/domain/siteResponsibles.js`, `src/services/inspectionService.js#createAutoActions` |
| B4 | **Usuários** | Ninguém de campo tem a EFC. Atribuição pela tela Usuários → "Unidades…" (só administrador geral). Usuário só da EFC já abre direto na EFC; com as duas unidades, ganha o seletor. | `src/domain/unitScope.js#getAllowedUnits` |
| B5 | **Storage** | INSERT no bucket `uploads` aceito para qualquer conta autenticada, inclusive pendente ou sem unidade (UPDATE/DELETE limitados aos próprios arquivos pela 0018). Bucket público por URL. | `supabase/schema.sql`, `0018` |

## Ajustes de conteúdo (não bloqueiam; confundem o usuário da EFC)

| # | Tela | Situação | Onde |
|---|---|---|---|
| C1 | Análise Inteligente (tela e PDF) | KPIs fixos "Inspeções no Porto" / "Inspeções na Oficina" — na EFC aparecem zerados e com rótulo errado. | `src/pages/IntelligentAnalysis.jsx`, `src/services/intelligentAnalysisPdfService.js`, `src/domain/intelligentAnalysis.js` |
| C2 | Rótulos "Site" | "Site (Localidade)" no checklist; "Site" na localização do quadro, detalhe, QR público e Excel. Na EFC o nível é a **cidade**. | `InspectionForm.jsx`, `PanelLocation.jsx`, `PanelDetail.jsx`, `PublicPanelDetail.jsx`, `InventoryList.jsx` |
| C3 | Mapa e rota | Os 202 quadros da EFC foram importados **sem coordenadas** → não aparecem no mapa nem na rota. A rota é em linha reta (MVP), adequada dentro de uma cidade, não entre cidades. | `MapPage.jsx`, `src/domain/inspectionRoute.js` |
| C4 | Checklist | Existe um único modelo ativo ("Checklist Padrão BT"), usado por todas as unidades. | `src/repositories/inspectionRepository.js#getActiveTemplateRow` |

## Já funciona para a EFC (sem mudança)

- Isolamento de leitura por unidade no banco (0029) e no app; QR público por consulta individual com a unidade (0030).
- Guardas de escrita por unidade em inspeção, NC, ação e anexos (serviços + RLS restritiva).
- NC segue as ações (0027): regra independente de unidade; trigger validado com RLS restritiva.
- Cabeçalhos e nomes de arquivo de relatórios/PDF/Excel com a unidade (`unitReportLabel` / `unitFileName`).
- Nome do quadro da EFC já começa pela TAG (`ACD_QD_0001 / …`), como em São Luís (rótulos de ação/PDF corretos).

## Decisões necessárias (Fase 2)

1. **Escopo da 1ª liberação:** só inspeção + tratamento de NCs/ações (cadastro de quadros segue por planilha), ou já
   com cadastro/edição na tela? Na primeira opção, o cadastro/edição da EFC precisa ficar bloqueado à parte
   (hoje o bloqueio é da unidade inteira).
2. **Checklist:** a EFC usa o mesmo "Checklist Padrão BT"?
3. **Responsáveis das ações automáticas:** por cidade, uma pessoa/equipe para a unidade toda, ou sem responsável
   automático (atribuição manual)?
4. **Usuários e piloto:** quem usa a EFC, se haverá administrador local da EFC, e se começa por uma cidade piloto.
5. **Coordenadas:** coletar em campo (edição do quadro / "usar minha localização") ou importar de uma base existente?

## Esboço da Fase 3 (depende das decisões)

1. Storage: INSERT só para usuário aprovado (migration pequena, testada no banco local).
2. Responsáveis por unidade/cidade (substitui o mapeamento só por site, mantendo o de São Luís idêntico).
3. Rótulos e KPIs por unidade (C1, C2).
4. Conforme o escopo: bloqueio de cadastro/edição só para a EFC **ou** TAG por sigla da cidade
   (`next_panel_tag` por sigla, sem alterar a regra PRT/OFC/PEL) + formulário com "Cidade".
5. Ensaio completo no banco local → liberar `permite_escrita` → atribuir usuários → piloto acompanhado.

## Decisões (2026-11-09) e implementação (branch `feature/efc-operacao-levantamento`)

| Decisão | Implementação |
|---|---|
| 1ª liberação = inspeção + NCs/ações; quadros novos por planilha | `canCreatePanelsInUnit` (unidade com site): botões "Cadastrar/Novo Quadro" desabilitados na EFC com o motivo; `/inventario/novo` mostra aviso; `ElectricalPanel.create` recusa (`PanelCreationUnavailableError`). **Edição** liberada (necessária para coordenadas): sem o campo Site, com a Cidade do prédio; prédio só trocável dentro da mesma cidade (a TAG leva a sigla). Coordenadas também pelo Mapa. |
| Mesmo checklist | Nada a mudar. Histórico de checklists da EFC (com links de fotos) = importação à parte (aguarda o arquivo). |
| Responsável manual | Ação automática já nasce "pendente de atribuição". **0033** + `listAssignableUsers(unidade ativa)`: a lista de responsáveis só traz admin/inspetor com acesso à unidade (antes trazia todas as unidades — uma ação da EFC podia ir para quem não a enxerga). Fallback para a consulta antiga sem a 0033. |
| Administradores locais da EFC | Perfil admin + EFC em `profile_unidades` (só o admin geral atribui). Ver ponto aberto abaixo. |
| Coordenadas depois, pela edição | Coberto pela edição liberada e pelo Mapa. |
| — (B5) | **0032**: Storage só para aprovados. |
| — (C1/C2) | KPIs da Análise Inteligente por unidade (`localidadesEmDestaque`; São Luís idêntico); rótulo "Cidade" no checklist e na localização do quadro. |

**Administrador local x contas de outras unidades — resolvido pela 0034** (decisão de 09/11/2026): o administrador
local só altera (aprova, reprova, troca o perfil) contas **novas** (ainda sem unidade) ou que tenham ao menos uma
unidade a que ele também tem acesso. Atribuir unidades, conceder acesso global e promover a administrador continuam
exclusivos do administrador geral. A tela Usuários mostra o motivo quando o banco recusa.

**Sequência de produção (com aprovação):** 0032 → teste → 0033 → teste → 0034 → teste → deploy do frontend (funciona antes e depois
da 0033) → `update public.unidades_operacionais set permite_escrita = true where codigo = 'EFC';` → contas da EFC
criadas pelos próprios usuários → admin geral aprova e atribui a EFC (tela Usuários → "Unidades…").

