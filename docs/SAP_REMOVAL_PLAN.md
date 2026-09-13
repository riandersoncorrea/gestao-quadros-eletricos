# Plano de Remoção da Importação SAP — Inventário e Classificação

> Gerado no **Sprint 9** da refatoração arquitetural, na branch `refactor/arquitetura-corporativa`.
> **Este documento é só inventário e plano — nada foi removido, nenhuma tabela/coluna foi apagada, nenhuma migration foi criada ou aplicada.** Aguarda autorização explícita antes de qualquer execução.
>
> Escopo confirmado com você: remover **somente** a funcionalidade de importar um Excel do SAP (tela, upload, parsing, validação, API dedicada). Qualquer campo/tabela/coluna com "SAP" no nome que seja usado por Inventário, Checklist, identificação de quadro, histórico ou auditoria **permanece**, mesmo que o nome contenha "SAP".

---

## 0. Achado principal: a funcionalidade de importação já foi removida

A tela/wizard de Importação SAP (upload de Excel, mapeamento de colunas, validação, lote de importação) **já não existe no código** — foi removida no commit `dfe32e6` ("Remove SAP import page"), que é o **mesmo commit da tag `v1.0.0-mvp`**, ou seja, antes até do Sprint 1 desta refatoração começar. Removido naquele commit:

- Páginas: `SapImportList.jsx`, `SapImportWizard.jsx`, `SapBatchDetail.jsx`
- `src/api/sap.js` (API dedicada: `listBatches`, `getBatch`, `listOrders`, `commitImport`, `relinkOrder`, `cancelBatch`)
- `src/lib/sapImport.js` (parsing/validação do Excel)
- Rotas `/importacao-sap`, `/importacao-sap/nova`, `/importacao-sap/:id`
- Item de menu "Importação SAP"

**Não há, portanto, arquivo de código, rota ou componente exclusivo da importação para remover nesta sprint.** O que resta a avaliar é só o que ficou no **banco de dados** e as **poucas linhas de código que ainda leem esses dados** para funcionalidades que continuam ativas (Aderência ao Plano, vínculo opcional de inspeção a uma ordem, dados de inventário) — nenhuma delas é "importação", são consumidoras de dados que a importação um dia carregou.

---

## 1. Inventário completo — toda ocorrência de "SAP" no projeto hoje

| Item | Tipo | Onde | Linhas de dado hoje |
|---|---|---|---|
| `sap_import_batches` | Tabela | banco | **1 linha** (registro do único lote já importado) |
| `sap_orders` | Tabela | banco | **159 linhas** (ordens de manutenção planejadas) |
| `electrical_panels.sap_functional_location` | Coluna | banco | **313/313 quadros preenchidos** |
| `electrical_panels.sap_equipment_number` | Coluna | banco | **313/313 quadros preenchidos** |
| `inspections.sap_order_id` | Coluna (FK) | banco | 0 preenchidas hoje (campo existe, ainda não usado na prática) |
| `nonconformities.sap_order_id` | Coluna (FK) | banco | 0 preenchidas hoje (idem) |
| `getSapOrdersForPanel(panelId)` | Função | `src/repositories/inspectionRepository.js` | lê `sap_orders` |
| `ordersForPanel(panelId)` | Função | `src/services/inspectionService.js` | chama a de cima |
| `getSapOrdersRaw()` / `getPanelAdherence()` | Funções | `src/services/dashboardService.js` | leem `sap_orders` |
| `panelAdherence()` / `overallAdherence()` | Funções puras | `src/domain/adherence.js` | recebem ordens de `sap_orders` como parâmetro (não sabem de onde vieram) |
| `buildAutoNonconformities(...)` | Função pura | `src/domain/inspectionRules.js` | só repassa `sapOrderId` recebido, não lê nem escreve `sap_orders` |
| Dropdown "Vincular a ordem SAP" | UI | `src/pages/InspectionForm.jsx` | lê `sap_orders` via `ordersForPanel` |
| Card "SAP / Plano de Manutenção" | UI | `src/pages/PanelDetail.jsx` | exibe `sap_functional_location`/`sap_equipment_number` |
| Seção "Dados SAP (Plano de Manutenção)" | UI | `src/pages/InventoryForm.jsx` | edita `sap_functional_location`/`sap_equipment_number` (admin only) |
| Colunas de exportação Excel | UI/export | `src/pages/InventoryList.jsx` | exporta `sap_functional_location`/`sap_equipment_number` |
| KPI "Aderência ao plano" | UI | `src/pages/Dashboard.jsx`, `src/pages/ExecutiveReport.jsx` | consome `dashboardService` |
| Rótulos "Lotes SAP" / "Ordens SAP" | Config | `src/services/auditService.js` (`AUDITED_TABLES`) | só rótulos do filtro da tela de Auditoria |

---

## 2. Classificação

### A) EXCLUSIVO DA IMPORTAÇÃO SAP → candidato à remoção

| Item | Justificativa |
|---|---|
| Tabela `sap_import_batches` | Guarda só metadados do processo de importação (nome do arquivo, mapeamento de colunas, contadores, quem importou, quando). Nada no código atual grava ou lê essa tabela para qualquer funcionalidade em uso — o único consumidor era o wizard, já removido. |
| Rótulo `"Lotes SAP"` em `AUDITED_TABLES` (`auditService.js`) | Só existe para filtrar auditoria de uma tabela que, se removida, deixa de fazer sentido no filtro. |

### B) SAP UTILIZADO PELO SISTEMA → preservar

| Item | Por que preservar |
|---|---|
| Tabela `sap_orders` (159 linhas) | Alimenta a métrica **"Aderência ao Plano"** no Painel e no Relatório Executivo, o card de aderência em Detalhe do Quadro, e o dropdown opcional "Vincular a ordem SAP" no Checklist. Não é dado de importação — é dado **operacional** (planejamento de manutenção). |
| `electrical_panels.sap_functional_location` / `sap_equipment_number` | Campos de **identificação do ativo no inventário**, preenchidos em 100% dos 313 quadros, exibidos em Detalhe do Quadro, editáveis (admin) no cadastro, exportados no Excel do inventário. Isso é dado de inventário, não de importação. |
| `inspections.sap_order_id` / `nonconformities.sap_order_id` | Vínculo opcional entre um checklist/NC e uma ordem de manutenção planejada — parte do modelo de dados do Checklist, independente de como as ordens chegaram ao banco. |
| `panelAdherence()`/`overallAdherence()` (`domain/adherence.js`) | Regra de negócio de aderência ao plano de manutenção — continua válida e útil mesmo que `sap_orders` passe a ser alimentada de outra forma no futuro. |
| Rótulo `"Ordens SAP"` em `AUDITED_TABLES` | Continua fazendo sentido enquanto `sap_orders` existir e for gerenciável (ver §6). |

### C) COMPARTILHADO/AMBÍGUO → preservar até decisão

| Item | Por que é ambíguo |
|---|---|
| A única linha de `sap_import_batches` | Tecnicamente é dado "de importação" (categoria A), mas é também o **único registro histórico** de proveniência dos dados que hoje estão em `sap_orders` e nos campos de inventário — quem importou, quando, de qual arquivo. Apagar a tabela apaga essa procedência. Como é só 1 linha, o custo de manter é ~zero; por isso trato como C, não como remoção automática. |
| Entradas de `audit_log` com `tabela in ('sap_import_batches','sap_orders')` | Nunca devem ser apagadas (auditoria é história, não se edita) — mas se as tabelas-fonte forem removidas no futuro, essas entradas ficam "órfãs" (o `registro_id` não resolve mais para nenhuma linha existente). Isso não impede nada, mas é uma perda de rastreabilidade a considerar. |

---

## 3. Dependências entre os dois grupos

```
sap_import_batches (A)  ──FK (ON DELETE SET NULL)──>  sap_orders.batch_id (B)
```

A única dependência estrutural real é essa: `sap_orders.batch_id` referencia `sap_import_batches.id` com `ON DELETE SET NULL`. **Remover `sap_import_batches` não quebra `sap_orders`** — o FK já foi desenhado para tolerar isso (as 159 ordens simplesmente ficariam com `batch_id = null`, perdendo só a referência a QUAL lote as trouxe, não o dado da ordem em si).

Não há nenhuma dependência no sentido inverso, nem entre o código de categoria A e o de categoria B — nenhuma função/componente de categoria B importa ou depende de nada específico da categoria A.

**Dependência não-estrutural, mas real:** hoje **não existe nenhum caminho na interface para adicionar ou atualizar linhas em `sap_orders`** (o wizard que fazia isso foi removido). Isso não é um risco de remoção — é uma limitação **já existente agora**, independente de qualquer decisão deste sprint — mas relevante: se o plano de manutenção precisar ser atualizado no futuro, hoje só dá para fazer via SQL direto no banco.

---

## 4. Arquivos que seriam removidos

**Nenhum.** Não há arquivo de código exclusivo da importação restante — tudo já foi removido antes deste refactor (ver §0).

---

## 5. Rotas/componentes que seriam removidos

**Nenhum.** Rota, menu e páginas da importação já não existem.

---

## 6. Possíveis alterações de banco (apresentadas para decisão — nenhuma aplicada)

| Objeto | Ação possível | Risco |
|---|---|---|
| `sap_import_batches` | `DROP TABLE` (opcional) | Baixo — 1 linha, `sap_orders.batch_id` já é `ON DELETE SET NULL`. Perda: a procedência histórica do único lote importado (ver categoria C). |
| `sap_orders` | **Nenhuma alteração** | Deve permanecer — dado operacional ativo (159 linhas, alimenta Aderência ao Plano) |
| `electrical_panels.sap_functional_location` / `sap_equipment_number` | **Nenhuma alteração** | Devem permanecer — dado de inventário, 100% preenchido |
| `inspections.sap_order_id` / `nonconformities.sap_order_id` | **Nenhuma alteração** | Devem permanecer — parte do modelo de dados do Checklist |
| `AUDITED_TABLES` (código, não banco) | Remover a entrada `"Lotes SAP"` **somente se** `sap_import_batches` for de fato removida | Nenhum — é só um rótulo de filtro na tela de Auditoria |

Se decidir seguir com o `DROP TABLE sap_import_batches`, a migration seria só isto (rascunho, **não aplicado**):

```sql
-- Só executar se autorizado. Não afeta sap_orders (FK já é ON DELETE SET NULL).
drop table if exists public.sap_import_batches;
```

---

## 7. Riscos da remoção

| Risco | Nível | Mitigação |
|---|---|---|
| Perder a proveniência do único lote de importação já feito (`sap_import_batches`) | Baixo | Exportar/anotar a linha antes de remover, se decidir remover |
| Confundir "remover a importação" com "remover dado SAP do inventário/checklist" | **Este é o risco que você já preveniu** ao dar este escopo — nenhuma ação deste plano toca `electrical_panels`, `inspections` ou `nonconformities` |
| `sap_orders` ficar cada vez mais desatualizado, sem forma de reimportar novos dados | Médio, mas **não é risco de remoção** — é uma limitação que já existe hoje, independente deste sprint | Fora do escopo deste plano; mencionado para visibilidade |
| Quebrar o filtro de Auditoria se remover `sap_import_batches` sem tirar o rótulo do código | Baixo | Fazer as duas coisas juntas, se decidir remover a tabela |

---

## 8. Plano de execução (proposto — aguardando autorização, nada executado)

**Fase única, de baixíssimo risco e opcional** (o resultado prático de "remover a Importação SAP" já foi alcançado antes deste refactor):

1. Decidir se `sap_import_batches` (1 linha) deve ser removida ou simplesmente deixada como está (ela não atrapalha nada, não é lida por código nenhum hoje).
2. Se decidir remover:
   a. Exportar/registrar a única linha existente (proveniência histórica), se quiser preservar essa informação fora do banco.
   b. Validar a migration com `begin; ... rollback;` no SQL Editor, como sempre.
   c. Remover a entrada `{ value: "sap_import_batches", label: "Lotes SAP" }` de `AUDITED_TABLES` em `src/services/auditService.js` no mesmo commit.
   d. Aplicar a migration só após sua aprovação explícita, em produção.
3. **Não tocar em `sap_orders`, nem nos campos de inventário/checklist relacionados a SAP.**

**Nenhuma ação será executada até você autorizar explicitamente — inclusive o passo 2, que é opcional e de baixíssimo impacto.**

---

## 9. Resumo para decisão

- A funcionalidade de Importação SAP (tela, upload, parsing) **já foi removida** — este sprint não encontrou nada além disso para remover no código.
- No banco, só **uma tabela de 1 linha** (`sap_import_batches`) é exclusiva da importação e um candidato real (e de baixíssimo risco) à remoção — opcional, sem urgência.
- Tudo o mais com "SAP" no nome (`sap_orders`, os dois campos de inventário, os dois campos de vínculo em checklist/NC) é dado **ativo e em uso**, preservado integralmente, conforme seu escopo.

Aguardando sua autorização explícita antes de qualquer remoção — inclusive a opcional do item 1.
