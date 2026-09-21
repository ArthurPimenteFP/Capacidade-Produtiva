# Configurando login + banco de dados real (Firebase)

Este app agora tem cadastro, login e um banco de dados de verdade usando o
**Firebase** (gratuito no plano usado aqui). Siga os passos abaixo — leva
uns 10 minutos e não precisa digitar nenhum comando.

## O que foi adicionado

| Arquivo | Para que serve |
|---|---|
| `login.html` | Tela de login |
| `cadastro.html` | Tela onde pessoas novas criam conta |
| `admin.html` | Painel só para administradores, lista todos os usuários |
| `auth.js` | Toda a lógica de login/cadastro/permissões |
| `firebase-config.js` | **Aqui você cola as chaves do seu projeto Firebase** |
| `firestore.rules` | Regras de segurança do banco (quem pode ler/escrever o quê) |
| `index.html` / `script.js` | O app original, agora exige login e salva os dados na nuvem (por usuário) |

Como funciona o acesso:
- Qualquer pessoa pode se cadastrar em `cadastro.html` e já entra usando o app na hora.
- Cada pessoa só vê e edita os **próprios** dados de colhedoras — ninguém vê dados de outro usuário.
- Você (o administrador) tem uma conta com permissão especial, que vê `admin.html`
  com a lista de todos os cadastrados e pode promover/remover outros administradores.

---

## Passo 1 — Criar o projeto no Firebase

1. Acesse **https://console.firebase.google.com** e faça login com uma conta Google.
2. Clique em **"Adicionar projeto"**, dê um nome (ex: `controle-colhedoras`) e siga o assistente
   (pode desativar o Google Analytics, não é necessário).
3. Quando o projeto abrir, clique no ícone **`</>`** (Web) para registrar um app web.
   Dê um apelido qualquer e clique em **"Registrar app"**.
4. O Firebase vai mostrar um bloco de código parecido com este:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "controle-colhedoras.firebaseapp.com",
     projectId: "controle-colhedoras",
     storageBucket: "controle-colhedoras.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };
   ```

   Copie esses valores e cole em **`firebase-config.js`**, substituindo os campos
   `"COLE_AQUI_..."`. Essas chaves não são secretas — a segurança real vem das
   regras do Firestore (passo 4).

## Passo 2 — Ativar login por e-mail/senha

1. No menu lateral do Firebase, vá em **Build > Authentication**.
2. Clique em **"Get started"**.
3. Na aba **Sign-in method**, clique em **"E-mail/senha"** e ative a primeira opção
   ("Email/Password"). Salve.

## Passo 3 — Criar o banco de dados (Firestore)

1. No menu lateral, vá em **Build > Firestore Database**.
2. Clique em **"Create database"**.
3. Escolha uma localização (ex: `southamerica-east1` — São Paulo) e clique em avançar.
4. Selecione **"Start in production mode"** e conclua.

## Passo 4 — Colar as regras de segurança

1. Ainda no Firestore, vá na aba **"Rules"** (Regras).
2. Apague o conteúdo que estiver lá e cole todo o conteúdo do arquivo **`firestore.rules`**
   (que está na pasta do projeto).
3. Clique em **"Publish"** (Publicar).

Essas regras garantem que cada usuário só acesse os próprios dados, e que só
administradores vejam a lista de todo mundo.

## Passo 5 — Publicar o app (GitHub Pages ou outro)

Suba todos os arquivos da pasta (incluindo os novos: `login.html`, `cadastro.html`,
`admin.html`, `auth.js`, `auth.css`, `firebase-config.js` já preenchido) para o seu
repositório do GitHub Pages, normalmente. Nenhuma configuração extra é necessária —
o Firebase funciona direto do navegador, sem precisar de servidor próprio.

> **Atenção:** depois de publicar, volte no Firebase em **Authentication > Settings >
> Authorized domains** e adicione o domínio do seu GitHub Pages
> (ex: `seuusuario.github.io`), senão o login será bloqueado por segurança.

## Passo 6 — Criar sua conta de administrador

O primeiro administrador precisa ser definido manualmente (por segurança, ninguém
consegue virar admin sozinho pelo app):

1. Abra o app publicado e faça um cadastro normal (`cadastro.html`) com o seu
   próprio e-mail — como qualquer pessoa faria.
2. No Firebase Console, vá em **Firestore Database > Data**, abra a coleção
   **`users`**, e encontre o documento com o seu e-mail.
3. Edite o campo **`role`** de `"user"` para `"admin"` e salve.
4. Saia e entre de novo no app (ou apenas recarregue a página) — o link **"Admin"**
   vai aparecer no cabeçalho, levando para o painel com a lista de todos os usuários.

A partir daí, você pode promover outras pessoas a administrador diretamente pelo
próprio painel `admin.html` (botão "Tornar admin" na lista), sem precisar mexer
no console de novo.

---

## Perguntas frequentes

**Preciso de internet para usar o app agora?**
Sim, para fazer login/cadastro é preciso estar online. Depois de logado, o app
mantém uma cópia local dos dados (funciona para consulta mesmo sem sinal) e
sincroniza automaticamente com a nuvem quando a conexão voltar.

**Isso tem algum custo?**
O plano gratuito do Firebase (Spark) cobre tranquilamente um app desse porte
(milhares de logins e leituras/escritas por dia de graça). Não é necessário
cartão de crédito para usar esse plano.

**Como eu excluo um usuário de verdade (login e tudo)?**
Pelo painel `admin.html` dá para remover a permissão de admin de alguém, mas
excluir a conta de login (Authentication) exige acesso ao Firebase Console:
vá em **Authentication > Users**, encontre a pessoa e clique no menu de excluir.
(Apagar só o documento em Firestore não apaga o login.)
