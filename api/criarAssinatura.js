// --- Cria uma assinatura recorrente e devolve o link de pagamento do Mercado Pago ---
const { aplicarCors } = require('./_lib/cors');
const { verificarLogin } = require('./_lib/verificarLogin');
const { getAdmin } = require('./_lib/firebaseAdmin');

const VALOR_MENSAL = 9.9;
const NOME_PLANO = 'Controle de Colhedoras - Plano Premium';
const APP_URL = process.env.APP_URL || 'https://arthurpimentefp.github.io/Capacidade-Produtiva';

module.exports = async function (req, res) {
    if (aplicarCors(req, res)) return;
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método não permitido.' });
        return;
    }

    let usuario;
    try {
        usuario = await verificarLogin(req);
    } catch (err) {
        res.status(err.status || 401).json({ error: err.message });
        return;
    }

    let resp, data;
    try {
        resp = await fetch('https://api.mercadopago.com/preapproval', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reason: NOME_PLANO,
                external_reference: usuario.uid,
                payer_email: usuario.email,
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
        res.status(500).json({ error: 'Não foi possível conectar ao Mercado Pago agora.' });
        return;
    }

    if (!resp.ok) {
        console.error('Erro Mercado Pago (criar assinatura):', data);
        res.status(500).json({ error: 'Não foi possível iniciar a assinatura. Tente novamente.' });
        return;
    }

    const admin = getAdmin();
    await admin.firestore().collection('users').doc(usuario.uid).set({
        subscriptionId: data.id,
        planStatus: 'pending'
    }, { merge: true });

    res.status(200).json({ checkoutUrl: data.init_point });
};
