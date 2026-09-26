// --- Corrige o campo "emailVerified" no Firestore pra bater com o que o
// Firebase Authentication realmente sabe. Só um admin pode chamar. ---
// Por que essa API existe: o Firestore só fica sabendo que alguém confirmou
// o e-mail quando a PRÓPRIA PESSOA reabre o app (é o auth.js que copia o
// dado ali). Se ela confirmou e nunca mais voltou a abrir, o Firestore fica
// desatualizado e o botão "Confirmar e-mail" continua aparecendo pra ela no
// painel, mesmo já estando verificada de verdade. Essa API resolve isso
// direto na fonte (Firebase Auth), sem depender de ninguém reabrir nada.
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

    const admin = getAdmin();
    const db = admin.firestore();

    const perfilQuemChamou = await db.collection('users').doc(quemChamou.uid).get();
    if (!perfilQuemChamou.exists || perfilQuemChamou.data().role !== 'admin') {
        res.status(403).json({ error: 'Só administradores podem sincronizar e-mails.' });
        return;
    }

    // Só olha quem já foi cadastrado com exigência de verificação e ainda
    // não está marcado como verificado no Firestore (evita varrer todo mundo)
    const candidatos = await db.collection('users')
        .where('exigeVerificacaoEmail', '==', true)
        .get();

    const pendentes = candidatos.docs.filter(function (doc) {
        return doc.data().emailVerified !== true;
    });

    if (pendentes.length === 0) {
        res.status(200).json({ ok: true, sincronizados: 0 });
        return;
    }

    let sincronizados = 0;
    const lote = db.batch();

    // Confere um por um direto no Firebase Auth (fonte da verdade)
    const resultados = await Promise.all(pendentes.map(function (doc) {
        return admin.auth().getUser(doc.id)
            .then(function (userRecord) { return { id: doc.id, emailVerified: userRecord.emailVerified }; })
            .catch(function () { return null; }); // usuário pode ter sido excluído do Auth
    }));

    resultados.forEach(function (r) {
        if (r && r.emailVerified) {
            lote.update(db.collection('users').doc(r.id), { emailVerified: true });
            sincronizados++;
        }
    });

    if (sincronizados > 0) {
        await lote.commit();
    }

    res.status(200).json({ ok: true, sincronizados: sincronizados });
};
