// --- Dá acesso premium (com data de validade) a quem pagou via Pix ---
// Usado tanto pelo polling (consultarStatusPix) quanto pelo webhook.
const { getAdmin } = require('./firebaseAdmin');

const DIAS_PIX_TRIMESTRE = 90;

async function aprovarPagamentoPix(pagamento) {
    const uid = pagamento.external_reference;
    if (!uid || pagamento.status !== 'approved') return;

    const admin = getAdmin();
    const expiraEm = new Date(Date.now() + DIAS_PIX_TRIMESTRE * 24 * 60 * 60 * 1000);
    await admin.firestore().collection('users').doc(uid).set({
        plan: 'premium',
        planStatus: 'pix',
        pixPaymentId: pagamento.id,
        planExpiraEm: admin.firestore.Timestamp.fromDate(expiraEm)
    }, { merge: true });
}

module.exports = { aprovarPagamentoPix, DIAS_PIX_TRIMESTRE };
