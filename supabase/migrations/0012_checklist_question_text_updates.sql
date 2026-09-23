-- ============================================================================
-- Atualização de texto de 2 perguntas do checklist (ATR-01, PRO-03)
-- ============================================================================
-- Aditiva/reversível, mesmo padrão de 0004_checklist_adjustments.sql: só
-- atualiza o `titulo` no catálogo (inspection_template_items) — não mexe em
-- `codigo`, `modulo`, `ordem`, `obrigatorio` nem em nenhuma outra pergunta.
--
-- Efeito em inspeções já existentes: NENHUM. `inspection_responses.titulo`
-- é uma cópia ("snapshot") do título feita no momento em que cada inspeção
-- foi salva (ver createInspection em src/services/inspectionService.js) —
-- essa cópia já persistida não é tocada por este update, então inspeções
-- antigas continuam mostrando o texto que valia quando foram registradas.
-- Só inspeções novas, criadas a partir de agora, usam os textos abaixo
-- (via getActiveTemplate(), que sempre lê o catálogo atual).
-- ============================================================================

update public.inspection_template_items
set titulo = 'CONDUTOR DE PROTEÇÃO(PE) PRESENTE, CONECTADO E FUNCIONAL'
where codigo = 'ATR-01'
  and template_id in (select id from public.inspection_templates where nome = 'Checklist Padrão BT' and versao = 1);

update public.inspection_template_items
set titulo = 'DISJUNTOR GERAL TERMOMAGNÉTICO/CAIXA MOLDADA, COMPATÍVEL COM A INSTALAÇÃO'
where codigo = 'PRO-03'
  and template_id in (select id from public.inspection_templates where nome = 'Checklist Padrão BT' and versao = 1);
