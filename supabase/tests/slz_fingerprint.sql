-- ============================================================================
-- "Impressão digital" dos dados de São Luís — evidência de que 0028–0031 não
-- alteram nada existente
-- ============================================================================
-- Só leitura. Rodar IMEDIATAMENTE ANTES da 0028 e IMEDIATAMENTE DEPOIS da
-- 0031 e comparar: os resultados devem ser idênticos. (NCs, ações e inspeções
-- mudam se alguém usar o sistema no intervalo — rodar em sequência.)
--
-- Ignora de propósito só as colunas NOVAS: localidades (unidade_operacional_id,
-- sigla — 0028) e unidade_operacional_id nos registros filhos (0029). Todo o
-- resto da linha (inclusive updated_at) entra na comparação.
-- ============================================================================

with slz as (select id from public.unidades_operacionais where codigo = 'SLZ'),
     slz_loc as (select l.id, l.nome, l.created_at from public.localidades l
                  where l.nome in ('Porto', 'Oficina', 'Pelotização')),
     slz_locais as (select lc.* from public.locais lc join slz_loc l on l.id = lc.localidade_id),
     slz_sub as (select s.* from public.sublocais s join slz_locais lc on lc.id = s.local_id),
     slz_panels as (select p.* from public.electrical_panels p where p.unidade_operacional_id = (select id from slz)),
     slz_panel_ids as (select id from slz_panels)
select json_build_object(
  'quadros_slz',      (select count(*) from slz_panels),
  'quadros_slz_md5',  (select md5(string_agg(p::text, '|' order by p.id)) from slz_panels p),
  'localidades_slz',  (select count(*) from slz_loc),
  'localidades_md5',  (select md5(string_agg(l::text, '|' order by l.id)) from slz_loc l),
  'locais_md5',       (select md5(string_agg(lc::text, '|' order by lc.id)) from slz_locais lc),
  'sublocais_md5',    (select md5(string_agg(s::text, '|' order by s.id)) from slz_sub s),
  'inspecoes',        (select count(*) from public.inspections),
  'inspecoes_md5',    (select md5(string_agg((to_jsonb(i) - 'unidade_operacional_id')::text, '|' order by i.id)) from public.inspections i),
  'respostas_md5',    (select md5(string_agg((to_jsonb(r) - 'unidade_operacional_id')::text, '|' order by r.id)) from public.inspection_responses r),
  'ncs',              (select count(*) from public.nonconformities),
  'ncs_md5',          (select md5(string_agg((to_jsonb(n) - 'unidade_operacional_id')::text, '|' order by n.id)) from public.nonconformities n),
  'acoes',            (select count(*) from public.actions),
  'acoes_md5',        (select md5(string_agg((to_jsonb(a) - 'unidade_operacional_id')::text, '|' order by a.id)) from public.actions a),
  'sap_orders_md5',   (select md5(string_agg((to_jsonb(o) - 'unidade_operacional_id')::text, '|' order by o.id)) from public.sap_orders o),
  'flags_md5',        (select md5(string_agg((to_jsonb(f) - 'unidade_operacional_id')::text, '|' order by f.id)) from public.analysis_flags f),
  'hist_cond_md5',    (select md5(string_agg((to_jsonb(h) - 'unidade_operacional_id')::text, '|' order by h.id)) from public.panel_condition_history h),
  'hist_loc_md5',     (select md5(string_agg((to_jsonb(h) - 'unidade_operacional_id')::text, '|' order by h.id)) from public.panel_location_history h)
) as slz_fingerprint;
