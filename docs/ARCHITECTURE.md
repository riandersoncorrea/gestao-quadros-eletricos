# Arquitetura — Gestão de Quadros Elétricos

> Documento gerado no **Sprint 1 (Auditoria e Mapa da Arquitetura)** da refatoração arquitetural, na branch `refactor/arquitetura-corporativa`.
> Reflete o código e o banco de dados **reais** encontrados na auditoria (código-fonte em `src/`, migrations em `supabase/migrations/`, e introspecção ao vivo do Postgres via `information_schema`/`pg_catalog` em 2026-09-13). Não é uma arquitetura genérica nem aspiracional — onde algo é proposta futura, está explicitamente marcado como tal.
>
> Nenhuma alteração de código, banco, RLS, Auth, Storage ou deploy foi feita para produzir este documento.

---

## 1. Resumo executivo

O sistema é um SPA React servido estaticamente (GitHub Pages) que fala **diretamente** com o Supabase (Postgres + Auth + Storage) a partir do navegador. Não existe backend próprio: toda regra de acesso é imposta por RLS no Postgres, e boa parte da lógica de negócio roda no cliente, dentro de módulos `src/api/*.js` e, em alguns pontos, dentro das próprias páginas React.

Isso funciona bem para o MVP atual, mas cria três acoplamentos fortes que a refatoração pretende afrouxar (sem trocar nada agora):

1. **Componentes React chamando o Supabase diretamente** (não só via `src/api/*`) — encontrado em `AppLayout.jsx`, `PanelDetail.jsx`, `UserManagement.jsx` e em todas as telas de autenticação.
2. **Regras de negócio misturadas com chamadas de banco** dentro dos módulos `src/api/*.js` (ex.: `createInspection`, `recomputeInspectionAnalysis`).
3. **Ausência de uma camada de abstração para Auth e para Storage** — o app conhece `supabase.auth.*` e (em menor grau) `supabase.storage` diretamente.

Um ponto positivo encontrado: **Storage já está parcialmente abstraído** (`src/lib/storage.js`) e a lógica de domínio de Índice de Saúde/Aderência (`src/lib/healthIndex.js`, `src/lib/adherence.js`) já é **pura, sem nenhuma dependência de Supabase** — são os melhores pontos de partida para os próximos sprints.

---

## 2. Arquitetura atual (real)

```
React (páginas/componentes)
   │
   ├── chamando diretamente ──────────────► supabase.auth.*      (Login, Register, ForgotPassword,
   │                                                               ResetPassword, AuthContext)
   │
   ├── via src/api/*.js (maioria dos casos) ─► supabase.from(...) ─► PostgreSQL (Supabase)
   │                                                               (RLS decide o que cada role pode)
   │
   ├── chamando diretamente (exceção) ─────► supabase.from(...)  (AppLayout, PanelDetail, UserManagement)
   │
   └── via src/lib/storage.js ─────────────► supabase.storage.*  (upload de evidências/diagramas)
```

Não existe camada de serviços, nem repository, nem domínio isolado. `src/api/*.js` funciona hoje como uma mistura de **repository** (funções `list`/`create`/`update`/`delete` bem finas) e **service** (funções que orquestram várias tabelas e aplicam regras, como `createInspection`).

### 2.1 Estrutura de pastas real

```
src/
├── api/            7 arquivos — acesso a dados + algumas regras de negócio
├── components/
│   ├── layout/     AppLayout.jsx (shell + nav) — acessa Supabase diretamente (ver 3.1)
│   ├── panels/     4 componentes de apresentação pura (sem Supabase, sem @/api) — bom exemplo a preservar
│   └── ui/         ~50 componentes shadcn/Radix (Button, Select, Dialog, ...) — puramente visuais
├── pages/          23 páginas (rotas) — a maioria usa @/api/*; algumas acessam Supabase direto
├── hooks/          useUserRole.jsx (papel/permissão), use-mobile.jsx
├── lib/            AuthContext, storage, supabaseClient, query-client, healthIndex, adherence, utils
└── utils/          index.ts (vazio/utilitário mínimo)
```

Não existem `src/entities/`, `src/services/`, `src/repositories/` ou `src/domain/` hoje — citados no prompt da refatoração como pastas de referência, mas ainda não existem neste projeto.

---

## 3. Acoplamento com Supabase

### 3.1 Arquivos que importam `supabaseClient` (16 arquivos, fonte da verdade)

| Arquivo | Categoria | Observação |
|---|---|---|
| `src/lib/supabaseClient.js` | infraestrutura | cria o client único (`createClient`), lê `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` |
| `src/lib/AuthContext.jsx` | autenticação | `supabase.auth.getSession`, `onAuthStateChange`, `signOut` + 1 `select` em `profiles` |
| `src/lib/storage.js` | storage | único ponto que fala com `supabase.storage` |
| `src/pages/Login.jsx` | autenticação | `signInWithPassword`, `signInWithOAuth` (Google) |
| `src/pages/Register.jsx` | autenticação | `signUp`, `signInWithOAuth` |
| `src/pages/ForgotPassword.jsx` | autenticação | `resetPasswordForEmail` |
| `src/pages/ResetPassword.jsx` | autenticação | `getSession`, `updateUser`, `signOut` |
| `src/pages/PanelDetail.jsx` | consulta (⚠️ bypassa `src/api`) | `supabase.from("sap_orders")`, `supabase.from("inspections")` direto na página |
| `src/pages/UserManagement.jsx` | consulta + mutação (⚠️ bypassa `src/api`) | lista/atualiza `profiles` (role, approved) direto na página — não existe `userService`/`profileApi` |
| `src/components/layout/AppLayout.jsx` | consulta (⚠️ bypassa `src/api`) | conta `profiles` pendentes (`approved=false`) para o badge do menu, direto no componente de layout |
| `src/api/entities.js` | banco de dados (repository genérico) | fábrica `makeEntity(table)` → `ElectricalPanel`, `Inspection`, `Localidade`, `Local`, `Sublocal`; + `fetchHierarchy()` |
| `src/api/inspections.js` | banco de dados + regra de negócio | ver §4 |
| `src/api/nc.js` | banco de dados | CRUD de não-conformidades e ações |
| `src/api/analysis.js` | banco de dados + regra de negócio | ver §4 (motor de Índice de Saúde) |
| `src/api/dashboard.js` | consulta + agregação | agrega painel executivo no cliente a partir de 5 tabelas |
| `src/api/spatial.js` | consulta + mutação | dados do mapa + `setPanelCoordinates` |
| `src/api/audit.js` | auditoria | log de auditoria, histórico de localização/condição |

**16 arquivos, 57 pontos de chamada direta ao Supabase** (contando `.from(`, `.auth.`, `.storage.` em todas as variações, inclusive chamadas encadeadas em múltiplas linhas).

### 3.2 Páginas que **não** usam `src/api/*` (potencial acesso direto ou nenhuma necessidade)

| Página | Situação |
|---|---|
| `Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx` | usam `supabase.auth` diretamente — esperado hoje, candidatas a `authService` (Sprint 4) |
| `UserManagement.jsx` | usa `supabase.from("profiles")` diretamente — candidata a `userService`/`profileRepository` (Sprint 2/3) |
| `PendingApproval.jsx`, `InfoFundamentais.jsx` | não tocam em dados — ok, não precisam de camada nenhuma |

### 3.3 Componentes de UI: já desacoplados (ponto positivo)

`src/components/panels/*` (`PanelCard`, `QRCodeGenerator`, `SpatialMap`, `StatusBadge`) e todo `src/components/ui/*` **não importam Supabase nem `@/api`** — recebem dados via props. Isso já é exatamente o padrão que a Sprint 6 (domínio) e a arquitetura alvo querem generalizar: **componentes burros, dados entram por fora**.

---

## 4. Regras de negócio — onde estão hoje

| Regra | Localização atual | Está misturada com Supabase? |
|---|---|---|
| Cálculo do Índice de Saúde (pesos por dimensão, banda bom/atenção/crítico) | `src/lib/healthIndex.js` (`dimensionScores`, `healthIndex`, `healthBand`) | **Não** — função pura, só recebe dados e devolve número. Ótimo candidato a "domain layer" já pronto. |
| Geração de flags de análise (ex.: DR não-conforme → alerta) | `src/lib/healthIndex.js` (`analysisFlags`) | **Não** — pura. |
| Orquestração: recalcular Índice de Saúde de uma inspeção, gravar flags, atualizar `electrical_panels.health_index`, gravar snapshot em `panel_condition_history` | `src/api/analysis.js` (`recomputeInspectionAnalysis`) | **Sim** — a função pura acima é chamada, mas a orquestração (5+ tabelas, `Promise.all`, decisão de "essa é a inspeção mais recente?") está no mesmo arquivo que faz `supabase.from(...)`. |
| Aderência ao plano de inspeção (cumprida/vencida, tolerância de dias) | `src/lib/adherence.js` (`panelAdherence`, `overallAdherence`) | **Não** — pura, testável isoladamente. |
| Resultado geral da inspeção (aprovado / aprovado com ressalvas / reprovado) | `src/api/inspections.js` (`computeOverall`) | **Não** (função pura dentro do arquivo), mas está ao lado de `createInspection`, que é 100% acoplada. |
| Criação de inspeção completa: grava inspeção + respostas + medições + termografia + **gera não-conformidade automaticamente** para cada item "não conforme" + atualiza `last_inspection_date` do quadro + dispara recálculo do Índice de Saúde | `src/api/inspections.js` (`createInspection`) | **Sim, fortemente** — é a função com mais regra de negócio do sistema e também a mais acoplada ao Supabase (7 tabelas diferentes, sem transação real porque o supabase-js não oferece uma). |
| Geração de TAG do quadro (`PRT_QD_0001`, `OFC_QD_0001`) | Função Postgres `next_panel_tag()` + trigger `set_panel_tag` | Depende do Postgres (ver §6.4) — não há equivalente em JS. |
| Permissões por papel (admin/editor/viewer, aprovado/pendente) | `src/hooks/useUserRole.jsx` (client-side) **e** `public.current_role()` + RLS (banco) | As duas camadas existem e precisam ficar coerentes; a fonte da verdade é o banco (RLS), o hook é só conveniência de UI. |
| Resumo do painel executivo (Torre de Controle): médias, rankings, contagens | `src/api/dashboard.js` | **Sim** — 5 queries + toda a agregação (bandas de saúde, ranking de quadros, aderência por localidade) roda no cliente, dentro do mesmo arquivo que faz as queries. |

**Conclusão prática para os próximos sprints:** `healthIndex.js` e `adherence.js` já são "domain layer" — não precisam de trabalho. O maior ganho de uma futura extração de domínio (Sprint 6) está em `createInspection` e `recomputeInspectionAnalysis`, que hoje decidem regra de negócio (o que é NC automática, o que é "a inspeção mais recente") no meio de chamadas de banco.

---

## 5. Autenticação — `src/lib/AuthContext.jsx`

### Como funciona hoje

- `AuthProvider` chama `supabase.auth.getSession()` uma vez e assina `supabase.auth.onAuthStateChange(...)`.
- Em cada mudança de sessão, `buildUser(authUser)` busca `role` e `approved` em `public.profiles` (1 `select`) e monta o objeto `user` consumido pelo resto do app: `{ id, email, full_name, role, approved }`.
- `logout()` chama `supabase.auth.signOut()`.
- O contexto expõe `{ user, isAuthenticated, isLoadingAuth, logout }` via `useAuth()`.
- **Fora do contexto**, 4 páginas chamam `supabase.auth` diretamente para as próprias operações: `Login.jsx` (`signInWithPassword`, `signInWithOAuth` Google), `Register.jsx` (`signUp`, `signInWithOAuth`), `ForgotPassword.jsx` (`resetPasswordForEmail`), `ResetPassword.jsx` (`updateUser`, `signOut`).
- `ProtectedRoute.jsx` e `RoleRoute.jsx` decidem o que renderizar com base em `isAuthenticated`, `user.approved` e `user.role` — não chamam Supabase, só consomem o contexto.

### Caminho conceitual para uma futura troca por Microsoft Entra ID (Sprint 4, **não fazer agora**)

O contrato que o resto do app realmente usa é pequeno:

```
authService.getSession()      // hoje: supabase.auth.getSession()
authService.onAuthChange(fn)  // hoje: supabase.auth.onAuthStateChange(fn)
authService.signInPassword()  // hoje: supabase.auth.signInWithPassword()
authService.signInOAuth()     // hoje: supabase.auth.signInWithOAuth({ provider: 'google' })
authService.signUp()          // hoje: supabase.auth.signUp()
authService.resetPassword()   // hoje: supabase.auth.resetPasswordForEmail()
authService.updatePassword()  // hoje: supabase.auth.updateUser({ password })
authService.signOut()         // hoje: supabase.auth.signOut()
authService.getCurrentUser()  // hoje: AuthContext.buildUser()
```

Se essas 9 operações forem centralizadas em um único módulo (`authService`), trocar o provedor no futuro (Entra ID via MSAL, por exemplo) significa reescrever **um arquivo**, não 5 páginas + o contexto. Isso é exatamente o objetivo do Sprint 4 — hoje nada disso existe ainda.

Um ponto que qualquer migração futura para Entra ID vai precisar resolver: hoje `role` e `approved` vivem em `public.profiles`, uma tabela própria da aplicação, não em metadados do provedor de auth. Isso é bom — significa que a lógica de autorização **já está desacoplada do provedor de autenticação**, só a autenticação em si (login/sessão) está no Supabase.

---

## 6. Storage — `src/lib/storage.js`

### Como funciona hoje

```js
// src/lib/storage.js — arquivo inteiro, 13 linhas
export async function uploadFile({ file }) {
  const path = `${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from("uploads").upload(path, file);
  const { data } = supabase.storage.from("uploads").getPublicUrl(path);
  return { file_url: data.publicUrl };
}
```

Este já é o **melhor exemplo de abstração no projeto hoje**: `InspectionForm.jsx` e `InventoryForm.jsx` (as duas únicas telas que fazem upload — evidências, assinatura, diagrama unifilar, foto do quadro) só conhecem `uploadFile({ file }) → { file_url }`. Nenhuma página chama `supabase.storage` diretamente.

### Caminho conceitual para uma futura troca por Azure Blob Storage (Sprint 5, **não fazer agora**)

Faltam apenas duas operações para fechar o contrato sugerido no prompt (`upload`, `getUrl`, `delete`):

| Operação | Hoje |
|---|---|
| `storage.upload(file)` | existe (`uploadFile`) |
| `storage.getUrl(path)` | implícito dentro de `uploadFile` (poderia virar função própria) |
| `storage.delete(path)` | **não existe** — hoje nada no app remove arquivos do bucket `uploads`; ficam órfãos quando um registro é excluído |

Bucket único (`uploads`), público, arquivos nomeados por UUID — sem estrutura de pastas por entidade. Isso é relevante para uma migração futura de arquivos (ver `docs/DATA_MIGRATION.md`).

---

## 7. Banco de dados (introspecção ao vivo — Supabase Postgres, 2026-09-13)

### 7.1 Tabelas (20 tabelas + 1 view), com finalidade

| Tabela | Finalidade | PK | Colunas notáveis |
|---|---|---|---|
| `profiles` | Papel e aprovação de cada usuário autenticado | `id uuid` (= `auth.users.id`) | `email`, `role` (admin/editor/viewer), `approved` (bool), `created_at` |
| `electrical_panels` | Inventário mestre dos quadros BT | `id uuid` | `tag` (único), `name`, `site`, localização (texto livre + `localidade_id`/`local_id`/`sublocal_id`), características elétricas, `criticality`, `health_index`, `sap_functional_location`/`sap_equipment_number` (legado SAP) |
| `localidades` | Nível 1 da hierarquia de localização | `id uuid` | `nome` (único) — hoje só "Porto" e "Oficina" |
| `locais` | Nível 2 (prédio) | `id uuid` | `localidade_id` FK, `nome` — 99 registros seed |
| `sublocais` | Nível 3 (sala/área) | `id uuid` | `local_id` FK, `nome` — 176 registros seed |
| `panel_location_history` | Histórico de mudança de localização/coordenada do quadro | `id uuid` | `panel_id` FK, snapshot dos campos de localização antigos, `changed_by`, `changed_at` — gravada só por trigger |
| `panel_condition_history` | Snapshot de condição do quadro ao longo do tempo (série histórica) | `id uuid` | `panel_id` FK, `health_index`, contagens de NC/ações, `source` |
| `sap_import_batches` | **Legado SAP** — lote de importação do plano SAP | `id uuid` | contadores do lote, `status`, `imported_by/at` |
| `sap_orders` | **Legado SAP** — ordens de manutenção planejadas importadas do SAP | `id uuid` | `batch_id` FK, `panel_id` FK, `data_planejada`, `link_status` |
| `inspection_templates` | Template de checklist (versão do catálogo) | `id uuid` | `nome`+`versao` únicos, `ativo` — hoje só "Checklist Padrão BT" v1 |
| `inspection_template_items` | Item individual do checklist (um por módulo) | `id uuid` | `template_id` FK, `modulo`, `codigo`, `obrigatorio`, `ativo` (soft-delete) |
| `inspections` | Cabeçalho de uma inspeção realizada | `id uuid` | `panel_id` FK **not null**, `panel_ref_id` FK (ver nota abaixo), `template_id` FK, `sap_order_id` FK, `overall_result`, `health_index_resultado`, `assinatura_url`. **Contém colunas legadas não usadas pelo código atual** — ver §7.5 |
| `inspection_responses` | Resposta de cada item de checklist numa inspeção | `id uuid` | `inspection_id` FK, `template_item_id` FK, `resposta` (conforme/não conforme/n·a/não verificado) |
| `measurements` | Medições elétricas (tensão, corrente, corrente de fuga, isolação, etc.) | `id uuid` | `inspection_id` FK, `categoria`, `unidade` (corrente de fuga é travada em A/mA/µA por `constraint`) |
| `thermography_points` | Pontos de termografia | `id uuid` | `inspection_id` FK, `temperatura`, `delta_t`, `criticidade` |
| `nonconformities` | Não conformidades (manuais ou geradas por inspeção) | `id uuid` | `panel_id` FK, `inspection_id` FK, `sap_order_id` FK, `severidade`, `status`, `origem` |
| `actions` | Ações corretivas ligadas a uma NC | `id uuid` | `nonconformity_id` FK (cascade), `panel_id` FK, `prazo`, `status` |
| `analysis_flags` | Alertas gerados pelo motor de análise (ex.: "DR não testado") | `id uuid` | `inspection_id` FK, `panel_id` FK, `severidade`, `resolvido` |
| `health_index_config` | Pesos configuráveis por dimensão do Índice de Saúde | `id uuid` | `dimensao` (único), `peso`, `ativo` |
| `audit_log` | Log de auditoria genérico (1 linha por campo alterado) | `id uuid` | `tabela`, `registro_id`, `acao`, `campo`, valores antes/depois, `usuario_id/email` — gravado só por trigger |
| `v_actions` (view) | `actions` + coluna derivada `atrasada` (não persistida) | — | `security_invoker = on` → herda RLS de `actions` |

### 7.2 Chaves estrangeiras (mapa completo, verificado ao vivo — 32 FKs)

```
localidades ──┬──< locais ──┬──< sublocais
              │              │
              │              └──< electrical_panels.sublocal_id
              ├──< electrical_panels.localidade_id
              └──< electrical_panels.local_id

electrical_panels ──┬──< inspections.panel_id (CASCADE, not null)
                     ├──< inspections.panel_ref_id (SET NULL)
                     ├──< nonconformities.panel_id (SET NULL)
                     ├──< actions.panel_id (SET NULL)
                     ├──< analysis_flags.panel_id (SET NULL)
                     ├──< measurements.panel_id (SET NULL)
                     ├──< thermography_points.panel_id (SET NULL)
                     ├──< sap_orders.panel_id (SET NULL)
                     ├──< panel_location_history.panel_id (CASCADE)
                     └──< panel_condition_history.panel_id (CASCADE)

inspection_templates ──< inspection_template_items.template_id (CASCADE)
                      └──< inspections.template_id (SET NULL)

inspection_template_items ──┬──< inspection_responses.template_item_id (SET NULL)
                             └──< nonconformities.template_item_id (SET NULL)

inspections ──┬──< inspection_responses.inspection_id (CASCADE)
              ├──< measurements.inspection_id (CASCADE)
              ├──< thermography_points.inspection_id (CASCADE)
              ├──< nonconformities.inspection_id (SET NULL)
              └──< analysis_flags.inspection_id (CASCADE)

nonconformities ──< actions.nonconformity_id (CASCADE)

sap_import_batches ──< sap_orders.batch_id (SET NULL)
sap_orders ──┬──< inspections.sap_order_id (SET NULL)
             └──< nonconformities.sap_order_id (SET NULL)
```

Além destas (schema `public → public`), várias tabelas referenciam `auth.users(id)` sem `ON DELETE` explícito (`created_by`, `changed_by`, `imported_by`, `linked_by`, `validated_by`, `updated_by`) — confirmadas no código-fonte das migrations, não aparecem na introspecção acima porque a consulta usada foi restrita a FKs dentro do schema `public`.

**⚠️ Achado da auditoria (comentário desatualizado):** a migration `0001_phase0_data_model.sql` (linha ~378) comenta que "a coluna antiga `panel_id` é **text**". A introspecção ao vivo confirma que `inspections.panel_id` é **`uuid not null`**, igual ao `schema.sql`. Ou seja, o comentário na migration não reflete o banco atual — provavelmente descrevia um estado anterior a uma reformulação do `schema.sql` que não foi documentada. Não é um problema funcional (o código usa `panel_id` como uuid corretamente em todo lugar), mas é uma inconsistência de documentação a ter em mente numa futura migração — **não confiar cegamente em comentários de migrations antigas sem checar o banco real**, como feito aqui.

### 7.3 IDs — o que preservar numa futura migração

- **Todas as PKs são `uuid` gerados por `gen_random_uuid()`** (extensão `pgcrypto`), exceto `v_actions` (view, herda o `id` de `actions`). Não há PK inteira/serial em nenhuma tabela de domínio.
- IDs são usados diretamente:
  - **No frontend**, como chave de rota (`/quadro/:id`, `/inspecoes/:id`, `/nao-conformidades/:id`, `/inventario/editar/:id`).
  - **No Storage**, o nome do arquivo é `crypto.randomUUID()` (não é o mesmo UUID de nenhuma linha — é um UUID novo por upload), então arquivos **não têm vínculo direto por nome com a linha que os referencia**; o vínculo é só a URL pública gravada na coluna (`diagram_url`, `photo_url`, `evidencia_url`, `imagem_url`, `assinatura_url`).
  - **Em auditoria/histórico**, `audit_log.registro_id`, `panel_location_history.panel_id`, `panel_condition_history.panel_id` guardam o UUID original — se os UUIDs mudarem numa migração, o histórico perde a referência.
  - **Em `sap_orders`/`nonconformities`/`inspections`**, `panel_id` é usado tanto para join quanto para exibição (`tag` é redundante e gravado em paralelo em alguns lugares, ex. `nonconformities.tag`).
- **Diretriz para uma futura migração:** preservar os UUIDs originais (não regenerar) é a única forma de manter todos esses vínculos (FKs, Storage indireto via URL, auditoria, URLs de rota já compartilhadas/salvas por usuários) íntegros sem reescrever cada tabela dependente. Detalhado em `docs/DATA_MIGRATION.md`.

### 7.4 Triggers e funções PostgreSQL (verificado ao vivo)

| Função | `SECURITY DEFINER` | Uso |
|---|---|---|
| `handle_new_user()` | sim | Trigger `on_auth_user_created` em `auth.users` — cria a linha em `profiles` (role `viewer`, `approved` padrão `false` desde a migration 0006) a cada novo cadastro (e-mail/senha ou Google) |
| `current_role()` | sim | Usada em **toda** policy de RLS que restringe a admin/editor; desde a 0006, retorna `null` se `approved = false` |
| `audit_trigger()` | sim | Trigger genérico (`trg_audit`) anexado a 10 tabelas — grava 1 linha por campo alterado em `audit_log` |
| `set_updated_at()` | não | Trigger `BEFORE UPDATE` que atualiza `updated_at` — anexado em 6 tabelas (`electrical_panels`, `inspections`, `inspection_responses`, `nonconformities`, `actions`, `sap_orders`, `health_index_config`) |
| `set_panel_tag()` | não | Trigger `BEFORE INSERT` em `electrical_panels` — chama `next_panel_tag()` se `tag` vier nulo |
| `next_panel_tag(site)` | não | Gera a próxima tag no formato `PRT_QD_0001`/`OFC_QD_0001`, usando `pg_advisory_xact_lock` para evitar corrida entre cadastros simultâneos |
| `track_panel_location()` | sim | Trigger `BEFORE UPDATE` em `electrical_panels` — grava snapshot em `panel_location_history` quando lat/long/coordenada/hierarquia mudam |

**Dependência específica do PostgreSQL/Supabase** (não portável automaticamente para Azure SQL, por exemplo): `pg_advisory_xact_lock` (lock consultivo transacional), `gen_random_uuid()`/`pgcrypto`, `SECURITY DEFINER` + `search_path` fixo (padrão de segurança específico do Postgres), a view com `security_invoker = on`, e o próprio modelo de trigger em PL/pgSQL. Uma futura migração para Azure SQL precisaria reescrever geração de TAG, auditoria e histórico de localização em T-SQL (ou mover essa lógica para uma camada de aplicação/serviço — o que aliás é uma boa razão adicional para os Sprints 2–3).

### 7.5 Achado: colunas legadas em `inspections`

A tabela `inspections` ainda tem as colunas originais do schema pré-Fase 0 (`estado_geral_involucro`, `fechamento_portas_selos`, `limpeza_interna_externa`, `ausencia_umidade_poeira`, `identificacao_circuitos`, `conexoes_superaquecimento`, `dispositivos_dr_dps`, `fiacao_cabos`, `sinalizacao_seguranca`, `termografia_resultado`, `diagrama_atualizado`). O código atual (`api/inspections.js`, função `createInspection`) **não grava mais nelas** — o checklist modular (`inspection_template_items` + `inspection_responses`) as substituiu. Ficam como colunas mortas/vestigiais. Não é urgente remover agora (fora do escopo deste sprint — nenhuma alteração de schema foi feita), mas é um candidato natural para uma limpeza de schema controlada em sprint futuro, com uma migration própria e aprovação explícita.

### 7.6 RLS — padrão de permissões por tabela (verificado ao vivo)

Padrão dominante em quase todas as tabelas de domínio:

- **SELECT**: `to authenticated using (true)` — **qualquer usuário autenticado lê tudo**, independente de role. Isso vale mesmo para `viewer` e (como documentado na migration 0006) mesmo para um usuário `approved = false`, já que a policy de SELECT não passa por `current_role()`.
- **INSERT/UPDATE/DELETE**: exigem `current_role() in ('admin','editor')` (a maioria) ou só `'admin'` (config, templates, localidades/locais/sublocais, exclusão de quadros/inspeções).

Exceções ao padrão:

| Tabela | Particularidade |
|---|---|
| `profiles` | SELECT: só a própria linha, **ou** todas se admin. UPDATE: só admin, e nunca a própria linha (evita auto-bloqueio/auto-rebaixamento). Sem policy de DELETE nem INSERT (linha é criada só via trigger `handle_new_user`, que roda como `SECURITY DEFINER` e ignora RLS). |
| `audit_log` | SELECT: só admin. Sem policy de INSERT/UPDATE/DELETE — gravado só pelo trigger `SECURITY DEFINER`. |
| `panel_location_history` | SELECT: qualquer autenticado. Sem policy de escrita — gravado só pelo trigger. |
| `panel_condition_history` | SELECT: qualquer autenticado. INSERT: admin/editor (chamado por `recomputeInspectionAnalysis`, não por trigger). |
| `v_actions` | Sem RLS própria — `security_invoker = on` faz a view herdar as policies de `actions`. |

A relação usuário → permissão é: `auth.users` (Supabase Auth) --1:1--> `profiles` (`role`, `approved`) --lida por--> `current_role()` --usada em--> policies de RLS de todas as outras tabelas. `useUserRole()` no frontend é só um espelho de conveniência do mesmo `role`/`approved` já carregado pelo `AuthContext` — a decisão de segurança real está sempre no banco.

### 7.7 Migrations (resumo do que cada uma fez)

| Arquivo | Resumo |
|---|---|
| `0001_phase0_data_model.sql` | Modelo de dados principal: `audit_log` + trigger genérico, hierarquia `localidades/locais/sublocais`, colunas novas em `electrical_panels`, histórico de localização/condição, **tabelas SAP** (`sap_import_batches`, `sap_orders`), sistema de checklist modular (`inspection_templates`, `inspection_template_items`, colunas novas em `inspections`, `inspection_responses`), `measurements`, `thermography_points`, `nonconformities`, `actions` (+ view `v_actions`), `analysis_flags`, `health_index_config`, e anexação do trigger de auditoria a 10 tabelas. Semente: template "Checklist Padrão BT" v1 com ~24 itens iniciais. |
| `0002_phase1_import_inventory.sql` | Importa o inventário oficial: 2 localidades, 99 locais, 176 sublocais, **313 quadros** (`electrical_panels`) com `tag`, `site`, `criticality`, `sap_functional_location`/`sap_equipment_number` e hierarquia de localização já vinculada. Também substitui o gerador de tag antigo (baseado em `sequence`) pelo atual, baseado em `pg_advisory_xact_lock` + `max(regexp)`. |
| `0003_phase3_checklist_catalog.sql` | Expande o catálogo de checklist: acrescenta ~33 itens novos (só insere os que ainda não existem por `codigo`) nos módulos já existentes (Identificação, Segurança, Integridade física, Proteções, Barramentos, Cabos, Aterramento, Documentação). |
| `0004_checklist_adjustments.sql` | Ajuste fino do catálogo: reformula o texto de 2 itens (`SEG-06`, `BAR-06`), torna `CAB-08` obrigatório, e **desativa** (`ativo=false`, soft-delete) 12 itens — preserva respostas históricas já gravadas, que guardam `titulo`/`modulo` desnormalizados. |
| `0005_inspection_signature.sql` | Adiciona `inspections.assinatura_url` (assinatura do inspetor capturada em canvas). |
| `0006_user_approval.sql` | Adiciona `profiles.approved` (default `false`), aprova retroativamente todos os usuários já existentes, e redefine `current_role()` para retornar `null` quando `approved = false` — fecha a lacuna de um usuário pendente conseguir insert/update/delete via API direta. |

Todas as migrations são aditivas e idempotentes (`if not exists`, soft-delete em vez de `DROP`/`DELETE`), consistente com a regra do projeto de nunca perder dado histórico.

---

## 8. Mapa de arquivos e dependências (Sprint 1C)

### 8.1 Quem acessa o quê (visão condensada)

```
Autenticação (supabase.auth direto)
  AuthContext.jsx, Login.jsx, Register.jsx, ForgotPassword.jsx, ResetPassword.jsx

Banco de dados — via src/api/*  (padrão desejável, maioria dos casos)
  entities.js, inspections.js, nc.js, analysis.js, dashboard.js, spatial.js, audit.js
     ↑ consumidos por 16 páginas via useQuery/useMutation (React Query)

Banco de dados — direto na página (⚠️ exceção ao padrão)
  AppLayout.jsx (contagem de pendentes), PanelDetail.jsx (sap_orders, inspections),
  UserManagement.jsx (profiles: list/update role/update approved)

Storage — via src/lib/storage.js (padrão já correto)
  InspectionForm.jsx, InventoryForm.jsx

Regra de negócio pura (sem Supabase) — bons candidatos a "domain" já prontos
  lib/healthIndex.js, lib/adherence.js

Regra de negócio + Supabase misturados — candidatos a "service" (Sprint 2) e
depois "domain" isolado (Sprint 6)
  api/inspections.js (createInspection), api/analysis.js (recomputeInspectionAnalysis),
  api/dashboard.js (fetchDashboardData)

Componentes de apresentação pura — já desacoplados, não tocar
  components/panels/*, components/ui/*
```

### 8.2 Dependência de entidades por página (visão rápida)

| Página | Entidades/tabelas principais |
|---|---|
| `Dashboard.jsx` | `electrical_panels`, `nonconformities`, `v_actions`, `inspections`, `sap_orders` (via `dashboard.js`) |
| `MapPage.jsx` | `electrical_panels`, `nonconformities`, `analysis_flags` (via `spatial.js`) |
| `InventoryList/Form.jsx` | `electrical_panels`, hierarquia (`localidades/locais/sublocais`) |
| `InspectionList/Form/Detail.jsx` | `inspections`, `inspection_template_items`, `inspection_responses`, `measurements`, `thermography_points`, `nonconformities` (geradas automaticamente), `analysis_flags` |
| `NonconformityList/Detail.jsx` | `nonconformities`, `actions` (via `v_actions`) |
| `ActionList.jsx` | `v_actions` |
| `PanelDetail.jsx` | `electrical_panels`, `inspections`, `sap_orders` (direto), `nonconformities` (resumo) |
| `HealthConfig.jsx` | `health_index_config` |
| `AuditLog.jsx` | `audit_log`, `panel_location_history`, `panel_condition_history` |
| `UserManagement.jsx` | `profiles` |
| `ExecutiveReport.jsx` | reaproveita `dashboard.js` |
| `QRCodePage.jsx` | `electrical_panels` (lista para gerar QR) |

---

## 9. Código relacionado à Importação SAP (legado, candidato à remoção — Sprint 9)

**Importante:** as *páginas* de importação SAP (`SapImportList`, `SapImportWizard`, `SapBatchDetail`, `src/api/sap.js`, `src/lib/sapImport.js`, rota `/importacao-sap`, item de menu) **já foram removidas** em um commit anterior a este sprint (`dfe32e6 — Remove SAP import page`, já no `main` antes da tag `v1.0.0-mvp`). O que resta hoje é a **base de dados já importada** e alguns pontos de leitura que a consomem — é isso que fica marcado como legado abaixo.

| Item | Tipo | Uso atual | Ação recomendada (só no Sprint 9, com autorização) |
|---|---|---|---|
| `sap_import_batches` | Tabela | Nenhuma tela grava mais nela (wizard removido); só aparece no filtro de `AuditLog` (`AUDITED_TABLES`) para consultar histórico antigo | Candidata a remoção, mas só depois de decidir se o histórico de auditoria dessas linhas deve ser preservado ou arquivado |
| `sap_orders` | Tabela | **Compartilhada** — ver linha abaixo | Não remover sem antes resolver a dependência compartilhada |
| `src/api/dashboard.js` (`fetchDashboardData`) | Código | Lê `sap_orders` para calcular **"Aderência ao Plano"** (`panelAdherence`) exibido na Torre de Controle | ⚠️ **Dependência compartilhada real** — se `sap_orders` for esvaziado/removido, este card do painel executivo passa a mostrar 0%/vazio. Decidir explicitamente o que fazer com essa métrica antes de remover a tabela. |
| `src/api/inspections.js` (`ordersForPanel`) | Código | Lê `sap_orders` filtradas por `panel_id` — usada para relacionar uma inspeção a uma ordem de manutenção planejada | Mesma dependência — verificar quem chama `ordersForPanel` antes de remover |
| `src/pages/PanelDetail.jsx` | Código | `supabase.from("sap_orders")` direto, para mostrar ordens do quadro | Mesma dependência |
| `electrical_panels.sap_functional_location` / `sap_equipment_number` | Colunas | Preenchidas no import de 313 quadros (migration 0002); hoje só leitura/exibição, se ainda exibidas em alguma tela | Verificar uso em tela antes de remover a coluna |
| `nonconformities.sap_order_id`, `inspections.sap_order_id` | Colunas (FK) | Vínculo opcional entre NC/inspeção e uma ordem SAP | `ON DELETE SET NULL` já configurado — remover `sap_orders` não quebra essas tabelas, só zera o vínculo |
| `AUDITED_TABLES` em `src/api/audit.js` | Código | 2 entradas de rótulo ("Lotes SAP", "Ordens SAP") no filtro da tela de Auditoria | Remover as 2 entradas junto com as tabelas, se decidido remover |

**Nenhuma abstração nova foi criada para este código** (conforme instruído) e nenhuma refatoração foi feita nele. O plano de remoção detalhado (Sprint 9) precisará, no mínimo, decidir o destino da métrica "Aderência ao Plano" antes de tocar em `sap_orders`.

---

## 10. Arquitetura proposta (alvo — não implementada neste sprint)

```
React (componentes/páginas)
        │  não conhece Supabase, só chama services
        ▼
services/          (Sprint 2)
  panelService, inspectionService, ncService, actionService,
  dashboardService, userService, auditService, healthConfigService
        │
        ▼
domain/            (Sprint 6 — regras extraídas de dentro dos services/api atuais)
  healthIndex.js e adherence.js já são pura e migram quase sem mudança;
  regras hoje dentro de createInspection/recomputeInspectionAnalysis são
  extraídas para funções puras testáveis (ex.: decidir quais respostas geram NC,
  decidir se uma inspeção é "a mais recente" do quadro)
        │
        ▼
repositories/      (Sprint 3)
  um repository por tabela/agregado, escondendo `supabase.from(...)`
        │
        ▼
Supabase (Postgres, mesma implementação de hoje — sem mudança)

auth/              (Sprint 4) — authService.* substitui supabase.auth.* espalhado
storage/           (Sprint 5) — formaliza storage.upload/getUrl/delete a partir do storage.js atual
```

Estrutura de pastas proposta (a implementar gradualmente, sprint a sprint — **não criar tudo de uma vez**):

```
src/
├── components/     (mantém — já desacoplado)
├── pages/          (mantém — passa a chamar services em vez de api/ direto)
├── hooks/          (mantém)
├── services/       (novo — Sprint 2)
├── domain/         (novo — Sprint 6)
├── repositories/   (novo — Sprint 3)
├── auth/           (novo — Sprint 4, encapsula src/lib/AuthContext.jsx + Supabase Auth)
├── storage/         (novo — Sprint 5, evolução de src/lib/storage.js)
├── api/            (tende a esvaziar à medida que services/repositories assumem)
└── lib/            (fica só com utilitários realmente genéricos: query-client, utils, healthIndex/adherence migram para domain/)
```

A Importação SAP **não** aparece nesta arquitetura alvo — nenhum `sapService`/`sapRepository` deve ser criado nos próximos sprints.

---

## 11. Limitação conhecida, não resolvida neste sprint

As policies de `SELECT` da maioria das tabelas usam `using (true)` para qualquer usuário `authenticated`, **sem** passar por `current_role()`. Isso significa que um usuário com `approved = false` (tela de "solicitação pendente") já é bloqueado de **escrever** qualquer coisa (migration 0006), mas ainda conseguiria **ler** dados via chamada direta à API caso contornasse a tela do app. Isso é um comportamento pré-existente do modelo de permissões (não introduzido por este sprint) e está documentado aqui para uma decisão futura do Sprint 7 (Segurança e Banco) — não foi alterado agora.

---

## 12. Deploy e ambiente (contexto, sem alteração)

- **GitHub Pages** (único ambiente de produção): workflow `.github/workflows/deploy-pages.yml`, dispara só em push para `main` (não roda nesta branch). Usa `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` como *Actions variables* (não secrets) — intencional, pois são valores públicos por natureza no client-side.
- **Variáveis de ambiente**: só `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (`.env.local.example`), ambas seguras para o bundle do cliente.
- **Scripts disponíveis**: `npm run lint` (ESLint), `npm run typecheck` (`tsc -p jsconfig.json`, checkJs sobre `src/pages/**/*.jsx` e `src/components/**/*.js`), `npm run build` (Vite).

---

## 13. Próximos passos

Este documento cobre exclusivamente o **Sprint 1**. Nenhum código, schema, RLS, Auth ou Storage foi alterado. Os Sprints 2–10 descritos no plano de refatoração (service layer, repository layer, auth, storage, domínio, segurança, portabilidade, remoção do SAP, documentação de migração corporativa) **aguardam autorização explícita**, um de cada vez.
