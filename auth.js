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

    // --- Cadastro de novo usuário comum ---
    function registrar(nome, email, senha) {
        return auth.createUserWithEmailAndPassword(email, senha)
            .then(function (cred) {
                return db.collection('users').doc(cred.user.uid).set({
                    name: nome,
                    email: email,
                    role: 'user',
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

    // --- Busca o perfil (nome/role) do usuário logado no Firestore ---
    function buscarPerfil(uid) {
        return db.collection('users').doc(uid).get().then(function (doc) {
            if (doc.exists) return doc.data();
            return { name: '', role: 'user' };
        });
    }

    // --- Protege uma página: exige usuário logado. Redireciona se não estiver. ---
    // callback(perfil) é chamado quando o usuário está confirmado.
    function exigirLogin(callback) {
        auth.onAuthStateChanged(function (user) {
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
            buscarPerfil(user.uid).then(function (perfil) {
                callback({
                    uid: user.uid,
                    email: user.email,
                    name: perfil.name || user.email,
                    role: perfil.role || 'user'
                });
            }).catch(function (err) {
                console.error('Erro ao buscar perfil:', err);
                callback({
                    uid: user.uid,
                    email: user.email,
                    name: user.email,
                    role: 'user'
                });
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

    // --- Se o usuário já estiver logado e abrir login/cadastro, manda pro app ---
    function redirecionarSeLogado() {
        auth.onAuthStateChanged(function (user) {
            if (user) window.location.href = 'index.html';
        });
    }

    window.AppAuth = {
        auth: auth,
        db: db,
        registrar: registrar,
        login: login,
        logout: logout,
        buscarPerfil: buscarPerfil,
        exigirLogin: exigirLogin,
        exigirAdmin: exigirAdmin,
        redirecionarSeLogado: redirecionarSeLogado
    };
})();
