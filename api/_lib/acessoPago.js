// --- Diz se a pessoa já tem acesso PAGO ativo (cartão ou Pix dentro do prazo).
// Usado pra impedir novo pagamento antes da hora (ex.: renovar Pix com dias sobrando). ---
function acessoPagoAtivo(dados) {
    if (!dados || dados.plan !== 'premium') return false;
    if (dados.planExpiraEm) {
        const fim = dados.planExpiraEm.toDate ? dados.planExpiraEm.toDate() : new Date(dados.planExpiraEm);
        return fim.getTime() > Date.now();
    }
    return true; // cartão recorrente ativo
}

module.exports = { acessoPagoAtivo };
