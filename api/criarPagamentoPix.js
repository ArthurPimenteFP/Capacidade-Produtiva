// --- Cria um pagamento único via Pix (R$ 15,90 = 1 mês, sem renovação automática) ---
const { aplicarCors } = require('./_lib/cors');
const { verificarLogin } = require('./_lib/verificarLogin');
const { getAdmin } = require('./_lib/firebaseAdmin');

const VALOR_PIX_MENSAL = 15.9;
const NOME_PLANO = 'Controle de Colhedoras - Plano Premium';

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
        resp = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN,
                'Content-Type': 'application/json',
                // Evita cobrança duplicada se o usuário clicar 2x rapidamente
                'X-Idempotency-Key': usuario.uid + '-pix-' + Date.now()
            },
            body: JSON.stringify({
                transaction_amount: VALOR_PIX_MENSAL,
                description: NOME_PLANO + ' - Pix (1 mês)',
                payment_method_id: 'pix',
                external_reference: usuario.uid,
                payer: { email: usuario.email }
            })
        });
        data = await resp.json();
    } catch (err) {
        console.error('Falha de rede ao chamar Mercado Pago (Pix):', err);
        res.status(500).json({ error: 'Não foi possível conectar ao Mercado Pago agora.' });
        return;
    }

    if (!resp.ok) {
        console.error('Erro Mercado Pago (criar Pix):', data);
        res.status(500).json({ error: 'Não foi possível gerar o Pix. Tente novamente.' });
        return;
    }

    const dadosPix = data.point_of_interaction && data.point_of_interaction.transaction_data;
    if (!dadosPix || !dadosPix.qr_code) {
        console.error('Resposta do Mercado Pago sem QR code:', data);
        res.status(500).json({ error: 'O Mercado Pago não retornou o QR code do Pix.' });
        return;
    }

    const admin = getAdmin();
    await admin.firestore().collection('users').doc(usuario.uid).set({
        pixPaymentId: data.id,
        planStatus: 'pix_pendente'
    }, { merge: true });

    res.status(200).json({
        paymentId: data.id,
        qrCode: dadosPix.qr_code,
        qrCodeBase64: dadosPix.qr_code_base64
    });
};
