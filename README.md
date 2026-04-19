# Controle de Colhedoras - Tempos Produtivos 🌾

Sistema web PWA para cálculo operacional de colhedoras agrícolas.

## Funcionalidades

- 📋 Cadastro de colhedoras (adicionar, editar, excluir)
- 🧮 Cálculos automáticos de Ton/h e relação Transbordo/Colhedora
- 🚛 Cálculo de caminhões necessários por hora
- 📊 Totais automáticos em tempo real
- 💾 Dados salvos no LocalStorage (persistem entre sessões)
- 📱 PWA - funciona offline como um app no celular
- 🖥️ Layout responsivo (desktop fullscreen + mobile)

## Como usar no celular (sem internet)

1. Acesse o link do GitHub Pages no navegador do celular
2. Toque no menu do navegador (⋮) e selecione **"Adicionar à tela inicial"**
3. O app será instalado como um ícone na sua tela
4. Após a primeira abertura, funciona **100% offline**

## Fórmulas

- **Ton/h** = (18 × 60) ÷ Tempo de carregamento
- **Relação Transbordo** = Tempo de ciclo ÷ Tempo de carregamento
- **Caminhões/h** = Total Ton/h ÷ Capacidade do caminhão
