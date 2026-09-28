-- ============================================================================
-- Resposta complementar de PRO-01: "área molhada" (risco de interdição)
-- ============================================================================
-- Quando o item PRO-01 (DR — teste funcional) é respondido "Não Conforme",
-- a UI (InspectionForm) passa a exigir uma resposta complementar: o
-- quadro/painel alimenta pontos de utilização em áreas molhadas (cozinhas,
-- lavanderias, áreas de serviço, garagens etc. — item "d" do material de
-- referência)? Essa resposta determina se a não-conformidade gerada é
-- classificada como crítica (severidade = 'critica') ou não.
--
-- Coluna nova, nullable, sem valor default diferente de null — 100%
-- compatível com as linhas existentes (ficam null, sem qualquer
-- reprocessamento) e com qualquer outro item do checklist (só é
-- preenchida para PRO-01; para os demais permanece sempre null). Não há
-- necessidade de tabela nova nem de estrutura paralela: a regra de negócio
-- (severidade automática) fica em src/domain/inspectionRules.js, a partir
-- desta coluna.
-- ============================================================================

alter table public.inspection_responses
  add column if not exists area_molhada boolean;

comment on column public.inspection_responses.area_molhada is
  'Resposta complementar do item PRO-01 (Não Conforme): o quadro alimenta pontos de utilização em áreas molhadas? Null = não respondido / não aplicável a este item.';
