// ===========================
// Controle de Colhedoras - Backend de Assinaturas (Mercado Pago)
// ===========================
// Estas Cloud Functions existem porque o token secreto do Mercado Pago
// NUNCA pode ficar no navegador (front-end). Elas rodam nos servidores do
// Firebase e são as únicas que têm acesso ao token.

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Token de acesso do Mercado Pago. Configure com:
//   firebase functions:secrets:set MP_ACCESS_TOKEN
const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');

const REGIAO = 'southamerica-east1';

// ---- CONFIGURAÇÃO DO PLANO ----
// Ajuste aqui o valor e o nome da assinatura, se quiser mudar.
const VALOR_MENSAL = 19.9;
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

// --- Webhook: o Mercado Pago chama esta URL sempre que o status da assinatura muda ---
// Configure esta URL (mostrada após o deploy) em:
// Mercado Pago > Sua conta > Webhooks > Assinaturas
exports.webhookMercadoPago = onRequest({ secrets: [MP_ACCESS_TOKEN], region: REGIAO }, async (req, res) => {
    try {
        const tipo = req.query.type || (req.body && req.body.type);
        const id = req.query['data.id'] || (req.body && req.body.data && req.body.data.id) || req.query.id;

        if (!id || (tipo !== 'subscription_preapproval' && tipo !== 'preapproval')) {
            res.status(200).send('ignorado');
            return;
        }

        const resp = await fetch('https://api.mercadopago.com/preapproval/' + id, {
            headers: { 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN.value() }
        });
        const data = await resp.json();
        const uid = data.external_reference;

        if (!uid) {
            res.status(200).send('sem uid');
            return;
        }

        const novoPlano = data.status === 'authorized' ? 'premium' : 'free';

        await db.collection('users').doc(uid).set({
            plan: novoPlano,
            planStatus: data.status,
            subscriptionId: data.id
        }, { merge: true });

        res.status(200).send('ok');
    } catch (err) {
        console.error('Erro no webhook do Mercado Pago:', err);
        res.status(500).send('erro');
    }
});
