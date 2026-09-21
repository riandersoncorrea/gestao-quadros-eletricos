-- ============================================================================
-- Página pública do quadro via QR Code (sem login) — view com whitelist
-- ============================================================================
-- Objetivo: permitir que qualquer pessoa que escaneie o QR Code físico de um
-- quadro veja um subconjunto de dados técnicos/identificação, localização,
-- engenheiro responsável e diagrama/foto — SEM precisar de login, e SEM
-- expor dados operacionais/sensíveis: Índice de Saúde, não-conformidades,
-- histórico de localização/condição, dados de SAP/plano de manutenção e
-- observações internas ("notes") continuam só na página autenticada
-- (PanelDetail.jsx).
--
-- A policy existente de electrical_panels é "for select to authenticated
-- using (true)" — o papel anon não tem (e continua sem ter) nenhum acesso
-- direto a electrical_panels, localidades, locais ou sublocais. Em vez de
-- adicionar uma policy "anon" na tabela (o que exigiria repetir em toda
-- consulta o cuidado de nunca selecionar uma coluna sensível), a fronteira
-- de segurança é esta view: `security_invoker = false` (o padrão do
-- Postgres) faz a view rodar com o privilégio de quem a criou/é dona das
-- tabelas de origem, então as policies "to authenticated" das tabelas-base
-- não bloqueiam a consulta feita através da view — e o único novo acesso
-- concedido ao papel anon é um GRANT SELECT nesta view específica.
--
-- IMPORTANTE: esta view é a fronteira de segurança de todo o recurso.
-- Nunca adicionar aqui health_index, dados de SAP/manutenção, notes, nem
-- qualquer coluna não explicitamente aprovada como pública.
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
  sub.nome as sublocal_nome
from public.electrical_panels p
left join public.localidades loc on loc.id = p.localidade_id
left join public.locais lo on lo.id = p.local_id
left join public.sublocais sub on sub.id = p.sublocal_id;

comment on view public.panel_public_info is
  'Whitelist de colunas de electrical_panels para a página pública do QR Code (sem login, ver /quadro-publico/:id). Fronteira de segurança do recurso — nunca adicionar colunas operacionais/sensíveis.';

grant select on public.panel_public_info to anon, authenticated;
