// ===========================
// CONFIGURAÇÃO DO FIREBASE
// ===========================
// 1. Crie um projeto gratuito em https://console.firebase.google.com
// 2. No projeto, vá em "Configurações do projeto" > "Geral" > "Seus apps" > ícone "</>" (Web)
// 3. Copie o objeto "firebaseConfig" que aparecer e cole substituindo os valores abaixo
// 4. Siga o passo a passo completo em README-FIREBASE.md antes de publicar o app
//
// IMPORTANTE: estas chaves NÃO são secretas (são de uso público no navegador).
// A segurança real do banco de dados é feita pelas "Regras" do Firestore
// (arquivo firestore.rules), não por esconder este arquivo.

window.FIREBASE_CONFIG = {
    apiKey: "COLE_AQUI_SUA_API_KEY",
    authDomain: "SEU-PROJETO.firebaseapp.com",
    projectId: "SEU-PROJETO",
    storageBucket: "SEU-PROJETO.appspot.com",
    messagingSenderId: "COLE_AQUI",
    appId: "COLE_AQUI"
};
