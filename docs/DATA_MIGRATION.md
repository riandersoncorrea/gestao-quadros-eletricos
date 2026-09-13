# Plano de Migração Corporativa — Gestão de Quadros Elétricos

> Gerado no **Sprint 1** e expandido no **Sprint 10** da refatoração arquitetural, na branch `refactor/arquitetura-corporativa`. Substitui e amplia a versão preliminar do Sprint 1.
>
> **Este documento é um plano, não uma execução.** Nenhuma migração de dados foi feita, nenhum schema foi alterado, nenhum banco corporativo foi criado, nenhuma infraestrutura Azure foi provisionada, o Supabase Auth/Storage não foi tocado. O destino final (PostgreSQL corporativo, Azure SQL, Microsoft Entra ID, Azure Blob Storage ou outra tecnologia) **não é decidido aqui** — cabe à TI corporativa, com base neste documento e nos critérios reais do ambiente homologado.
>
> Para o levantamento técnico detalhado (tabelas, colunas, triggers, RLS) que fundamenta este plano, ver `docs/ARCHITECTURE.md` §7 e `docs/SECURITY_REVIEW.md` — este documento não repete esse levantamento coluna a coluna, referencia onde necessário.

---

## 1. Arquitetura atual

```
React (componentes/páginas)
        │
        ▼
Services (src/services/)       ← orquestração + regra de negócio (parte)
        │
        ▼
Repositories (src/repositories/) ← único lugar que fala supabase.from(...)
        │
        ▼
Supabase (PostgREST + RLS)
        │
        ▼
PostgreSQL (gerenciado pelo Supabase)

Auth: React → src/auth/authService.js → supabase.auth
Storage: React → src/storage/storageService.js → supabase.storage
Domínio: src/domain/ (funções puras, sem Supabase, chamadas pelos services)
```

Ponto central para entender o resto deste documento: **hoje não existe um backend próprio**. `services/` e `repositories/` são código JavaScript que roda **no navegador do usuário**, dentro do bundle da SPA. Isso só é seguro porque o Supabase expõe uma API REST (PostgREST) diretamente ao cliente e usa **Row Level Security (RLS)** no próprio Postgres para decidir o que cada usuário autenticado pode ler/escrever — o "backend" de autorização é o banco de dados em si (ver `docs/SECURITY_REVIEW.md`).

Detalhamento completo (16 arquivos de acoplamento, regras de negócio por domínio, etc.) em `docs/ARCHITECTURE.md` §2–§10.

---

## 2. Arquitetura futura desejada

```
Frontend (React/Vite — pode continuar quase inalterado)
        │  chamadas HTTP autenticadas (hoje: chamadas diretas ao Supabase)
        ▼
API / Backend  (NOVA CAMADA — não existe hoje)
        │
        ▼
Services / Domain  (regra de negócio — já existe, já é portável)
        │
        ▼
Repositories  (acesso a dados — já existe, precisa trocar a implementação)
        │
        ▼
Banco corporativo (PostgreSQL corporativo, Azure SQL, ou outro — a definir)
```

### Por que precisa de uma camada de API/Backend nova

Esta é a diferença estrutural mais importante entre a arquitetura de hoje e a futura, e vale deixar explícita: **um banco corporativo tipicamente não pode ser exposto com segurança direto ao navegador**, do jeito que o Supabase faz via PostgREST + RLS. Bancos corporativos (Azure SQL, Postgres interno) normalmente vivem dentro da rede corporativa, sem uma API pública com autorização por linha embutida. Isso significa que, ao trocar o Supabase, a aplicação passa a precisar de um **servidor de aplicação real** entre o navegador e o banco — algo que hoje não existe neste projeto.

**O que isso muda, camada por camada, e o que os Sprints 2–6 já deixaram pronto para essa mudança:**

| Camada | Hoje (roda no navegador) | Futuro (roda no servidor) | Esforço estimado |
|---|---|---|---|
| `src/domain/` | Funções puras, zero dependência de Supabase ou de navegador | **Praticamente inalterado** — só precisa ser movido/reempacotado para rodar em Node.js (ou outra runtime do backend escolhido) | Baixo — é a camada mais barata de migrar, por construção (Sprint 6) |
| `src/services/` | Orquestra repositories + domain, chama `supabase.auth.getUser()` para carimbar `created_by` | A lógica de orquestração é a mesma; troca só a fonte do "usuário atual" (hoje: `authService`; futuro: identidade validada pelo backend a partir do token) | Baixo–médio |
| `src/repositories/` | Cada função chama `supabase.from(tabela)...` | **Única camada que precisa ser reescrita de fato** — troca `supabase-js` por um driver do banco corporativo (ex.: `pg` para Postgres, Entity Framework/Dapper para Azure SQL). A *assinatura* de cada função (`list()`, `create()`, `update()`...) pode continuar igual — só o corpo muda | Médio–alto — é o "coração" do trabalho de migração de banco |
| `src/auth/` | Fala com `supabase.auth` | Vira um cliente do backend (ex.: MSAL para Entra ID) + validação de token no backend | Médio |
| `src/storage/` | Fala com `supabase.storage` | Vira um cliente do backend (ou SDK direto do novo provedor, ex.: Azure Blob SDK) | Baixo–médio |
| Autorização (RLS) | No banco (Postgres RLS) | Precisa de um lar novo — no backend (middleware por rota) e/ou nativa do banco escolhido (ver §3.7) | Médio–alto — é uma decisão de arquitetura, não só de código |

Esse quadro é a razão prática pela qual os Sprints 2 (services), 3 (repositories) e 6 (domain) desta refatoração não foram "só organização" — eles reduzem a migração futura de "reescrever o app inteiro" para "reescrever a camada de repositories e criar um backend por cima do que já existe".

---

## 3. Migração futura do banco de dados

### 3.1 Origem e possíveis destinos

```
Supabase (BaaS gerenciado)
        │
        ▼
PostgreSQL (versão gerenciada pelo Supabase)
```

Destinos possíveis, sem preferência técnica declarada aqui — decisão da TI:
- **PostgreSQL corporativo** — menor atrito de tipos/sintaxe (mesma família de banco).
- **Azure SQL** — exigiria tradução de dialeto e tipos.
- Outra tecnologia homologada pela TI.

### 3.2 Schema e estrutura

O schema completo (20 tabelas + 1 view) está documentado tabela a tabela em `docs/ARCHITECTURE.md` §7.1. Características que atravessam qualquer destino:
- Todas as tabelas de domínio têm RLS habilitado hoje (ver §3.7 sobre o que isso vira no destino).
- Não há particionamento, nem tabelas muito grandes (a maior é `audit_log`, que cresce 1 linha por campo alterado — ver §3.8).
- Uso moderado de `jsonb` (`sap_import_batches.column_mapping`, `sap_orders.raw_row`) — precisa de equivalente no destino se este não for Postgres.

### 3.3 Tabelas

Lista completa com finalidade, chaves e colunas em `docs/ARCHITECTURE.md` §7.1. Resumo por domínio (o que permanece — Importação SAP já não tem código ativo, ver `docs/SAP_REMOVAL_PLAN.md`):

```
Identidade:        profiles
Hierarquia:        localidades → locais → sublocais
Inventário:        electrical_panels (+ histórico: panel_location_history, panel_condition_history)
Checklist:         inspection_templates → inspection_template_items
                   inspections → inspection_responses, measurements, thermography_points
Não conformidade:  nonconformities → actions (+ view v_actions)
Análise:           analysis_flags, health_index_config
Auditoria:         audit_log
Legado (preservar, ver SAP_REMOVAL_PLAN.md): sap_import_batches, sap_orders
```

### 3.4 Chaves primárias e estrangeiras

Mapa completo (32 FKs) em `docs/ARCHITECTURE.md` §7.2. Ponto relevante para a migração: **todas** as FKs hoje têm `ON DELETE CASCADE` ou `ON DELETE SET NULL` explícitos — nenhuma é `NO ACTION`/`RESTRICT` implícita. Um banco corporativo precisa recriar esse mesmo comportamento explicitamente; não é o padrão em todo SGBD (ex.: SQL Server exige sintaxe própria e tem restrições sobre cascatas múltiplas que podem exigir redesenho de algumas FKs).

### 3.5 UUIDs e identificadores

Todas as chaves primárias são `uuid` via `gen_random_uuid()` (extensão `pgcrypto`). **Nenhuma tabela usa PK inteira/serial.** Ver §6 para a diretriz completa de preservação de IDs — é a seção mais crítica deste documento, porque determina se os relacionamentos, o histórico e os QR Codes já impressos continuam válidos após a migração.

### 3.6 Triggers e funções

Mapa completo em `docs/ARCHITECTURE.md` §7.4. Nenhuma dessas é portável automaticamente — são PL/pgSQL específico do Postgres:

| Função/trigger | O que faz | Equivalente no destino |
|---|---|---|
| `next_panel_tag()` + `set_panel_tag()` | Gera TAG sequencial por site (`PRT_QD_0001`) com `pg_advisory_xact_lock` para evitar corrida | Se destino for Postgres: portável quase direto. Se for outro SGBD: precisa de mecanismo equivalente (sequence nativa + lock, ou mover a geração para o backend/service, o que aliás já é possível hoje — a lógica é isolável) |
| `track_panel_location()` | Grava snapshot em `panel_location_history` a cada mudança de localização | Pode virar trigger nativo do destino, **ou** virar uma responsabilidade explícita do backend/service (mais portável, mais fácil de testar) |
| `audit_trigger()` | Grava 1 linha por campo alterado em `audit_log`, em 10 tabelas | Mesma escolha: trigger nativo do destino, ou middleware do backend que audita toda mutação — ver §3.8 |
| `handle_new_user()` | Cria profile (`role='viewer'`, `approved=false`) a cada novo usuário do Supabase Auth | Deixa de fazer sentido como está — depende inteiramente da futura estratégia de identidade (ver §5) |
| `current_role()` | Função usada por toda policy de RLS para saber o papel do usuário autenticado | Só existe enquanto o modelo for "RLS no banco"; no modelo "autorização no backend" (mais provável fora do Supabase), essa lógica migra para middleware/claims do token |

**Recomendação a avaliar com a TI:** mover `track_panel_location` e `audit_trigger` para o backend (em vez de recriar como trigger no novo banco) tende a ser mais simples de manter e testar do que reescrever PL/pgSQL em outro dialeto — mas isso é uma escolha de arquitetura, não uma decisão técnica que cabe fechar aqui.

### 3.7 RLS/policies e seus equivalentes futuros

Hoje a autorização vive **inteiramente no banco** (Postgres RLS, ver `docs/SECURITY_REVIEW.md`). Sem o padrão Supabase (PostgREST + RLS + JWT), essa responsabilidade precisa de um novo lar. Duas famílias de opção, não mutuamente exclusivas:

1. **Autorização no backend (mais comum fora do Supabase):** o backend valida o token do usuário (ver §5), resolve o papel dele, e cada endpoint/service decide o que permitir — exatamente a mesma regra que hoje está em `current_role() in (...)`, só que em código de aplicação em vez de SQL. Vantagem: mais fácil de testar e depurar. Desvantagem: se um dia surgir outro cliente além do backend acessando o banco direto, a regra não protege mais nada sozinha.
2. **RLS nativa do banco de destino:** Azure SQL tem "Row-Level Security" próprio (predicados via função + `SECURITY POLICY`); Postgres corporativo teria RLS nativo, só sem o `auth.uid()` do Supabase — precisaria de uma função equivalente que leia a identidade a partir de uma claim de sessão configurada pelo backend. Vantagem: defesa em profundidade (protege mesmo que o backend tenha um bug). Desvantagem: mais complexo de manter, duplica a regra em dois lugares.

**Decisão que cabe à TI corporativa:** qual das duas (ou as duas) o padrão de segurança da Vale exige para bancos corporativos — isso normalmente já é uma política definida, não uma escolha deste projeto.

### 3.8 Histórico e auditoria

`audit_log` (auditoria genérica) e `panel_location_history`/`panel_condition_history` (histórico de domínio) precisam de uma decisão de migração própria:
- **Migrar tudo:** preserva rastreabilidade completa, mas `audit_log` pode ser grande (cresce por campo alterado, sem limite de retenção definido hoje).
- **Migrar uma janela recente + arquivar o resto:** mais leve, perde consulta direta ao histórico antigo (mas não precisa perder o dado — pode ir para armazenamento frio).
- Qualquer que seja a escolha, é decisão de negócio/compliance (quanto tempo de auditoria a Vale exige manter acessível), não uma decisão técnica deste projeto.

### 3.9 Estratégia de exportação/ETL

```
Supabase PostgreSQL
        │
        ▼
Exportação lógica (ex.: pg_dump --data-only, ou extração tabela a tabela via API/driver)
        │
        ▼
Transformação / validação (ver §3.10)
        │
        ▼
Carga no banco corporativo
```

Ordem sugerida de carga (respeita as FKs mapeadas em §3.4/`docs/ARCHITECTURE.md` §7.2): `localidades` → `locais` → `sublocais` → `profiles` (ver ressalva de identidade em §5) → `electrical_panels` → `inspection_templates` → `inspection_template_items` → `inspections` → (`inspection_responses`, `measurements`, `thermography_points`) → `nonconformities` → `actions` → `analysis_flags` → `health_index_config` → `sap_orders`/`sap_import_batches` (se ainda existirem, ver `docs/SAP_REMOVAL_PLAN.md`) → `panel_location_history`/`panel_condition_history` → `audit_log`.

### 3.10 Transformação e validação

- **Tipos:** `uuid`→`uniqueidentifier` (se Azure SQL), `jsonb`→JSON nativo (sem operadores `->`/`->>` do Postgres), `timestamptz`→`datetimeoffset`, `numeric` com `check` de faixa recriado manualmente.
- **Constraints:** todo `check` (ex.: `criticality in ('A','B','C','D')`, unidade de corrente de fuga só em A/mA/µA) precisa ser recriado explicitamente — não copia junto com o dado.
- **Validação de integridade referencial:** conferir, após a carga, que toda FK resolve (nenhum `panel_id` órfão, etc.) antes de liberar o ambiente novo.
- **Validação de regra de negócio:** rodar `computeOverall`/`healthIndex`/`panelAdherence` (já são funções puras, `src/domain/`) contra uma amostra dos dados migrados e comparar com o resultado já gravado no Supabase — se baterem, a migração preservou a semântica, não só os bytes.

### 3.11 Preservação dos relacionamentos

Ver §6 (mapa explícito de IDs) — é o mesmo tema, detalhado ali por ser o ponto mais crítico do plano.

### 3.12 Estratégia de coexistência

Se o corte não puder ser instantâneo, período de coexistência possível:
- **Somente leitura no Supabase, escrita já no novo banco** (com replicação/sync unidirecional) — reduz risco, mas exige um período de "congelamento" de escrita no sistema antigo.
- **Feature flag por módulo** — mais complexo de manter, só compensa se a migração for faseada por domínio (ex.: Inventário migra primeiro, Checklist depois).
- Não recomendamos decidir a estratégia agora — depende de uma janela de manutenção que só a TI/operação sabe negociar com os usuários do sistema.

### 3.13 Validação pós-migração

Checklist mínimo antes de considerar a migração bem-sucedida:
- Contagem de linhas por tabela bate entre origem e destino.
- Amostra de FKs resolve nos dois lados.
- Os três indicadores calculados (Índice de Saúde, Aderência ao Plano, contagem de NCs abertas) batem entre o dado antigo (Supabase) e o recém-migrado, para o mesmo conjunto de quadros.
- Login de teste com pelo menos um usuário de cada papel (admin/editor/viewer) funciona ponta a ponta no ambiente novo.
- Upload e leitura de ao menos um arquivo (evidência/diagrama) funciona no novo Storage.

### 3.14 Rollback

- Antes de qualquer corte de produção, ter um backup completo do Supabase (schema + dados) tirado imediatamente antes da migração.
- Enquanto durar o período de coexistência (§3.12), o Supabase permanece como fallback — não desligar nada até a validação pós-migração (§3.13) passar integralmente.
- Se o corte for direto (sem coexistência), definir previamente um critério de "ponto sem volta" e um plano B explícito caso a validação pós-migração falhe (ex.: religar o DNS/config para o Supabase enquanto se corrige o problema).

### 3.15 Estratégia de desligamento do Supabase

Só desligar Supabase (Auth + Database + Storage) quando **todos** os itens abaixo estiverem verdadeiros:
1. Dados validados no banco corporativo (§3.13).
2. Arquivos migrados e servindo do novo Storage (§4).
3. Autenticação migrada e testada para todos os papéis (§5).
4. Aplicação já rodando 100% contra a nova infraestrutura, sem nenhum código apontando para `supabaseClient` (uma busca por `@/lib/supabaseClient` no repositório deve retornar zero resultados fora dos próprios arquivos de infraestrutura antiga, que nesse ponto já teriam sido removidos).
5. Período de coexistência (se houve) encerrado sem incidentes por um tempo que a operação considere seguro.

---

## 4. Migração futura de arquivos (Storage)

```
Supabase Storage (bucket "uploads", público, arquivo nomeado por UUID aleatório)
        │
        ▼
Download de todos os objetos
        │
        ▼
Novo destino (ex.: Azure Blob Storage, ou outro homologado)
        │
        ▼
Atualização das colunas *_url em todas as tabelas afetadas
```

Pontos que já estão documentados em `docs/ARCHITECTURE.md` §6 e continuam valendo:
- O nome do arquivo no bucket **não é o mesmo UUID de nenhuma linha** — o vínculo é só a URL completa gravada nas colunas `diagram_url`, `photo_url`, `evidencia_url`, `imagem_url`, `imagem_termografica_url`, `assinatura_url`. Trocar de provedor exige **reescrever essas URLs em massa** nas tabelas, não só copiar arquivo por arquivo.
- O bucket é **público hoje** (decisão deliberada, documentada desde o `schema.sql` original) — decidir, junto com a TI, se essa mesma política (leitura sem autenticação) é aceitável no novo provedor, ou se o novo Storage deve exigir um token/URL assinada (mudança de comportamento, não só de infraestrutura).
- A abstração `src/storage/storageService.js` (Sprint 5) já isola 100% do código de app do provedor — trocar o provedor é trabalho só dentro desse arquivo (e do futuro backend, se o upload passar a ser mediado pelo servidor em vez de direto do navegador).

---

## 5. Autenticação futura

```
Supabase Auth (e-mail/senha + Google OAuth)
        │
        ▼
Futuro provedor corporativo (ex.: Microsoft Entra ID, ou outro homologado)
```

**Ponto que precisa estar explícito e não pode ser simplificado:** migrar autenticação **não é** copiar a tabela `profiles` para o novo sistema. São duas coisas fundamentalmente diferentes:

- `profiles` (`role`, `approved`) é **autorização de aplicação** — já vive numa tabela própria do domínio, desacoplada do provedor de auth (achado positivo já registrado em `docs/ARCHITECTURE.md` §5). Essa parte migra como qualquer outra tabela (§3).
- **Identidade** (quem é o usuário, como ele prova quem é, sua senha/segundo fator) é gerenciada inteiramente pelo Supabase Auth hoje, em `auth.users` — uma tabela interna do Supabase que **não faz parte do schema `public` migrado em §3** e não deveria ser tratada como tal.

Consequências práticas a decidir com a TI (não decidido aqui):
- **Senhas não migram.** Não existe forma de extrair a senha original de um usuário do Supabase Auth (fica em hash, corretamente). Um usuário migrado para Entra ID (ou outro IdP) precisa: (a) usar SSO corporativo já existente (mais provável e mais simples, se a Vale já usa Entra ID/Azure AD para outros sistemas), ou (b) passar por um fluxo de "defina sua nova senha" no primeiro acesso.
- **Provisionamento de identidade:** decidir se as ~9 contas hoje ativas são criadas manualmente no novo IdP, ou se há um processo de convite/sincronização automática a partir do diretório corporativo.
- **Mapeamento id-a-id:** `profiles.id` hoje É o mesmo UUID de `auth.users.id` (FK direta). No novo modelo, cada usuário migrado precisa de uma correspondência clara entre o UUID antigo (preservado em `profiles.id`, que outras tabelas referenciam via `created_by`/`updated_by`/`validated_by`) e o novo identificador que o Entra ID (ou outro IdP) atribuir. Essa correspondência deve ser registrada explicitamente durante a migração — sem ela, todo o histórico de "quem criou/validou o quê" (`created_by` em 8+ tabelas) perde a referência.
- **Login social (Google OAuth):** hoje existe como opção de login. Precisa de decisão: mantém login social no novo IdP, ou passa a ser só SSO corporativo.
- **Papel do Entra ID nas 3 roles do sistema (admin/editor/viewer):** decidir se os papéis continuam vivendo em `profiles` (mais simples, já é assim hoje) ou se passam a ser grupos/roles do próprio Entra ID (mais alinhado a um ambiente corporativo maduro, mas exige mapear grupo→papel).

**Nada disso foi decidido ou implementado.** Fica registrado aqui porque é o tipo de decisão que precisa da política de identidade da Vale, não de uma escolha de engenharia deste projeto.

---

## 6. Mapa explícito de preservação de IDs

Diretriz central: **preservar os UUIDs originais é o que mantém os 32 relacionamentos (FKs), o histórico/auditoria e as referências já em uso fora do banco (URLs de rota, QR Codes impressos) íntegros sem reescrever cada tabela dependente.**

| Dado | Onde o ID é usado fora da própria tabela | O que quebra se o ID mudar |
|---|---|---|
| `electrical_panels.id` | 10 FKs diretas (§3.4); rota `/quadro/:id`; **QR Code impresso fisicamente em cada um dos 313 quadros** (`QRCodePage.jsx`, `PanelDetail.jsx`) | QR Codes já afixados fisicamente nos quadros elétricos ficariam **inválidos** — precisariam ser reimpressos e reafixados um a um |
| `inspections.id` | FK em `inspection_responses`, `measurements`, `thermography_points`, `nonconformities`, `analysis_flags`; rota `/inspecoes/:id` | Histórico de checklist perde a referência às suas próprias respostas/medições |
| `nonconformities.id` | FK em `actions` (cascade); rota `/nao-conformidades/:id` | Ações corretivas ficam órfãs |
| `profiles.id` (= `auth.users.id` hoje) | `created_by`/`updated_by`/`validated_by`/`imported_by`/`linked_by`/`changed_by` em 8+ tabelas; `audit_log.usuario_id` | Toda a trilha de "quem fez o quê" no sistema perde a referência — **é o caso mais sensível**, tratado em detalhe no §5 |
| `localidades.id`, `locais.id`, `sublocais.id` | FK em `electrical_panels` e nas duas tabelas de histórico de localização | Hierarquia de localização de todos os 313 quadros perde a referência |
| `audit_log.registro_id` | Não é FK formal (referência solta, por design), mas aponta para o `id` de qualquer uma das 10 tabelas auditadas | Se os IDs mudarem, cada linha de auditoria antiga vira ilegível (não resolve mais para nenhuma linha existente) |

**Onde preservar o ID não for tecnicamente possível** (ex.: colisão estatisticamente improvável, ou o novo banco exige outro formato de chave), a diretriz é manter uma **tabela de correspondência** (`id_antigo → id_novo`) durante e depois da transição, para permitir corrigir referências, reimprimir QR Codes afetados, e não perder a trilha de auditoria.

---

## 7. Riscos, dependências e pontos que precisam de decisão da TI corporativa

| # | Item | Tipo | Depende de |
|---|---|---|---|
| 1 | Qual banco corporativo (Postgres vs. Azure SQL vs. outro) | Decisão de infraestrutura | TI/arquitetura corporativa |
| 2 | Autorização: no backend, nativa do banco, ou as duas (§3.7) | Decisão de arquitetura + política de segurança | TI/segurança da informação |
| 3 | Retenção de auditoria/histórico (§3.8) | Decisão de negócio/compliance | Área de compliance/operação |
| 4 | Estratégia de coexistência e janela de corte (§3.12) | Decisão operacional | TI + operação (usuários do sistema) |
| 5 | Provedor de identidade (Entra ID vs. outro) e modelo de provisionamento (§5) | Decisão de infraestrutura de identidade | TI/segurança da informação |
| 6 | Papéis do app como grupos do IdP vs. tabela própria (§5) | Decisão de arquitetura de identidade | TI + este projeto, em conjunto |
| 7 | Storage: bucket público equivalente ou URLs assinadas (§4) | Decisão de segurança | TI/segurança da informação |
| 8 | Tecnologia do backend novo (Node.js, ASP.NET Core, outro) | Decisão técnica, mas influenciada por padrão corporativo | TI (padrões homologados) + este projeto |
| 9 | Reimpressão de QR Codes se algum ID de quadro não puder ser preservado | Risco operacional (custo/tempo de campo) | Só existe se o item 1 não permitir preservar UUIDs |
| 10 | Migração de senhas/segundo fator | Risco de experiência do usuário | Inerente a qualquer troca de IdP — mitigar com SSO corporativo, se disponível |

---

## 8. Decisão técnica atual vs. decisão que depende da homologação da Vale

| Já decidido/feito por este projeto (Sprints 1–9) | Depende da TI/homologação corporativa |
|---|---|
| Separação em `domain/` (puro), `services/` (orquestração), `repositories/` (acesso a dados) — pronta para uma futura troca de banco | **Qual banco** vai ser usado |
| Abstrações `authService`/`storageService` isolando 100% do app do Supabase Auth/Storage | **Qual IdP** (Entra ID ou outro) e **qual Storage** (Azure Blob ou outro) |
| `profiles` (papel/autorização) já desacoplado de `auth.users` (identidade) | Como o **provisionamento de identidade** vai funcionar (SSO, convite, sincronização de diretório) |
| Mapa completo de tabelas, FKs, triggers, RLS (`docs/ARCHITECTURE.md`, `docs/SECURITY_REVIEW.md`) | **Onde a autorização vai morar** no novo modelo (backend, RLS nativo, os dois) |
| Diretriz de preservação de IDs (§6) e por que ela importa (QR Codes, auditoria) | **Se a preservação de UUID é tecnicamente possível** no banco de destino escolhido |
| Identificação de que uma camada de API/Backend nova é necessária (§2) | **Qual tecnologia de backend** é padrão homologado pela Vale |
| SAP: inventário completo do que é exclusivo de importação vs. dado operacional (`docs/SAP_REMOVAL_PLAN.md`) | Nenhuma — já é decisão fechada deste projeto, não da TI |
| Estratégia conceitual de ETL, validação e rollback (§3.9–§3.14) | **Janela de manutenção**, tolerância a downtime, e política de retenção de backup |

---

## 9. Critérios de sucesso da migração (quando ela for de fato executada)

- Aplicação funcionando 100% contra o banco/Auth/Storage novos, sem nenhuma dependência residual do Supabase.
- Todos os 32 relacionamentos (FKs) íntegros no destino.
- Os três indicadores de negócio (Índice de Saúde, Aderência ao Plano, NCs abertas) batendo entre origem e destino para os mesmos quadros.
- QR Codes já impressos continuam resolvendo para o quadro correto (ou plano de reimpressão executado, se não foi possível preservar o ID).
- Trilha de auditoria (`audit_log`) preservada e resolvendo para os `usuario_id`/`registro_id` corretos.
- Todos os usuários atuais (9 hoje) conseguem logar no novo provedor de identidade com o papel correto.

---

## 10. Referências

- `docs/ARCHITECTURE.md` — arquitetura atual detalhada, mapa completo de tabelas/FKs/triggers/RLS, arquitetura alvo intermediária (services/repositories/domain, já implementada nos Sprints 2–6).
- `docs/SECURITY_REVIEW.md` — RLS, policies, gaps de segurança conhecidos (leitura aberta em algumas tabelas, Storage sem checagem de papel).
- `docs/SAP_REMOVAL_PLAN.md` — o que do legado SAP é exclusivo de importação vs. dado operacional preservado.

Este documento cobre exclusivamente o **Sprint 10**. Nenhum código, schema, RLS, Auth, Storage ou infraestrutura foi alterado. Não há merge para `main` previsto neste sprint — a revisão conjunta das 10 sprints acontece antes de qualquer merge, por decisão explícita já combinada.
