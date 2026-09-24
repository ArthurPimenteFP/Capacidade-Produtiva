// --- Utilidades de CPF: validação (dígitos verificadores), máscara e hash ---
// O CPF completo NUNCA é gravado. Guardamos só:
//  - um hash (HMAC com segredo CPF_PEPPER) pra impedir dois cadastros com o mesmo CPF;
//  - uma versão mascarada (***.456.789-**) pra mostrar na tela/admin.
const crypto = require('crypto');

function limpar(cpf) {
    return String(cpf || '').replace(/\D/g, '');
}

function valido(cpf) {
    const c = limpar(cpf);
    if (c.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(c)) return false; // 111.111.111-11 etc.
    for (let t = 9; t < 11; t++) {
        let soma = 0;
        for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
        const dv = ((soma * 10) % 11) % 10;
        if (dv !== Number(c[t])) return false;
    }
    return true;
}

function mascarar(cpf) {
    const c = limpar(cpf);
    return '***.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-**';
}

function hash(cpf, segredo) {
    return crypto.createHmac('sha256', segredo).update(limpar(cpf)).digest('hex');
}

module.exports = { limpar, valido, mascarar, hash };
