-- ============================================================================
-- Ajustes no catálogo de checklist "Checklist Padrão BT" v1
-- ============================================================================
-- Aditiva/reversível: não apaga linhas. Itens "removidos" são apenas
-- desativados (ativo = false) — a query de getActiveTemplate() já filtra
-- por ativo = true, e respostas já gravadas guardam titulo/modulo próprios
-- (denormalizados em inspection_responses), então inspeções antigas não
-- são afetadas.
-- ============================================================================

update public.inspection_template_items
set titulo = 'Disjuntor possibilita aplicação do dispositivo/travamento (LOTO)?'
where codigo = 'SEG-06'
  and template_id in (select id from public.inspection_templates where nome = 'Checklist Padrão BT' and versao = 1);

update public.inspection_template_items
set titulo = 'Terminais e conectores adequados à seção do condutor'
where codigo = 'BAR-06'
  and template_id in (select id from public.inspection_templates where nome = 'Checklist Padrão BT' and versao = 1);

update public.inspection_template_items
set obrigatorio = true
where codigo = 'CAB-08'
  and template_id in (select id from public.inspection_templates where nome = 'Checklist Padrão BT' and versao = 1);

update public.inspection_template_items
set ativo = false
where codigo in ('SEG-08', 'INT-09', 'PRO-07', 'PRO-09', 'CAB-04', 'CAB-05', 'ATR-04', 'DOC-02', 'DOC-03', 'DOC-04', 'DOC-05', 'DOC-06')
  and template_id in (select id from public.inspection_templates where nome = 'Checklist Padrão BT' and versao = 1);
