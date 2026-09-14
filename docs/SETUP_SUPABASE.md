# Ligar o app a um banco (Supabase)

O All Big Chef guarda tudo numa conta sua no Supabase. É o que permite abrir as
mesmas receitas no celular e no computador, e é o que garante que perder o
aparelho não significa perder o caderno de receitas.

Leva uns dez minutos, uma vez só. O plano grátis dá conta com folga.

---

## 1. Criar o projeto

1. Entre em [supabase.com](https://supabase.com) e crie uma conta.
2. **New project**. Dê um nome (`all-big-chef` serve), escolha uma senha forte
   para o banco e a região mais próxima de você (South America / São Paulo).
3. Espere o projeto subir. Leva um ou dois minutos.

## 2. Criar as tabelas

1. No menu da esquerda, **SQL Editor** → **New query**.
2. Abra o arquivo [`supabase/schema.sql`](../supabase/schema.sql) deste repositório
   e copie **o conteúdo inteiro**.
3. Cole no editor e clique em **Run**.

No fim aparece uma tabelinha de conferência. Todas as dez linhas devem mostrar
`ok` em `tabela_existe`, `true` em `rls_ligado` e `4` em `politicas`. Se alguma
vier diferente, rode de novo — o script foi feito para poder ser reaplicado
quantas vezes for preciso, sem apagar nada.

## 3. Pegar as chaves

**Project Settings** (a engrenagem) → **Data API**. Você precisa de dois valores:

| Onde aparece | Para que serve |
|---|---|
| **Project URL** | `VITE_SUPABASE_URL` |
| **anon public** | `VITE_SUPABASE_ANON_KEY` |

A anon key é pública por desenho — ela vai dentro do JavaScript do app e qualquer
pessoa que abrir o site consegue lê-la. Quem protege os dados não é o sigilo dessa
chave, é a regra de RLS que o schema instalou: cada linha só é visível para o dono
dela, e sem uma sessão válida não existe dono nenhum.

A chave **service_role**, essa sim é secreta. Ela não é usada por este app e não
deve ser colocada em lugar nenhum daqui.

## 4. Onde colocar as chaves

### Rodando no seu computador

Copie `.env.example` para `.env` e preencha:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Depois `npm install` e `npm run dev`.

### Publicado no GitHub Pages

No repositório: **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Crie os dois, com exatamente esses nomes:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Depois rode o workflow **Deploy GitHub Pages** de novo (aba **Actions** →
**Run workflow**). As chaves entram no bundle na hora do build, então mudar o
secret só faz efeito no próximo deploy.

## 5. Criar a sua conta — e fechar a porta atrás de você

1. Abra o app. Na tela de entrada, toque em **Criar minha conta**.
2. Use o seu e-mail e uma senha de pelo menos 6 caracteres.
3. Se o Supabase pedir confirmação por e-mail, clique no link que ele mandar.
4. Entre no app para conferir que funcionou.

Agora o passo que responde ao "só eu ter acesso":

**Authentication** → **Sign In / Providers** → desligue
**Allow new users to sign up**.

A partir daí o endereço do app pode ser público à vontade. Quem abrir vai ver a
tela de entrada, não vai conseguir criar conta, e sem conta não existe nenhum
dado para ver — o RLS no banco recusa antes de qualquer coisa chegar na tela.

---

## Quando alguma coisa não funciona

**A tela diz "o app ainda não está ligado a um banco".**
As variáveis não chegaram no build. No computador, confira se o arquivo se chama
`.env` (não `.env.example`) e reinicie o `npm run dev` — o Vite só lê o `.env` ao
iniciar. No Pages, confira o nome dos secrets e rode o deploy de novo.

**"E-mail ou senha não conferem" e você tem certeza que confere.**
Provavelmente a conta foi criada em outro projeto do Supabase. Confira, na tela
de Configurações do app, se o host que aparece é o do projeto certo.

**"Novos cadastros estão desligados".**
É o passo 5 funcionando. Se precisar de outra conta, religue a opção no painel,
crie, e desligue de novo.

**Entra, mas nada salva.**
Quase sempre é o schema que não foi aplicado inteiro. Rode o `schema.sql` de novo
e olhe a tabela de conferência no fim.
