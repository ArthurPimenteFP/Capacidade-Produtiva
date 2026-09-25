// ===========================
// Calculadoras: Capacidade Produtiva e Tempo de Colheita
// (abas adicionadas ao Controle de Colhedoras)
// ===========================

(function () {
    'use strict';

    // ---------------------------
    // Constantes
    // ---------------------------
    const STORAGE_KEY_CAP = 'capacidade_produtiva_campos';
    const STORAGE_KEY_COL = 'tempo_colheita_campos';

    const CAP_HORAS_PADRAO = '13';

    // Parâmetros internos da colheita (não exibidos na interface)
    const COL_HORAS_POR_DIA = 15;
    const COL_DIVISOR = 6.667;
    const HORAS_NO_DIA = 24;

    // Brasília = UTC−3 (fixo, independente do fuso do aparelho)
    const BRASILIA_OFFSET_MS = -3 * 60 * 60 * 1000;

    // ---------------------------
    // Utilitários
    // ---------------------------
    const $ = (id) => document.getElementById(id);

    function pad(n, size = 2) {
        return String(n).padStart(size, '0');
    }

    // Aceita "6,5" ou "6.5". Retorna NaN se inválido (vazio, letras, negativo etc.)
    function parseNumber(raw) {
        let s = String(raw == null ? '' : raw).trim().replace(/\s/g, '');
        if (s === '') return NaN;
        if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
        if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
        return parseFloat(s);
    }

    function formatDecimal(num) {
        return Number(num).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    // Só permite dígitos, vírgula e ponto nos campos numéricos
    function sanitizeNumericInput(input) {
        const clean = input.value.replace(/[^\d.,]/g, '');
        if (clean !== input.value) input.value = clean;
    }

    function saveJSON(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('Erro ao salvar no LocalStorage:', e);
        }
    }

    function loadJSON(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error('Erro ao carregar do LocalStorage:', e);
            return null;
        }
    }

    function removeKey(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('Erro ao limpar LocalStorage:', e);
        }
    }

    function popValue(el) {
        el.classList.remove('updated');
        void el.offsetWidth; // reinicia a animação
        el.classList.add('updated');
    }

    // ---------------------------
    // Data e hora (Brasília, 24h)
    // Os instantes são tratados como "hora de parede de Brasília" guardada
    // em um timestamp UTC; assim não há dependência do fuso do dispositivo.
    // ---------------------------
    function nowBrasilia() {
        return Date.now() + BRASILIA_OFFSET_MS;
    }

    function formatDateTimeBR(ms) {
        const d = new Date(ms);
        return (
            `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ` +
            `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
        );
    }

    // HH:MM:SS a partir de segundos (horas podem passar de 24)
    function formatDuration(totalSeconds) {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }

    // ---------------------------
    // Cálculos
    // ---------------------------
    function calcCapacidade({ tch, divisor, velocidade, manobra, horas, maquinas }) {
        const base = (tch / divisor) * velocidade;
        const aposManobra = base * (1 - manobra / 100);
        return aposManobra * horas * maquinas;
    }

    function calcColheita({ hectares, velocidade, colhedoras, manobra }) {
        const capacidadeDia = (velocidade * COL_HORAS_POR_DIA) / COL_DIVISOR * colhedoras;
        const hectaresPorHora = capacidadeDia / HORAS_NO_DIA;
        const horasBase = hectares / hectaresPorHora;
        const horasTotais = horasBase * (1 + manobra / 100);
        const dias = horasTotais / HORAS_NO_DIA;
        const segundosTotais = Math.round(horasTotais * 3600);
        return { hectaresPorHora, horasTotais, dias, segundosTotais };
    }

    // ---------------------------
    // Validação
    // ---------------------------
    // rules: [{ input, message, ok(valorNumerico) }]
    function validate(rules, errorBox) {
        const values = {};
        const invalid = [];

        rules.forEach((rule) => {
            const el = rule.input;
            el.classList.remove('is-invalid');
            const value = rule.parse ? rule.parse(el) : parseNumber(el.value);
            if (!rule.ok(value)) {
                invalid.push(rule);
                el.classList.add('is-invalid');
            } else {
                values[rule.key] = value;
            }
        });

        if (invalid.length) {
            errorBox.textContent = invalid[0].message;
            errorBox.hidden = false;
            invalid[0].input.focus();
            return null;
        }

        errorBox.hidden = true;
        return values;
    }

    function clearInvalidState(form, errorBox) {
        form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
        errorBox.hidden = true;
    }

    const isPositive = (v) => !isNaN(v) && v > 0;
    const isInteger = (v) => !isNaN(v) && v >= 1 && Number.isInteger(v);

    // ===========================
    // ABAS
    // ===========================
    const tabButtons = Array.from(document.querySelectorAll('.app-tabs [role="tab"]'));
    const tabPanels = {
        colhedoras: $('panel-colhedoras'),
        capacidade: $('panel-capacidade'),
        colheita: $('panel-colheita'),
    };

    function activateTab(name, focusTab) {
        tabButtons.forEach((btn) => {
            const active = btn.dataset.tab === name;
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
            btn.tabIndex = active ? 0 : -1;
            if (active && focusTab) btn.focus();
        });
        Object.keys(tabPanels).forEach((key) => {
            tabPanels[key].hidden = key !== name;
        });

        if (name === 'colheita') tickClock();
        window.scrollTo(0, 0);
    }

    tabButtons.forEach((btn, index) => {
        btn.addEventListener('click', () => activateTab(btn.dataset.tab, false));
        btn.addEventListener('keydown', (e) => {
            let next = null;
            if (e.key === 'ArrowRight') next = (index + 1) % tabButtons.length;
            else if (e.key === 'ArrowLeft') next = (index - 1 + tabButtons.length) % tabButtons.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = tabButtons.length - 1;
            if (next === null) return;
            e.preventDefault();
            activateTab(tabButtons[next].dataset.tab, true);
        });
    });

    // Mantém os elementos sticky alinhados com a altura real do header/abas
    function syncStickyOffsets() {
        const header = $('app-header');
        const tabs = $('app-tabs');
        const root = document.documentElement.style;
        if (header) root.setProperty('--header-h', header.offsetHeight + 'px');
        if (tabs) root.setProperty('--tabs-h', tabs.offsetHeight + 'px');
    }

    window.addEventListener('resize', syncStickyOffsets);
    if ('ResizeObserver' in window) {
        const ro = new ResizeObserver(syncStickyOffsets);
        ro.observe($('app-header'));
        ro.observe($('app-tabs'));
    }
    syncStickyOffsets();

    // ===========================
    // CAPACIDADE PRODUTIVA
    // ===========================
    const cap = {
        form: $('cap-form'),
        error: $('cap-error'),
        result: $('cap-result'),
        resultValue: $('cap-result-value'),
        resultHint: $('cap-result-hint'),
        btnClear: $('cap-clear'),
        tch: $('cap-tch'),
        divisor: $('cap-divisor'),
        velocidade: $('cap-velocidade'),
        manobra: $('cap-manobra'),
        horas: $('cap-horas'),
        maquinas: $('cap-maquinas'),
    };
    const capFields = ['tch', 'divisor', 'velocidade', 'manobra', 'horas', 'maquinas'];
    const DIVISORES_VALIDOS = ['3.333', '4.166', '6.666'];

    function saveCap() {
        const data = {};
        capFields.forEach((f) => (data[f] = cap[f].value));
        saveJSON(STORAGE_KEY_CAP, data);
    }

    function loadCap() {
        const data = loadJSON(STORAGE_KEY_CAP);
        if (!data) return;
        capFields.forEach((f) => {
            if (typeof data[f] !== 'string') return;
            if (f === 'divisor' && !DIVISORES_VALIDOS.includes(data[f])) return;
            cap[f].value = data[f];
        });
    }

    function resetCapResult() {
        cap.result.classList.add('is-empty');
        cap.result.classList.remove('is-stale');
        cap.resultValue.textContent = '—';
        cap.resultHint.textContent = 'Preencha os campos e toque em Calcular';
    }

    function handleCapSubmit(e) {
        e.preventDefault();

        const values = validate(
            [
                { key: 'tch', input: cap.tch, ok: isPositive, message: 'Informe o Tch (maior que zero).' },
                {
                    key: 'divisor',
                    input: cap.divisor,
                    parse: (el) => (DIVISORES_VALIDOS.includes(el.value) ? parseFloat(el.value) : NaN),
                    ok: isPositive,
                    message: 'Selecione o divisor.',
                },
                { key: 'velocidade', input: cap.velocidade, ok: isPositive, message: 'Informe a velocidade (maior que zero).' },
                {
                    key: 'manobra',
                    input: cap.manobra,
                    ok: (v) => !isNaN(v) && v >= 0 && v <= 100,
                    message: 'Informe a % de manobra (entre 0 e 100).',
                },
                {
                    key: 'horas',
                    input: cap.horas,
                    ok: (v) => !isNaN(v) && v > 0 && v <= 24,
                    message: 'Informe as horas (entre 0 e 24).',
                },
                { key: 'maquinas', input: cap.maquinas, ok: isInteger, message: 'Informe o número de máquinas (inteiro, mínimo 1).' },
            ],
            cap.error
        );
        if (!values) return;

        const total = calcCapacidade(values);

        cap.resultValue.innerHTML = `${formatDecimal(total)}<span class="unit">t/dia</span>`;
        cap.resultHint.textContent = '';
        cap.result.classList.remove('is-empty', 'is-stale');
        popValue(cap.resultValue);
        saveCap();
        cap.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function handleCapClear() {
        cap.form.reset(); // restaura o padrão do HTML (Horas = 13, divisor sem seleção)
        cap.horas.value = CAP_HORAS_PADRAO;
        removeKey(STORAGE_KEY_CAP);
        clearInvalidState(cap.form, cap.error);
        resetCapResult();
        cap.tch.focus();
    }

    ['tch', 'velocidade', 'manobra', 'horas', 'maquinas'].forEach((f) => {
        cap[f].addEventListener('input', () => sanitizeNumericInput(cap[f]));
    });
    capFields.forEach((f) => {
        const evt = f === 'divisor' ? 'change' : 'input';
        cap[f].addEventListener(evt, () => {
            cap[f].classList.remove('is-invalid');
            if (!cap.result.classList.contains('is-empty')) cap.result.classList.add('is-stale');
            saveCap();
        });
    });
    cap.form.addEventListener('submit', handleCapSubmit);
    cap.btnClear.addEventListener('click', handleCapClear);

    // ===========================
    // ESTIMATIVA
    // ===========================
    const STORAGE_KEY_EST = 'estimativa_campos';
    const ESPACAMENTOS_VALIDOS = ['3.333', '4.166', '6.666'];

    const est = {
        form: $('est-form'),
        error: $('est-error'),
        result: $('est-result'),
        resultValue: $('est-result-value'),
        resultHint: $('est-result-hint'),
        btnClear: $('est-clear'),
        densidade: $('est-densidade'),
        metros: $('est-metros'),
        espacamento: $('est-espacamento'),
    };
    const estFields = ['densidade', 'metros', 'espacamento'];

    // Estimativa = (Densidade do caixote ÷ Metros percorridos) × Espaçamento
    function calcEstimativa({ densidade, metros, espacamento }) {
        return (densidade / metros) * espacamento;
    }

    function saveEst() {
        const data = {};
        estFields.forEach((f) => (data[f] = est[f].value));
        saveJSON(STORAGE_KEY_EST, data);
    }

    function loadEst() {
        const data = loadJSON(STORAGE_KEY_EST);
        if (!data) return;
        estFields.forEach((f) => {
            if (typeof data[f] !== 'string') return;
            if (f === 'espacamento' && !ESPACAMENTOS_VALIDOS.includes(data[f])) return;
            est[f].value = data[f];
        });
    }

    function resetEstResult() {
        est.result.classList.add('is-empty');
        est.result.classList.remove('is-stale');
        est.resultValue.textContent = '—';
        est.resultHint.textContent = 'Preencha os campos e toque em Calcular';
    }

    function handleEstSubmit(e) {
        e.preventDefault();

        const values = validate(
            [
                { key: 'densidade', input: est.densidade, ok: isPositive, message: 'Informe a densidade do caixote (maior que zero).' },
                { key: 'metros', input: est.metros, ok: isPositive, message: 'Informe os metros percorridos (maior que zero).' },
                {
                    key: 'espacamento',
                    input: est.espacamento,
                    parse: (el) => (ESPACAMENTOS_VALIDOS.includes(el.value) ? parseFloat(el.value) : NaN),
                    ok: isPositive,
                    message: 'Selecione o espaçamento.',
                },
            ],
            est.error
        );
        if (!values) return;

        const total = calcEstimativa(values);

        est.resultValue.innerHTML = `${formatDecimal(total)}<span class="unit">t/ha</span>`;
        est.resultHint.textContent = '';
        est.result.classList.remove('is-empty', 'is-stale');
        popValue(est.resultValue);
        saveEst();
        est.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function handleEstClear() {
        est.form.reset();
        removeKey(STORAGE_KEY_EST);
        clearInvalidState(est.form, est.error);
        resetEstResult();
        est.densidade.focus();
    }

    ['densidade', 'metros'].forEach((f) => {
        est[f].addEventListener('input', () => sanitizeNumericInput(est[f]));
    });
    estFields.forEach((f) => {
        const evt = f === 'espacamento' ? 'change' : 'input';
        est[f].addEventListener(evt, () => {
            est[f].classList.remove('is-invalid');
            if (!est.result.classList.contains('is-empty')) est.result.classList.add('is-stale');
            saveEst();
        });
    });
    est.form.addEventListener('submit', handleEstSubmit);
    est.btnClear.addEventListener('click', handleEstClear);

    // ===========================
    // TEMPO DE COLHEITA
    // ===========================
    const col = {
        form: $('col-form'),
        error: $('col-error'),
        result: $('col-result'),
        btnClear: $('col-clear'),
        hectares: $('col-hectares'),
        datahora: $('col-datahora'),
        velocidade: $('col-velocidade'),
        colhedoras: $('col-colhedoras'),
        manobra: $('col-manobra'),
        forecast: $('col-forecast'),
        forecastHint: $('col-forecast-hint'),
        horas: $('col-horas'),
        horasDec: $('col-horas-dec'),
        dias: $('col-dias'),
        hah: $('col-hah'),
    };
    const colFields = ['hectares', 'velocidade', 'colhedoras', 'manobra'];

    // Relógio: sempre automático (Brasília, UTC−3); o campo é somente leitura
    function tickClock() {
        if (tabPanels.colheita.hidden) return;
        col.datahora.value = formatDateTimeBR(nowBrasilia());
    }

    function saveCol() {
        const data = {};
        colFields.forEach((f) => (data[f] = col[f].value));
        saveJSON(STORAGE_KEY_COL, data);
    }

    function loadCol() {
        const data = loadJSON(STORAGE_KEY_COL);
        if (!data) return;
        colFields.forEach((f) => {
            if (typeof data[f] === 'string') col[f].value = data[f];
        });
    }

    function resetColResult() {
        col.result.classList.add('is-empty');
        col.result.classList.remove('is-stale');
        col.forecast.textContent = '—';
        col.forecastHint.textContent = 'Preencha os campos e toque em Calcular';
        col.horas.textContent = '—';
        col.horasDec.textContent = '';
        col.dias.textContent = '—';
        col.hah.textContent = '—';
    }

    function handleColSubmit(e) {
        e.preventDefault();

        const rules = [
            { key: 'hectares', input: col.hectares, ok: isPositive, message: 'Informe os hectares a colher (maior que zero).' },
            { key: 'velocidade', input: col.velocidade, ok: isPositive, message: 'Informe a velocidade de colheita (maior que zero).' },
            { key: 'colhedoras', input: col.colhedoras, ok: isInteger, message: 'Informe a quantidade de colhedoras (inteiro, mínimo 1).' },
            { key: 'manobra', input: col.manobra, ok: (v) => !isNaN(v) && v >= 0, message: 'Informe a % de manobra (0 ou mais).' },
        ];

        const values = validate(rules, col.error);
        if (!values) return;

        // Início: data/hora de Brasília capturada no momento do cálculo
        const inicio = nowBrasilia();
        col.datahora.value = formatDateTimeBR(inicio);

        const r = calcColheita(values);
        const termino = inicio + r.segundosTotais * 1000;

        col.forecast.textContent = formatDateTimeBR(termino);
        col.forecastHint.textContent = `Início: ${formatDateTimeBR(inicio)}`;
        col.horas.textContent = formatDuration(r.segundosTotais);
        col.horasDec.textContent = `${formatDecimal(r.horasTotais)} h`;
        col.dias.textContent = formatDecimal(r.dias);
        col.hah.textContent = formatDecimal(r.hectaresPorHora);

        col.result.classList.remove('is-empty', 'is-stale');
        popValue(col.forecast);
        saveCol();
        col.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function handleColClear() {
        col.form.reset();
        removeKey(STORAGE_KEY_COL);
        clearInvalidState(col.form, col.error);
        resetColResult();
        tickClock();
        col.hectares.focus();
    }

    function markColStale() {
        if (!col.result.classList.contains('is-empty')) col.result.classList.add('is-stale');
    }

    colFields.forEach((f) => {
        col[f].addEventListener('input', () => {
            sanitizeNumericInput(col[f]);
            col[f].classList.remove('is-invalid');
            markColStale();
            saveCol();
        });
    });

    col.form.addEventListener('submit', handleColSubmit);
    col.btnClear.addEventListener('click', handleColClear);

    setInterval(tickClock, 1000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) tickClock();
    });

    // ---------------------------
    // Inicialização
    // ---------------------------
    function init() {
        loadCap();
        loadEst();
        loadCol();
        col.datahora.value = formatDateTimeBR(nowBrasilia());
    }

    init();
})();
