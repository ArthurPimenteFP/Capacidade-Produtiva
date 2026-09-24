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
    // Faz os e-mails do Firebase (confirmar e-mail, redefinir senha) saírem em português
    auth.languageCode = 'pt-BR';
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

    // O teste grátis (7 dias, sem cartão) é criado pelo SERVIDOR
    // (api/registrarUsuario.js), junto com a checagem de CPF. Aqui o
    // navegador só cria o login e pede pro servidor concluir o cadastro.
    let registrando = false; // evita que login/cadastro redirecionem no meio do processo

    function registrar(nome, email, senha, cpf) {
        registrando = true;
        return auth.createUserWithEmailAndPassword(email, senha)
            .catch(function (err) {
                registrando = false;
                throw new Error(traduzErro(err));
            })
            .then(function (cred) {
                return chamarApi('registrarUsuario', { nome: nome, cpf: cpf })
                    .then(function () {
                        return cred.user.updateProfile({ displayName: nome }).catch(function () { });
                    })
                    .then(function () {
                        // Manda o e-mail de confirmação (link) - o app só libera depois de confirmar
                        return cred.user.sendEmailVerification().catch(function (e) { console.error(e); });
                    })
                    .then(function () {
                        registrando = false;
                        return cred;
                    })
                    .catch(function (err) {
                        registrando = false;
                        // Cadastro não concluído (ex.: CPF já usado): desfaz a conta de login
                        return cred.user.delete().catch(function () { return auth.signOut(); }).then(function () {
                            throw err;
                        });
                    });
            });
    }

    // --- Login ---
    function login(email, senha) {
        return auth.signInWithEmailAndPassword(email, senha)
            .catch(function (err) {
                throw new Error(traduzErro(err));
            });
    }

    // --- Esqueci a senha: manda um e-mail com o link pra criar uma nova senha ---
    // Por segurança, não revela se o e-mail existe ou não (mesma resposta nos dois casos).
    function redefinirSenha(email) {
        return auth.sendPasswordResetEmail(email).catch(function (err) {
            if (err.code === 'auth/user-not-found') return; // finge que enviou
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
                    planStatus: perfil.planStatus || 'none',
                    planoEscolhido: perfil.planoEscolhido || null,
                    trialEnd: perfil.trialEnd || null,
                    planExpiraEm: perfil.planExpiraEm || null,
                    cpfMascarado: perfil.cpfMascarado || null,
                    exigeVerificacaoEmail: !!perfil.exigeVerificacaoEmail,
                    emailVerified: user.emailVerified
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

    // --- Chama uma das funções hospedadas na Vercel (api/*.js), no lugar
    // do antigo Cloud Functions. Sempre manda o token de login atual no
    // cabeçalho Authorization, pra função na Vercel confirmar quem está
    // chamando (equivalente ao "request.auth" que o Firebase dava de graça). ---
    function chamarApi(nome, dados) {
        if (!window.API_BASE_URL) {
            return Promise.reject(new Error('API_BASE_URL não configurada. Veja api-config.js.'));
        }
        const usuario = auth.currentUser;
        if (!usuario) {
            return Promise.reject(new Error('Você precisa estar logado.'));
        }
        return usuario.getIdToken().then(function (token) {
            return fetch(window.API_BASE_URL + '/api/' + nome, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(dados || {})
            });
        }).then(function (resp) {
            return resp.json().catch(function () { return {}; }).then(function (data) {
                if (!resp.ok) {
                    throw new Error(data.error || 'Erro ao chamar o servidor.');
                }
                return data;
            });
        });
    }

    // --- Calcula quantos dias faltam do teste grátis (0 se já acabou) ---
    function diasRestantesTeste(perfil) {
        if (!perfil.trialEnd) return 0;
        const fim = perfil.trialEnd.toDate ? perfil.trialEnd.toDate() : new Date(perfil.trialEnd);
        const ms = fim.getTime() - Date.now();
        return ms > 0 ? Math.ceil(ms / (24 * 60 * 60 * 1000)) : 0;
    }

    // --- Resumo do teste grátis pra mostrar contagem regressiva:
    // { expirou, texto: "6 dias e 4h", fim: Date } (null se não tem teste) ---
    function resumoTeste(perfil) {
        if (!perfil.trialEnd) return null;
        const fim = perfil.trialEnd.toDate ? perfil.trialEnd.toDate() : new Date(perfil.trialEnd);
        const ms = fim.getTime() - Date.now();
        if (ms <= 0) return { expirou: true, texto: '', fim: fim };
        const dias = Math.floor(ms / 86400000);
        const horas = Math.floor((ms % 86400000) / 3600000);
        const min = Math.floor((ms % 3600000) / 60000);
        let texto;
        if (dias >= 1) {
            texto = dias + (dias === 1 ? ' dia' : ' dias') + (horas ? ' e ' + horas + 'h' : '');
        } else if (horas >= 1) {
            texto = horas + 'h e ' + min + 'min';
        } else {
            texto = Math.max(min, 1) + ' min';
        }
        return { expirou: false, texto: texto, fim: fim };
    }

    // --- Calcula quantos dias faltam pro Pix vencer (null se não estiver no
    // plano Pix ou não tiver data de expiração; 0 se já venceu) ---
    function diasRestantesPix(perfil) {
        if (perfil.planStatus !== 'pix' || !perfil.planExpiraEm) return null;
        const fim = perfil.planExpiraEm.toDate ? perfil.planExpiraEm.toDate() : new Date(perfil.planExpiraEm);
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
            // Contas novas precisam confirmar o e-mail (link enviado no cadastro)
            if (perfil.role !== 'admin' && perfil.exigeVerificacaoEmail && !perfil.emailVerified) {
                window.location.href = 'verificar-email.html';
                return;
            }
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
            if (user && !registrando) window.location.href = 'index.html';
        });
    }

    window.AppAuth = {
        auth: auth,
        db: db,
        chamarApi: chamarApi,
        registrar: registrar,
        login: login,
        redefinirSenha: redefinirSenha,
        logout: logout,
        buscarPerfil: buscarPerfil,
        exigirLogin: exigirLogin,
        exigirAdmin: exigirAdmin,
        exigirAssinaturaAtiva: exigirAssinaturaAtiva,
        redirecionarSeLogado: redirecionarSeLogado,
        diasRestantesTeste: diasRestantesTeste,
        resumoTeste: resumoTeste,
        diasRestantesPix: diasRestantesPix,
        acessoLiberado: acessoLiberado
    };
})();
