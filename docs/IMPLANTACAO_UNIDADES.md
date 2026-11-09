# Implantação — unidades operacionais (São Luís, EFC) e segurança por unidade

Branch `feature/efc-inventario`. Nada deste roteiro foi executado no Supabase.

## Arquivos e ordem de execução

| # | Arquivo | O que faz | Depende de |
|---|---|---|---|
| 0016 | `supabase/migrations/0016_unidades_operacionais.sql` | Reconstituição do que **já está** em produção (não executar) | — |
| 0028 | `supabase/migrations/0028_efc_estrutura.sql` | `usa_site` por unidade; localidade → unidade + sigla (sem default); `site` obrigatório só onde a unidade usa site | 0016 |
| 0029 | `supabase/migrations/0029_seguranca_por_unidade.sql` | RLS por unidade (policies **restritivas**, aditivas), aprovação obrigatória, `profile_unidades`, `acesso_todas_unidades`, `permite_escrita` (EFC = false), unidade herdada nos registros filhos, proteção contra autoatribuição | 0028 |
| 0030 | `supabase/migrations/0030_qr_publico_consulta_individual.sql` | `get_public_panel(id)` no lugar da view enumerável; anon sem privilégios de tabela | 0029 e **frontend novo no ar** |
| 0031 | `supabase/private/0031_efc_inventario.sql` (**fora do repositório**) | Importação dos 202 quadros da EFC (gerada) — **se recusa a rodar sem 0029/0030**. **Aplicada em produção em 2026-11-09.** | 0028–0030 + validação |

A 0031 contém o inventário real da EFC (TAGs, prédios, locais) e **não é versionada**, porque o repositório é público:
fica em `supabase/private/` (ignorado pelo git), com cópia guardada pelo responsável pelo sistema. Para recriá-la, rode
`scripts/inventory-import/generate-inventory-sql.mjs` com a planilha de origem. O `scripts/db-local/run.sh` pula a
importação quando o arquivo não existe.

Rollback: `supabase/rollback/0029_*.rollback.sql`, `supabase/rollback/0030_*.rollback.sql` (testados no banco local).
A 0027 (`feature/nc-status-segue-acoes`) é independente: testada antes, depois e sem as novas migrations.

## Sequência recomendada

1. **Antes de tudo (SQL Editor, só leitura):** `supabase/tests/slz_fingerprint.sql` → guardar o resultado.
2. **0028** → rodar `supabase/tests/0028_efc_estrutura.test.sql` (BEGIN/ROLLBACK).
3. **0029** → ler o NOTICE (registros sem quadro que ficaram com unidade NULL) → rodar
   `supabase/tests/0029_seguranca_por_unidade.test.sql`.
   - Conferir a lista de usuários: admins viraram administradores gerais; aprovados não-admin receberam São Luís;
     pendentes não receberam nada.
   - Decidir a classificação dos registros NULL (consulta abaixo).
4. **Deploy do frontend** desta branch (funciona com e sem a 0030; com a 0029 passa a ler o acesso por unidade).
5. **0030** → rodar `supabase/tests/0030_qr_publico.test.sql` → abrir um QR real sem login.
6. **Validação no app real (obrigatória antes da 0031):** login com admin geral, com um viewer e com uma conta pendente;
   chamada direta à API com uma conta pendente (deve voltar vazio); tela Usuários → atribuição de unidade.
7. **0031** → `supabase/tests/0031_efc_inventario.check.sql` → `supabase/tests/0031_isolamento_pos_importacao.test.sql`
   → `slz_fingerprint.sql` de novo (idêntico ao passo 1).
8. Conferência visual: EFC com 202 quadros/9 cidades em modo consulta; São Luís inalterado.

Registros sem quadro pendentes de classificação (após a 0029):

```sql
select 'nonconformities' t, id, descricao from public.nonconformities where unidade_operacional_id is null
union all select 'actions', id, descricao from public.actions where unidade_operacional_id is null
union all select 'sap_orders', id, ordem from public.sap_orders where unidade_operacional_id is null;
-- Classificar só após conferência humana, ex.:
-- update public.sap_orders set unidade_operacional_id = (select id from public.unidades_operacionais where codigo = 'SLZ') where id = '...';
```

## Usuários × unidades

- **Administrador geral** = `role = 'admin'` + `acesso_todas_unidades = true`. Único que atribui unidades,
  concede acesso global, promove/rebaixa administradores e altera a configuração das unidades.
- **Administrador local** = `role = 'admin'` com unidades em `profile_unidades`.
- **Demais perfis** = unidades em `profile_unidades`; o perfil (editor/viewer/inspetor) continua definindo o que podem fazer.
- **Conta pendente** = nenhum dado, nem pela API. Aprovar **e** atribuir a unidade (tela Usuários → "Unidades…").
- Unidade somente leitura: `unidades_operacionais.permite_escrita = false` (EFC nesta etapa). Para liberar a EFC numa
  etapa futura: `update public.unidades_operacionais set permite_escrita = true where codigo = 'EFC';` — sem código.
- Nova unidade: `insert into public.unidades_operacionais (codigo, nome) values (...)` + localidades com
  `unidade_operacional_id` + atribuição aos usuários. Nenhuma regra nova.

## O que foi testado e onde

| Verificação | Onde | Situação |
|---|---|---|
| Migrations 0028–0031 aplicam sem erro, idempotência da 0031 | Postgres 18 **local e descartável**, schema reconstruído das migrations do repositório | ✅ executado |
| RLS: admin geral, admin local, viewer, editor por unidade, pendente, sem unidade, anon, 3ª unidade | idem (`0029_*.test.sql`, BEGIN/ROLLBACK) | ✅ executado |
| Testes de mutação (cada proteção removida → teste acusa) | idem | ✅ executado |
| QR individual, view fechada, sem enumeração | idem (`0030_*.test.sql`) | ✅ executado |
| Importação bloqueada sem 0029/0030 | idem | ✅ executado |
| Impressão digital de São Luís idêntica antes/depois | idem | ✅ executado |
| Rollback 0029/0030 devolve as 52 policies originais | idem | ✅ executado |
| Frontend (regras, serviços, fallbacks pré/pós-0029/0030) | `npm test` (sem banco) | ✅ executado |
| **Tudo acima no Supabase real** | SQL Editor | ❌ **não executado** — depende de autorização |

Diferenças possíveis entre o banco local e o Supabase: a 0021 não existe no repositório (policies extras desconhecidas
continuam valendo, mas a abordagem restritiva é combinada com AND, então não abre acesso); privilégios padrão
criados por `supabase_admin` não são alterados pela 0030; Storage (bucket `uploads` público) fora do escopo.
