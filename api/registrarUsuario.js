// --- Conclui o cadastro de um usuário novo: valida o CPF, garante "1 teste
// grátis por CPF" e cria o perfil com 7 dias de teste. ---
// Isto roda no SERVIDOR de propósito: se o navegador criasse o perfil, a
// pessoa poderia editar a data de fim do teste ou pular a checagem de CPF.
const crypto = require('crypto');
const { aplicarCors } = require('./_lib/cors');
const { verificarLogin } = require('./_lib/verificarLogin');
const { getAdmin } = require('./_lib/firebaseAdmin');
const cpfLib = require('./_lib/cpf');

const DIAS_TESTE_GRATIS = 7;
const MAX_CADASTROS_POR_IP_POR_DIA = 10;

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

    const segredo = process.env.CPF_PEPPER;
    if (!segredo) {
        console.error('Variável CPF_PEPPER não configurada na Vercel.');
        res.status(500).json({ error: 'Cadastro indisponível no momento (configuração pendente).' });
        return;
    }

    const nome = String((req.body && req.body.nome) || '').trim();
    const cpf = cpfLib.limpar(req.body && req.body.cpf);
    if (nome.length < 2) {
        res.status(400).json({ error: 'Informe seu nome.' });
        return;
    }
    if (!cpfLib.valido(cpf)) {
        res.status(400).json({ error: 'CPF inválido. Confira os números.' });
        return;
    }

    const admin = getAdmin();
    const db = admin.firestore();
    const agora = new Date();
    const cpfRef = db.collection('cpfs').doc(cpfLib.hash(cpf, segredo));
    const userRef = db.collection('users').doc(usuario.uid);

    try {
        // --- Limite de cadastros por IP por dia (freia quem cria várias contas) ---
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'desconhecido').split(',')[0].trim();
        const chaveIp = crypto.createHmac('sha256', segredo).update(ip).digest('hex').slice(0, 24)
            + '-' + agora.toISOString().slice(0, 10);
        const limiteRef = db.collection('limitesCadastro').doc(chaveIp);
        const excedeu = await db.runTransaction(async function (t) {
            const snap = await t.get(limiteRef);
            const total = snap.exists ? snap.data().total : 0;
            if (total >= MAX_CADASTROS_POR_IP_POR_DIA) return true;
            t.set(limiteRef, { total: total + 1, dia: agora.toISOString().slice(0, 10) });
            return false;
        });
        if (excedeu) {
            await admin.auth().deleteUser(usuario.uid).catch(function () { });
            res.status(429).json({ error: 'Muitos cadastros feitos por esta conexão hoje. Tente novamente amanhã.' });
            return;
        }

        // --- Se o CPF pertencia a uma conta que foi apagada, libera de novo ---
        const antigo = await cpfRef.get();
        if (antigo.exists && antigo.data().uid !== usuario.uid) {
            try {
                await admin.auth().getUser(antigo.data().uid);
            } catch (e) {
                if (e.code === 'auth/user-not-found') await cpfRef.delete();
            }
        }

        // --- Reserva o CPF e cria o perfil, tudo ou nada ---
        const resultado = await db.runTransaction(async function (t) {
            const userSnap = await t.get(userRef);
            if (userSnap.exists && userSnap.data().trialEnd) return 'ja-registrado';
            const cpfSnap = await t.get(cpfRef);
            if (cpfSnap.exists && cpfSnap.data().uid !== usuario.uid) return 'cpf-em-uso';

            const fimTeste = new Date(agora.getTime() + DIAS_TESTE_GRATIS * 24 * 60 * 60 * 1000);
            t.set(cpfRef, { uid: usuario.uid, criadoEm: admin.firestore.FieldValue.serverTimestamp() });
            t.set(userRef, {
                name: nome,
                email: usuario.email,
                role: 'user',
                plan: 'trial',
                planStatus: 'trial',
                trialEnd: admin.firestore.Timestamp.fromDate(fimTeste),
                cpfMascarado: cpfLib.mascarar(cpf),
                exigeVerificacaoEmail: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return 'ok';
        });

        if (resultado === 'cpf-em-uso') {
            // Apaga a conta recém-criada pra o e-mail não ficar "queimado"
            await admin.auth().deleteUser(usuario.uid).catch(function () { });
            res.status(409).json({ error: 'Este CPF já está cadastrado. Entre na conta existente ou fale com o suporte.' });
            return;
        }

        res.status(200).json({ ok: true, diasTeste: DIAS_TESTE_GRATIS });
    } catch (err) {
        console.error('Erro ao registrar usuário:', err);
        res.status(500).json({ error: 'Não foi possível concluir o cadastro. Tente novamente.' });
    }
};
