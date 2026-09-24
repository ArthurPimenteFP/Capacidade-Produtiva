// --- Cancela a assinatura do usuário logado ---
const { aplicarCors } = require('./_lib/cors');
const { verificarLogin } = require('./_lib/verificarLogin');
const { getAdmin } = require('./_lib/firebaseAdmin');

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

    const admin = getAdmin();
    const db = admin.firestore();
    const userSnap = await db.collection('users').doc(usuario.uid).get();
    const subscriptionId = userSnap.exists ? userSnap.data().subscriptionId : null;

    if (!subscriptionId) {
        res.status(400).json({ error: 'Nenhuma assinatura ativa encontrada.' });
        return;
    }

    let resp, data;
    try {
        resp = await fetch('https://api.mercadopago.com/preapproval/' + subscriptionId, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'cancelled' })
        });
        data = await resp.json();
    } catch (err) {
        console.error('Falha de rede ao cancelar no Mercado Pago:', err);
        res.status(500).json({ error: 'Não foi possível conectar ao Mercado Pago agora.' });
        return;
    }

    if (!resp.ok) {
        console.error('Erro Mercado Pago (cancelar):', data);
        res.status(500).json({ error: 'Não foi possível cancelar agora. Tente novamente.' });
        return;
    }

    await db.collection('users').doc(usuario.uid).set({
        plan: 'free',
        planStatus: 'cancelled'
    }, { merge: true });

    res.status(200).json({ ok: true });
};
