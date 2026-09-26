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
  apiKey: "AIzaSyBUVO32fUsugyMBPF-wXD_7E1l6Co3YDHE",
  authDomain: "controle-colhedoras.firebaseapp.com",
  projectId: "controle-colhedoras",
  storageBucket: "controle-colhedoras.firebasestorage.app",
  messagingSenderId: "686733003266",
  appId: "1:686733003266:web:c8f78b97163d9f8cc1b51b"
};

// ===========================
// NOTIFICAÇÕES PUSH (Firebase Cloud Messaging)
// ===========================
// Chave pública usada pra registrar o navegador do admin pra receber
// notificações push (funciona até com o site fechado). Gere a sua em:
// Firebase Console > Configurações do projeto > Cloud Messaging >
// "Certificados push da Web" > Gerar par de chaves. Cole o valor que
// aparecer (uma string longa) abaixo, entre as aspas.
window.FIREBASE_VAPID_KEY = "BJhDClA-fWFpO7K-GBzTQOJFYzeoiuUiVfAWjQQ8j8GQHoLtagR8sdo_75V9rQky1tGdCuPWdEfw07TEv4XQG4E";
