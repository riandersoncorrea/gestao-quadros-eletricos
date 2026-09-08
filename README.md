**Gestão de Quadros Elétricos**

Aplicação React (Vite) para inventário e inspeção de quadros elétricos, com backend em [Supabase](https://supabase.com) (banco de dados, autenticação e storage de arquivos).

**Configuração**

1. Instale as dependências: `npm install`
2. Crie um projeto no Supabase e rode o script `supabase/schema.sql` no SQL Editor do projeto (cria as tabelas, RLS e o bucket de uploads).
3. Crie um arquivo `.env.local` na raiz com:

```
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anon_public
```

Esses dois valores ficam em Project Settings → API no painel do Supabase.

4. Rode a aplicação: `npm run dev`

Veja `supabase/README.md` para os passos de configuração de autenticação (Google OAuth, template de e-mail de confirmação) necessários no painel do Supabase.
