# Mapa Preliminar de Migração de Dados — Gestão de Quadros Elétricos

> Gerado no **Sprint 1B** da refatoração arquitetural, na branch `refactor/arquitetura-corporativa`.
> Este documento é um **mapa preliminar**, não um plano de execução. Nenhuma migração de dados foi feita, nenhum schema foi alterado, nenhum banco corporativo foi criado. O destino final (PostgreSQL corporativo, Azure SQL ou outra tecnologia) **não é uma decisão tomada aqui** — cabe à área de TI, com base neste mapa e nos critérios reais do ambiente corporativo.
>
> Para o detalhamento completo de tabelas, colunas, FKs, triggers, funções e RLS, ver `docs/ARCHITECTURE.md` (§7) — este documento não repete esse levantamento, só referencia o que é relevante para uma futura migração.

---

## 1. Origem atual

```
Aplicação (React/Vite)
        │
        ▼
Supabase (BaaS gerenciado)
        │
        ▼
PostgreSQL (versão gerenciada pelo Supabase)
```

Características relevantes da origem:
- Acesso ao Postgres é **sempre via Supabase** (REST/PostgREST + supabase-js), nunca conexão direta `psql`/driver a partir do frontend.
- Toda regra de autorização está em **RLS** (Row Level Security), não em uma camada de aplicação própria — ver `docs/ARCHITECTURE.md` §7.6.
- Arquivos (evidências, diagramas, assinaturas, fotos) ficam no **Supabase Storage**, bucket único `uploads`, público, nomes por UUID aleatório (não é o UUID de nenhuma linha de tabela).
- Autenticação é **Supabase Auth** (e-mail/senha + Google OAuth), com uma tabela própria `public.profiles` guardando `role`/`approved` — a autorização já não depende de metadados do provedor de auth (ver `docs/ARCHITECTURE.md` §5).

---

## 2. Possíveis destinos futuros (não decidido)

Citados apenas como possibilidades arquiteturais a avaliar pela TI, nesta ordem de menção do briefing original — sem preferência técnica declarada aqui:

- **PostgreSQL corporativo** (self-hosted ou gerenciado) — caminho de menor atrito de tipos/sintaxe, já que a origem também é Postgres.
- **Azure SQL** — exigiria tradução de dialeto (T-SQL), tipos (`uuid` → `uniqueidentifier`, `jsonb` → tipo JSON do SQL Server, `timestamptz` → `datetimeoffset`), e reescrita de toda a lógica hoje em PL/pgSQL (triggers, `SECURITY DEFINER`, `pg_advisory_xact_lock`).
- **Outra tecnologia homologada pela TI**, a definir.

Nenhuma dessas opções é tratada como definitiva.

---

## 3. Mapa entidade → entidade

| Entidade (negócio) | Tabela atual | Chave primária | Dependências (FK) | Observação |
|---|---|---|---|---|
| Perfil de usuário | `profiles` | `id uuid` (= `auth.users.id`) | `id` → `auth.users.id` | Não migra sozinha — depende de como o futuro provedor de identidade (ex.: Entra ID) representa usuários |
| Localidade | `localidades` | `id uuid` | — | Hierarquia nível 1 (2 registros: Porto, Oficina) |
| Local (prédio) | `locais` | `id uuid` | `localidade_id` → `localidades.id` | Hierarquia nível 2 (99 registros) |
| Sublocal (sala/área) | `sublocais` | `id uuid` | `local_id` → `locais.id` | Hierarquia nível 3 (176 registros) |
| Quadro elétrico | `electrical_panels` | `id uuid` | `localidade_id`/`local_id`/`sublocal_id` → hierarquia; `created_by` → `auth.users` | Entidade central — 313 registros; `tag` é único e usado como identificador de negócio (além do `id`) |
| Histórico de localização | `panel_location_history` | `id uuid` | `panel_id` → `electrical_panels.id` (cascade) | Só gravado por trigger, nunca pela aplicação diretamente |
| Histórico de condição | `panel_condition_history` | `id uuid` | `panel_id` → `electrical_panels.id` (cascade) | Série temporal — importante preservar ordem cronológica (`snapshot_at`) |
| Lote de importação SAP | `sap_import_batches` | `id uuid` | — | Legado (ver `docs/ARCHITECTURE.md` §9) |
| Ordem SAP | `sap_orders` | `id uuid` | `batch_id` → `sap_import_batches.id`; `panel_id` → `electrical_panels.id` | Legado, mas **compartilhado** com o card "Aderência ao Plano" do dashboard — não migrar/descartar sem decidir o destino dessa métrica |
| Template de checklist | `inspection_templates` | `id uuid` | — | 1 template ativo hoje ("Checklist Padrão BT" v1) |
| Item de checklist | `inspection_template_items` | `id uuid` | `template_id` → `inspection_templates.id` (cascade) | Itens desativados ficam com `ativo=false` (soft-delete) — preservar esse estado na migração |
| Inspeção | `inspections` | `id uuid` | `panel_id` (not null, cascade), `panel_ref_id`, `template_id`, `sap_order_id` → respectivas tabelas | Contém colunas legadas não usadas pelo código atual (ver `docs/ARCHITECTURE.md` §7.5) — decidir se migram ou são descartadas |
| Resposta de checklist | `inspection_responses` | `id uuid` | `inspection_id` (cascade), `template_item_id` (set null) | Guarda `titulo`/`modulo` desnormalizados — não depende só da FK para fazer sentido histórico |
| Medição | `measurements` | `id uuid` | `inspection_id` (cascade), `panel_id` (set null) | `constraint` de unidade (corrente de fuga só em A/mA/µA) precisa de equivalente no destino |
| Termografia | `thermography_points` | `id uuid` | `inspection_id` (cascade), `panel_id` (set null) | — |
| Não conformidade | `nonconformities` | `id uuid` | `panel_id`, `inspection_id`, `sap_order_id`, `template_item_id` (todas set null, exceto a origem) | — |
| Ação corretiva | `actions` | `id uuid` | `nonconformity_id` (cascade) | Coluna derivada `atrasada` vem da view `v_actions`, não da tabela — recalcular no destino, não migrar como coluna |
| Flag de análise | `analysis_flags` | `id uuid` | `inspection_id` (cascade), `panel_id` (set null) | Resultado de regra de negócio (`analysisFlags()`), reprocessável a partir de `inspection_responses`/`measurements`/`thermography_points` se necessário |
| Config. Índice de Saúde | `health_index_config` | `id uuid` | — | 8 linhas fixas (pesos por dimensão) |
| Log de auditoria | `audit_log` | `id uuid` | referências soltas (`registro_id`, sem FK formal) | Maior tabela em volume potencial (1 linha por campo alterado); avaliar se migra tudo ou só uma janela recente |

---

## 4. Riscos de migração

| Risco | Detalhe | Tabelas/áreas mais afetadas |
|---|---|---|
| **Diferenças de tipo entre Postgres e Azure SQL** | `uuid` ↔ `uniqueidentifier`, `jsonb` ↔ JSON nativo do SQL Server (sem operadores `->`/`->>`), `timestamptz` ↔ `datetimeoffset`, `numeric` com `check` de faixa | `sap_orders.raw_row` (jsonb), `sap_import_batches.column_mapping` (jsonb), todas as `timestamptz` |
| **Geração de UUID** | `gen_random_uuid()` é do Postgres (`pgcrypto`); Azure SQL usa `NEWID()`/`NEWSEQUENTIALID()` com formato diferente de representação | Todas as PKs |
| **Funções e triggers em PL/pgSQL** | `next_panel_tag()`, `set_panel_tag()`, `track_panel_location()`, `audit_trigger()`, `handle_new_user()`, `current_role()`, `set_updated_at()` — nenhuma é portável automaticamente | Ver `docs/ARCHITECTURE.md` §7.4 — teriam que ser reescritas em T-SQL ou movidas para a aplicação (reforça o valor dos Sprints 2/3/6) |
| **`pg_advisory_xact_lock`** | Lock consultivo transacional específico do Postgres, usado para gerar TAGs sem corrida entre cadastros simultâneos | `next_panel_tag()` — precisa de um mecanismo equivalente (ex.: sequence nativa do destino, ou lock a nível de aplicação) |
| **Sequences** | Não há `sequence` em uso hoje (a versão antiga foi descontinuada na migration 0002 em favor do cálculo por `max()` + lock) | — |
| **Constraints com `check`** | Várias (`criticality in (...)`, `severidade in (...)`, unidade de corrente de fuga, `health_index between 0 and 100`) — sintaxe de `CHECK` é similar entre os dois bancos, mas precisa ser recriada manualmente | Praticamente todas as tabelas de domínio |
| **RLS (Row Level Security)** | Recurso nativo do Postgres; Azure SQL tem "Row-Level Security" próprio, com sintaxe e modelo (predicados via função + `SECURITY POLICY`) bem diferentes | Todas as 20 tabelas — reescrever toda a política de acesso, não só copiar |
| **Policies dependentes de `auth.uid()`** | `auth.uid()` é uma função do Supabase Auth (JWT do request); sem Supabase, não existe mais — a fonte de identidade do usuário autenticado muda de mecanismo | Toda função `current_role()` e a maioria das policies |
| **Índices** | Índices simples (`btree`) em FKs e colunas de filtro — portam bem; nenhum índice especial (ex.: GIN/GiST) foi encontrado | — |
| **Storage** | Bucket público do Supabase Storage vira `https://…supabase.co/storage/v1/object/public/uploads/<uuid>.<ext>` — URLs completas estão gravadas nas colunas (`diagram_url`, `photo_url`, `evidencia_url`, `imagem_url`, `assinatura_url`). Trocar de storage exige **reescrever essas URLs em massa**, não só copiar arquivo por arquivo | Toda tabela com coluna `*_url` |
| **Autenticação** | `auth.users` (Supabase) não se copia para Entra ID — é preciso uma estratégia de provisionamento de identidade (ex.: convite/sincronização), e decidir o que acontece com senhas (não migram; usuários precisariam redefinir, ou usar SSO) | `profiles` (mapeamento id-a-id com o novo provedor) |
| **Consultas específicas do Postgres** | Uso de `.or()`, agregação client-side via `Promise.all` de múltiplas queries (não é SQL específico, mas o padrão de "várias queries + agregação no JS" é comum em `dashboard.js`, `analysis.js`) — não é um risco de portabilidade de **schema**, mas de **reescrita de código** ao trocar o client de acesso a dados | `api/dashboard.js`, `api/analysis.js`, `api/spatial.js` |
| **View `v_actions`** | Depende de `security_invoker = on` (recurso relativamente recente do Postgres) para herdar RLS de `actions` | Precisa de equivalente explícito no destino (view + política própria) |
| **Volume de auditoria** | `audit_log` cresce 1 linha por campo alterado, sem limite/retenção definida hoje | Avaliar estratégia de arquivamento antes de migrar tudo |

---

## 5. Estratégia conceitual futura (não é plano de execução)

```
Supabase PostgreSQL
        │
        ▼
Exportação / ETL       (ex.: pg_dump lógico, ou extração tabela a tabela via API)
        │
        ▼
Transformação / validação   (tipos, constraints, regeneração de triggers como
        │                     lógica de aplicação onde fizer sentido — Sprints 2/3/6
        │                     preparam exatamente esse terreno)
        ▼
Banco corporativo (PostgreSQL corporativo, Azure SQL, ou outro — a definir)
```

Em paralelo, tratado **separadamente**:

```
Supabase Storage (bucket "uploads")
        │
        ▼
Migração de arquivos           (baixar todos os objetos, resolver nomes)
        │
        ▼
Azure Blob Storage (ou outro destino)
        │
        ▼
Atualização das colunas *_url em todas as tabelas afetadas
```

A ordem relativa (dados primeiro, arquivos depois, ou em paralelo com URLs temporárias) é uma decisão de projeto para quando a migração for de fato planejada — não antecipada aqui.

---

## 6. IDs — diretriz de preservação

Diretriz arquitetural (não implementação):

```
Quadro                         Quadro (pós-migração, idealmente)
ID = <uuid original>                  ID = <mesmo uuid>
        │                                     │
        ▼                                     ▼
Inspeção                       Inspeção
panel_id = <uuid original>            panel_id = <mesmo uuid>
```

Por quê isso importa concretamente neste projeto (não é só um princípio genérico):

- **32 relacionamentos por FK** (ver `docs/ARCHITECTURE.md` §7.2) dependem do UUID ser o mesmo dos dois lados.
- **Auditoria e histórico** (`audit_log.registro_id`, `panel_location_history`, `panel_condition_history`) referenciam o UUID diretamente — regenerar IDs torna esse histórico órfão/ilegível.
- **URLs já compartilhadas** (rotas como `/quadro/:id`, QR Codes gerados para os 313 quadros — ver `QRCodePage.jsx`) usam o UUID do quadro. QR Codes já impressos/afixados fisicamente nos quadros elétricos ficariam inválidos se o ID mudasse.
- **`tag`** (ex. `OFC_QD_0140`) é único e legível, mas **não é a chave primária** — não substitui a necessidade de preservar o `id` uuid.

Onde preservar o ID original não for tecnicamente possível (ex.: colisão de UUID entre ambientes, o que é estatisticamente improvável mas não impossível), a diretriz é manter uma tabela de correspondência (`id_antigo → id_novo`) durante o período de transição, para poder corrigir referências e reimprimir QR Codes afetados.

---

## 7. Papel deste documento

Este é um **mapa**, para uma equipe de TI avaliar viabilidade e esforço — não uma instrução de execução. Qualquer migração real de dados deverá, quando chegar a hora:

1. Ser tratada em sprint próprio, com plano detalhado e aprovação explícita (mesmo padrão usado neste projeto para toda alteração de schema).
2. Ser precedida por um ambiente de teste/homologação com uma cópia dos dados.
3. Ter estratégia de rollback definida antes de qualquer corte de produção.
4. Considerar um período de coexistência (Supabase + banco corporativo) se o corte não puder ser instantâneo.
5. Definir critérios claros de "quando desligar o Supabase" (dados validados, Storage migrado, Auth substituído e testado, aplicação já rodando 100% na nova infraestrutura).

A Importação SAP **não** faz parte desta estratégia futura — os dados de `sap_orders`/`sap_import_batches` só aparecem aqui porque já existem hoje e um deles (`sap_orders`) tem uma dependência ativa (card "Aderência ao Plano"); a decisão sobre migrar, arquivar ou descartar esses dados deve ser tomada junto com o Sprint 9 (remoção do módulo SAP), não como parte do planejamento de migração corporativa.
