-- ============================================================================
-- Localidade "Pelotização"
-- ============================================================================
-- Os quadros do site Pelotização (PEL_QD_0001 e PEL_QD_0002) estavam na
-- localidade Oficina, dentro de prédios da Oficina — por isso Pelotização não
-- aparecia nos filtros de localização (Dashboard, Inventário, Checklists,
-- Análise Inteligente), que leem public.localidades.
--
-- 1. Cria a localidade Pelotização.
-- 2. Cria sob ela os prédios e sublocais desses quadros, com os MESMOS nomes
--    (CASA DE RODAS / ÁREA EXT e ESTACAO CARGAS / AREA INT). Os prédios de
--    mesmo nome da Oficina continuam lá, com os demais quadros da Oficina.
-- 3. Move os 2 quadros (localidade, prédio e sublocal). Nada mais muda nos
--    quadros (tag, site, nomenclatura, local de instalação).
--
-- Aditiva e idempotente (on conflict / só move o que ainda não foi movido).
-- Validar sem aplicar: begin; <conteúdo> rollback;
-- ROLLBACK (manual): devolver localidade_id/local_id/sublocal_id dos 2
--   quadros para os da Oficina e apagar os locais/sublocais/localidade criados.
-- ============================================================================

insert into public.localidades (nome) values ('Pelotização')
on conflict (nome) do nothing;

-- Prédio e sublocal atuais de cada quadro (ainda na Oficina).
drop table if exists _pel_origem;
create temporary table _pel_origem as
select p.id as panel_id, lc.nome as predio, sl.nome as sublocal
  from public.electrical_panels p
  join public.locais lc on lc.id = p.local_id
  left join public.sublocais sl on sl.id = p.sublocal_id
 where p.site = 'pelotizacao'
   and p.localidade_id is distinct from (select id from public.localidades where nome = 'Pelotização');

insert into public.locais (localidade_id, nome)
select distinct (select id from public.localidades where nome = 'Pelotização'), o.predio
  from _pel_origem o
on conflict (localidade_id, nome) do nothing;

insert into public.sublocais (local_id, nome)
select distinct lc.id, o.sublocal
  from _pel_origem o
  join public.locais lc on lc.nome = o.predio
   and lc.localidade_id = (select id from public.localidades where nome = 'Pelotização')
 where o.sublocal is not null
on conflict (local_id, nome) do nothing;

update public.electrical_panels p
   set localidade_id = lc.localidade_id,
       local_id = lc.id,
       sublocal_id = sl.id
  from _pel_origem o
  join public.locais lc on lc.nome = o.predio
   and lc.localidade_id = (select id from public.localidades where nome = 'Pelotização')
  left join public.sublocais sl on sl.local_id = lc.id and sl.nome = o.sublocal
 where p.id = o.panel_id;

drop table if exists _pel_origem;
