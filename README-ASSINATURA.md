# Configurando as assinaturas (Mercado Pago + Cloud Functions)

Agora o app só libera o acesso pra quem tem assinatura ativa (R$ 19,90/mês,
cobrança recorrente pelo Mercado Pago). Só administradores entram sem pagar.

## Antes de começar

Isso exige duas coisas que o setup anterior não pedia:

1. **Upgrade do Firebase para o plano Blaze** (pago por uso, mas com cota
   gratuita generosa — você não deve pagar nada com o volume desse app).
   Necessário porque as Cloud Functions vão fazer chamadas para fora do
   Google (a API do Mercado Pago), e isso só é permitido no plano Blaze.
   No Firebase Console, clique em "Upgrade" no canto inferior esquerdo.
2. **Node.js instalado no seu computador** (para usar o Firebase CLI).
   Baixe em https://nodejs.org (versão LTS).

## Passo 1 — Criar sua conta no Mercado Pago

1. Crie uma conta em https://www.mercadopago.com.br (se ainda não tiver).
2. Acesse https://www.mercadopago.com.br/developers/panel/app e crie uma
   aplicação (qualquer nome).
3. Na aba **"Credenciais de produção"**, copie o **Access Token**. Guarde-o,
   você vai usar no Passo 3.

   > Enquanto estiver testando, você pode usar as **"Credenciais de teste"**
   > em vez das de produção — assim nenhum pagamento real é cobrado.

## Passo 2 — Instalar o Firebase CLI e conectar ao projeto

Abra um terminal na pasta do projeto (onde está a pasta `functions`) e rode:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
```

Escolha o projeto `controle-colhedoras` quando for perguntado.

## Passo 3 — Configurar o token secreto do Mercado Pago

```bash
firebase functions:secrets:set MP_ACCESS_TOKEN
```

Cole o Access Token do Passo 1 quando for solicitado. Esse valor fica
guardado com segurança no Google Cloud — nunca aparece no código nem no
GitHub.

## Passo 4 — Instalar dependências e publicar as Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

Isso pode levar alguns minutos na primeira vez. Ao final, o terminal mostra
as URLs das 3 funções criadas (`criarAssinatura`, `cancelarAssinatura`,
`webhookMercadoPago`). Copie a URL da **`webhookMercadoPago`** — algo como:

```
https://southamerica-east1-controle-colhedoras.cloudfunctions.net/webhookMercadoPago
```

## Passo 5 — Avisar o Mercado Pago sobre o webhook

1. Volte em https://www.mercadopago.com.br/developers/panel/app, abra sua
   aplicação, vá em **"Webhooks"**.
2. Cole a URL copiada no Passo 4.
3. Marque o evento **"Assinaturas"** (subscription_preapproval / preapproval).
4. Salve.

Isso é o que permite que, assim que alguém pagar, o Firestore seja
atualizado automaticamente e a pessoa ganhe acesso na hora (sem precisar
você fazer nada manualmente).

## Passo 6 — Publicar as regras novas do Firestore

```bash
firebase deploy --only firestore:rules
```

(Ou cole o conteúdo de `firestore.rules` manualmente em Firestore Database >
Rules > Publish, como você já fez antes.)

## Passo 7 — Testar

1. Suba os arquivos novos (`planos.html`, `auth.js`, `index.html`, `sw.js`,
   `firestore.rules` atualizados) para o GitHub.
2. Crie uma conta de teste em `cadastro.html`.
3. Você deve cair direto na tela `planos.html` (paywall).
4. Clique em "Assinar com Mercado Pago" — se você configurou as
   **credenciais de teste** no Passo 1, use um
   [usuário de teste comprador](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/accounts)
   para simular o pagamento sem gastar dinheiro de verdade.
5. Depois de "pagar", volte pro app — o acesso deve liberar sozinho em
   poucos segundos (o app fica ouvindo o Firestore em tempo real).

## Ajustando o preço

Abra `functions/index.js` e mude a linha:

```js
const VALOR_MENSAL = 19.9;
```

Depois rode `firebase deploy --only functions` de novo para aplicar.

## Como você (admin) sempre tem acesso

Sua conta marcada como `role: admin` (feito no passo 6 do
README-FIREBASE.md) sempre tem acesso ao app, independente de assinatura —
não precisa pagar a si mesmo.

## Como cancelar/reembolsar manualmente um usuário

Você pode gerenciar assinaturas ativas direto no painel do Mercado Pago
(https://www.mercadopago.com.br/subscriptions), ou, para revogar o acesso no
app imediatamente sem esperar o Mercado Pago, edite o documento da pessoa em
Firestore Database > `users` > campo `plan` para `"none"`.
