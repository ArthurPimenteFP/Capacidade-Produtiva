// ===========================
// Controle de Colhedoras - Tempos Produtivos
// Application Logic
// ===========================

(function () {
    'use strict';

    // --- Constants ---
    // As chaves de armazenamento local são específicas de cada usuário (definidas em init()),
    // para não misturar dados de contas diferentes no mesmo aparelho/navegador.
    let STORAGE_KEY = 'colhedoras_data';
    let STORAGE_KEY_TRUCK = 'peso_caminhao';
    let currentUid = null;

    function userDocRef() {
        if (!window.AppAuth || !currentUid) return null;
        return window.AppAuth.db.collection('userdata').doc(currentUid);
    }

    // --- DOM References ---
    const form = document.getElementById('cd-form');
    const editIdInput = document.getElementById('edit-id');
    const frotaInput = document.getElementById('frota-number');
    const carregamentoInput = document.getElementById('tempo-carregamento');
    const cicloInput = document.getElementById('tempo-ciclo');
    const formTitle = document.getElementById('form-title');
    const btnSubmit = document.getElementById('btn-submit');
    const btnSubmitText = document.getElementById('btn-submit-text');
    const btnCancel = document.getElementById('btn-cancel');
    const btnClearAll = document.getElementById('btn-clear-all');
    const livePreview = document.getElementById('live-preview');
    const previewTonH = document.getElementById('preview-tonh');
    const previewRelacao = document.getElementById('preview-relacao');
    const tableContainer = document.getElementById('table-container');
    const cdTable = document.getElementById('cd-table');
    const cdTableBody = document.getElementById('cd-table-body');
    const emptyState = document.getElementById('empty-state');
    const totalTonH = document.getElementById('total-tonh');
    const totalTransbordos = document.getElementById('total-transbordos');
    const footerTonH = document.getElementById('footer-tonh');
    const footerRelacao = document.getElementById('footer-relacao');
    const cdCount = document.getElementById('cd-count');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    // Truck DOM references
    const pesoCaminhaoInput = document.getElementById('peso-caminhao');
    const truckResultValue = document.getElementById('truck-result-value');
    const truckResultDetail = document.getElementById('truck-result-detail');

    // --- State ---
    let colhedoras = [];
    let toastTimeout = null;

    // --- Armazenamento: cópia local instantânea (localStorage) + sincronização na nuvem (Firestore) ---
    function saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(colhedoras));
        } catch (e) {
            console.error('Erro ao salvar no LocalStorage:', e);
        }

        const ref = userDocRef();
        if (ref) {
            ref.set({ colhedoras: colhedoras }, { merge: true }).catch((e) => {
                console.warn('Não foi possível sincronizar com o servidor agora (sem conexão?):', e);
            });
        }
    }

    function saveTruckWeight() {
        try {
            localStorage.setItem(STORAGE_KEY_TRUCK, pesoCaminhaoInput.value);
        } catch (e) {
            console.error('Erro ao salvar peso do caminhão:', e);
        }

        const ref = userDocRef();
        if (ref) {
            ref.set({ pesoCaminhao: pesoCaminhaoInput.value }, { merge: true }).catch((e) => {
                console.warn('Não foi possível sincronizar peso do caminhão agora (sem conexão?):', e);
            });
        }
    }

    function loadFromStorage() {
        // 1) Carrega a cópia local primeiro, para a tela abrir instantaneamente
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                colhedoras = JSON.parse(data);
            }
        } catch (e) {
            console.error('Erro ao carregar do LocalStorage:', e);
            colhedoras = [];
        }

        try {
            const truckWeight = localStorage.getItem(STORAGE_KEY_TRUCK);
            if (truckWeight) {
                pesoCaminhaoInput.value = truckWeight;
            }
        } catch (e) {
            console.error('Erro ao carregar peso do caminhão:', e);
        }

        // 2) Busca a versão mais atual no Firestore (nuvem), quando disponível
        const ref = userDocRef();
        if (!ref) return Promise.resolve();

        return ref.get().then((snap) => {
            if (!snap.exists) return;
            const data = snap.data();
            if (Array.isArray(data.colhedoras)) {
                colhedoras = data.colhedoras;
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(colhedoras)); } catch (e) { /* ignore */ }
            }
            if (typeof data.pesoCaminhao === 'string' || typeof data.pesoCaminhao === 'number') {
                pesoCaminhaoInput.value = data.pesoCaminhao;
                try { localStorage.setItem(STORAGE_KEY_TRUCK, String(data.pesoCaminhao)); } catch (e) { /* ignore */ }
            }
        }).catch((e) => {
            console.warn('Não foi possível carregar do servidor, usando cópia local salva neste aparelho.', e);
        });
    }

    // --- Constants ---
    const DENSIDADE_CAIXOTE = 18; // Valor fixo (travado)
    const MINUTOS_HORA = 60;     // Valor fixo (travado)

    // --- Calculations ---
    function calcTonH(tempoCarregamento) {
        if (!tempoCarregamento || tempoCarregamento <= 0) return 0;
        // Fórmula: (Densidade do caixote × 60) ÷ Tempo de carregamento
        return (DENSIDADE_CAIXOTE * MINUTOS_HORA) / tempoCarregamento;
    }

    function calcRelacao(tempoCiclo, tempoCarregamento) {
        if (!tempoCarregamento || tempoCarregamento <= 0) return 0;
        return tempoCiclo / tempoCarregamento;
    }

    // --- Truck Calculation ---
    function getTotalTonH() {
        let sum = 0;
        colhedoras.forEach((cd) => {
            sum += calcTonH(cd.tempoCarregamento);
        });
        return sum;
    }

    function updateTruckCalc() {
        const pesoCaminhao = parseFloat(pesoCaminhaoInput.value);
        const totalTon = getTotalTonH();

        if (pesoCaminhao > 0 && totalTon > 0) {
            const caminhoesNecessarios = totalTon / pesoCaminhao;
            const displayValue = formatDecimal(caminhoesNecessarios);
            
            truckResultValue.textContent = displayValue;
            truckResultDetail.textContent = 'Caminhões necessários por hora';
            
            // Pop animation
            truckResultValue.classList.remove('updated');
            void truckResultValue.offsetWidth; // trigger reflow
            truckResultValue.classList.add('updated');
        } else if (pesoCaminhao > 0 && totalTon === 0) {
            truckResultValue.textContent = '0';
            truckResultDetail.textContent = 'Adicione colhedoras para calcular';
        } else {
            truckResultValue.textContent = '—';
            truckResultDetail.textContent = 'Informe a capacidade do caminhão';
        }

        saveTruckWeight();
    }

    // --- Toast Notification ---
    function showToast(message, type = '') {
        if (toastTimeout) clearTimeout(toastTimeout);
        toastMessage.textContent = message;
        toast.className = 'toast toast--visible';
        if (type) toast.classList.add(`toast--${type}`);
        toastTimeout = setTimeout(() => {
            toast.className = 'toast';
        }, 2500);
    }

    // --- Rendering ---
    function render() {
        const hasData = colhedoras.length > 0;

        // Toggle empty state vs table
        emptyState.style.display = hasData ? 'none' : 'flex';
        cdTable.style.display = hasData ? 'table' : 'none';

        // Update count badge
        cdCount.textContent = colhedoras.length;

        // Clear table body
        cdTableBody.innerHTML = '';

        let sumTonH = 0;
        let sumRelacao = 0;

        colhedoras.forEach((cd, index) => {
            const tonH = calcTonH(cd.tempoCarregamento);
            const relacao = calcRelacao(cd.tempoCiclo, cd.tempoCarregamento);

            sumTonH += tonH;
            sumRelacao += relacao;

            const tr = document.createElement('tr');
            tr.className = 'row-enter';
            tr.style.animationDelay = `${index * 0.05}s`;
            tr.innerHTML = `
                <td>
                    <div class="cd-label">
                        <span class="cd-label__dot"></span>
                        CD ${cd.frota}
                    </div>
                </td>
                <td class="cd-value">${formatNumber(cd.tempoCarregamento)}</td>
                <td class="cd-value">${formatNumber(cd.tempoCiclo)}</td>
                <td><span class="cd-value--ton">${Math.round(tonH)}</span></td>
                <td><span class="cd-value--rel">${formatDecimal(relacao)}</span></td>
                <td>
                    <div class="cd-actions">
                        <button type="button" class="btn btn--icon btn--icon-edit" data-action="edit" data-index="${index}" title="Editar">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button type="button" class="btn btn--icon btn--icon-delete" data-action="delete" data-index="${index}" title="Excluir">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </td>
            `;
            cdTableBody.appendChild(tr);
        });

        // Update totals
        totalTonH.textContent = Math.round(sumTonH);
        totalTransbordos.textContent = formatDecimal(sumRelacao);
        footerTonH.textContent = Math.round(sumTonH);
        footerRelacao.textContent = formatDecimal(sumRelacao);

        // Update truck calculation
        updateTruckCalc();
    }

    // --- Formatting Helpers ---
    function formatNumber(num) {
        return Number(num).toLocaleString('pt-BR');
    }

    function formatDecimal(num) {
        return Number(num).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    // --- Live Preview ---
    function updateLivePreview() {
        const carregamento = parseFloat(carregamentoInput.value);
        const ciclo = parseFloat(cicloInput.value);

        if (carregamento > 0 || ciclo > 0) {
            livePreview.style.display = 'block';

            if (carregamento > 0) {
                const tonH = calcTonH(carregamento);
                previewTonH.textContent = Math.round(tonH);
            } else {
                previewTonH.textContent = '—';
            }

            if (carregamento > 0 && ciclo > 0) {
                const relacao = calcRelacao(ciclo, carregamento);
                previewRelacao.textContent = formatDecimal(relacao);
            } else {
                previewRelacao.textContent = '—';
            }
        } else {
            livePreview.style.display = 'none';
            previewTonH.textContent = '—';
            previewRelacao.textContent = '—';
        }
    }

    // --- Form Handling ---
    function resetForm() {
        form.reset();
        editIdInput.value = '';
        formTitle.textContent = 'Adicionar Colhedora';
        btnSubmitText.textContent = 'Adicionar';
        btnCancel.style.display = 'none';
        livePreview.style.display = 'none';
        previewTonH.textContent = '—';
        previewRelacao.textContent = '—';
    }

    function handleSubmit(e) {
        e.preventDefault();

        const frota = frotaInput.value.trim();
        const carregamento = parseFloat(carregamentoInput.value);
        const ciclo = parseFloat(cicloInput.value);

        if (!frota || isNaN(carregamento) || isNaN(ciclo) || carregamento <= 0 || ciclo <= 0) {
            showToast('Preencha todos os campos corretamente!', 'danger');
            return;
        }

        const editIndex = editIdInput.value;

        if (editIndex !== '') {
            // Editing existing
            const idx = parseInt(editIndex, 10);
            colhedoras[idx] = {
                frota: frota,
                tempoCarregamento: carregamento,
                tempoCiclo: ciclo,
            };
            showToast(`CD ${frota} atualizada com sucesso!`, 'success');
        } else {
            // Adding new
            colhedoras.push({
                frota: frota,
                tempoCarregamento: carregamento,
                tempoCiclo: ciclo,
            });
            showToast(`CD ${frota} adicionada com sucesso!`, 'success');
        }

        saveToStorage();
        render();
        resetForm();
        frotaInput.focus();
    }

    function handleEdit(index) {
        const cd = colhedoras[index];
        if (!cd) return;

        frotaInput.value = cd.frota;
        carregamentoInput.value = cd.tempoCarregamento;
        cicloInput.value = cd.tempoCiclo;
        editIdInput.value = index;

        formTitle.textContent = `Editar CD ${cd.frota}`;
        btnSubmitText.textContent = 'Salvar';
        btnCancel.style.display = 'inline-flex';

        updateLivePreview();

        // Scroll to form
        document.getElementById('form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function handleDelete(index) {
        const cd = colhedoras[index];
        if (!cd) return;

        showConfirmDialog(
            'Excluir Colhedora',
            `Deseja realmente excluir a CD ${cd.frota}?`,
            () => {
                colhedoras.splice(index, 1);
                saveToStorage();
                render();
                showToast(`CD ${cd.frota} excluída!`, 'danger');

                // If editing this item, reset form
                if (editIdInput.value === String(index)) {
                    resetForm();
                }
            }
        );
    }

    function handleClearAll() {
        if (colhedoras.length === 0) {
            showToast('Nenhuma colhedora para limpar.', '');
            return;
        }

        showConfirmDialog(
            'Limpar Tudo',
            `Deseja realmente excluir todas as ${colhedoras.length} colhedoras cadastradas?`,
            () => {
                colhedoras = [];
                saveToStorage();
                render();
                resetForm();
                showToast('Todos os dados foram limpos!', 'danger');
            }
        );
    }

    // --- Confirm Dialog ---
    function showConfirmDialog(title, message, onConfirm) {
        // Remove existing dialog if any
        const existing = document.querySelector('.confirm-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-dialog__icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                </div>
                <h3 class="confirm-dialog__title">${title}</h3>
                <p class="confirm-dialog__message">${message}</p>
                <div class="confirm-dialog__actions">
                    <button type="button" class="btn btn--secondary" id="confirm-cancel">Cancelar</button>
                    <button type="button" class="btn btn--danger-solid" id="confirm-ok">Excluir</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const btnConfirmCancel = document.getElementById('confirm-cancel');
        const btnConfirmOk = document.getElementById('confirm-ok');

        function closeDialog() {
            overlay.remove();
        }

        btnConfirmCancel.addEventListener('click', closeDialog);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeDialog();
        });

        btnConfirmOk.addEventListener('click', () => {
            closeDialog();
            onConfirm();
        });
    }

    // --- Table Action Delegation ---
    function handleTableClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const index = parseInt(btn.dataset.index, 10);

        if (action === 'edit') {
            handleEdit(index);
        } else if (action === 'delete') {
            handleDelete(index);
        }
    }

    // --- Event Listeners ---
    form.addEventListener('submit', handleSubmit);

    btnCancel.addEventListener('click', () => {
        resetForm();
    });

    btnClearAll.addEventListener('click', handleClearAll);

    // Real-time calculation preview
    carregamentoInput.addEventListener('input', updateLivePreview);
    cicloInput.addEventListener('input', updateLivePreview);

    // Truck weight real-time calculation
    pesoCaminhaoInput.addEventListener('input', updateTruckCalc);

    // Table actions (event delegation)
    cdTableBody.addEventListener('click', handleTableClick);

    // --- Initialize ---
    // O app só carrega os dados depois que o login é confirmado (evento disparado em index.html),
    // e usa o uid do usuário logado para separar os dados de cada pessoa.
    function init(uid) {
        currentUid = uid;
        STORAGE_KEY = 'colhedoras_data_' + uid;
        STORAGE_KEY_TRUCK = 'peso_caminhao_' + uid;

        loadFromStorage().then(render);
    }

    if (window.currentUser && window.currentUser.uid) {
        // Caso o evento já tenha disparado antes deste script carregar
        init(window.currentUser.uid);
    } else {
        document.addEventListener('app-auth-ready', function (e) {
            init(e.detail.uid);
        });
    }
})();

