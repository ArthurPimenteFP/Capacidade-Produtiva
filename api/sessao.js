// --- Trava de "1 sessão por vez" por conta (exceto administradores) ---
// Junta em um único arquivo o que antes eram dois endpoints
// (verificarSessao.js e encerrarSessao.js). Motivo: o plano Hobby da
// Vercel permite no máximo 12 Serverless Functions por deploy, e ter os
// dois arquivos separados estourava esse limite. A lógica de cada um foi
// mantida 100% igual, só que agora escolhida pelo campo "acao" do corpo
// da requisição.
//
// Roda no SERVIDOR de propósito, usando o Admin SDK (que ignora as regras
// do Firestore) — assim a checagem/gravação nunca falha por causa de
// permissão, diferente da tentativa anterior de gravar isso direto do
// navegador.
const { aplicarCors } = require('./_lib/cors');
const { verificarLogin } = require('./_lib/verificarLogin');
const { getAdmin } = require('./_lib/firebaseAdmin');

async function verificar(req, res) {
    let usuario;
    try {
        usuario = await verificarLogin(req);
    } catch (err) {
        res.status(err.status || 401).json({ error: err.message });
        return;
    }

    try {
        const admin = getAdmin();
        const db = admin.firestore();
        const userRef = db.collection('users').doc(usuario.uid);

        // Transação: evita que dois aparelhos logando ao mesmo tempo
        // "passem" os dois pela checagem antes de qualquer um marcar a trava.
        const resultado = await db.runTransaction(async function (t) {
            const doc = await t.get(userRef);
            const dados = doc.exists ? doc.data() : {};

            if (dados.role === 'admin') {
                return 'liberado';
            }
            if (dados.sessaoAtiva === true) {
                return 'bloqueado';
            }
            t.set(userRef, { sessaoAtiva: true }, { merge: true });
            return 'liberado';
        });

        if (resultado === 'bloqueado') {
            res.status(409).json({
                error: 'Esta conta já está sendo usada em outro aparelho. Peça para sair lá primeiro, ou aguarde alguns minutos.'
            });
            return;
        }

        res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Erro ao verificar sessão:', err);
        res.status(500).json({ error: 'Não foi possível verificar a sessão. Tente novamente.' });
    }
}

async function encerrar(req, res) {
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
}

module.exports = async function (req, res) {
    if (aplicarCors(req, res)) return;
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método não permitido.' });
        return;
    }

    const acao = (req.body && req.body.acao) || 'verificar';

    if (acao === 'encerrar') {
        await encerrar(req, res);
    } else {
        await verificar(req, res);
    }
};
