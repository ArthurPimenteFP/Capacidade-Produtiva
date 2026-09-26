// --- Libera a trava de "1 sessão por vez" quando o usuário clica em "Sair",
// pra outro aparelho poder logar em seguida. Mesmo motivo do
// verificarSessao.js: roda no servidor com o Admin SDK pra nunca falhar
// por permissão do Firestore.
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
        // Token já expirado/inválido: a sessão já não está mais "presa" de
        // verdade (o login que a gerou não existe mais), então não é um erro.
        res.status(200).json({ ok: true });
        return;
    }

    try {
        const admin = getAdmin();
        const db = admin.firestore();
        await db.collection('users').doc(usuario.uid).set({ sessaoAtiva: false }, { merge: true });
        res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Erro ao encerrar sessão:', err);
        res.status(500).json({ error: 'Não foi possível encerrar a sessão.' });
    }
};
