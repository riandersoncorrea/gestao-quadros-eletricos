-- ============================================================================
-- Página pública do quadro via QR Code — adicionar SAP / Plano de Manutenção
-- ============================================================================
-- Decisão explícita do usuário (revertendo a exclusão original de dados
-- operacionais feita em 0010_public_panel_view.sql): a seção "SAP / Plano de
-- Manutenção" exibida em PanelDetail.jsx (autenticado) passa a ser pública
-- também, com os mesmos 6 campos: identificação SAP (local de instalação,
-- nº do equipamento) e cronograma de inspeção (frequência, última, próxima,
-- data de instalação).
--
-- health_index, não-conformidades, histórico de localização/condição e
-- observações internas ("notes") continuam de fora — nunca adicionar essas
-- aqui sem uma decisão explícita equivalente a esta.
-- ============================================================================

create or replace view public.panel_public_info
  with (security_invoker = false)
as
select
  p.id,
  p.tag,
  p.name,
  p.nomenclatura_oficial,
  p.panel_type,
  p.panel_type_custom,
  p.site,
  p.status,
  p.criticality,
  p.phases,
  p.voltage_nominal,
  p.current_nominal,
  p.frequency_hz,
  p.power_supply,
  p.circuit_count,
  p.main_breaker_type,
  p.main_breaker_capacity,
  p.main_breaker_brand,
  p.has_dr,
  p.has_dps,
  p.has_grounding,
  p.manufacturer,
  p.model,
  p.serial_number,
  p.installation_location,
  p.location_floor,
  p.location_room,
  p.coordinate,
  p.latitude,
  p.longitude,
  p.responsible_engineer,
  p.diagram_url,
  p.photo_url,
  loc.nome as localidade_nome,
  lo.nome as local_nome,
  sub.nome as sublocal_nome,
  -- Novas colunas de 0011: CREATE OR REPLACE VIEW só permite acrescentar
  -- colunas ao final da lista (Postgres não deixa renomear/reordenar uma
  -- coluna de view existente — erro 42P16), por isso entram depois das
  -- colunas de hierarquia, e não junto das demais colunas de p.* acima.
  p.sap_functional_location,
  p.sap_equipment_number,
  p.inspection_frequency,
  p.last_inspection_date,
  p.next_inspection_date,
  p.installation_date
from public.electrical_panels p
left join public.localidades loc on loc.id = p.localidade_id
left join public.locais lo on lo.id = p.local_id
left join public.sublocais sub on sub.id = p.sublocal_id;

comment on view public.panel_public_info is
  'Whitelist de colunas de electrical_panels para a página pública do QR Code (sem login, ver /quadro-publico/:id). Fronteira de segurança do recurso — nunca adicionar colunas sensíveis (health_index, NCs, histórico, notes) sem decisão explícita.';

grant select on public.panel_public_info to anon, authenticated;
