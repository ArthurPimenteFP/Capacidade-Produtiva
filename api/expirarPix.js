// --- Roda 1x por dia (Vercel Cron, veja vercel.json): revoga o acesso de
// quem pagou via Pix e passou do prazo (1 mês) sem renovar. Protegida por
// CRON_SECRET - a Vercel manda esse valor sozinha no cabeçalho
// Authorization quando aciona o cron, então ninguém de fora consegue
// chamar essa URL manualmente. ---
const { getAdmin } = require('../lib/firebaseAdmin');

module.exports = async function (req, res) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
        res.status(401).send('não autorizado');
        return;
    }

    const admin = getAdmin();
    const db = admin.firestore();
    const agora = admin.firestore.Timestamp.now();

    const vencidos = await db.collection('users')
        .where('planStatus', '==', 'pix')
        .where('planExpiraEm', '<=', agora)
        .get();

    const lote = db.batch();
    vencidos.forEach(function (doc) {
        lote.update(doc.ref, { plan: 'free', planStatus: 'expirado' });
    });
    if (!vencidos.empty) {
        await lote.commit();
    }

    res.status(200).json({ revogados: vencidos.size });
};
