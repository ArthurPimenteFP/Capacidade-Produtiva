// ===========================
// Libera as chamadas vindas do seu site (GitHub Pages, ou onde quer que o
// front-end esteja publicado) para essas funções na Vercel, que ficam em
// outro domínio. Sem isso, o navegador bloqueia a chamada.
// ===========================
// Ajuste a variável de ambiente APP_URL na Vercel se o site mudar de
// endereço (sem barra no final). Pode colocar várias origens separadas por
// vírgula, ex: "https://site1.com,https://site2.com"

const ORIGENS_PERMITIDAS = (process.env.APP_URL || 'https://arthurpimentefp.github.io')
    .split(',')
    .map(function (s) { return s.trim(); });

// Devolve true se a função chamadora já respondeu (era um preflight OPTIONS)
// e o handler deve parar por ali.
function aplicarCors(req, res) {
    const origem = req.headers.origin;
    if (origem && ORIGENS_PERMITIDAS.indexOf(origem) !== -1) {
        res.setHeader('Access-Control-Allow-Origin', origem);
    } else {
        res.setHeader('Access-Control-Allow-Origin', ORIGENS_PERMITIDAS[0]);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return true;
    }
    return false;
}

module.exports = { aplicarCors };
