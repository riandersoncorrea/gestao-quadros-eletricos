-- ============================================================================
-- 0030 — QR Code público: consulta individual no lugar da view enumerável
-- ============================================================================
-- Ordem: 0028 -> 0029 -> 0030 -> deploy do frontend -> validação -> 0031.
-- ATENÇÃO À ORDEM: o frontend que chama get_public_panel deve estar no ar
-- ANTES (ou junto) desta migration — o frontend novo tenta a função e, se
-- ela ainda não existir, usa a view; o frontend antigo só conhece a view,
-- que esta migration fecha para anon/authenticated.
--
-- PROBLEMA: public.panel_public_info (0010/0011) é security_invoker = false
-- (ignora a RLS), não tem WHERE e tem grant select para anon: qualquer
-- pessoa com a chave anon (pública, no bundle do site) lista TODOS os
-- quadros de todas as unidades sem login (GET /rest/v1/panel_public_info).
--
-- SOLUÇÃO:
--   1. public.get_public_panel(p_id uuid) -> jsonb: SECURITY DEFINER,
--      search_path = '', devolve UM quadro (ou null) pelo id do QR. Não há
--      como listar: sem id, nada; o id é um uuid aleatório.
--      Campos: exatamente os que a página pública (PublicPanelDetail.jsx)
--      exibe hoje + unidade_nome (para quem escaneia saber a unidade).
--      Campos sensíveis mantidos por compatibilidade, para decisão do
--      negócio: responsible_engineer, latitude/longitude/coordinate,
--      sap_functional_location, sap_equipment_number — remover aqui (e na
--      página) se não deverem ser públicos.
--   2. revoke select na view para anon e authenticated (a view fica, sem
--      acesso pela API, para rollback; pode ser removida numa etapa futura).
--   3. anon perde os privilégios de tabela no schema public (defesa em
--      profundidade: a página pública não lê tabelas). Os privilégios
--      padrão de tabelas novas também deixam de incluir anon.
--
-- Testes: supabase/tests/0030_qr_publico.test.sql
-- ROLLBACK: supabase/rollback/0030_qr_publico.rollback.sql
-- ============================================================================

begin;

create or replace function public.get_public_panel(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'tag', p.tag,
    'name', p.name,
    'nomenclatura_oficial', p.nomenclatura_oficial,
    'panel_type', p.panel_type,
    'panel_type_custom', p.panel_type_custom,
    'site', p.site,
    'status', p.status,
    'criticality', p.criticality,
    'phases', p.phases,
    'voltage_nominal', p.voltage_nominal,
    'current_nominal', p.current_nominal,
    'frequency_hz', p.frequency_hz,
    'power_supply', p.power_supply,
    'circuit_count', p.circuit_count,
    'main_breaker_type', p.main_breaker_type,
    'main_breaker_capacity', p.main_breaker_capacity,
    'main_breaker_brand', p.main_breaker_brand,
    'has_dr', p.has_dr,
    'has_dps', p.has_dps,
    'has_grounding', p.has_grounding,
    'manufacturer', p.manufacturer,
    'model', p.model,
    'serial_number', p.serial_number,
    'installation_location', p.installation_location,
    'location_floor', p.location_floor,
    'location_room', p.location_room,
    'coordinate', p.coordinate,
    'latitude', p.latitude,
    'longitude', p.longitude,
    'responsible_engineer', p.responsible_engineer,
    'diagram_url', p.diagram_url,
    'photo_url', p.photo_url,
    'localidade_nome', loc.nome,
    'local_nome', lo.nome,
    'sublocal_nome', sub.nome,
    'unidade_nome', u.nome,
    'sap_functional_location', p.sap_functional_location,
    'sap_equipment_number', p.sap_equipment_number,
    'inspection_frequency', p.inspection_frequency,
    'last_inspection_date', p.last_inspection_date,
    'next_inspection_date', p.next_inspection_date,
    'installation_date', p.installation_date
  )
  from public.electrical_panels p
  left join public.localidades loc on loc.id = p.localidade_id
  left join public.locais lo on lo.id = p.local_id
  left join public.sublocais sub on sub.id = p.sublocal_id
  left join public.unidades_operacionais u on u.id = p.unidade_operacional_id
  where p.id = p_id
$$;

comment on function public.get_public_panel(uuid) is
  'QR Code público: dados de UM quadro pelo id (uuid do QR). Substitui a view panel_public_info (enumerável). Não há listagem.';

revoke all on function public.get_public_panel(uuid) from public;
grant execute on function public.get_public_panel(uuid) to anon, authenticated, service_role;

-- A view deixa de ser acessível pela API.
revoke all on public.panel_public_info from anon, authenticated;

-- anon sem privilégios de tabela/sequência no schema public.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

commit;
