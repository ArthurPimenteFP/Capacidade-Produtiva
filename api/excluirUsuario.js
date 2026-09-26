// --- Exclui a conta de um usuário (login + dados). Só um admin pode chamar. ---
// Apaga: o login no Firebase Authentication, o perfil em "users/{uid}", os
// dados salvos em "userdata/{uid}", o pedido de ajuda em "pedidosVerificacao/{uid}"
// (se existir) e os tokens de notificação em "pushTokens/{uid}/tokens/*".
// Não dá pra desfazer.
const { aplicarCors } = require('./_lib/cors');
const { verificarLogin } = require('./_lib/verificarLogin');
const { getAdmin } = require('./_lib/firebaseAdmin');

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

    const uidParaExcluir = req.body && req.body.uid;
    if (!uidParaExcluir || typeof uidParaExcluir !== 'string') {
        res.status(400).json({ error: 'Informe o uid do usuário a excluir.' });
        return;
    }

    if (uidParaExcluir === quemChamou.uid) {
        res.status(400).json({ error: 'Você não pode excluir a própria conta por aqui.' });
        return;
    }

    const admin = getAdmin();
    const db = admin.firestore();

    // Confirma que quem está chamando é admin (lendo o próprio perfil dele,
    // igual às Firestore rules fazem para outras ações administrativas)
    const perfilQuemChamou = await db.collection('users').doc(quemChamou.uid).get();
    if (!perfilQuemChamou.exists || perfilQuemChamou.data().role !== 'admin') {
        res.status(403).json({ error: 'Só administradores podem excluir contas.' });
        return;
    }

    // Apaga o login (Firebase Authentication). Se a conta já não existir lá
    // (auth/user-not-found), segue em frente e limpa os dados mesmo assim.
    try {
        await admin.auth().deleteUser(uidParaExcluir);
    } catch (err) {
        if (err.code !== 'auth/user-not-found') {
            console.error('Erro ao excluir usuário no Authentication:', err);
            res.status(500).json({ error: 'Não foi possível excluir o login do usuário.' });
            return;
        }
    }

    // Apaga os dados no Firestore (perfil + cálculos salvos + pedido de ajuda
    // de verificação de e-mail, se houver + tokens de notificação salvos)
    try {
        const batch = db.batch();
        batch.delete(db.collection('users').doc(uidParaExcluir));
        batch.delete(db.collection('userdata').doc(uidParaExcluir));
        batch.delete(db.collection('pedidosVerificacao').doc(uidParaExcluir));
        await batch.commit();

        // A subcoleção pushTokens/{uid}/tokens pode ter vários documentos
        // (um por aparelho/navegador), então não dá pra apagar com um único
        // .delete() no doc pai — precisa listar e apagar cada token.
        const tokensSnap = await db
            .collection('pushTokens')
            .doc(uidParaExcluir)
            .collection('tokens')
            .get();
        if (!tokensSnap.empty) {
            const batchTokens = db.batch();
            tokensSnap.forEach((doc) => batchTokens.delete(doc.ref));
            await batchTokens.commit();
        }
    } catch (err) {
        console.error('Erro ao excluir dados no Firestore:', err);
        res.status(500).json({ error: 'O login foi excluído, mas houve um erro ao apagar os dados salvos. Avise o suporte.' });
        return;
    }

    res.status(200).json({ ok: true });
};
