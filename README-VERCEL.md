# Publicando a API na Vercel (sem precisar do plano Blaze do Firebase)

O Firebase continua de graça (Spark): login, Firestore e hospedagem do site
não mudam. Só as 6 funções que conversam com o Mercado Pago
(`criarAssinatura`, `criarPagamentoPix`, `consultarStatusPix`,
`cancelarAssinatura`, `webhookMercadoPago`, `expirarPix`) saíram do Firebase
Functions e agora moram na pasta `/api`, publicadas na Vercel.

## Passo 1 — Gerar a chave da service account do Firebase

Essa chave permite que o código na Vercel leia/escreva no Firestore e
confirme se o login de alguém é válido — é o "Admin SDK" do Firebase, só
que rodando fora do Firebase.

1. No [Firebase Console](https://console.firebase.google.com), abra o
   projeto `controle-colhedoras`.
2. Vá em **Configurações do projeto** (ícone de engrenagem) > **Contas de
   serviço**.
3. Clique em **"Gerar nova chave privada"** → confirma → baixa um arquivo
   `.json`. **Guarde esse arquivo em local seguro, nunca suba pro GitHub.**
4. Converta esse arquivo pra base64 (formato que a Vercel aceita bem em
   variável de ambiente). No terminal, na pasta onde o arquivo caiu:

   **Windows (PowerShell):**
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("nome-do-arquivo.json")) | Set-Clipboard
   ```
   (isso já copia o resultado pra área de transferência)

   **Mac/Linux:**
   ```bash
   base64 -i nome-do-arquivo.json | pbcopy   # Mac
   base64 -w0 nome-do-arquivo.json | xclip   # Linux (se tiver xclip)
   ```

## Passo 2 — Instalar o Vercel CLI e publicar

Na pasta do projeto (a mesma onde está a pasta `api`):

```bash
npm install -g vercel
vercel login
vercel
```

Na primeira vez, ele faz umas perguntas (nome do projeto, etc.) — pode
aceitar os padrões. Ele vai gerar uma URL de teste
(`https://seu-projeto-xxxx.vercel.app`).

## Passo 3 — Configurar as variáveis de ambiente

No [painel da Vercel](https://vercel.com/dashboard), abra o projeto criado
→ **Settings** → **Environment Variables**, e adicione:

| Nome | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | O Access Token do Mercado Pago (o mesmo que você ia usar no Firebase) |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | O texto base64 gerado no Passo 1 |
| `APP_URL` | A URL onde o site (front-end) está publicado, sem barra no final — ex: `https://arthurpimentefp.github.io/Capacidade-Produtiva` |
| `CRON_SECRET` | Uma senha aleatória forte (pode gerar em https://1password.com/password-generator, por exemplo) |

Marque pra valer em **Production** (e Preview/Development se quiser testar
antes).

## Passo 4 — Publicar de novo (pra aplicar as variáveis) e pegar a URL final

```bash
vercel --prod
```

Ele te devolve a URL de produção, algo como:
```
https://capacidade-produtiva-api.vercel.app
```

## Passo 5 — Conectar o front-end na nova API

Abra `api-config.js` e troque a URL de exemplo pela URL real do Passo 4:

```js
window.API_BASE_URL = "https://capacidade-produtiva-api.vercel.app";
```

Suba esse arquivo (junto com `auth.js` e `planos.html`, que também
mudaram) pro GitHub Pages (ou onde o site estiver hospedado).

## Passo 6 — Configurar o webhook no Mercado Pago

A URL do webhook agora é:
```
https://capacidade-produtiva-api.vercel.app/api/webhookMercadoPago
```
Cole essa URL no painel do Mercado Pago > Webhooks, marcando os eventos
**"Assinaturas"** e **"Pagamentos"**, como no guia original.

## Passo 7 — Publicar as regras do Firestore (isso continua no Firebase)

```bash
firebase deploy --only firestore:rules
```

## Passo 8 — Testar

1. Cadastre uma conta de teste, confirme que cai em `planos.html`.
2. Teste cartão e Pix com as credenciais de teste do Mercado Pago.
3. O cron da `expirarPix` roda sozinho todo dia às 3h (horário de Brasília)
   — dá pra ver o histórico de execuções em **Vercel > seu projeto >
   Settings > Cron Jobs**.

## Se algo der erro

- **CORS bloqueado no navegador**: confirme que `APP_URL` na Vercel bate
  exatamente com a URL do seu site (sem barra no final, com `https://`).
- **"Sessão expirada ou inválida"**: geralmente é a
  `FIREBASE_SERVICE_ACCOUNT_BASE64` errada ou faltando — confira se copiou
  o base64 inteiro, sem quebras de linha extras.
- **Erros da função aparecem em**: Vercel > seu projeto > aba **Logs** (ou
  **Deployments** > clique no deploy > **Functions**).
