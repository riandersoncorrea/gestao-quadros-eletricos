-- ============================================================================
-- Remover PRO-08 do conjunto ativo do checklist
-- ============================================================================
-- Mesmo padrão de 0004_checklist_adjustments.sql: desativa (ativo = false),
-- não apaga. getTemplateItems() (repositories/inspectionRepository.js) já
-- filtra por ativo = true, então PRO-08 some do formulário de novas
-- inspeções e da contagem "itens" sem nenhuma mudança de código — mas as
-- respostas já salvas em inspection_responses (que guardam titulo/modulo
-- copiados no momento da criação, não uma referência viva ao catálogo)
-- continuam intactas, e getInspectionAggregate() não filtra por ativo, então
-- inspeções antigas com resposta de PRO-08 continuam exibindo-a normalmente.
-- ============================================================================

update public.inspection_template_items
set ativo = false
where codigo = 'PRO-08'
  and template_id in (select id from public.inspection_templates where nome = 'Checklist Padrão BT' and versao = 1);
