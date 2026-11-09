-- ============================================================================
-- Conferência da importação 0031_efc_inventario.sql
-- ============================================================================
-- Só leitura (como postgres). Rodar DEPOIS da 0031. Sucesso = nenhum "FALHA"
-- e o SELECT final por cidade (202 quadros, 9 cidades, 103 prédios, 194 locais
-- detalhados — ver o cabeçalho da 0031).
-- ============================================================================

do $$
declare
  v_efc uuid := (select id from public.unidades_operacionais where codigo = 'EFC');
  v_n int;
begin
  select count(*) into v_n from public.electrical_panels where unidade_operacional_id = v_efc;
  if v_n <> 202 then raise exception 'FALHA: % quadros EFC (esperado 202)', v_n; end if;
  if exists (select 1 from public.electrical_panels where unidade_operacional_id = v_efc
               and (sap_functional_location is not null or sap_equipment_number is not null)) then
    raise exception 'FALHA: quadro EFC com campo SAP preenchido';
  end if;
  if exists (select 1 from public.sap_orders o join public.electrical_panels p on p.id = o.panel_id
              where p.unidade_operacional_id = v_efc) then
    raise exception 'FALHA: ordem/plano SAP vinculado a quadro EFC';
  end if;
  if exists (select 1 from public.electrical_panels where unidade_operacional_id = v_efc and site is not null) then
    raise exception 'FALHA: quadro EFC com site';
  end if;
  if exists (select 1 from public.electrical_panels p left join public.localidades l on l.id = p.localidade_id
              where p.unidade_operacional_id = v_efc
                and (l.id is null or l.unidade_operacional_id <> v_efc or p.local_id is null or p.sublocal_id is null)) then
    raise exception 'FALHA: quadro EFC sem hierarquia completa ou em localidade de outra unidade';
  end if;
  if exists (select 1 from public.electrical_panels p join public.localidades l on l.id = p.localidade_id
              where p.unidade_operacional_id = v_efc
                and (p.tag !~ ('^' || l.sigla || '_QD_[0-9]+$') or p.nomenclatura_oficial <> p.tag)) then
    raise exception 'FALHA: TAG EFC não corresponde à sigla da cidade';
  end if;
  if exists (select 1 from public.electrical_panels where unidade_operacional_id <> v_efc
               and tag !~ '^(PRT|OFC|PEL)_QD_[0-9]+$') then
    raise exception 'FALHA: quadro fora da EFC com TAG fora do padrão de São Luís';
  end if;
  select count(*) into v_n from public.localidades where unidade_operacional_id = v_efc;
  if v_n <> 9 then raise exception 'FALHA: % cidades EFC (esperado 9)', v_n; end if;
  select count(*) into v_n from public.locais lc join public.localidades l on l.id = lc.localidade_id
   where l.unidade_operacional_id = v_efc;
  if v_n <> 103 then raise exception 'FALHA: % prédios EFC (esperado 103)', v_n; end if;
  select count(*) into v_n from public.sublocais s join public.locais lc on lc.id = s.local_id
    join public.localidades l on l.id = lc.localidade_id where l.unidade_operacional_id = v_efc;
  if v_n <> 194 then raise exception 'FALHA: % locais detalhados EFC (esperado 194)', v_n; end if;
  if (select permite_escrita from public.unidades_operacionais where id = v_efc) then
    raise exception 'FALHA: EFC deveria estar somente leitura nesta etapa';
  end if;
end $$;

select l.nome as cidade, l.sigla, count(p.id) as quadros,
       count(*) filter (where p.criticality = 'A') as classe_a,
       count(*) filter (where p.criticality = 'B') as classe_b,
       count(distinct p.local_id) as predios
  from public.localidades l
  join public.unidades_operacionais u on u.id = l.unidade_operacional_id and u.codigo = 'EFC'
  left join public.electrical_panels p on p.localidade_id = l.id
 group by l.nome, l.sigla
 order by count(p.id) desc, l.nome;
