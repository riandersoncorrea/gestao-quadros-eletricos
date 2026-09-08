# Configuração do Supabase

Passos para deixar o backend funcionando depois de criar o projeto no Supabase.

## 1. Rodar o schema

Abra **SQL Editor** no painel do projeto e cole o conteúdo de `supabase/schema.sql`, depois clique em Run. Isso cria:

- tabelas `electrical_panels` e `inspections` (com RLS: leitura para qualquer usuário logado, escrita para editor/admin, exclusão só para admin)
- tabela `profiles` (guarda o `role` de cada usuário — criada automaticamente para todo novo usuário, com `role = 'viewer'` por padrão)
- geração automática da Tag do quadro (ex: `POR_QUADRO_0001`) direto no banco
- bucket de Storage `uploads` (público para leitura) para fotos e diagramas

## 2. Variáveis de ambiente do app

Em **Project Settings → API**, copie:

- `Project URL` → `VITE_SUPABASE_URL`
- `anon public` key → `VITE_SUPABASE_ANON_KEY`

Coloque as duas em `.env.local` na raiz do projeto (veja `README.md`).

## 3. Promover o primeiro usuário a admin

Todo novo cadastro entra como `viewer`. Depois de criar sua conta pelo app, rode no SQL Editor:

```sql
update public.profiles set role = 'admin' where email = 'seu@email.com';
```

## 4. Confirmação de e-mail no cadastro

Feito ✅ — desativamos **Confirm email** em Authentication → Sign In / Providers → Supabase Auth. Como é um sistema interno, o cadastro já entra logado na hora, sem precisar clicar em link ou digitar código.

(O motivo: editar o template de e-mail para mostrar um código OTP exige configurar SMTP customizado no plano gratuito do Supabase, o que seria complicação desnecessária aqui. Se um dia quiser reativar a confirmação por e-mail, é o mesmo toggle — mas aí o cadastro passa a exigir clicar num link de confirmação antes do primeiro login.)

## 5. Login com Google (opcional)

Em **Authentication → Providers → Google**:

1. Ative o provider e informe o Client ID / Client Secret de um OAuth Client criado no Google Cloud Console.
2. No Google Cloud Console, adicione como "Authorized redirect URI":
   `https://SEU_PROJETO.supabase.co/auth/v1/callback`

Se não configurar isso, o botão "Continuar com Google" simplesmente não funciona — login por e-mail/senha continua funcionando normalmente.

## 6. URLs de redirecionamento

Em **Authentication → URL Configuration**:

- **Site URL**: a URL principal do app em produção (ou `http://localhost:5173` em dev)
- **Redirect URLs**: adicione `http://localhost:5173/**` (dev) e a URL de produção equivalente — necessário para o link de "esqueci minha senha" (`/reset-password`) e o retorno do login Google funcionarem.
