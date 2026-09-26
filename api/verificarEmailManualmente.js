// --- Confirma manualmente o e-mail de um usuário. Só um admin pode chamar. ---
// Usado quando o link de confirmação não funciona no aparelho da pessoa
// (ex.: alguns iPhones não abrem o link corretamente). Como o "emailVerified"
// é um dado do Firebase Authentication (não do Firestore), só o Admin SDK,
// rodando no servidor, pode alterá-lo — por isso essa API existe.
const { aplicarCors } = require('../lib/cors');
const { verificarLogin } = require('../lib/verificarLogin');
const { getAdmin } = require('../lib/firebaseAdmin');

module.exports = async function (req, res) {
    if (aplicarCors(req, res)) return;
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método não permitido.' });
        return;
    }

    let quemChamou;
    try {
        quemChamou = await verificarLogin(req);
    } catch (err) {
        res.status(err.status || 401).json({ error: err.message });
        return;
    }

    const uidAlvo = req.body && req.body.uid;
    if (!uidAlvo || typeof uidAlvo !== 'string') {
        res.status(400).json({ error: 'Informe o uid do usuário.' });
        return;
    }

    const admin = getAdmin();
    const db = admin.firestore();

    // Confirma que quem está chamando é admin
    const perfilQuemChamou = await db.collection('users').doc(quemChamou.uid).get();
    if (!perfilQuemChamou.exists || perfilQuemChamou.data().role !== 'admin') {
        res.status(403).json({ error: 'Só administradores podem confirmar e-mails manualmente.' });
        return;
    }

    try {
        await admin.auth().updateUser(uidAlvo, { emailVerified: true });
    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            res.status(404).json({ error: 'Usuário não encontrado.' });
            return;
        }
        console.error('Erro ao confirmar e-mail manualmente:', err);
        res.status(500).json({ error: 'Não foi possível confirmar o e-mail agora.' });
        return;
    }

    // A tela "verificar-email.html" já confere sozinha a cada 5s, então a
    // pessoa é liberada automaticamente, sem precisar recarregar nada.
    res.status(200).json({ ok: true });
};
