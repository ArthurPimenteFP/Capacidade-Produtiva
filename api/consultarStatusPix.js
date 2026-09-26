// --- Consulta o status de um pagamento Pix (o front usa isso pra saber na
// hora se a pessoa já pagou, sem precisar esperar o webhook) ---
const { aplicarCors } = require('../lib/cors');
const { verificarLogin } = require('../lib/verificarLogin');
const { aprovarPagamentoPix } = require('../lib/aprovarPagamentoPix');

module.exports = async function (req, res) {
    if (aplicarCors(req, res)) return;
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método não permitido.' });
        return;
    }

    try {
        await verificarLogin(req);
    } catch (err) {
        res.status(err.status || 401).json({ error: err.message });
        return;
    }

    const paymentId = req.body && req.body.paymentId;
    if (!paymentId) {
        res.status(400).json({ error: 'Informe o paymentId.' });
        return;
    }

    const resp = await fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
        headers: { 'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN }
    });
    const data = await resp.json();
    if (!resp.ok) {
        res.status(500).json({ error: 'Não foi possível consultar o pagamento.' });
        return;
    }

    if (data.status === 'approved') {
        await aprovarPagamentoPix(data);
    }

    res.status(200).json({ status: data.status });
};
