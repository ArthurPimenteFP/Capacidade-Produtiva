// --- Avisa todos os admins (por notificação push no celular/navegador)
// quando alguém clica em "Não consegui confirmar o e-mail". ---
// Quem chama essa API é a PESSOA COM PROBLEMA (não um admin), por isso ela
// só exige estar logado — mas, pra evitar spam, só manda a notificação se
// existir de fato um pedido de ajuda pendente (documento em
// "pedidosVerificacao/{uid}" com atendido = false) criado pela mesma pessoa.
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

    const admin = getAdmin();
    const db = admin.firestore();

    // Confirma que existe mesmo um pedido pendente dessa pessoa
    const pedidoDoc = await db.collection('pedidosVerificacao').doc(quemChamou.uid).get();
    if (!pedidoDoc.exists || pedidoDoc.data().atendido !== false) {
        res.status(400).json({ error: 'Nenhum pedido de ajuda pendente encontrado.' });
        return;
    }
    const pedido = pedidoDoc.data();

    // Busca todos os admins e os tokens de notificação push deles
    const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
    if (adminsSnap.empty) {
        res.status(200).json({ ok: true, enviados: 0 });
        return;
    }

    const tokensPorAdmin = {}; // uidAdmin -> [tokens]
    const todosTokens = [];
    for (const doc of adminsSnap.docs) {
        const tokensSnap = await db.collection('pushTokens').doc(doc.id).collection('tokens').get();
        const tokens = tokensSnap.docs.map(function (t) { return t.id; });
        if (tokens.length) {
            tokensPorAdmin[doc.id] = tokens;
            todosTokens.push.apply(todosTokens, tokens);
        }
    }

    if (todosTokens.length === 0) {
        // Nenhum admin ativou notificações push ainda — não é erro, o banner
        // no painel admin continua funcionando normalmente.
        res.status(200).json({ ok: true, enviados: 0 });
        return;
    }

    let enviados = 0;
    try {
        const resposta = await admin.messaging().sendEachForMulticast({
            tokens: todosTokens,
            notification: {
                title: 'Pedido de ajuda com verificação',
                body: (pedido.name || pedido.email || 'Um usuário') + ' não conseguiu confirmar o e-mail.'
            },
            data: { url: 'admin.html' },
            webpush: {
                fcmOptions: { link: 'admin.html' }
            }
        });
        enviados = resposta.successCount;

        // Remove tokens que não são mais válidos (navegador desinstalado,
        // permissão revogada, etc.) pra não acumular lixo no banco
        const tokensInvalidos = [];
        resposta.responses.forEach(function (r, i) {
            if (!r.success) {
                const codigo = r.error && r.error.code;
                if (codigo === 'messaging/registration-token-not-registered' || codigo === 'messaging/invalid-registration-token') {
                    tokensInvalidos.push(todosTokens[i]);
                }
            }
        });
        if (tokensInvalidos.length) {
            const lote = db.batch();
            Object.keys(tokensPorAdmin).forEach(function (uidAdmin) {
                tokensPorAdmin[uidAdmin].forEach(function (token) {
                    if (tokensInvalidos.indexOf(token) !== -1) {
                        lote.delete(db.collection('pushTokens').doc(uidAdmin).collection('tokens').doc(token));
                    }
                });
            });
            await lote.commit();
        }
    } catch (err) {
        console.error('Erro ao enviar notificação push:', err);
        // Não falha a resposta pro usuário por causa disso — o banner no
        // painel admin (Firestore em tempo real) continua funcionando.
    }

    res.status(200).json({ ok: true, enviados: enviados });
};
