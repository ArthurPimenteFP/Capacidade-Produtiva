// --- Cria uma assinatura recorrente e devolve o link de pagamento do Mercado Pago ---
const { aplicarCors } = require('../lib/cors');
const { verificarLogin } = require('../lib/verificarLogin');
const { getAdmin } = require('../lib/firebaseAdmin');
const { acessoPagoAtivo } = require('../lib/acessoPago');

// Planos de cartão (recorrência a cada N meses). O valor é decidido aqui no
// servidor: o navegador só manda a chave do plano ('2m' ou '3m').
const PLANOS_CARTAO = {
    '2m': { meses: 2, valor: 23.9, nome: '2 meses' },
    '3m': { meses: 3, valor: 29.99, nome: '3 meses' }
};
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

    const chave = req.body && req.body.plano;
    const plano = PLANOS_CARTAO[chave];
    if (!plano) {
        res.status(400).json({ error: 'Plano inválido.' });
        return;
    }

    try {
        const perfilSnap = await getAdmin().firestore().collection('users').doc(usuario.uid).get();
        if (acessoPagoAtivo(perfilSnap.exists ? perfilSnap.data() : null)) {
            res.status(409).json({ error: 'Você já tem uma assinatura ativa. Só é possível renovar quando o prazo acabar.' });
            return;
        }
    } catch (err) {
        console.error('Erro ao conferir assinatura atual:', err);
        res.status(500).json({ error: 'Não foi possível conferir sua assinatura. Tente novamente.' });
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
                reason: NOME_PLANO + ' - ' + plano.nome,
                external_reference: usuario.uid,
                payer_email: usuario.email,
                back_url: APP_URL + '/planos.html',
                auto_recurring: {
                    frequency: plano.meses,
                    frequency_type: 'months',
                    transaction_amount: plano.valor,
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
        planoEscolhido: chave,
        planStatus: 'pending'
    }, { merge: true });

    res.status(200).json({ checkoutUrl: data.init_point });
};
