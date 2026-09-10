-- ============================================================================
-- FASE 3 — Catálogo de checklist (expansão do template "Checklist Padrão BT" v1)
-- ============================================================================
-- Aditiva e idempotente: só insere itens cujo `codigo` ainda não existe no
-- template. Não remove nem altera itens existentes (respostas já gravadas
-- continuam válidas). Escopo: BAIXA TENSÃO.
--
-- Módulos de checklist: 1 Identificação, 2 Segurança, 3 Integridade física,
-- 4 Proteções, 5 Barramentos e conexões, 6 Cabos e isolação, 7 Aterramento,
-- 10 Documentação. Medições (8), Termografia (9) e Não-conformidades (11)
-- têm tabelas/telas próprias.
-- ============================================================================

do $$
declare
  v_tpl uuid;
  r record;
begin
  select id into v_tpl
  from public.inspection_templates
  where nome = 'Checklist Padrão BT' and versao = 1;

  if v_tpl is null then
    raise exception 'Template "Checklist Padrão BT" v1 não encontrado — rode a migração 0001 primeiro';
  end if;

  for r in
    select * from (values
      -- 1 · IDENTIFICAÇÃO
      (1, 'Identificação',          3, 'ID-03', 'Diagrama/etiqueta de circuitos afixado na parte interna da porta', true,  false),
      (1, 'Identificação',          4, 'ID-04', 'Tensão nominal e esquema de aterramento (TN/TT/IT) identificados', true,  false),
      (1, 'Identificação',          5, 'ID-05', 'TAG do quadro corresponde ao inventário / plano SAP', true,  false),

      -- 2 · SEGURANÇA
      (2, 'Segurança',              5, 'SEG-05', 'Barreiras/anteparos contra contato acidental instalados', true,  true),
      (2, 'Segurança',              6, 'SEG-06', 'Dispositivo de bloqueio/travamento (LOTO) do disjuntor geral disponível', true,  false),
      (2, 'Segurança',              7, 'SEG-07', 'Extintor de CO2/pó químico próximo e dentro da validade', false, false),
      (2, 'Segurança',              8, 'SEG-08', 'Piso/estrado isolante em frente ao quadro, quando exigido', false, false),

      -- 3 · INTEGRIDADE FÍSICA
      (3, 'Integridade física',     5, 'INT-05', 'Pintura/tratamento anticorrosivo do invólucro preservado', false, false),
      (3, 'Integridade física',     6, 'INT-06', 'Prensa-cabos e aberturas vedados (grau IP mantido)', true,  true),
      (3, 'Integridade física',     7, 'INT-07', 'Dobradiças, fecho e maçaneta funcionando', false, false),
      (3, 'Integridade física',     8, 'INT-08', 'Ausência de sinais de infiltração de água ou entrada de animais', true,  true),
      (3, 'Integridade física',     9, 'INT-09', 'Ventilação/exaustão e filtros limpos e desobstruídos', false, false),

      -- 4 · PROTEÇÕES
      (4, 'Proteções',              5, 'PRO-05', 'Seletividade/coordenação entre disjuntor geral e ramais mantida', true,  false),
      (4, 'Proteções',              6, 'PRO-06', 'Ausência de proteções shuntadas, travadas ou "jumpeadas"', true,  true),
      (4, 'Proteções',              7, 'PRO-07', 'Curva e corrente nominal dos disjuntores compatíveis com o projeto', true,  true),
      (4, 'Proteções',              8, 'PRO-08', 'DPS com desconector/fusível de retaguarda instalado', false, false),
      (4, 'Proteções',              9, 'PRO-09', 'Registro da data do último teste de DR', false, false),

      -- 5 · BARRAMENTOS E CONEXÕES
      (5, 'Barramentos e conexões', 4, 'BAR-04', 'Isoladores e suportes de barramento íntegros', true,  true),
      (5, 'Barramentos e conexões', 5, 'BAR-05', 'Ausência de descoloração, marcas de arco ou odor de queimado', true,  true),
      (5, 'Barramentos e conexões', 6, 'BAR-06', 'Terminais e conectores adequados à seção do condutor (sem "gambiarra")', true,  true),
      (5, 'Barramentos e conexões', 7, 'BAR-07', 'Distâncias de isolamento e escoamento respeitadas', true,  false),
      (5, 'Barramentos e conexões', 8, 'BAR-08', 'Neutro e PE em barramentos distintos (esquema TN-S)', true,  true),

      -- 6 · CABOS E ISOLAÇÃO
      (6, 'Cabos e isolação',       4, 'CAB-04', 'Raio de curvatura dos cabos respeitado', false, false),
      (6, 'Cabos e isolação',       5, 'CAB-05', 'Identificação de circuitos nas duas extremidades dos cabos', false, false),
      (6, 'Cabos e isolação',       6, 'CAB-06', 'Ausência de emendas dentro do quadro', true,  true),
      (6, 'Cabos e isolação',       7, 'CAB-07', 'Cores da isolação conforme norma (fase, neutro azul-claro, PE verde-amarelo)', true,  false),
      (6, 'Cabos e isolação',       8, 'CAB-08', 'Reserva técnica de espaço para novos circuitos', false, false),

      -- 7 · ATERRAMENTO
      (7, 'Aterramento',            4, 'ATR-04', 'Aperto/torque das conexões do barramento de terra verificado', true,  true),
      (7, 'Aterramento',            5, 'ATR-05', 'Todas as massas metálicas (porta, painel, trilhos) aterradas', true,  true),
      (7, 'Aterramento',            6, 'ATR-06', 'Condutor de equipotencialização presente onde aplicável', false, false),
      (7, 'Aterramento',            7, 'ATR-07', 'Ausência de corrosão nas conexões de aterramento', true,  false),

      -- 10 · DOCUMENTAÇÃO
      (10, 'Documentação',          3, 'DOC-03', 'ART/prontuário de instalações elétricas disponível (NR-10)', false, false),
      (10, 'Documentação',          4, 'DOC-04', 'Laudo/relatório da última termografia arquivado', false, false),
      (10, 'Documentação',          5, 'DOC-05', 'Etiqueta de inspeção no quadro com data e responsável', false, false),
      (10, 'Documentação',          6, 'DOC-06', 'Lista de circuitos / memorial de cálculo compatível com o executado', false, false)
    ) as t(modulo, modulo_nome, ordem, codigo, titulo, obrigatorio, gera_nc_automatica)
  loop
    if not exists (
      select 1 from public.inspection_template_items
      where template_id = v_tpl and codigo = r.codigo
    ) then
      insert into public.inspection_template_items
        (template_id, modulo, modulo_nome, ordem, codigo, titulo, obrigatorio, gera_nc_automatica)
      values
        (v_tpl, r.modulo, r.modulo_nome, r.ordem, r.codigo, r.titulo, r.obrigatorio, r.gera_nc_automatica);
    end if;
  end loop;
end $$;

-- ============================================================================
-- FIM DA FASE 3 (catálogo)
-- ============================================================================
