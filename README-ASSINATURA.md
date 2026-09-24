# Configurando as assinaturas (Mercado Pago + Vercel)

> ⚠️ **Atualização:** o backend (as funções que conversam com o Mercado
> Pago) não está mais no Firebase Functions — foi migrado pra Vercel, pra
> não precisar do plano pago (Blaze) do Firebase. Siga o
> **`README-VERCEL.md`** para publicar a API. Este arquivo abaixo continua
> valendo para tudo que é do Firebase (login, Firestore, regras) — só os
> passos que mencionam `firebase deploy --only functions` e
> `firebase functions:secrets:set` não se aplicam mais.

O app libera acesso em 3 situações:

1. **Teste grátis de 5 dias**, automático no cadastro, sem pedir cartão.
2. **Cartão**: R$ 9,90/mês, cobrança recorrente pelo Mercado Pago.
3. **Pix**: R$ 49,90 pagamento único, dá acesso por 3 meses (sem renovação
   automática — ao vencer, a pessoa paga de novo ou muda pro cartão).

Administradores sempre têm acesso, sem pagar.

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
as URLs das funções criadas (`criarAssinatura`, `criarPagamentoPix`,
`consultarStatusPix`, `cancelarAssinatura`, `webhookMercadoPago`,
`expirarPix`). Copie a URL da **`webhookMercadoPago`** — algo como:

```
https://southamerica-east1-controle-colhedoras.cloudfunctions.net/webhookMercadoPago
```

## Passo 5 — Avisar o Mercado Pago sobre o webhook

1. Volte em https://www.mercadopago.com.br/developers/panel/app, abra sua
   aplicação, vá em **"Webhooks"**.
2. Cole a URL copiada no Passo 4.
3. Marque **os dois eventos**: **"Assinaturas"** (subscription_preapproval /
   preapproval) — usado pelo cartão — e **"Pagamentos"** (payment) — usado
   pelo Pix.
4. Salve.

⚠️ A função `expirarPix` roda 1x por dia sozinha (Cloud Scheduler) e revoga
o acesso de quem pagou Pix e passou dos 3 meses. Na primeira execução, se o
Firestore pedir um índice composto (aparece um link no log da função), basta
clicar no link e depois em "Criar índice" — é automático, só precisa ser
feito uma vez.

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

## Ajustando preços e duração do teste

Em `functions/index.js`:

```js
const VALOR_MENSAL = 9.9;             // cartão, por mês
const VALOR_PIX_TRIMESTRE = 49.9;     // Pix, pagamento único
const DIAS_PIX_TRIMESTRE = 90;        // dias de acesso que o Pix libera
```

Em `auth.js`:

```js
const DIAS_TESTE_GRATIS = 5;
```

Depois rode `firebase deploy --only functions` (e reenvie os arquivos do
front-end) para aplicar.

## Como você (admin) sempre tem acesso

Sua conta marcada como `role: admin` (feito no passo 6 do
README-FIREBASE.md) sempre tem acesso ao app, independente de assinatura —
não precisa pagar a si mesmo.

## Como cancelar/reembolsar manualmente um usuário

Você pode gerenciar assinaturas de cartão direto no painel do Mercado Pago
(https://www.mercadopago.com.br/subscriptions), ou, para revogar o acesso no
app imediatamente sem esperar o Mercado Pago, edite o documento da pessoa em
Firestore Database > `users` > campo `plan` para `"free"`.

Para quem pagou via Pix, não existe assinatura pra cancelar no Mercado Pago
(foi um pagamento avulso) — pra revogar o acesso antes da data, edite o
mesmo campo `plan` para `"free"`, ou mude `planExpiraEm` para uma data
passada.

## Aviso de "Pix vencendo em breve"

Como o Pix não tem cobrança automática, o app avisa a pessoa antes do
vencimento em vez de simplesmente cortar o acesso sem aviso:

- **Dentro do app (`index.html`)**: quando faltam 7 dias ou menos para o
  Pix vencer, aparece uma faixa amarela abaixo do cabeçalho com o número de
  dias restantes e um link "Renovar agora" para `planos.html`.
- **Na tela de assinatura (`planos.html`)**: o texto de "assinatura ativa"
  muda para um alerta com a contagem de dias, e um botão **"Renovar Pix
  agora"** aparece, permitindo gerar um novo QR code e pagar antes mesmo de
  vencer (sem precisar esperar o acesso cair para poder pagar de novo).

Isso é feito só com o que já está salvo no Firestore (`planExpiraEm`), sem
precisar de nenhum serviço de e-mail. Se no futuro você quiser também um
aviso por e-mail, dá pra criar uma Cloud Function agendada parecida com a
`expirarPix` (rodando 1x por dia, buscando quem está a poucos dias do
vencimento) e usar algum serviço de envio de e-mail (Resend, SendGrid etc.)
— isso não foi implementado porque o projeto não tem nenhuma credencial de
e-mail configurada ainda.

## Resumo das perguntas mais comuns

- **Dá trabalho cancelar assinatura / descadastrar cartão?** Não. O número
  do cartão nunca passa pelo seu app — fica só com o Mercado Pago. O botão
  "Cancelar assinatura" chama a função `cancelarAssinatura`, que já para a
  cobrança na hora, sem você precisar mexer em nada.
- **O teste grátis pede cartão?** Não. É controlado só pelo Firestore
  (campo `trialEnd`), liberado automaticamente no cadastro.
- **O Pix tem "cartão" pra cancelar?** Não existe — é um pagamento único.
  Ao vencer os 3 meses, o acesso é revogado sozinho pela função `expirarPix`.
