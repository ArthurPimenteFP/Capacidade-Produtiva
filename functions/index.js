// ===========================
// Controle de Colhedoras - Backend de Assinaturas (Mercado Pago)
// ===========================
// Estas Cloud Functions existem porque o token secreto do Mercado Pago
// NUNCA pode ficar no navegador (front-end). Elas rodam nos servidores do
// Firebase e são as únicas que têm acesso ao token.

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Token de acesso do Mercado Pago. Configure com:
//   firebase functions:secrets:set MP_ACCESS_TOKEN
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');

const REGIAO = 'southamerica-east1';

// ---- CONFIGURAÇÃO DO PLANO ----
// Ajuste aqui os valores, se quiser mudar.
const VALOR_MENSAL = 9.9;                 // Cartão: cobrança recorrente mensal
const VALOR_PIX_TRIMESTRE = 49.9;         // Pix: pagamento único, dá acesso por 3 meses
const DIAS_PIX_TRIMESTRE = 90;
const NOME_PLANO = 'Controle de Colhedoras - Plano Premium';

// URL pública do seu app publicado (sem barra no final)
const APP_URL = 'https://arthurpimentefp.github.io/Capacidade-Produtiva';

// --- Cria uma assinatura recorrente e devolve o link de pagamento do Mercado Pago ---
exports.criarAssinatura = onCall({ secrets: [MP_ACCESS_TOKEN], region: REGIAO }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Você precisa estar logado.');
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;

    let resp, data;
    try {
        resp = await fetch('https://api.mercadopago.com/preapproval', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + MP_ACCESS_TOKEN.value(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reason: NOME_PLANO,
                external_reference: uid,
                payer_email: email,
                back_url: APP_URL + '/planos.html',
                auto_recurring: {
                    frequency: 1,
                    frequency_type: 'months',
                    transaction_amount: VALOR_MENSAL,
                    currency_id: 'BRL'
                },
                status: 'pending'
            })
        });
        data = await resp.json();
    } catch (err) {
        console.error('Falha de rede ao chamar Mercado Pago:', err);
        throw new HttpsError('internal', 'Não foi possível conectar ao Mercado Pago agora.');
    }

    if (!resp.ok) {
        console.error('Erro Mercado Pago (criar assinatura):', data);
        throw new HttpsError('internal', 'Não foi possível iniciar a assinatura. Tente novamente.');
    }

    await db.collection('users').doc(uid).set({
        subscriptionId: data.id,
        planStatus: 'pending'
    }, { merge: true });

    return { checkoutUrl: data.init_point };
});

// --- Cria um pagamento único via Pix (R$ 49,90 = 3 meses, sem renovação automática) ---
// Diferente da assinatura por cartão, o Pix não tem "cartão cadastrado" pra
// cancelar: é só um pagamento avulso. Quando os 3 meses acabarem, a função
// agendada `expirarPix` (mais abaixo) revoga o acesso sozinha.
exports.criarPagamentoPix = onCall({ secrets: [MP_ACCESS_TOKEN], region: REGIAO }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Você precisa estar logado.');
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;

    let resp, data;
    try {
        resp = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + MP_ACCESS_TOKEN.value(),
                'Content-Type': 'application/json',
                // Evita cobrança duplicada se o usuário clicar 2x rapidamente
                'X-Idempotency-Key': uid + '-pix-' + Date.now()
            },
            body: JSON.stringify({
                transaction_amount: VALOR_PIX_TRIMESTRE,
                description: NOME_PLANO + ' - Pix (3 meses)',
                payment_method_id: 'pix',
                external_reference: uid,
                payer: { email: email }
            })
        });
        data = await resp.json();
    } catch (err) {
        console.error('Falha de rede ao chamar Mercado Pago (Pix):', err);
        throw new HttpsError('internal', 'Não foi possível conectar ao Mercado Pago agora.');
    }

    if (!resp.ok) {
        console.error('Erro Mercado Pago (criar Pix):', data);
        throw new HttpsError('internal', 'Não foi possível gerar o Pix. Tente novamente.');
    }

    const dadosPix = data.point_of_interaction && data.point_of_interaction.transaction_data;
    if (!dadosPix || !dadosPix.qr_code) {
        console.error('Resposta do Mercado Pago sem QR code:', data);
        throw new HttpsError('internal', 'O Mercado Pago não retornou o QR code do Pix.');
    }

    await db.collection('users').doc(uid).set({
        pixPaymentId: data.id,
        planStatus: 'pix_pendente'
    }, { merge: true });

    return {
        paymentId: data.id,
        qrCode: dadosPix.qr_code,               // "copia e cola"
        qrCodeBase64: dadosPix.qr_code_base64    // imagem do QR em base64
    };
});

// --- Consulta o status de um pagamento Pix (o front usa isso pra saber na
// hora se a pessoa já pagou, sem precisar esperar o webhook) ---
exports.consultarStatusPix = onCall({ secrets: [MP_ACCESS_TOKEN], region: REGIAO }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Você precisa estar logado.');
    }
    const paymentId = request.data && request.data.paymentId;
    if (!paymentId) {
        throw new HttpsError('invalid-argument', 'Informe o paymentId.');
    }

    const resp = await fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
        headers: { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN.value() }
    });
    const data = await resp.json();
    if (!resp.ok) {
        throw new HttpsError('internal', 'Não foi possível consultar o pagamento.');
    }

    if (data.status === 'approved') {
        await aprovarPagamentoPix(data);
    }

    return { status: data.status };
});

// --- Cancela a assinatura do usuário logado ---
exports.cancelarAssinatura = onCall({ secrets: [MP_ACCESS_TOKEN], region: REGIAO }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Você precisa estar logado.');
    }

    const uid = request.auth.uid;
    const userSnap = await db.collection('users').doc(uid).get();
    const subscriptionId = userSnap.exists ? userSnap.data().subscriptionId : null;

    if (!subscriptionId) {
        throw new HttpsError('failed-precondition', 'Nenhuma assinatura ativa encontrada.');
    }

    let resp, data;
    try {
        resp = await fetch('https://api.mercadopago.com/preapproval/' + subscriptionId, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + MP_ACCESS_TOKEN.value(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'cancelled' })
        });
        data = await resp.json();
    } catch (err) {
        console.error('Falha de rede ao cancelar no Mercado Pago:', err);
        throw new HttpsError('internal', 'Não foi possível conectar ao Mercado Pago agora.');
    }

    if (!resp.ok) {
        console.error('Erro Mercado Pago (cancelar):', data);
        throw new HttpsError('internal', 'Não foi possível cancelar agora. Tente novamente.');
    }

    await db.collection('users').doc(uid).set({
        plan: 'free',
        planStatus: 'cancelled'
    }, { merge: true });

    return { ok: true };
});

// --- Dá acesso premium (com data de validade) a quem pagou via Pix ---
async function aprovarPagamentoPix(pagamento) {
    const uid = pagamento.external_reference;
    if (!uid || pagamento.status !== 'approved') return;

    const expiraEm = new Date(Date.now() + DIAS_PIX_TRIMESTRE * 24 * 60 * 60 * 1000);
    await db.collection('users').doc(uid).set({
        plan: 'premium',
        planStatus: 'pix',
        pixPaymentId: pagamento.id,
        planExpiraEm: admin.firestore.Timestamp.fromDate(expiraEm)
    }, { merge: true });
}

// --- Webhook: o Mercado Pago chama esta URL sempre que o status de uma
// assinatura (cartão) ou de um pagamento avulso (Pix) muda ---
// Configure esta URL (mostrada após o deploy) em:
// Mercado Pago > Sua conta > Webhooks (marque os eventos "Assinaturas" e "Pagamentos")
exports.webhookMercadoPago = onRequest({ secrets: [MP_ACCESS_TOKEN], region: REGIAO }, async (req, res) => {
    try {
        const tipo = req.query.type || (req.body && req.body.type);
        const id = req.query['data.id'] || (req.body && req.body.data && req.body.data.id) || req.query.id;

        if (!id) {
            res.status(200).send('ignorado');
            return;
        }

        // --- Evento de assinatura recorrente (cartão) ---
        if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
            const resp = await fetch('https://api.mercadopago.com/preapproval/' + id, {
                headers: { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN.value() }
            });
            const data = await resp.json();
            const uid = data.external_reference;
            if (!uid) { res.status(200).send('sem uid'); return; }

            const novoPlano = data.status === 'authorized' ? 'premium' : 'free';
            await db.collection('users').doc(uid).set({
                plan: novoPlano,
                planStatus: data.status,
                subscriptionId: data.id
            }, { merge: true });

            res.status(200).send('ok');
            return;
        }

        // --- Evento de pagamento avulso (Pix) ---
        if (tipo === 'payment') {
            const resp = await fetch('https://api.mercadopago.com/v1/payments/' + id, {
                headers: { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN.value() }
            });
            const data = await resp.json();
            await aprovarPagamentoPix(data);
            res.status(200).send('ok');
            return;
        }

        res.status(200).send('ignorado');
    } catch (err) {
        console.error('Erro no webhook do Mercado Pago:', err);
        res.status(500).send('erro');
    }
});

// --- Roda 1x por dia: revoga o acesso de quem pagou via Pix e passou dos
// 3 meses sem renovar (Pix não tem cobrança automática, então isso não vem
// pelo webhook - precisa ser checado por aqui). ---
exports.expirarPix = onSchedule({ schedule: 'every day 03:00', region: REGIAO, timeZone: 'America/Sao_Paulo' }, async () => {
    const agora = admin.firestore.Timestamp.now();
    const vencidos = await db.collection('users')
        .where('planStatus', '==', 'pix')
        .where('planExpiraEm', '<=', agora)
        .get();

    const lote = db.batch();
    vencidos.forEach((doc) => {
        lote.update(doc.ref, { plan: 'free', planStatus: 'expirado' });
    });
    if (!vencidos.empty) {
        await lote.commit();
        console.log('Pix expirados revogados:', vencidos.size);
    }
});
