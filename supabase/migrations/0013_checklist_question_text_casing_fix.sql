-- ============================================================================
-- Ajuste de caixa dos textos de ATR-01 e PRO-03 (migração 0012)
-- ============================================================================
-- 0012_checklist_question_text_updates.sql gravou os textos em caixa alta.
-- Este ajuste só corrige a capitalização, para o mesmo padrão das demais
-- perguntas do catálogo (frase normal, com siglas em maiúsculas) — sem
-- mudar o conteúdo/sentido do texto, código, módulo, ordem ou
-- obrigatoriedade.
-- ============================================================================

update public.inspection_template_items
set titulo = 'Condutor de proteção(PE) presente, conectado e funcional'
where codigo = 'ATR-01'
  and template_id in (select id from public.inspection_templates where nome = 'Checklist Padrão BT' and versao = 1);

update public.inspection_template_items
set titulo = 'Disjuntor geral termomagnético/caixa moldada, compatível com a instalação'
where codigo = 'PRO-03'
  and template_id in (select id from public.inspection_templates where nome = 'Checklist Padrão BT' and versao = 1);
