// --- Trava de "1 sessão por vez" por conta (exceto administradores) ---
// Chamado pelo navegador logo depois de um login/cadastro bem-sucedido,
// ANTES de liberar o app. Roda no SERVIDOR de propósito, usando o Admin
// SDK (que ignora as regras do Firestore) — assim a checagem nunca falha
// por causa de permissão, diferente da tentativa anterior de gravar isso
// direto do navegador.
//
// Regra: se a conta já está marcada como "sessaoAtiva: true" (ou seja, já
// tem outro aparelho logado que ainda não saiu), este login é REJEITADO
// (o navegador desfaz o login que acabou de fazer). Se não está marcada,
// este aparelho passa a ser o "dono" da sessão (marca sessaoAtiva: true).
// Um administrador nunca é bloqueado nem marca a trava.
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
};
