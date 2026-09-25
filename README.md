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
- 🗂️ Abas: **Colhedoras**, **Capacidade Produtiva** e **Tempo de Colheita**
- 🕒 Tempo de Colheita com data/hora de Brasília (UTC−3) e previsão de término

## Como usar no celular (sem internet)

1. Acesse o link do GitHub Pages no navegador do celular
2. Toque no menu do navegador (⋮) e selecione **"Adicionar à tela inicial"**
3. O app será instalado como um ícone na sua tela
4. Após a primeira abertura, funciona **100% offline**

## Fórmulas

- **Ton/h** = (18 × 60) ÷ Tempo de carregamento
- **Relação Transbordo** = Tempo de ciclo ÷ Tempo de carregamento
- **Caminhões/h** = Total Ton/h ÷ Capacidade do caminhão

### Capacidade Produtiva (aba)

- Produtividade base = Tch ÷ Divisor × Velocidade
- Após manobra = base × (1 − Manobra/100)
- **Resultado (t/dia)** = após manobra × Horas × Nº de máquinas
- Divisores disponíveis: 3,333 · 4,166 · 6,666 (Horas inicia em 13)

### Tempo de Colheita (aba)

Parâmetros internos: 15 h de colheita por dia e divisor 6,667.

- Capacidade diária = Velocidade × 15 ÷ 6,667 × Qtd. de colhedoras
- Hectares/hora = capacidade diária ÷ 24
- Horas totais = (Hectares ÷ Hectares/hora) × (1 + Manobra/100)
- Dias = Horas totais ÷ 24
- Previsão de término = data/hora inicial (Brasília, UTC−3) + horas totais (com segundos)

> Estas fórmulas são apenas documentação de desenvolvimento e não são exibidas na interface.

## Atualização do PWA

Ao alterar arquivos do app, incremente `CACHE_NAME` em `sw.js` (atualmente `colhedoras-v11`)
e mantenha a lista `STATIC_ASSETS` em dia (inclui `calculadoras.js`, `planos.html` e as telas de admin).
O app também se atualiza sozinho: ao voltar pra ele (ou abrir), procura uma versão nova do `sw.js` e recarrega a página quando encontra.
