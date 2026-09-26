// ===========================
// Inicializa o Firebase Admin SDK (usado pra verificar login e ler/escrever
// no Firestore de fora do Firebase, aqui na Vercel).
// ===========================
// A chave da service account fica na variável de ambiente
// FIREBASE_SERVICE_ACCOUNT_BASE64 (o JSON baixado no Firebase Console,
// codificado em base64 - veja o passo a passo no README-VERCEL.md).

const admin = require('firebase-admin');

function getAdmin() {
    if (!admin.apps.length) {
        const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
        if (!base64) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 não configurada nas variáveis de ambiente da Vercel.');
        }
        const json = Buffer.from(base64, 'base64').toString('utf8');
        const serviceAccount = JSON.parse(json);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    return admin;
}

module.exports = { getAdmin };
