// --- Webhook: o Mercado Pago chama esta URL sempre que o status de uma
// assinatura (cartão) ou de um pagamento avulso (Pix) muda ---
// Esta rota é PÚBLICA de propósito (quem chama é o servidor do Mercado
// Pago, não uma pessoa logada) - por isso não passa por verificarLogin.
// Configure esta URL no painel do Mercado Pago > Webhooks.
const { getAdmin } = require('./_lib/firebaseAdmin');
const { aprovarPagamentoPix } = require('./_lib/aprovarPagamentoPix');

module.exports = async function (req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).send('método não permitido');
        return;
    }

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
                headers: { 'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN }
            });
            const data = await resp.json();
            const uid = data.external_reference;
            if (!uid) { res.status(200).send('sem uid'); return; }

            const admin = getAdmin();
            const novoPlano = data.status === 'authorized' ? 'premium' : 'free';
            await admin.firestore().collection('users').doc(uid).set({
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
                headers: { 'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN }
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
};
