-- ============================================================================
-- Quadros da Oficina cadastrados na hierarquia do Porto
-- ============================================================================
-- OFC_QD_0238, OFC_QD_0271 e OFC_QD_0268 têm site = 'oficina' (tag e
-- sublocal corretos), mas localidade_id/local_id/sublocal_id apontam para
-- prédios do Porto — e é essa hierarquia que o Inventário (e os filtros de
-- localidade) exibem:
--   OFC_QD_0238, OFC_QD_0271 -> Porto › CANT SEOP › LADO WC MASC
--   OFC_QD_0268              -> Porto › MIRANTE › SALA DOS RACKS
--
-- 1. Garante na Oficina os prédios/sublocais desses quadros, com os MESMOS
--    nomes: CANT SEOP já existe na Oficina (falta o sublocal LADO WC MASC);
--    MIRANTE só existe no Porto. Os prédios do Porto continuam lá, com os
--    quadros do Porto (19 em MIRANTE, 1 em CANT SEOP).
-- 2. Move os 3 quadros (localidade, prédio e sublocal). Nada mais muda nos
--    quadros (tag, site, nome, nomenclatura, SAP). O histórico de
--    localização registra a mudança (trigger trg_track_panel_location).
--
-- Aditiva e idempotente (on conflict / só move o que ainda está fora da
-- Oficina, e só quadros com site = 'oficina').
-- Validar sem aplicar: begin; <conteúdo> rollback;
-- ROLLBACK (manual): devolver localidade_id/local_id/sublocal_id dos 3
--   quadros para os do Porto (ver panel_location_history) e apagar o
--   prédio MIRANTE e os sublocais criados na Oficina.
-- ============================================================================

-- Prédio e sublocal atuais de cada quadro (ainda fora da Oficina).
drop table if exists _ofc_origem;
create temporary table _ofc_origem as
select p.id as panel_id, lc.nome as predio, sl.nome as sublocal
  from public.electrical_panels p
  join public.locais lc on lc.id = p.local_id
  left join public.sublocais sl on sl.id = p.sublocal_id
 where p.tag in ('OFC_QD_0238', 'OFC_QD_0271', 'OFC_QD_0268')
   and p.site = 'oficina'
   and p.localidade_id is distinct from (select id from public.localidades where nome = 'Oficina');

insert into public.locais (localidade_id, nome)
select distinct (select id from public.localidades where nome = 'Oficina'), o.predio
  from _ofc_origem o
on conflict (localidade_id, nome) do nothing;

insert into public.sublocais (local_id, nome)
select distinct lc.id, o.sublocal
  from _ofc_origem o
  join public.locais lc on lc.nome = o.predio
   and lc.localidade_id = (select id from public.localidades where nome = 'Oficina')
 where o.sublocal is not null
on conflict (local_id, nome) do nothing;

update public.electrical_panels p
   set localidade_id = lc.localidade_id,
       local_id = lc.id,
       sublocal_id = sl.id
  from _ofc_origem o
  join public.locais lc on lc.nome = o.predio
   and lc.localidade_id = (select id from public.localidades where nome = 'Oficina')
  left join public.sublocais sl on sl.local_id = lc.id and sl.nome = o.sublocal
 where p.id = o.panel_id;

drop table if exists _ofc_origem;

-- Conferência (deve listar os 3 quadros em Oficina › prédio › sublocal):
-- select p.tag, loc.nome, lc.nome, sl.nome
--   from public.electrical_panels p
--   join public.localidades loc on loc.id = p.localidade_id
--   join public.locais lc on lc.id = p.local_id
--   left join public.sublocais sl on sl.id = p.sublocal_id
--  where p.tag in ('OFC_QD_0238', 'OFC_QD_0271', 'OFC_QD_0268');
