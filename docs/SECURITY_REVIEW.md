# Revisão de Segurança e Banco — Gestão de Quadros Elétricos

> Gerado no **Sprint 7** da refatoração arquitetural, na branch `refactor/arquitetura-corporativa`.
> Verificado ao vivo contra o Postgres de produção em 2026-09-13. Nenhuma migration rodou entre o Sprint 1 e este sprint, então o schema/RLS/triggers/funções documentados aqui são idênticos aos de `docs/ARCHITECTURE.md` §7 — este documento **não repete** esse levantamento, foca no que é relevante para uma revisão de segurança: o que está de fato protegido no banco, o que só está protegido na aplicação, e os gaps encontrados.
>
> **Nenhuma alteração foi feita no banco.** Onde há uma lacuna real, ela está descrita com uma proposta de migration para sua avaliação — nada foi executado.

---

## 1. Resumo executivo

A regra geral do sistema é: **RLS decide quem pode escrever; a aplicação decide quem pode ver o quê na tela.** Isso funciona bem para os fluxos normais do app, mas tem duas consequências que vale ter claras:

1. **Leitura (`SELECT`) é aberta a qualquer usuário autenticado em 18 das 20 tabelas** — inclusive nas que a interface esconde de determinados perfis (ex.: Editor não vê a tela de Não Conformidades, mas conseguiria ler `nonconformities` via uma chamada direta à API). Só `audit_log` e `profiles` são protegidas por papel/identidade no próprio banco.
2. **O Storage (`uploads`) permite upload/alteração/exclusão de arquivo para qualquer usuário autenticado**, incluindo alguém com cadastro ainda **pendente de aprovação** — porque as policies de Storage não passam pela função `current_role()` que a migration 0006 corrigiu para as tabelas.

Nenhum dos dois pontos é uma falha crítica hoje (é tudo dado interno da empresa, atrás de login; o pior cenário é um usuário autenticado ver ou alterar mais do que a tela dele mostraria) — mas são exatamente o tipo de coisa que vale fechar antes de tratar este sistema como "produto corporativo", e por isso ficam registrados aqui para você decidir.

---

## 2. O que está protegido pelo banco (RLS) vs. só pela aplicação

| Camada | O que garante | Onde |
|---|---|---|
| **Banco (RLS)** | Que só `admin`/`editor` conseguem **inserir/atualizar/excluir** nas tabelas de domínio (quadros, inspeções, NCs, ações, checklist, config) | `current_role() in ('admin','editor')` ou `= 'admin'` em cada policy `INSERT`/`UPDATE`/`DELETE`/`ALL` — ver `docs/ARCHITECTURE.md` §7.6 |
| **Banco (RLS)** | Que um usuário com `approved = false` não consegue **escrever** nada, mesmo chamando a API direto | `current_role()` retorna `null` se `approved = false` (migration 0006) |
| **Banco (RLS)** | Que só admin lê o log de auditoria; que cada usuário só lê o próprio perfil (exceto admin, que lê todos) | Únicas duas tabelas com `SELECT` restrito: `audit_log`, `profiles` |
| **Banco (trigger)** | Que todo usuário novo nasce com `role='viewer'` e `approved=false`, nunca com um papel mais alto por engano | `handle_new_user()`, roda como `SECURITY DEFINER`, ignora qualquer coisa que o cliente tente mandar |
| **Aplicação (React Router)** | Quais páginas cada papel enxerga no menu e consegue navegar (`RoleRoute`, `NAV_ITEMS`) | `src/App.jsx`, `src/components/layout/AppLayout.jsx` |
| **Aplicação (`ProtectedRoute`)** | Que um usuário `approved = false` só vê a tela de "solicitação pendente", nunca o app | `src/components/ProtectedRoute.jsx` |
| **Aplicação apenas — sem equivalente no banco** | Que **Editor não vê** Painel, Não Conformidades, Ações e Relatório Executivo (mas o RLS de leitura dessas tabelas é aberto a qualquer autenticado) | `RoleRoute allow={['admin','viewer']}` em `App.jsx` — ver §3 |
| **Aplicação apenas — sem equivalente no banco** | Que só admin acessa Índice de Saúde (config), QR Codes, Auditoria (tela) — a *tela* de auditoria é admin-only, mas o dado de `audit_log` já é protegido também no banco | idem |

---

## 3. Gap concreto: leitura aberta em tabelas que a interface restringe por papel

Nenhuma tabela abaixo tem `SELECT` restrito por `current_role()` — todas usam `using (true)` para qualquer usuário `authenticated`, verificado ao vivo:

```
actions, analysis_flags, electrical_panels, health_index_config, inspection_responses,
inspection_template_items, inspection_templates, inspections, locais, localidades,
measurements, nonconformities, panel_condition_history, panel_location_history,
sap_import_batches, sap_orders, sublocais, thermography_points
```

Das rotas que a UI restringe por `RoleRoute`, o impacto real é:

| Rota restrita a admin/viewer (Editor não vê) | Tabela(s) por trás | RLS de leitura hoje | Editor consegue ler via API direta? |
|---|---|---|---|
| `/` (Painel) | `electrical_panels`, `nonconformities`, `v_actions`, `inspections`, `sap_orders` | todas `using(true)` | **Sim** |
| `/nao-conformidades`, `/nao-conformidades/:id` | `nonconformities` | `using(true)` | **Sim** |
| `/acoes` | `v_actions` (view sobre `actions`) | `using(true)` | **Sim** |
| `/relatorio` | mesmas do Painel | `using(true)` | **Sim** |
| `/config/indice-saude` (admin-only) | `health_index_config` | `using(true)` | **Sim** (mas tela nem existe pra Editor) |
| `/auditoria` (admin-only) | `audit_log` | **`current_role() = 'admin'`** | **Não** — este já é protegido de verdade |
| `/usuarios` (admin-only) | `profiles` | **própria linha, ou admin vê todas** | **Não** — já é protegido de verdade |
| `/qrcode` (admin-only) | `electrical_panels` | `using(true)` | Sim, mas é o mesmo dado que Editor já vê legitimamente em outras telas — não é exposição de dado novo |

**Leitura correta desse quadro:** o RLS já protege bem os dois casos mais sensíveis (auditoria e dados de outros usuários). O que falta é estender a mesma lógica de `current_role()` — já usada nas policies de escrita — também às policies de leitura de `nonconformities`, `actions`/`v_actions` e `health_index_config`, para que a regra "Editor não acessa isso" valha também por API direta, não só pela tela.

### Proposta de migration (apresentada para decisão — **não aplicada**)

Se você quiser fechar esse gap, o ajuste seria trocar `using (true)` por `using (current_role() in ('admin','viewer'))` nas policies de `SELECT` de `nonconformities`, `actions` e `health_index_config` — aditivo, só mais restritivo, não quebra nenhuma tela atual (elas já não são acessadas por Editor). Rascunho conceitual:

```sql
drop policy if exists "Autenticados leem NCs" on public.nonconformities;
create policy "Admin e viewer leem NCs" on public.nonconformities
  for select to authenticated using (current_role() in ('admin', 'viewer'));

drop policy if exists "Autenticados leem ações" on public.actions;
create policy "Admin e viewer leem ações" on public.actions
  for select to authenticated using (current_role() in ('admin', 'viewer'));

drop policy if exists "Autenticados leem pesos do Health Index" on public.health_index_config;
create policy "Admins leem pesos do Health Index" on public.health_index_config
  for select to authenticated using (current_role() = 'admin');
```

⚠️ Pontos a considerar antes de decidir se quer isso:
- `nonconformities`/`actions` também são lidas indiretamente por `healthIndexService.recomputeInspectionAnalysis` (roda no contexto do usuário logado, que ao criar uma inspeção normalmente é admin/editor — precisa confirmar que Editor, que **cria** inspeções e portanto dispara esse recálculo, ainda consegue **ler** o suficiente de `nonconformities`/`actions` para o recálculo funcionar; hoje Editor tem RLS de escrita nessas tabelas, então restringir a leitura só a admin/viewer bloquearia esse recálculo quando quem inspeciona é um Editor).
- Isso é exatamente o tipo de coisa que precisa ser testado com cuidado antes de aplicar — por isso trago como proposta, não como algo já pronto para rodar.

**Não apliquei nada disso.** Se quiser seguir, me diga e eu preparo a migration formal (com `begin;...rollback;` para validar primeiro, como sempre) e testo o fluxo de Editor criando inspeção antes de aplicar de verdade.

---

## 4. Gap concreto: Storage não verifica aprovação nem papel

```
Authenticated users can upload files    INSERT  {authenticated}  bucket_id = 'uploads'
Authenticated users can update uploads  UPDATE  {authenticated}  bucket_id = 'uploads'
Authenticated users can delete uploads  DELETE  {authenticated}  bucket_id = 'uploads'
```

Nenhuma das três passa por `current_role()`. Isso significa:
- Um usuário com `approved = false` (tela de "solicitação pendente") **consegue** enviar, sobrescrever ou apagar arquivos no bucket `uploads` via chamada direta à API, mesmo sem conseguir usar nenhuma tela do app.
- Um `viewer` (que na aplicação nunca vê um botão de upload) também tecnicamente consegue, pelo mesmo motivo.

Leitura (`SELECT`) do bucket já é público por design (documentado desde o `schema.sql` original — URLs de evidência/diagrama são acessíveis sem login, decisão deliberada para simplificar a exibição de imagens). Isso não muda aqui.

### Proposta de migration (apresentada para decisão — **não aplicada**)

```sql
drop policy if exists "Authenticated users can upload files" on storage.objects;
create policy "Editores e admins fazem upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'uploads' and current_role() in ('admin','editor'));

drop policy if exists "Authenticated users can update their uploads" on storage.objects;
create policy "Editores e admins atualizam uploads" on storage.objects
  for update to authenticated using (bucket_id = 'uploads' and current_role() in ('admin','editor'));

drop policy if exists "Authenticated users can delete uploads" on storage.objects;
create policy "Admins apagam uploads" on storage.objects
  for delete to authenticated using (bucket_id = 'uploads' and current_role() = 'admin');
```

(Mantive delete como admin-only, espelhando o padrão já usado em `electrical_panels`/`inspections` — ajustável se preferir liberar para editor também.) Mesma regra: **não apliquei**, só deixo pronto para sua decisão.

---

## 5. Funções e triggers de segurança (reconfirmado ao vivo, sem mudança)

| Função | `SECURITY DEFINER` | Papel na segurança |
|---|---|---|
| `current_role()` | sim | Fonte única de verdade para toda policy de escrita; retorna `null` se o usuário não estiver aprovado — fecha a escrita para pendentes |
| `handle_new_user()` | sim | Cria o profile do novo usuário com `role='viewer'`, `approved=false` — o cliente nunca escolhe o próprio papel |
| `audit_trigger()` | sim | Grava histórico de alteração em 10 tabelas; só é gravável por trigger, nunca por chamada direta do app |

Nenhuma dessas foi alterada por este sprint. `search_path` fixo em todas (`set search_path = public`) — protege contra um ataque clássico de RLS bypass via schema shadowing.

---

## 6. Estruturas relacionadas à Importação SAP (candidatas à remoção — Sprint 9)

Revisão final antes do sprint de remoção, do ponto de vista de segurança/banco (a listagem completa de código já está em `docs/ARCHITECTURE.md` §9 — aqui só o que é específico de banco/RLS):

| Estrutura | RLS hoje | Observação para a remoção |
|---|---|---|
| `sap_import_batches` | `SELECT` aberto a autenticado; `ALL` para admin/editor | Sem gravação nova desde que o wizard foi removido; RLS pode ser removida junto com a tabela |
| `sap_orders` | idem | **Não remover isoladamente** — `sap_orders.panel_id`/`sap_order_id` têm FK com `ON DELETE SET NULL` em `inspections`/`nonconformities`, e o card "Aderência ao Plano" do dashboard (`dashboardService.getSapOrdersRaw`) depende desses dados — ver `docs/ARCHITECTURE.md` §9 para o plano completo |
| Trigger `trg_audit` em ambas | — | Cai automaticamente com a tabela; não precisa de ação separada |
| Rótulos "Lotes SAP"/"Ordens SAP" em `AUDITED_TABLES` (`auditService.js`) | — | Já é código de aplicação, não de banco; listado aqui só para não esquecer no Sprint 9 |

Nenhuma alteração feita agora — a decisão de remover (e o que fazer com "Aderência ao Plano") é do Sprint 9.

---

## 7. O que já está bem — não mexer

- Toda tabela de domínio tem RLS **habilitado** (nenhuma tabela pública sem RLS).
- Toda escrita (insert/update/delete) já é corretamente restrita por papel via `current_role()`, incluindo o fechamento para usuários pendentes (migration 0006).
- `profiles` e `audit_log` — os dois dados mais sensíveis do sistema (identidade e trilha de auditoria) — já são protegidos corretamente também no banco, não só na tela.
- Nenhum segredo (chave de service role, senha, token) está no frontend — só `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, que são seguros por design para ficar no bundle do cliente.
- `SECURITY DEFINER` com `search_path` fixo em todas as funções sensíveis — padrão correto, evita a classe mais comum de bug de escalação de privilégio no Postgres.

---

## 8. Resumo para decisão

Duas propostas de migration ficaram registradas acima (§3 e §4), nenhuma aplicada:

1. Restringir `SELECT` de `nonconformities`/`actions`/`health_index_config` a `admin`/`viewer` (com a ressalva sobre o recálculo de Índice de Saúde disparado por Editor, a testar antes).
2. Restringir upload/update/delete no Storage a `admin`/`editor` aprovados.

Me diga se quer que eu prepare e valide (com `begin;...rollback;`, como sempre) alguma das duas — ou as duas — antes de aplicar. Até lá, nada muda no banco.

---

## 9. Próximos passos

Este documento cobre exclusivamente o **Sprint 7**. Nenhum código, schema, RLS, Storage ou Auth foi alterado. Sprints 8–10 (portabilidade/deploy, remoção do SAP, documentação de migração corporativa) aguardam autorização explícita, um de cada vez.
