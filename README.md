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

**Deploy**

O app está publicado em dois lugares, ambos com deploy automático a cada push na branch `main`:

- **Netlify** — https://gestao-quadros-eletricos.netlify.app (config de build no próprio painel Netlify; SPA fallback em `public/_redirects`)
- **GitHub Pages** — https://riandersoncorrea.github.io/gestao-quadros-eletricos/ (workflow em `.github/workflows/deploy-pages.yml`; usa as GitHub Actions *variables* `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`)

O Pages serve o app num subcaminho (`/gestao-quadros-eletricos/`); o `base` do Vite só muda quando `GITHUB_PAGES=true`, então o Netlify (na raiz) não é afetado.

Ao adicionar um novo domínio de deploy, lembre de cadastrá-lo em **Supabase → Authentication → URL Configuration → Redirect URLs** e em **Google Cloud → OAuth Client → Origens JavaScript autorizadas**.
