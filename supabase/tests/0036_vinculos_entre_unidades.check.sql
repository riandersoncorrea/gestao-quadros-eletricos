-- ============================================================================
-- Conferência SÓ LEITURA — registros filhos com unidade diferente da do seu
-- vínculo (quadro / inspeção / NC). Rodar no SQL Editor ANTES da 0036.
-- ============================================================================
-- Resultado esperado: todas as linhas com divergentes = 0. Qualquer valor > 0
-- indica registro criado com unidade forjada (falha corrigida pela 0036) ou
-- dado legado a classificar; a própria 0036 aborta nesse caso.
-- Não altera nada. Só contagens (sem dados pessoais).
-- ============================================================================

select x.tabela, x.vinculo, x.divergentes
  from (
    select 'inspections' tabela, 'panel_id' vinculo, count(*) divergentes
      from public.inspections c join public.electrical_panels p on p.id = c.panel_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'inspections', 'panel_ref_id', count(*)
      from public.inspections c join public.electrical_panels p on p.id = c.panel_ref_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'inspection_responses', 'inspection_id', count(*)
      from public.inspection_responses c join public.inspections p on p.id = c.inspection_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'measurements', 'panel_id', count(*)
      from public.measurements c join public.electrical_panels p on p.id = c.panel_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'measurements', 'inspection_id', count(*)
      from public.measurements c join public.inspections p on p.id = c.inspection_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'thermography_points', 'panel_id', count(*)
      from public.thermography_points c join public.electrical_panels p on p.id = c.panel_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'thermography_points', 'inspection_id', count(*)
      from public.thermography_points c join public.inspections p on p.id = c.inspection_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'analysis_flags', 'panel_id', count(*)
      from public.analysis_flags c join public.electrical_panels p on p.id = c.panel_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'analysis_flags', 'inspection_id', count(*)
      from public.analysis_flags c join public.inspections p on p.id = c.inspection_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'nonconformities', 'panel_id', count(*)
      from public.nonconformities c join public.electrical_panels p on p.id = c.panel_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'nonconformities', 'inspection_id', count(*)
      from public.nonconformities c join public.inspections p on p.id = c.inspection_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'actions', 'panel_id', count(*)
      from public.actions c join public.electrical_panels p on p.id = c.panel_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'actions', 'nonconformity_id', count(*)
      from public.actions c join public.nonconformities p on p.id = c.nonconformity_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'panel_condition_history', 'panel_id', count(*)
      from public.panel_condition_history c join public.electrical_panels p on p.id = c.panel_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'panel_location_history', 'panel_id', count(*)
      from public.panel_location_history c join public.electrical_panels p on p.id = c.panel_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'sap_orders', 'panel_id', count(*)
      from public.sap_orders c join public.electrical_panels p on p.id = c.panel_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'panel_attachments', 'panel_id', count(*)
      from public.panel_attachments c join public.electrical_panels p on p.id = c.panel_id
     where c.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    select 'electrical_panels', 'local_id (prédio de outra unidade)', count(*)
      from public.electrical_panels p join public.locais lc on lc.id = p.local_id
      join public.localidades l on l.id = lc.localidade_id
     where l.unidade_operacional_id is distinct from p.unidade_operacional_id
    union all
    -- Informativo (legado): a 0036 só valida a cadeia quando a localização muda.
    select 'electrical_panels', 'INFO prédio fora da cidade/localidade do quadro', count(*)
      from public.electrical_panels p join public.locais lc on lc.id = p.local_id
     where p.localidade_id is not null and lc.localidade_id is distinct from p.localidade_id
    union all
    select 'electrical_panels', 'INFO sublocal fora do prédio do quadro', count(*)
      from public.electrical_panels p join public.sublocais s on s.id = p.sublocal_id
     where p.local_id is not null and s.local_id is distinct from p.local_id
    union all
    -- A 0036 substitui audit_trigger só se ela for o texto da 0001 (senão aborta).
    select 'audit_trigger', 'INFO texto da 0001 (1) ou da 0036 (2)? 0 = conferir antes da 0036',
           max(case when md5(prosrc) = '0cfd82d7cbf45327bbd05fea9999185e' then 1
                    when prosrc like '%0036: a exclusão guarda o registro inteiro%' then 2 else 0 end)
      from pg_proc where proname = 'audit_trigger' and pronamespace = 'public'::regnamespace
    union all
    select 'herdar_unidade', 'SECURITY DEFINER? (antes da 0036 = 0; depois = 1)',
           count(*) filter (where prosecdef)
      from pg_proc where proname = 'herdar_unidade' and pronamespace = 'public'::regnamespace
  ) x
 order by x.divergentes desc, x.tabela;
