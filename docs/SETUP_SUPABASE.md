# Configurando o Supabase

Guia para criar o banco do All Big Chef do zero. Leva uns 15 minutos e não exige
saber SQL — é copiar, colar e clicar.

## 1. Criar a conta e o projeto

1. Acesse [supabase.com](https://supabase.com) e crie uma conta (o plano gratuito
   atende folgado uma cozinha).
2. Clique em **New project**.
3. Preencha:
   - **Name**: `all-big-chef`
   - **Database Password**: gere uma senha forte e **guarde num gerenciador de
     senhas**. Ela não é usada pelo app, mas é a única forma de acessar o banco
     direto — e o Supabase não mostra de novo.
   - **Region**: `South America (São Paulo)` — menor latência para o Brasil.
4. Aguarde uns 2 minutos enquanto o projeto sobe.

## 2. Aplicar as migrations

No menu lateral, abra **SQL Editor** → **New query**. Rode os arquivos **na
ordem**, um de cada vez:

1. Cole todo o conteúdo de [`../supabase/migrations/0001_schema.sql`](../supabase/migrations/0001_schema.sql)
   e clique em **Run**.
2. Abra outra query, cole [`../supabase/migrations/0002_rls_e_status.sql`](../supabase/migrations/0002_rls_e_status.sql)
   e **Run**.

Cada um deve terminar com *Success. No rows returned*. Se aparecer erro, pare e
me mostre a mensagem — não rode o próximo.

## 3. Pegar as chaves do app

Vá em **Project Settings** (engrenagem) → **Data API**. Você precisa de dois
valores:

| Campo no painel | Vai para |
| --- | --- |
| **Project URL** | `VITE_SUPABASE_URL` |
| **anon / public** key | `VITE_SUPABASE_ANON_KEY` |

Crie um arquivo `.env` na raiz do projeto (copiando o `.env.example`) e cole os
dois valores.

> **Sobre a anon key:** ela é pública por projeto — vai dentro do JavaScript e
> qualquer pessoa que abrir o app consegue lê-la. Isso é o desenho pretendido do
> Supabase, não um descuido. Quem impede alguém de ler os dados do seu
> restaurante são as políticas de RLS que a migration 0002 instalou, que
> amarram toda consulta à organização do usuário logado.
>
> A chave que **nunca** pode vazar é a **`service_role`**, que ignora o RLS.
> Ela não é usada pelo app e não deve entrar em nenhum arquivo do projeto.

## 4. Criar o login do restaurante

O modelo é **um login por restaurante**, não um por funcionário — o tablet fica
logado na bancada e o operador só toca no próprio nome antes de imprimir.

Em **Authentication** → **Users** → **Add user** → **Create new user**:

- **Email**: um e-mail do restaurante (ex.: `cozinha@seurestaurante.com.br`)
- **Password**: defina uma senha
- Marque **Auto Confirm User** (evita ter que confirmar por e-mail)

Depois, em **Authentication** → **Providers** → **Email**, desligue
**Enable email signups**. Sem isso, qualquer pessoa que descobrir a URL do app
pode criar conta no seu projeto.

## 5. Criar a organização

De volta ao **SQL Editor**, rode — trocando o e-mail e o nome:

```sql
-- Faz o Postgres agir como se fosse aquele usuário, para que criar_organizacao
-- saiba a quem vincular a nova organização.
select set_config(
  'request.jwt.claim.sub',
  (select id::text from auth.users where email = 'cozinha@seurestaurante.com.br'),
  false
);

select public.criar_organizacao('Nome do Seu Restaurante');
```

Isso cria a organização, vincula o usuário como admin e já semeia as pastas
típicas de cozinha: Laticínios, Pescados, Carnes, Aves, Hortifrúti, Molhos,
Congelados, Secos e Pré-preparo. Você renomeia ou apaga o que não usar dentro do
app.

## 6. Conferir

Rode no SQL Editor:

```sql
select o.nome as restaurante, count(f.id) as pastas
  from public.organizations o
  left join public.folders f on f.org_id = o.id
 group by o.nome;
```

Deve aparecer seu restaurante com 9 pastas. Se apareceu, o banco está pronto.

## Estrutura criada

| Tabela | Guarda |
| --- | --- |
| `organizations` / `org_members` | O restaurante e quem tem acesso |
| `team_members` | A equipe da cozinha (não são logins — é a lista de nomes) |
| `folders` | Pastas/categorias de produto |
| `suppliers` | Fornecedores |
| `products` | Produtos e seus dias de validade |
| `label_templates` | Layouts de etiqueta do editor visual |
| `labels` | Cada etiqueta impressa, com snapshot do que foi impresso |
| `label_events` | Trilha de auditoria imutável: quem imprimiu, quem deu baixa |
| `push_subscriptions` | Aparelhos que recebem alerta de validade |
| `org_settings` | Limiares de alerta e perfil da etiquetadora |

Duas decisões que valem entender, porque afetam o que você vê no app:

**As etiquetas guardam uma cópia do nome do produto e do fornecedor.** Se você
renomear "Creme de leite" para "Creme de leite UHT" amanhã, as etiquetas
impressas hoje continuam dizendo "Creme de leite" — porque é isso que está
escrito no papel colado no pote. Num relatório para a vigilância sanitária, o
histórico precisa bater com o físico.

**Baixa de etiqueta é registrada como evento, nunca como edição.** A tabela
`label_events` não aceita UPDATE nem DELETE, nem pelo app. Se dois tablets
offline derem baixa na mesma etiqueta, os dois registros sobrevivem e o status
final é o do fato mais recente — não o do que sincronizou por último.
