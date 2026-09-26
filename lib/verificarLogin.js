// ===========================
// Lê o cabeçalho "Authorization: Bearer <idToken>" que o front-end manda em
// toda chamada, confirma com o Firebase que o token é válido, e devolve
// quem é a pessoa logada. Substitui o que o Firebase Functions
// (request.auth) fazia sozinho antes.
// ===========================

const { getAdmin } = require('./firebaseAdmin');

async function verificarLogin(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        const err = new Error('Você precisa estar logado.');
        err.status = 401;
        throw err;
    }

    const admin = getAdmin();
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        return { uid: decoded.uid, email: decoded.email };
    } catch (e) {
        const err = new Error('Sessão expirada ou inválida. Faça login novamente.');
        err.status = 401;
        throw err;
    }
}

module.exports = { verificarLogin };
