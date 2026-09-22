// ===========================
// Controle de Colhedoras - Autenticação (Firebase)
// Lógica compartilhada entre login.html, cadastro.html, admin.html e index.html
// ===========================

(function () {
    'use strict';

    if (!window.firebase || !window.FIREBASE_CONFIG) {
        console.error('Firebase não está carregado. Verifique se firebase-config.js e os scripts do Firebase vêm antes de auth.js.');
        return;
    }

    if (!firebase.apps.length) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    // Tenta manter o app utilizável offline (leitura de cache local do Firestore)
    try {
        db.enablePersistence({ synchronizeTabs: true }).catch(() => { });
    } catch (e) { /* navegador sem suporte, ignora */ }

    // --- Mensagens de erro em português ---
    function traduzErro(err) {
        const map = {
            'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
            'auth/invalid-email': 'E-mail inválido.',
            'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
            'auth/user-not-found': 'E-mail ou senha incorretos.',
            'auth/wrong-password': 'E-mail ou senha incorretos.',
            'auth/invalid-credential': 'E-mail ou senha incorretos.',
            'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
            'auth/network-request-failed': 'Sem conexão com a internet. Verifique sua rede.',
            'auth/user-disabled': 'Este usuário foi desativado pelo administrador.',
        };
        return map[err.code] || ('Erro: ' + (err.message || 'não foi possível completar a ação.'));
    }

    // Duração do teste grátis (em dias). Não exige cartão: é controlado
    // só pelo Firestore, a partir da data de cadastro.
    const DIAS_TESTE_GRATIS = 5;

    // --- Cadastro de novo usuário comum ---
    // "plan: trial" = dentro do período de teste grátis (5 dias, sem cartão).
    // "trialEnd" trava a data em que o teste acaba; depois disso o acesso só
    // volta quando o Mercado Pago confirmar um pagamento (Cloud Functions).
    function registrar(nome, email, senha) {
        return auth.createUserWithEmailAndPassword(email, senha)
            .then(function (cred) {
                const agora = new Date();
                const fimTeste = new Date(agora.getTime() + DIAS_TESTE_GRATIS * 24 * 60 * 60 * 1000);
                return db.collection('users').doc(cred.user.uid).set({
                    name: nome,
                    email: email,
                    role: 'user',
                    plan: 'trial',
                    planStatus: 'trial',
                    trialEnd: firebase.firestore.Timestamp.fromDate(fimTeste),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(function () {
                    return cred.user.updateProfile({ displayName: nome });
                }).then(function () {
                    return cred;
                });
            })
            .catch(function (err) {
                throw new Error(traduzErro(err));
            });
    }

    // --- Login ---
    function login(email, senha) {
        return auth.signInWithEmailAndPassword(email, senha)
            .catch(function (err) {
                throw new Error(traduzErro(err));
            });
    }

    // --- Logout ---
    function logout() {
        return auth.signOut();
    }

    // --- Busca o perfil (nome/role/plano) do usuário logado no Firestore ---
    function buscarPerfil(uid) {
        return db.collection('users').doc(uid).get().then(function (doc) {
            if (doc.exists) return doc.data();
            return { name: '', role: 'user', plan: 'none', planStatus: 'none' };
        });
    }

    // --- Protege uma página: exige usuário logado. Redireciona se não estiver. ---
    // callback(perfil) é chamado sempre que o perfil mudar (em tempo real),
    // o que permite o app liberar o acesso automaticamente assim que o
    // pagamento for confirmado, sem precisar recarregar a página.
    function exigirLogin(callback) {
        auth.onAuthStateChanged(function (user) {
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
            db.collection('users').doc(user.uid).onSnapshot(function (doc) {
                const perfil = doc.exists ? doc.data() : {};
                callback({
                    uid: user.uid,
                    email: user.email,
                    name: perfil.name || user.email,
                    role: perfil.role || 'user',
                    plan: perfil.plan || 'none',
                    planStatus: perfil.planStatus || 'none'
                });
            }, function (err) {
                console.error('Erro ao observar perfil:', err);
            });
        });
    }

    // --- Protege uma página apenas para administradores ---
    function exigirAdmin(callback) {
        exigirLogin(function (perfil) {
            if (perfil.role !== 'admin') {
                window.location.href = 'index.html';
                return;
            }
            callback(perfil);
        });
    }

    // --- Calcula quantos dias faltam do teste grátis (0 se já acabou) ---
    function diasRestantesTeste(perfil) {
        if (!perfil.trialEnd) return 0;
        const fim = perfil.trialEnd.toDate ? perfil.trialEnd.toDate() : new Date(perfil.trialEnd);
        const ms = fim.getTime() - Date.now();
        return ms > 0 ? Math.ceil(ms / (24 * 60 * 60 * 1000)) : 0;
    }

    // --- Diz se o acesso está liberado agora (teste grátis ainda no prazo,
    // Pix ainda dentro da validade de 3 meses, ou assinatura recorrente ativa) ---
    function acessoLiberado(perfil) {
        if (perfil.role === 'admin') return true;
        if (perfil.plan === 'trial') return diasRestantesTeste(perfil) > 0;
        if (perfil.plan === 'premium') {
            // Assinaturas via Pix têm data de expiração (planExpiraEm); via
            // cartão (recorrente) esse campo não existe e o acesso segue até
            // o Mercado Pago avisar o webhook de um cancelamento.
            if (perfil.planExpiraEm) {
                const fim = perfil.planExpiraEm.toDate ? perfil.planExpiraEm.toDate() : new Date(perfil.planExpiraEm);
                return fim.getTime() > Date.now();
            }
            return true;
        }
        return false;
    }

    // --- Protege o app: exige login E acesso liberado (teste, Pix ou cartão) ---
    function exigirAssinaturaAtiva(callback) {
        exigirLogin(function (perfil) {
            if (acessoLiberado(perfil)) {
                callback(perfil);
            } else {
                window.location.href = 'planos.html';
            }
        });
    }

    // --- Se o usuário já estiver logado e abrir login/cadastro, manda pro app ---
    // (o próprio index.html decide se o mostra ou redireciona pra tela de assinatura)
    function redirecionarSeLogado() {
        auth.onAuthStateChanged(function (user) {
            if (user) window.location.href = 'index.html';
        });
    }

    window.AppAuth = {
        auth: auth,
        db: db,
        functions: firebase.functions ? firebase.app().functions('southamerica-east1') : null,
        registrar: registrar,
        login: login,
        logout: logout,
        buscarPerfil: buscarPerfil,
        exigirLogin: exigirLogin,
        exigirAdmin: exigirAdmin,
        exigirAssinaturaAtiva: exigirAssinaturaAtiva,
        redirecionarSeLogado: redirecionarSeLogado,
        diasRestantesTeste: diasRestantesTeste,
        acessoLiberado: acessoLiberado
    };
})();
