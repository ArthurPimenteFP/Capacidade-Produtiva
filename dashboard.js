// ===========================
// Dashboard - Controle de Colhedoras
// Lê os dados salvos pelo usuário (mesma coleção "userdata" do app
// principal), monta os gráficos e gera o PDF via impressão do navegador.
// ===========================

(function () {
    'use strict';

    // Mesmas constantes/fórmulas usadas em script.js
    const DENSIDADE_CAIXOTE = 18;
    const MINUTOS_HORA = 60;

    function calcTonH(tempoCarregamento) {
        if (!tempoCarregamento || tempoCarregamento <= 0) return 0;
        return (DENSIDADE_CAIXOTE * MINUTOS_HORA) / tempoCarregamento;
    }

    function calcRelacao(tempoCiclo, tempoCarregamento) {
        if (!tempoCarregamento || tempoCarregamento <= 0) return 0;
        return tempoCiclo / tempoCarregamento;
    }

    function formatNumber(num) {
        return Number(num).toLocaleString('pt-BR');
    }

    function formatDecimal(num) {
        return Number(num).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    const overlay = document.getElementById('auth-loading');
    const container = document.getElementById('dash-container');
    const errorBox = document.getElementById('dash-error');
    const emptyBox = document.getElementById('dash-empty');
    const bodyBox = document.getElementById('dash-body');
    const tbody = document.getElementById('dash-table-body');
    const printMeta = document.getElementById('print-meta');

    let charts = [];

    function destruirGraficos() {
        charts.forEach(function (c) { c.destroy(); });
        charts = [];
    }

    function renderDashboard(perfil, colhedoras, pesoCaminhao) {
        if (!colhedoras || colhedoras.length === 0) {
            emptyBox.hidden = false;
            bodyBox.hidden = true;
            return;
        }
        emptyBox.hidden = true;
        bodyBox.hidden = false;

        printMeta.textContent = (perfil.name || perfil.email || '') +
            ' — gerado em ' + new Date().toLocaleString('pt-BR');

        let somaTonH = 0;
        let somaRelacao = 0;
        const labels = [];
        const dadosTonH = [];
        const dadosRelacao = [];

        tbody.innerHTML = '';
        colhedoras.forEach(function (cd) {
            const tonH = calcTonH(cd.tempoCarregamento);
            const relacao = calcRelacao(cd.tempoCiclo, cd.tempoCarregamento);
            somaTonH += tonH;
            somaRelacao += relacao;

            labels.push('CD ' + cd.frota);
            dadosTonH.push(Math.round(tonH * 100) / 100);
            dadosRelacao.push(Math.round(relacao * 100) / 100);

            const tr = document.createElement('tr');
            tr.innerHTML =
                '<td>CD ' + cd.frota + '</td>' +
                '<td>' + formatNumber(cd.tempoCarregamento) + '</td>' +
                '<td>' + formatNumber(cd.tempoCiclo) + '</td>' +
                '<td>' + Math.round(tonH) + '</td>' +
                '<td>' + formatDecimal(relacao) + '</td>';
            tbody.appendChild(tr);
        });

        // --- Cartões de resumo ---
        document.getElementById('dash-total-tonh').textContent = Math.round(somaTonH);
        document.getElementById('dash-media-relacao').textContent = formatDecimal(somaRelacao / colhedoras.length);
        document.getElementById('dash-total-count').textContent = colhedoras.length;
        document.getElementById('dash-footer-tonh').textContent = Math.round(somaTonH);
        document.getElementById('dash-footer-relacao').textContent = formatDecimal(somaRelacao);

        const pesoNum = parseFloat(pesoCaminhao);
        const caminhoesEl = document.getElementById('dash-caminhoes');
        if (pesoNum > 0 && somaTonH > 0) {
            caminhoesEl.textContent = formatDecimal(somaTonH / pesoNum);
        } else {
            caminhoesEl.textContent = '—';
        }

        // --- Gráficos ---
        destruirGraficos();

        const corVerde = '#16a34a';
        const corAmbar = '#f59e0b';

        const ctxTon = document.getElementById('chart-tonh').getContext('2d');
        charts.push(new Chart(ctxTon, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ label: 'Ton/h', data: dadosTonH, backgroundColor: corVerde, borderRadius: 6 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        }));

        const ctxRel = document.getElementById('chart-relacao').getContext('2d');
        charts.push(new Chart(ctxRel, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ label: 'Relação', data: dadosRelacao, backgroundColor: corAmbar, borderRadius: 6 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        }));
    }

    function carregarDados(perfil) {
        const ref = window.AppAuth.db.collection('userdata').doc(perfil.uid);
        ref.get().then(function (snap) {
            const data = snap.exists ? snap.data() : {};
            const colhedoras = Array.isArray(data.colhedoras) ? data.colhedoras : [];
            renderDashboard(perfil, colhedoras, data.pesoCaminhao);
            overlay.style.display = 'none';
            container.style.display = '';
        }).catch(function (err) {
            console.error(err);
            overlay.style.display = 'none';
            container.style.display = '';
            errorBox.textContent = 'Não foi possível carregar os dados agora. Tente novamente.';
            errorBox.classList.add('is-visible');
        });
    }

    window.AppAuth.exigirLogin(carregarDados);

    // Gera o PDF de verdade no navegador (em vez de usar window.print()).
    // O "salvar como PDF" do sistema, em muitos celulares, falha ou gera um
    // arquivo de 0kb quando a página tem gráficos em <canvas>. Desenhando o
    // PDF nós mesmos (html2canvas + jsPDF), o arquivo sai igual em qualquer
    // aparelho.
    document.getElementById('btn-export-pdf').addEventListener('click', async function () {
        const btn = this;
        const label = btn.querySelector('span');
        const textoOriginal = label.textContent;

        if (typeof html2canvas === 'undefined' || !window.jspdf) {
            alert('Não foi possível carregar o gerador de PDF. Confira sua internet e tente novamente.');
            return;
        }

        btn.disabled = true;
        label.textContent = 'Gerando PDF...';

        try {
            const canvas = await html2canvas(document.getElementById('dash-content'), {
                scale: Math.min(2, window.devicePixelRatio || 1.5),
                backgroundColor: '#ffffff',
                useCORS: true,
                onclone: (clonedDoc) => {
                    const cabecalho = clonedDoc.querySelector('.dash-print-header');
                    if (cabecalho) cabecalho.style.display = 'block';
                },
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let alturaRestante = imgHeight;
            let posicaoY = 0;

            pdf.addImage(imgData, 'JPEG', 0, posicaoY, imgWidth, imgHeight);
            alturaRestante -= pageHeight;

            while (alturaRestante > 0) {
                posicaoY = alturaRestante - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, posicaoY, imgWidth, imgHeight);
                alturaRestante -= pageHeight;
            }

            const hoje = new Date();
            const dataArquivo = [hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate()]
                .map((n) => String(n).padStart(2, '0'))
                .join('-');
            pdf.save(`colhedoras-${dataArquivo}.pdf`);
        } catch (err) {
            console.error(err);
            alert('Não foi possível gerar o PDF agora. Tente novamente em alguns segundos.');
        } finally {
            btn.disabled = false;
            label.textContent = textoOriginal;
        }
    });
})();
