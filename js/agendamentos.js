/**
 * =================================================================
 * IORD — Agendamentos | JavaScript (corrigido + melhorado)
 * -----------------------------------------------------------------
 * Módulos:
 *   1. MockData         — dados mockados
 *   2. AppState         — estado global + pub/sub
 *   3. Filters          — pills de radiologia/período, busca, status
 *   4. DateUtils        — helpers de data compartilhados
 *   5. AgendaData       — filtro central de agendamentos
 *   6. Kpis             — cards de indicadores
 *   7. OccupancyChart   — gráfico de ocupação (Chart.js)
 *   8. AppointmentModal — modal de detalhes (reutilizado por todos os modos)
 *   9. DayListModal     — modal lista do dia (ao clicar no calendário)
 *  10. CalendarView     — Modo Agenda (calendário mensal/semanal)
 *  11. KanbanView       — Modo Kanban (drag and drop)
 *  12. DayView          — Modo Dia (timeline vertical)
 *  13. ViewSwitcher     — alterna entre Agenda / Kanban / Dia  ← CORRIGIDO
 *  14. Sidebar
 *  15. Init
 * =================================================================
 */

/* =================================================================
   1. APP CACHE — dados reais carregados da API
   Substitui o MockData. Preenchido assincronamente no Init.
   Módulos lêem via getters; nunca escrevem diretamente.
================================================================= */
// ============================================================
// CÓDIGO NOVO
// ============================================================
/* =================================================================
   1. APP CACHE — somente constantes e helpers puros
   NÃO armazena dados. Toda leitura de dados vai ao DataStore.
================================================================= */
const AppCache = (() => {
  // Configurações estáticas (nunca mudam em runtime)
  const statusConfig = {
    agendado:  { label: 'Agendado',  kanbanColumn: 'agendado'  },
    confirmado:{ label: 'Confirmado',kanbanColumn: 'confirmado'},
    realizado: { label: 'Realizado', kanbanColumn: 'realizado' },
    cancelado: { label: 'Cancelado', kanbanColumn: 'cancelado' },
  };
  const kanbanColumns = [
    { id: 'agendado',   label: 'Agendado'   },
    { id: 'confirmado', label: 'Confirmado' },
    { id: 'realizado',  label: 'Realizado'  },
    { id: 'cancelado',  label: 'Cancelado'  },
  ];

  function pad(n) { return String(n).padStart(2, '0'); }
  function toISODate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  return { pad, toISODate, statusConfig, kanbanColumns };
})();

/* =================================================================
   1b. DATA STORE — fonte única de verdade, sem cache
   Sempre lê do servidor. Expõe os dados carregados para os módulos
   de render (que só lêem, nunca escrevem).
================================================================= */
const DataStore = (() => {
  // Dados em memória (apenas para o ciclo de render atual)
  let _radiologias   = [];
  let _agendamentos  = [];
  let _tiposExame    = [];

  // ── getters ──────────────────────────────────────────────
  function getRadiologias() { return _radiologias; }
  function getTiposExame()  { return _tiposExame;  }

  function nomeRadiologiaPorId(id) {
    return (_radiologias.find(r => r.id === id) || {}).nome || id;
  }

  function getAgendamentos({ radiologiaId = 'all' } = {}) {
    if (radiologiaId === 'all') return _agendamentos;
    return _agendamentos.filter(a => a.radiologiaId === radiologiaId);
  }

  // ── loaders (buscam do servidor e atualizam memória) ─────
  async function loadRadiologias() {
    const res = await Api.getRadiologias();
    _radiologias = res.data || [];
  }

  async function loadTiposExame() {
    const res = await Api.getParametros();
    const list = res.data?.examDurations || [];
    _tiposExame = list;
    // Rebuild das lookups globais de valor e duração
    VALOR_POR_EXAME   = {};
    DURACAO_POR_EXAME = {};
    list.forEach(e => {
      VALOR_POR_EXAME[e.id]    = e.valor_base || 0;
      DURACAO_POR_EXAME[e.id]  = e.duration   || 30;
      VALOR_POR_EXAME[e.label]    = e.valor_base || 0;
      DURACAO_POR_EXAME[e.label]  = e.duration   || 30;
    });
  }

  async function loadAgendamentos(state) {
    const { start, end } = DateUtils.getPeriodRange(state);
    const res = await Api.getAgendamentos({
      radiologiaId: state.radiologiaSelecionada,
      dataInicio: AppCache.toISODate(start),
      dataFim: AppCache.toISODate(end),
    });
    _agendamentos = res.data || [];
  }

  /**
   * Recarrega agendamentos do servidor e dispara re-render de toda a UI.
   * Chamar isso após qualquer mutação (update de status, criar, editar).
   */
  async function refresh(state) {
    await loadAgendamentos(state);
    // Não chama render aqui — quem chama refresh é responsável por renderizar
  }

  return {
    getRadiologias, getTiposExame, nomeRadiologiaPorId, getAgendamentos,
    loadRadiologias, loadTiposExame, loadAgendamentos,
    refresh,
  };
})();

/* =================================================================
   2. APP STATE
================================================================= */
const AppState = (() => {
  let state = {
    radiologiaSelecionada: 'all',
    periodo: 'hoje',
    customDateStart: null,
    customDateEnd: null,
    busca: '',
    status: 'all',
    agendaView: 'agenda',     // 'agenda' | 'kanban' | 'dia'
    calGranularity: 'mensal', // 'mensal' | 'semanal'
    calDate: new Date(),
    dayDate: new Date(),
  };

  const listeners = [];
  function getState() { return { ...state }; }
  function update(partial) {
    state = { ...state, ...partial };
    listeners.forEach((fn) => fn(getState()));
  }
  function subscribe(fn) { listeners.push(fn); }

  return { getState, update, subscribe };
})();


/* =================================================================
   3. FILTERS
================================================================= */
const Filters = (() => {
  let radPillsContainer, periodPillsContainer, customRangeWrapper,
    customDateStart, customDateEnd, searchInput, statusSelect;

  const PERIODOS = [
    { id: 'hoje', label: 'Hoje' },
    { id: 'amanha', label: 'Amanhã' },
    { id: 'esta_semana', label: 'Esta Semana' },
    { id: 'este_mes', label: 'Este Mês' },
    { id: 'proximos_30', label: 'Próximos 30 dias' },
    { id: 'custom', label: 'Personalizado' },
  ];

  function renderRadiologyPills() {
    radPillsContainer.innerHTML = '';
    DataStore.getRadiologias().forEach((rad) => {
      const isActive = rad.id === AppState.getState().radiologiaSelecionada;
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pill' + (isActive ? ' is-active' : '');
      pill.textContent = rad.nome;
      pill.setAttribute('role', 'tab');
      pill.setAttribute('aria-selected', String(isActive));
      pill.dataset.radiologyId = rad.id;
      pill.addEventListener('click', () => AppState.update({ radiologiaSelecionada: rad.id }));
      radPillsContainer.appendChild(pill);
    });
  }

  function renderPeriodPills() {
    periodPillsContainer.innerHTML = '';
    PERIODOS.forEach((p) => {
      const isActive = p.id === AppState.getState().periodo;
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pill' + (isActive ? ' is-active' : '');
      pill.textContent = p.label;
      pill.setAttribute('role', 'tab');
      pill.setAttribute('aria-selected', String(isActive));
      pill.dataset.periodId = p.id;
      pill.addEventListener('click', () => AppState.update({ periodo: p.id }));
      periodPillsContainer.appendChild(pill);
    });
  }

  function syncActivePills(state) {
    radPillsContainer.querySelectorAll('.pill').forEach((pill) => {
      const isActive = pill.dataset.radiologyId === state.radiologiaSelecionada;
      pill.classList.toggle('is-active', isActive);
      pill.setAttribute('aria-selected', String(isActive));
    });
    periodPillsContainer.querySelectorAll('.pill').forEach((pill) => {
      const isActive = pill.dataset.periodId === state.periodo;
      pill.classList.toggle('is-active', isActive);
      pill.setAttribute('aria-selected', String(isActive));
    });
    customRangeWrapper.hidden = state.periodo !== 'custom';
  }

  function bindEvents() {
    searchInput.addEventListener('input', (e) => AppState.update({ busca: e.target.value }));
    statusSelect.addEventListener('change', (e) => AppState.update({ status: e.target.value }));
    customDateStart.addEventListener('change', (e) => AppState.update({ customDateStart: e.target.value }));
    customDateEnd.addEventListener('change', (e) => AppState.update({ customDateEnd: e.target.value }));
    AppState.subscribe(syncActivePills);
  }

  function init() {
    radPillsContainer = document.getElementById('radiologyFilters');
    periodPillsContainer = document.getElementById('periodFilters');
    customRangeWrapper = document.getElementById('customRangeInputs');
    customDateStart = document.getElementById('customDateStart');
    customDateEnd = document.getElementById('customDateEnd');
    searchInput = document.getElementById('quickSearch');
    statusSelect = document.getElementById('statusFilter');

    renderRadiologyPills();
    renderPeriodPills();
    syncActivePills(AppState.getState());
    bindEvents();

    AppState.subscribe((state) => {
    const subtitle = document.getElementById('pageHeadingSubtitle');
    const nome = DataStore.nomeRadiologiaPorId(state.radiologiaSelecionada);
    subtitle.textContent = state.radiologiaSelecionada === 'all'
      ? 'Visão completa dos agendamentos — todas as radiologias'
      : `Visão completa dos agendamentos — ${nome}`;
  });
  }

  return { init };
})();


/* =================================================================
   4. DATE UTILS
================================================================= */
const DateUtils = (() => {
  function startOfDay(d) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
  function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
  function startOfWeek(d) { const c = startOfDay(d); c.setDate(c.getDate() - c.getDay()); return c; }

  function getPeriodRange(state) {
    const hoje = startOfDay(new Date());
    switch (state.periodo) {
      case 'hoje': return { start: hoje, end: hoje };
      case 'amanha': { const t = addDays(hoje, 1); return { start: t, end: t }; }
      case 'esta_semana': { const s = startOfWeek(hoje); return { start: s, end: addDays(s, 6) }; }
      case 'este_mes': { const s = new Date(hoje.getFullYear(), hoje.getMonth(), 1); return { start: s, end: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0) }; }
      case 'proximos_30': return { start: hoje, end: addDays(hoje, 30) };
      case 'custom': {
        if (state.customDateStart && state.customDateEnd) {
          return { start: new Date(`${state.customDateStart}T00:00:00`), end: new Date(`${state.customDateEnd}T00:00:00`) };
        }
        return { start: hoje, end: addDays(hoje, 30) };
      }
      default: return { start: hoje, end: addDays(hoje, 30) };
    }
  }

  function isWithinRange(isoDate, start, end) {
    const d = new Date(`${isoDate}T00:00:00`);
    return d >= start && d <= end;
  }

  return { startOfDay, addDays, startOfWeek, getPeriodRange, isWithinRange };
})();


/* =================================================================
   5. AGENDA DATA — filtro central
================================================================= */
const AgendaData = (() => {
  function getFiltered(state) {
    const { start, end } = DateUtils.getPeriodRange(state);
    const base = DataStore.getAgendamentos({ radiologiaId: state.radiologiaSelecionada });
    const buscaLower = state.busca.trim().toLowerCase();
    return base.filter((a) => {
      if (!DateUtils.isWithinRange(a.data, start, end)) return false;
      if (state.status !== 'all' && a.status !== state.status) return false;
      if (buscaLower) {
        const alvo = `${a.paciente || ''} ${a.tipoExame || ''} ${a.medico || ''}`.toLowerCase();
        if (!alvo.includes(buscaLower)) return false;
      }
      return true;
    });
  }

  function getFilteredNoPeriod(state) {
    const base = DataStore.getAgendamentos({ radiologiaId: state.radiologiaSelecionada });
    const buscaLower = state.busca.trim().toLowerCase();
    return base.filter((a) => {
      if (state.status !== 'all' && a.status !== state.status) return false;
      if (buscaLower) {
        const alvo = `${a.paciente || ''} ${a.tipoExame || ''} ${a.medico || ''}`.toLowerCase();
        if (!alvo.includes(buscaLower)) return false;
      }
      return true;
    });
  }

  return { getFiltered, getFilteredNoPeriod };
})();


/* =================================================================
   6. KPIS
================================================================= */
const Kpis = (() => {
  function formatCurrency(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  function formatNumber(v) { return v.toLocaleString('pt-BR'); }

  function formatChange(v) {
    const isPositive = v >= 0;
    return { text: `${isPositive ? '▲' : '▼'} ${isPositive ? '+' : ''}${v.toFixed(1)}%`, isPositive };
  }

  function renderChangeEl(el, v) {
    const { text, isPositive } = formatChange(v);
    el.textContent = text;
    el.classList.toggle('is-positive', isPositive);
    el.classList.toggle('is-negative', !isPositive);
  }

  function render(state) {
    const agendamentos = AgendaData.getFiltered(state);
    const hojeISO = AppCache.toISODate(new Date());
    const todosDaRadiologia = DataStore.getAgendamentos({ radiologiaId: state.radiologiaSelecionada });

    const total = agendamentos.length;
    const kpiTotal = document.getElementById('kpiTotalAgendamentos');
    kpiTotal.querySelector('[data-field="value"]').textContent = formatNumber(total);
    renderChangeEl(kpiTotal.querySelector('[data-field="change"]'), total > 0 ? 6.4 : 0);

    // Taxa de ocupação: agendamentos ativos / capacidade do período
    const { start: ocStart, end: ocEnd } = DateUtils.getPeriodRange(state);
    const diasNoPeriodo = Math.max(1, Math.round((ocEnd - ocStart) / 86400000) + 1);
    const SLOTS_POR_DIA = 12;

    const todasRads = DataStore.getRadiologias().filter(r => r.id !== 'all');
    const radsParaOcupacao = state.radiologiaSelecionada === 'all'
      ? todasRads
      : todasRads.filter(r => r.id === state.radiologiaSelecionada);

    const mediaOcupacao = radsParaOcupacao.reduce((acc, r) => {
      const ags = DataStore.getAgendamentos({ radiologiaId: r.id })
        .filter(a => DateUtils.isWithinRange(a.data, ocStart, ocEnd));
      const ativos = ags.filter(a => a.status !== 'cancelado' && a.status !== 'faltou').length;
      const capacidade = diasNoPeriodo * SLOTS_POR_DIA;
      const pct = capacidade ? Math.min(100, Math.round((ativos / capacidade) * 100)) : 0;
      return acc + pct;
    }, 0) / (radsParaOcupacao.length || 1);

    document.getElementById('kpiOcupacaoGeral')
      .querySelector('[data-field="value"]').textContent = `${Math.round(mediaOcupacao)}%`;

    const doDia = todosDaRadiologia.filter(a => a.data === hojeISO);
    const confirmadosHoje = doDia.filter(a => a.status === 'confirmado' || a.status === 'realizado').length;
    const pendentesHoje = doDia.length - confirmadosHoje;
    const kpiHoje = document.getElementById('kpiHoje');
    kpiHoje.querySelector('[data-field="value"]').textContent = formatNumber(doDia.length);
    kpiHoje.querySelector('[data-field="context"]').textContent =
      `${confirmadosHoje} confirmados · ${pendentesHoje} pendentes`;

    const proximos7 = DateUtils.addDays(DateUtils.startOfDay(new Date()), 7);
    const janela7 = todosDaRadiologia.filter(a =>
      DateUtils.isWithinRange(a.data, DateUtils.startOfDay(new Date()), proximos7)
    );
    const preenchimento = Math.min(100, Math.round((janela7.length / (SLOTS_POR_DIA * 7)) * 100));
    document.getElementById('kpiPreenchimento')
      .querySelector('[data-field="value"]').textContent = `${preenchimento}%`;

    const faturamentoPrevisto = agendamentos
      .filter(a => a.status === 'confirmado' || a.status === 'realizado')
      .reduce((s, a) => s + (Number(a.valor) || 0), 0);
    document.getElementById('kpiFaturamentoPrevisto')
      .querySelector('[data-field="value"]').textContent = formatCurrency(faturamentoPrevisto);

    const kpiExames = document.getElementById('kpiExamesAgendados');
    kpiExames.querySelector('[data-field="value"]').textContent = formatNumber(total);
    const porTipo = {};
    agendamentos.forEach(a => { porTipo[a.tipoExame] = (porTipo[a.tipoExame] || 0) + 1; });
    const top3 = Object.entries(porTipo).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topList = document.getElementById('kpiExamesTopList');
    topList.innerHTML = top3.length
      ? top3.map(([tipo, qtd]) => `<li><span>${tipo}</span><span>${qtd}</span></li>`).join('')
      : '<li><span>Nenhum exame no período</span></li>';
  }

  function init() {
    render(AppState.getState());
    AppState.subscribe(render);
  }

  return { init, formatCurrency, formatNumber };
})();


/* =================================================================
   7. OCCUPANCY CHART
================================================================= */
const OccupancyChart = (() => {
  let chart = null;

  const PALETTE = {
    rad_centro: { base: '#018093', light: '#01C6BF', soft: 'rgba(1,128,147,0.12)' },
    rad_norte: { base: '#046B85', light: '#01A9A0', soft: 'rgba(4,107,133,0.12)' },
    rad_sul: { base: '#01C6BF', light: '#7FE0DA', soft: 'rgba(1,198,191,0.12)' },
    rad_leste: { base: '#7FE0DA', light: '#B2EDE9', soft: 'rgba(127,224,218,0.15)' },
  };

  // Gera dados simulados de tendência semanal para o sparkline (7 pontos)
  function sparklineData(radId) {
    const hoje = new Date();
    const pts = [];
    for (let i = 6; i >= 0; i--) {
      const dia = new Date(hoje);
      dia.setDate(dia.getDate() - i);
      const iso = AppCache.toISODate(dia);
      const ags = DataStore.getAgendamentos({ radiologiaId: radId })
        .filter(a => a.data === iso && a.status !== 'cancelado' && a.status !== 'faltou');
      pts.push(ags.length);
    }
    const max = Math.max(...pts, 1);
    return pts.map(v => Math.round((v / max) * 100));
  }

  // Desenha um sparkline SVG inline
  function buildSparklineSVG(points, color) {
    const W = 72, H = 28;
    const min = Math.min(...points) - 5;
    const max = Math.max(...points) + 5;
    const range = max - min || 1;
    const xs = points.map((_, i) => (i / (points.length - 1)) * W);
    const ys = points.map(v => H - ((v - min) / range) * H);
    const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
    const fill = `${xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')} L${W},${H} L0,${H} Z`;

    return `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="spk_grad_${color.replace('#', '')}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${fill}" fill="url(#spk_grad_${color.replace('#', '')})" />
        <path d="${d}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${xs[6].toFixed(1)}" cy="${ys[6].toFixed(1)}" r="2.5" fill="${color}"/>
      </svg>`;
  }

  // Constrói os cards de métricas acima do gráfico
  function renderCards(data) {
    const container = document.getElementById('occupancyCards');
    if (!container) return;
    container.innerHTML = '';

    data.forEach((item, i) => {
      const pal = PALETTE[item.id] || { base: '#018093', light: '#01C6BF', soft: 'rgba(1,128,147,0.1)' };
      const pts = sparklineData(item.id);
      const svg = buildSparklineSVG(pts, pal.base);
      const nomeShort = item.nome.replace('Radiologia ', '');

      const card = document.createElement('div');
      card.className = 'occ-card';
      card.style.setProperty('--occ-color', pal.base);
      card.style.setProperty('--occ-soft', pal.soft);
      card.innerHTML = `
        <div class="occ-card__top">
          <div class="occ-card__dot" style="background:${pal.base}"></div>
          <span class="occ-card__name">${nomeShort}</span>
        </div>
        <div class="occ-card__body">
          <span class="occ-card__value">${item.ocupacao}%</span>
          <div class="occ-card__spark">${svg}</div>
        </div>
        <div class="occ-card__bar-track">
          <div class="occ-card__bar-fill" style="width:${item.ocupacao}%; background:${pal.base}"></div>
        </div>
        <span class="occ-card__label">ocupação atual</span>
      `;
      container.appendChild(card);
    });
  }

  // Constrói a legenda de cores ao lado do título
  function renderLegend(data) {
    const el = document.getElementById('occupancyLegend');
    if (!el) return;
    el.innerHTML = data.map((item) => {
      const pal = PALETTE[item.id] || { base: '#018093' };
      const nomeShort = item.nome.replace('Radiologia ', '');
      return `
        <span class="occ-legend-item">
          <span class="occ-legend-dot" style="background:${pal.base}"></span>
          ${nomeShort}
        </span>`;
    }).join('');
  }

  // Tooltip externo rico
  function getOrCreateTooltip(chartInstance) {
    let el = chartInstance.canvas.parentNode.querySelector('div.chartjs-tooltip');
    if (!el) {
      el = document.createElement('div');
      el.className = 'chartjs-tooltip';
      el.innerHTML = '<div class="cjs-tooltip__inner"></div>';
      chartInstance.canvas.parentNode.appendChild(el);
    }
    return el;
  }

  function buildTooltipContent(tooltip, data) {
    const idx = tooltip.dataPoints[0].dataIndex;
    const item = data[idx];
    const pal = PALETTE[item.id] || { base: '#018093' };
    const pts = sparklineData(item.id);
    const svg = buildSparklineSVG(pts, '#ffffff');
    const agendados = Math.round(item.ocupacao * 0.5);
    const disponiveis = 50 - agendados;

    return `
      <span class="cjs-tooltip__eyebrow">Radiologia</span>
      <div class="cjs-tooltip__headline">
        <span class="cjs-tooltip__dot" style="background:${pal.light}"></span>
        <span class="cjs-tooltip__headline-label">${item.nome}</span>
        <span class="cjs-tooltip__headline-value">${item.ocupacao}%</span>
      </div>
      <div class="cjs-tooltip__spark-row">${svg}</div>
      <div class="cjs-tooltip__divider"></div>
      <div class="cjs-tooltip__metrics">
        <div class="cjs-tooltip__metric">
          <span class="cjs-tooltip__metric-label">Horários preenchidos</span>
          <span class="cjs-tooltip__metric-value">${agendados}/50</span>
        </div>
        <div class="cjs-tooltip__metric">
          <span class="cjs-tooltip__metric-label">Horários disponíveis</span>
          <span class="cjs-tooltip__metric-value">${disponiveis}</span>
        </div>
      </div>
      <div class="cjs-tooltip__mini-bar-track">
        <div class="cjs-tooltip__mini-bar-fill" style="width:${item.ocupacao}%; background:${pal.light}"></div>
      </div>
    `;
  }

  function externalTooltip(data) {
    return (context) => {
      const { chart: chartInstance, tooltip } = context;
      const el = getOrCreateTooltip(chartInstance);
      if (tooltip.opacity === 0) { el.style.opacity = 0; return; }
      el.querySelector('.cjs-tooltip__inner').innerHTML = buildTooltipContent(tooltip, data);
      const { offsetLeft, offsetTop } = chartInstance.canvas;
      el.style.opacity = 1;
      el.style.left = `${offsetLeft + tooltip.caretX}px`;
      el.style.top = `${offsetTop + tooltip.caretY}px`;
      el.style.transform = 'translate(-50%, calc(-100% - 14px))';
    };
  }

  function getOcupacaoGeral(state) {
    const { start, end } = DateUtils.getPeriodRange(state || AppState.getState());
    const diasNoPeriodo = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const SLOTS_POR_DIA = 12;

    return DataStore.getRadiologias()
      .filter(r => r.id !== 'all')
      .map(r => {
        const ags = DataStore.getAgendamentos({ radiologiaId: r.id })
          .filter(a => DateUtils.isWithinRange(a.data, start, end));
        const ativos = ags.filter(a => a.status !== 'cancelado' && a.status !== 'faltou').length;
        const capacidade = diasNoPeriodo * SLOTS_POR_DIA;
        const pct = capacidade ? Math.min(100, Math.round((ativos / capacidade) * 100)) : 0;
        return { id: r.id, nome: r.nome, ocupacao: pct, ativos, total: ags.length };
      });
  }

  function getOcupacaoInterna(radiologiaId) {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const ags = DataStore.getAgendamentos({ radiologiaId });
    const porDia = [0, 0, 0, 0, 0, 0, 0];
    ags.forEach(a => { porDia[new Date(`${a.data}T00:00:00`).getDay()]++; });
    const max = Math.max(...porDia, 1);
    return dias
      .map((nome, i) => ({
        nome,
        ocupacao: Math.round((porDia[i] / max) * 100),
        quantidade: porDia[i],
      }))
      .filter(d => d.nome !== 'Domingo');
  }

  function renderAllRadiologies(state) {
    const ctx = document.getElementById('occupancyChart');
    const data = getOcupacaoGeral(state);
    document.getElementById('occupancyChartTitle').textContent = 'Ocupação das Radiologias';
    document.getElementById('occupancyChartSubtitle').textContent = 'Comparativo entre as 4 unidades · últimos 7 dias de tendência';

    renderLegend(data);
    renderCards(data);

    if (chart) chart.destroy();

    const bgColors = data.map((d) => PALETTE[d.id]?.base || '#018093');
    const hvrColors = data.map((d) => PALETTE[d.id]?.light || '#01C6BF');

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.nome.replace('Radiologia ', '')),
        datasets: [{
          label: 'Ocupação (%)',
          data: data.map((d) => d.ocupacao),
          backgroundColor: bgColors,
          hoverBackgroundColor: hvrColors,
          borderRadius: { topLeft: 8, topRight: 8 },
          borderSkipped: 'bottom',
          maxBarThickness: 72,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            position: 'nearest',
            external: externalTooltip(data),
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 12, family: 'Inter', weight: '500' }, color: '#5C6E72' },
          },
          y: {
            min: 0, max: 100,
            grid: { color: '#E7ECED', lineWidth: 1 },
            border: { display: false, dash: [4, 4] },
            ticks: {
              font: { size: 11, family: 'Inter' },
              color: '#8B9C9F',
              stepSize: 20,
              callback: (v) => `${v}%`,
            },
          },
        },
      },
    });
  }

  function renderInternalOccupancy(state) {
    const ctx = document.getElementById('occupancyChart');
    const nome = AppCache.nomeRadiologiaPorId(state.radiologiaSelecionada);
    const data = getOcupacaoInterna(state.radiologiaSelecionada);
    const pal = PALETTE[state.radiologiaSelecionada] || { base: '#018093', light: '#01C6BF' };

    document.getElementById('occupancyChartTitle').textContent = `Ocupação Interna — ${nome}`;
    document.getElementById('occupancyChartSubtitle').textContent = 'Distribuição de agendamentos por dia da semana';

    // Esconde cards e legenda no modo interno
    const cards = document.getElementById('occupancyCards');
    const legend = document.getElementById('occupancyLegend');
    if (cards) cards.innerHTML = '';
    if (legend) legend.innerHTML = '';

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.nome),
        datasets: [{
          label: 'Ocupação (%)',
          data: data.map((d) => d.ocupacao),
          backgroundColor: data.map((_, i) => i === new Date().getDay() - 1 ? pal.light : pal.base),
          hoverBackgroundColor: pal.light,
          borderRadius: { topLeft: 8, topRight: 8 },
          borderSkipped: 'bottom',
          maxBarThickness: 72,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            position: 'nearest',
            external: (() => {
              const tooltipFn = (context) => {
                const { chart: chartInstance, tooltip } = context;
                const el = getOrCreateTooltip(chartInstance);
                if (tooltip.opacity === 0) { el.style.opacity = 0; return; }
                const idx = tooltip.dataPoints[0].dataIndex;
                const item = data[idx];
                el.querySelector('.cjs-tooltip__inner').innerHTML = `
                  <span class="cjs-tooltip__eyebrow">Dia da semana</span>
                  <div class="cjs-tooltip__headline">
                    <span class="cjs-tooltip__dot" style="background:${pal.light}"></span>
                    <span class="cjs-tooltip__headline-label">${item.nome}</span>
                    <span class="cjs-tooltip__headline-value">${item.ocupacao}%</span>
                  </div>
                  <div class="cjs-tooltip__divider"></div>
                  <div class="cjs-tooltip__metrics">
                    <div class="cjs-tooltip__metric">
                      <span class="cjs-tooltip__metric-label">Agendamentos</span>
                      <span class="cjs-tooltip__metric-value">${Kpis.formatNumber(item.quantidade)}</span>
                    </div>
                    <div class="cjs-tooltip__metric">
                      <span class="cjs-tooltip__metric-label">Slots disponíveis</span>
                      <span class="cjs-tooltip__metric-value">${Math.max(0, 24 - item.quantidade)}</span>
                    </div>
                  </div>
                  <div class="cjs-tooltip__mini-bar-track">
                    <div class="cjs-tooltip__mini-bar-fill" style="width:${item.ocupacao}%; background:${pal.light}"></div>
                  </div>
                `;
                const { offsetLeft, offsetTop } = chartInstance.canvas;
                el.style.opacity = 1;
                el.style.left = `${offsetLeft + tooltip.caretX}px`;
                el.style.top = `${offsetTop + tooltip.caretY}px`;
                el.style.transform = 'translate(-50%, calc(-100% - 14px))';
              };
              return tooltipFn;
            })(),
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 12, family: 'Inter', weight: '500' }, color: '#5C6E72' },
          },
          y: {
            min: 0, max: 100,
            grid: { color: '#E7ECED' },
            border: { display: false },
            ticks: { font: { size: 11, family: 'Inter' }, color: '#8B9C9F', stepSize: 20, callback: (v) => `${v}%` },
          },
        },
      },
    });
  }

  function render(state) {
    if (state.radiologiaSelecionada === 'all') renderAllRadiologies(state);
    else renderInternalOccupancy(state);
  }

  function init() {
    render(AppState.getState());
    AppState.subscribe(render);
  }

  return { init, render, externalTooltipHandler: () => { } };
})();


/* =================================================================
   8. APPOINTMENT MODAL
================================================================= */
const AppointmentModal = (() => {
  let overlay, closeBtn, statusBadge, statusSelect;
  let currentAppointment = null;

  /* Gera link WhatsApp baseado no status */
  function buildWhatsAppLink(agendamento) {
    const phone = (agendamento.pacienteTelefone || '').replace(/\D/g, '').replace(/^0/, '');
    const num = phone.startsWith('55') ? phone : `55${phone}`;
    const dataLabel = new Date(`${agendamento.data}T00:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    let msg;
    if (agendamento.status === 'confirmado') {
      msg =
        `Olá, ${agendamento.paciente.split(' ')[0]}! 👋 Lembrando do seu exame agendado:\n\n` +
        `📍 *Local:* ${agendamento.radiologiaNome}\n` +
        `📅 *Data:* ${dataLabel}\n` +
        `⏰ *Horário:* ${agendamento.horarioInicio}\n` +
        `🩺 *Exame:* ${agendamento.tipoExame}\n\n` +
        `Por favor, chegue com 10 minutos de antecedência. Em caso de imprevisto, entre em contato para reagendarmos. Até lá! 😊`;
    } else {
      msg =
        `Olá, ${agendamento.paciente.split(' ')[0]}! 😊 Passando para confirmar seu agendamento na *${agendamento.radiologiaNome}*.\n\n` +
        `📅 *Data:* ${dataLabel}\n` +
        `⏰ *Horário:* ${agendamento.horarioInicio}\n` +
        `🩺 *Exame:* ${agendamento.tipoExame}\n\n` +
        `Por favor, confirme sua presença respondendo esta mensagem. Qualquer dúvida, estamos à disposição! 🙏`;
    }

    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }

  function fill(agendamento) {
    currentAppointment = agendamento;
    const cfg = AppCache.statusConfig[agendamento.status];

    /* Header */
    document.getElementById('modalTime').textContent =
      `${agendamento.horarioInicio} – ${agendamento.horarioFim}`;

    const headerRadEl = document.getElementById('modalHeaderRadiologia');
    const headerExEl = document.getElementById('modalHeaderExame');
    if (headerRadEl) headerRadEl.textContent = agendamento.radiologiaNome;
    if (headerExEl) headerExEl.textContent = agendamento.tipoExame;

    statusBadge.textContent = cfg.label;
    statusBadge.className = `status-badge status-badge--${agendamento.status}`;
    statusSelect.value = agendamento.status;

    /* Campos do body */
    document.getElementById('modalPatientName').textContent = agendamento.paciente;
    document.getElementById('modalPatientPhone').textContent = agendamento.pacienteTelefone;
    document.getElementById('modalPatientAge').textContent =
      agendamento.pacienteIdade != null ? `${agendamento.pacienteIdade} anos` : '—';

    document.getElementById('modalExamType').textContent = agendamento.tipoExame;
    document.getElementById('modalExamValue').textContent = Kpis.formatCurrency(agendamento.valor);
    document.getElementById('modalExamDuration').textContent = `${agendamento.duracaoMin} minutos`;

    document.getElementById('modalRadiologia').textContent = agendamento.radiologiaNome;
    document.getElementById('modalClinica').textContent = agendamento.clinica;
    document.getElementById('modalMedico').textContent = agendamento.medico;
    document.getElementById('modalObservations').textContent =
      agendamento.observacoes || 'Nenhuma observação registrada.';

    /* Botão WhatsApp dinâmico */
    const waBtn = document.getElementById('modalBtnWhatsapp');
    const waLabel = document.getElementById('modalBtnWhatsappLabel');
    if (waBtn && waLabel) {
      waBtn.href = buildWhatsAppLink(agendamento);
      if (agendamento.status === 'confirmado') {
        waLabel.textContent = 'Enviar Lembrete via WhatsApp';
      } else if (agendamento.status === 'cancelado' || agendamento.status === 'realizado') {
        waBtn.style.display = 'none';
      } else {
        waBtn.style.display = '';
        waLabel.textContent = 'Confirmar via WhatsApp';
      }
    }
  }

  function open(agendamento) {
    fill(agendamento);
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    currentAppointment = null;
  }

  function notifyStatusChange(agendamento) {
    document.dispatchEvent(
      new CustomEvent('appointment:statusChanged', { detail: { agendamento } })
    );
  }

  function setStatus(newStatus) {
    if (!currentAppointment) return;
    currentAppointment.status = newStatus;
    fill(currentAppointment);
    notifyStatusChange(currentAppointment);
  }

  function bindEvents() {
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });
    statusSelect.addEventListener('change', async (e) => {
  const newStatus = e.target.value;
  if (!currentAppointment) return;
  const oldStatus = currentAppointment.status;

  // Atualiza o modal otimisticamente para feedback imediato
  currentAppointment.status = newStatus;
  fill(currentAppointment);

  try {
    await Api.updateAgendamento(currentAppointment.id, { status: newStatus });
    showToast('Status atualizado com sucesso!');
    // Busca dados frescos e dispara re-render de todos os componentes via AppState
    const st = AppState.getState();
    await DataStore.refresh(st);
    AppState.update({});   // notifica todos os subscribers (KPIs, gráficos, listas…)
    notifyStatusChange(currentAppointment);
  } catch (err) {
    // Reverte o modal ao status original
    currentAppointment.status = oldStatus;
    fill(currentAppointment);
    console.error('Erro ao salvar status:', err);
    showToast('Erro ao salvar status. Tente novamente.', 'error');
  }
});

    async function applyStatusChange(newStatus) {
  if (!currentAppointment) return;
  const oldStatus = currentAppointment.status;
  if (oldStatus === newStatus) return;

  // Feedback imediato no modal
  currentAppointment.status = newStatus;
  fill(currentAppointment);

  try {
    await Api.updateAgendamento(currentAppointment.id, { status: newStatus });
    showToast('Status atualizado com sucesso!');
    const st = AppState.getState();
    await DataStore.refresh(st);
    AppState.update({});   // notifica todos os subscribers (KPIs, gráficos, listas…)
    notifyStatusChange(currentAppointment);
  } catch (err) {
    // Reverte o modal
    currentAppointment.status = oldStatus;
    fill(currentAppointment);
    showToast('Erro ao salvar status. Tente novamente.', 'error');
  }
}

    document.getElementById('modalBtnDone').addEventListener('click', () => applyStatusChange('realizado'));
    document.getElementById('modalBtnCancel').addEventListener('click', () => applyStatusChange('cancelado'));
    document.getElementById('modalBtnPrint').addEventListener('click', () => window.print());
    document.getElementById('modalBtnEdit').addEventListener('click', () => {
      if (!currentAppointment) return;
      close();
      NewAppointmentModal.openEdit(currentAppointment);
    });
  }

  function init() {
    overlay = document.getElementById('appointmentModalOverlay');
    closeBtn = document.getElementById('modalCloseBtn');
    statusBadge = document.getElementById('modalStatusBadge');
    statusSelect = document.getElementById('modalStatusSelect');
    bindEvents();
  }

  return { init, open, close };
})();


/* =================================================================
   9. DAY LIST MODAL
================================================================= */
const DayListModal = (() => {
  let overlay, closeBtn, title, body;

  function render(dateLabel, agendamentos) {
    title.textContent = `Agendamentos — ${dateLabel}`;
    body.innerHTML = '';

    if (!agendamentos.length) {
      body.innerHTML = '<p style="text-align:center;color:var(--color-text-subtle);padding:32px 0;font-size:var(--fs-sm);">Nenhum agendamento neste dia.</p>';
      return;
    }

    agendamentos
      .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio))
      .forEach((a) => {
        const item = document.createElement('div');
        item.className = 'day-list-item';
        item.innerHTML = `
          <span class="day-list-item__time">${a.horarioInicio}</span>
          <div class="day-list-item__main">
            <span class="day-list-item__patient">${a.paciente}</span>
            <span class="day-list-item__meta">${a.tipoExame} · ${a.radiologiaNome}</span>
          </div>
          <span class="status-badge status-badge--${a.status}">${AppCache.statusConfig[a.status].label}</span>
        `;
        item.addEventListener('click', () => { close(); AppointmentModal.open(a); });
        body.appendChild(item);
      });
  }

  function open(dateLabel, agendamentos) {
    render(dateLabel, agendamentos);
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
  }

  function bindEvents() {
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });
  }

  function init() {
    overlay = document.getElementById('dayListModalOverlay');
    closeBtn = document.getElementById('dayListModalCloseBtn');
    title = document.getElementById('dayListModalTitle');
    body = document.getElementById('dayListModalBody');
    bindEvents();
  }

  return { init, open, close };
})();


/* =================================================================
   CAL HOVER CARD — preview flutuante ao passar o mouse no calendário
================================================================= */
const CalHoverCard = (() => {
  let cardEl = null;
  let hideTimer = null;
  let currentDayEl = null;

  const STATUS_COLORS = {
    agendado: '#8B9C9F',
    confirmado: '#018093',
    em_andamento: '#B27A0E',
    realizado: '#0E8F63',
    cancelado: '#C23B32',
    faltou: '#C23B32',
  };

  function createCard() {
    cardEl = document.createElement('div');
    cardEl.className = 'cal-hover-card';
    cardEl.setAttribute('role', 'tooltip');
    document.body.appendChild(cardEl);

    /* Permite que o mouse entre no card sem ele sumir */
    cardEl.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
    });
    cardEl.addEventListener('mouseleave', () => {
      scheduleHide();
    });
  }

  function scheduleHide() {
    hideTimer = setTimeout(hide, 120);
  }

  function hide() {
    if (!cardEl) return;
    cardEl.classList.remove('is-visible');
  }

  function position(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const cardW = 300;
    const cardH = cardEl.offsetHeight || 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 10;

    let left = rect.right + gap;
    let top = rect.top;

    /* Se sair pela direita, mostra à esquerda */
    if (left + cardW > vw - 12) left = rect.left - cardW - gap;
    /* Se sair pela base, sobe */
    if (top + cardH > vh - 12) top = vh - cardH - 12;
    /* Garante mínimo */
    if (top < 8) top = 8;
    if (left < 8) left = 8;

    cardEl.style.left = `${left}px`;
    cardEl.style.top = `${top}px`;
  }

  function buildContent(isoDate, agendamentos, state) {
    const date = new Date(`${isoDate}T00:00:00`);
    const dateLabel = date.toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long'
    });
    const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

    const total = agendamentos.length;
    const ativos = agendamentos.filter(a => a.status !== 'cancelado');
    const ocupPct = Math.min(100, Math.round((ativos.length / 12) * 100));

    const sorted = [...agendamentos].sort((a, b) =>
      a.horarioInicio.localeCompare(b.horarioInicio)
    );
    const preview = sorted.slice(0, 4);

    const listHTML = preview.length
      ? preview.map(a => `
          <div class="cal-hover-card__item" data-id="${a.id}">
            <div class="cal-hover-card__item-dot"
                 style="background:${STATUS_COLORS[a.status] || '#8B9C9F'}"></div>
            <span class="cal-hover-card__item-time">${a.horarioInicio}</span>
            <div class="cal-hover-card__item-body">
              <span class="cal-hover-card__item-patient">${a.paciente}</span>
              <span class="cal-hover-card__item-meta">${a.tipoExame} · ${a.medico.split(' ').slice(0, 2).join(' ')}</span>
            </div>
          </div>
        `).join('')
      : `<div class="cal-hover-card__empty">Nenhum agendamento neste dia</div>`;

    const footerHTML = total > 0 ? `
      <div class="cal-hover-card__footer">
        <button class="cal-hover-card__btn" data-iso="${isoDate}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M7 2v3M17 2v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Ver todos os ${total} agendamento${total !== 1 ? 's' : ''}
        </button>
      </div>` : '';

    cardEl.innerHTML = `
      <div class="cal-hover-card__stripe"></div>
      <div class="cal-hover-card__head">
        <div class="cal-hover-card__date">${dateCapitalized}</div>
        <div class="cal-hover-card__meta">
          <div class="cal-hover-card__stat">
            <span class="cal-hover-card__stat-value">${total}</span>
            <span class="cal-hover-card__stat-label">Agendamento${total !== 1 ? 's' : ''}</span>
          </div>
          <div class="cal-hover-card__stat-divider"></div>
          <div class="cal-hover-card__stat">
            <span class="cal-hover-card__stat-value">${ocupPct}%</span>
            <span class="cal-hover-card__stat-label">Ocupação</span>
          </div>
          <div class="cal-hover-card__stat-divider"></div>
          <div class="cal-hover-card__stat">
            <span class="cal-hover-card__stat-value">${ativos.length}</span>
            <span class="cal-hover-card__stat-label">Ativos</span>
          </div>
        </div>
        <div class="cal-hover-card__occ-bar">
          <div class="cal-hover-card__occ-fill" style="width:${ocupPct}%"></div>
        </div>
      </div>
      <div class="cal-hover-card__list">${listHTML}</div>
      ${footerHTML}
    `;

    /* Clique nos itens da lista abre o modal de detalhes */
    cardEl.querySelectorAll('.cal-hover-card__item').forEach(item => {
      item.addEventListener('click', () => {
        const appt = agendamentos.find(a => String(a.id) === item.dataset.id);
        if (appt) { hide(); AppointmentModal.open(appt); }
      });
    });

    /* Botão "Ver todos" abre o DayListModal */
    const btnAll = cardEl.querySelector('.cal-hover-card__btn');
    if (btnAll) {
      btnAll.addEventListener('click', () => {
        const lbl = date.toLocaleDateString('pt-BR', {
          weekday: 'long', day: 'numeric', month: 'long'
        });
        hide();
        DayListModal.open(lbl.charAt(0).toUpperCase() + lbl.slice(1), agendamentos);
      });
    }
  }

  function show(targetEl, isoDate, agendamentos, state) {
    clearTimeout(hideTimer);

    if (!cardEl) createCard();

    /* Evita rebuild desnecessário no mesmo dia */
    if (currentDayEl === targetEl && cardEl.classList.contains('is-visible')) return;
    currentDayEl = targetEl;

    buildContent(isoDate, agendamentos, state);

    /* Posiciona antes de mostrar */
    cardEl.style.opacity = '0';
    cardEl.style.transform = 'none';
    cardEl.classList.add('is-visible');

    requestAnimationFrame(() => {
      position(targetEl);
      cardEl.style.opacity = '';
      cardEl.style.transform = '';
    });
  }

  function init() {
    createCard();
    /* Fecha ao scrollar */
    window.addEventListener('scroll', hide, { passive: true });
  }

  return { show, hide, scheduleHide, init };
})();

/* =================================================================
   10. CALENDAR VIEW (MODO AGENDA)
================================================================= */
const CalendarView = (() => {
  let gridEl, labelEl, prevBtn, nextBtn, todayBtn, granularityToggle;

  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  function agendamentosDoDia(state, isoDate) {
    const todos = DataStore.getAgendamentos({ radiologiaId: state.radiologiaSelecionada });
    const buscaLower = state.busca.trim().toLowerCase();
    return todos.filter((a) => {
      if (a.data !== isoDate) return false;
      if (state.status !== 'all' && a.status !== state.status) return false;
      if (buscaLower) {
        if (!`${a.paciente} ${a.tipoExame} ${a.medico}`.toLowerCase().includes(buscaLower)) return false;
      }
      return true;
    });
  }

  function buildDayCell(date, state, isOutsideMonth) {
    const iso = AppCache.toISODate(date);
    const ags = agendamentosDoDia(state, iso);
    const isToday = iso === AppCache.toISODate(new Date());
    const ativos = ags.filter(a => a.status !== 'cancelado' && a.status !== 'faltou');
    const ocupPct = Math.min(100, Math.round((ativos.length / 12) * 100));

    const cell = document.createElement('div');
    cell.className = [
      'calendar-day',
      isOutsideMonth ? 'is-outside' : '',
      isToday ? 'is-today' : '',
      ags.length ? 'has-appointments' : '',
    ].filter(Boolean).join(' ');

    const sorted = [...ags].sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));
    const topApts = sorted.slice(0, 2);

    cell.innerHTML = `
      <div class="calendar-day__head">
        <span class="calendar-day__number">${date.getDate()}</span>
        ${ags.length ? `<span class="calendar-day__count">${ags.length}</span>` : ''}
      </div>
      ${ags.length ? `
        <div class="calendar-day__occupancy-track">
          <div class="calendar-day__occupancy-fill" style="width:${ocupPct}%"></div>
        </div>` : ''}
      <div class="calendar-day__appointments">
        ${topApts.map((a) => `
          <span class="calendar-day__appt-pill" data-status="${a.status}">
            <span class="calendar-day__appt-pill-time">${a.horarioInicio}</span>
            <span class="calendar-day__appt-pill-name">${a.paciente.split(' ')[0]} · ${a.tipoExame}</span>
          </span>
        `).join('')}
        ${ags.length > 2 ? `<span class="calendar-day__more">+${ags.length - 2} mais</span>` : ''}
      </div>
    `;

    if (!isOutsideMonth) {
      /* Clique abre o DayListModal (comportamento original) */
      cell.addEventListener('click', () => {
        const label = date.toLocaleDateString('pt-BR', {
          weekday: 'long', day: 'numeric', month: 'long'
        });
        DayListModal.open(label, ags);
      });
    }

    return cell;
  }

  function renderMonth(state) {
    const focusDate = state.calDate;
    const year = focusDate.getFullYear();
    const month = focusDate.getMonth();
    labelEl.textContent = `${MESES[month]} ${year}`;
    const firstOfMonth = new Date(year, month, 1);
    const startGrid = DateUtils.addDays(firstOfMonth, -firstOfMonth.getDay());
    gridEl.innerHTML = '';
    for (let i = 0; i < 42; i++) {
      const date = DateUtils.addDays(startGrid, i);
      gridEl.appendChild(buildDayCell(date, state, date.getMonth() !== month));
    }
  }

  function renderWeek(state) {
    const startWeek = DateUtils.startOfWeek(state.calDate);
    const endWeek = DateUtils.addDays(startWeek, 6);
    const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    labelEl.textContent = `${fmt(startWeek)} — ${fmt(endWeek)}`;
    gridEl.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      gridEl.appendChild(buildDayCell(DateUtils.addDays(startWeek, i), state, false));
    }
  }

  /**
   * CORREÇÃO: removido o guard `if (state.agendaView !== 'agenda') return;`
   * O controle de visibilidade agora é feito exclusivamente pelo ViewSwitcher
   * via classes CSS (.agenda-view--active), não por guards dentro do render.
   * Manter o guard causava o seguinte bug: ao trocar de view pelo toggle e
   * depois mudar um filtro, AppState.subscribe disparava render() com
   * agendaView já atualizado, mas o painel podia estar ativo/inativo de
   * forma inconsistente. Removendo o guard, render() sempre produz o DOM
   * correto; a visibilidade é controlada só pelo CSS.
   */
  function render(state) {
    if (state.calGranularity === 'semanal') renderWeek(state);
    else renderMonth(state);
  }

  function navigate(direction) {
    const state = AppState.getState();
    let newDate;
    if (state.calGranularity === 'semanal') {
      newDate = DateUtils.addDays(state.calDate, direction * 7);
    } else {
      newDate = new Date(state.calDate.getFullYear(), state.calDate.getMonth() + direction, 1);
    }
    AppState.update({ calDate: newDate });
  }

  function bindEvents() {
    prevBtn.addEventListener('click', () => navigate(-1));
    nextBtn.addEventListener('click', () => navigate(1));
    todayBtn.addEventListener('click', () => AppState.update({ calDate: new Date() }));

    granularityToggle.querySelectorAll('.view-toggle__btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        granularityToggle.querySelectorAll('.view-toggle__btn').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        AppState.update({ calGranularity: btn.dataset.granularity });
      });
    });

    AppState.subscribe(render);
    document.addEventListener('appointment:statusChanged', () => render(AppState.getState()));
  }

  function init() {
    gridEl = document.getElementById('calendarGrid');
    labelEl = document.getElementById('calendarLabel');
    prevBtn = document.getElementById('calPrevMonth');
    nextBtn = document.getElementById('calNextMonth');
    todayBtn = document.getElementById('calToday');
    granularityToggle = document.getElementById('calGranularityToggle');
    render(AppState.getState());
    bindEvents();
  }

  return { init, render };
})();

/* =================================================================
   KANBAN HOVER CARD — preview flutuante ao hover dos cards
================================================================= */
const KanbanHoverCard = (() => {
  let cardEl = null;
  let hideTimer = null;
  let currentCardEl = null;

  function getOrCreate() {
    if (cardEl) return cardEl;
    cardEl = document.createElement('div');
    cardEl.className = 'kanban-hover-card';
    document.body.appendChild(cardEl);
    cardEl.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    cardEl.addEventListener('mouseleave', () => scheduleHide());
    return cardEl;
  }

  function scheduleHide() {
    hideTimer = setTimeout(hide, 150);
  }

  function hide() {
    if (!cardEl) return;
    cardEl.classList.remove('is-visible');
    currentCardEl = null;
  }

  function buildWhatsAppLink(appt) {
    const phone = (appt.pacienteTelefone || '').replace(/\D/g, '').replace(/^0/, '');
    const num = phone.startsWith('55') ? phone : `55${phone}`;
    const dataLabel = new Date(`${appt.data}T00:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    const isConfirmado = appt.status === 'confirmado';
    const msg = isConfirmado
      ? `Olá, ${appt.paciente.split(' ')[0]}! 👋 Lembrando do seu exame:\n\n📍 *Local:* ${appt.radiologiaNome}\n📅 *Data:* ${dataLabel}\n⏰ *Horário:* ${appt.horarioInicio}\n🩺 *Exame:* ${appt.tipoExame}\n\nPor favor, chegue 10 minutos antes. Até lá! 😊`
      : `Olá, ${appt.paciente.split(' ')[0]}! 😊 Confirmando seu agendamento na *${appt.radiologiaNome}*.\n\n📅 *Data:* ${dataLabel}\n⏰ *Horário:* ${appt.horarioInicio}\n🩺 *Exame:* ${appt.tipoExame}\n\nPor favor, confirme sua presença. Qualquer dúvida, é só chamar! 🙏`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }

  function buildContent(appt) {
    const card = getOrCreate();
    card.dataset.status = appt.status;

    const dataLabel = new Date(`${appt.data}T00:00:00`)
      .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });

    const showWa = appt.status === 'agendado' || appt.status === 'confirmado';
    const waLabel = appt.status === 'confirmado' ? 'Enviar Lembrete via WhatsApp' : 'Confirmar via WhatsApp';
    const waLink = buildWhatsAppLink(appt);

    const waHTML = showWa ? `
      <a href="${waLink}" target="_blank" rel="noopener noreferrer"
         class="kanban-hover-card__whatsapp">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ${waLabel}
      </a>` : '';

    card.innerHTML = `
      <div class="kanban-hover-card__stripe"></div>
      <div class="kanban-hover-card__inner">

        <div class="kanban-hover-card__head">
          <span class="kanban-hover-card__name">${appt.paciente}</span>
          <span class="status-badge status-badge--${appt.status}">
  ${AppCache.statusConfig[appt.status].label}
</span>
        </div>

        <div class="kanban-hover-card__meta-row">
          <div class="kanban-hover-card__meta-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M7 2v3M17 2v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${dataLabel}
          </div>
          <div class="kanban-hover-card__meta-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
              <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            ${appt.horarioInicio}–${appt.horarioFim}
          </div>
          <div class="kanban-hover-card__meta-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
              <path d="M12 8v4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            ${appt.duracaoMin}min
          </div>
        </div>

        <div class="kanban-hover-card__tags">
          <span class="exam-tag">${appt.tipoExame}</span>
          <span class="radiology-tag">${appt.radiologiaNome.replace('Radiologia ', '')}</span>
        </div>

        <div class="kanban-hover-card__value-row">
          <span class="kanban-hover-card__value-label">Valor do exame</span>
          <span class="kanban-hover-card__value-amount">${Kpis.formatCurrency(appt.valor)}</span>
        </div>

        <div class="kanban-hover-card__divider"></div>

        <div class="kanban-hover-card__origin">
          <div class="kanban-hover-card__origin-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 12a5 5 0 100-10 5 5 0 000 10zM3 21a9 9 0 0118 0"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            ${appt.medico}
          </div>
          <div class="kanban-hover-card__origin-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                    stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            </svg>
            ${appt.clinica}
          </div>
        </div>

        ${waHTML}

      </div>
    `;
  }

  function position(targetEl) {
    const card = getOrCreate();
    const rect = targetEl.getBoundingClientRect();
    const cw = 300;
    const ch = card.offsetHeight || 360;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 12;

    let left = rect.right + gap;
    let top = rect.top;

    if (left + cw > vw - 12) left = rect.left - cw - gap;
    if (top + ch > vh - 12) top = vh - ch - 12;
    if (top < 8) top = 8;
    if (left < 8) left = 8;

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function show(targetEl, appt) {
    clearTimeout(hideTimer);
    const card = getOrCreate();

    if (currentCardEl === targetEl && card.classList.contains('is-visible')) return;
    currentCardEl = targetEl;

    buildContent(appt);

    /* Posiciona antes de tornar visível para evitar flash */
    card.style.opacity = '0';
    card.classList.add('is-visible');
    requestAnimationFrame(() => {
      position(targetEl);
      card.style.opacity = '';
    });
  }

  function init() {
    getOrCreate();
    window.addEventListener('scroll', hide, { passive: true });
    /* Fecha ao clicar fora */
    document.addEventListener('click', (e) => {
      if (cardEl && !cardEl.contains(e.target)) hide();
    });
  }

  return { show, hide, scheduleHide, init };
})();

/* =================================================================
   11. KANBAN VIEW
================================================================= */
const KanbanView = (() => {
  let boardEl, searchInput;
  let draggedId = null;
  let autoScrollRAF = null;
  let ghostEl = null;

  function agendamentosDoKanban(state) {
    const kanbanSearch = (searchInput?.value || '').trim().toLowerCase();
    // Kanban mostra TODOS os agendamentos da radiologia (sem filtro de período)
    // para dar visão completa do pipeline de status
    let base = AgendaData.getFilteredNoPeriod(state);
    if (!kanbanSearch) return base;
    return base.filter((a) =>
      `${a.paciente || ''} ${a.tipoExame || ''} ${a.medico || ''}`.toLowerCase().includes(kanbanSearch)
    );
  }

  /* Retorna o próximo horário disponível na coluna de destino,
     mantendo a ordem cronológica relativa ao card arrastado.     */
  function resolveNewTime(agendamento, targetStatus, allAgendamentos) {
    const targetCards = allAgendamentos
      .filter((a) => a.id !== agendamento.id && AppCache.statusConfig[a.status].kanbanColumn === targetStatus)
      .sort((a, b) => (a.data + a.horarioInicio).localeCompare(b.data + b.horarioInicio));

    // Mantém data/hora originais — a ordem visual já é resolvida pelo sort
    // Apenas garante que o status correto seja aplicado
    return { data: agendamento.data, horarioInicio: agendamento.horarioInicio };
  }

  function buildCard(agendamento) {
    const card = document.createElement('article');
    card.className = 'kanban-card';
    card.draggable = true;
    card.dataset.id = agendamento.id;
    card.dataset.status = agendamento.status;

    const dataLabel = new Date(`${agendamento.data}T00:00:00`)
      .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    card.innerHTML = `
      <div class="kanban-card__top">
        <span class="kanban-card__time">${dataLabel} · ${agendamento.horarioInicio}</span>
        <span class="status-badge status-badge--${agendamento.status}">${AppCache.statusConfig[agendamento.status].label}</span>
      </div>
      <span class="kanban-card__patient">${agendamento.paciente}</span>
      <div class="kanban-card__tags">
        <span class="exam-tag">${agendamento.tipoExame}</span>
        <span class="radiology-tag">${agendamento.radiologiaNome}</span>
      </div>
      <div class="kanban-card__origin">${agendamento.medico} · ${agendamento.clinica}</div>
      <div class="kanban-card__footer">
        <span class="kanban-card__value">${Kpis.formatCurrency(agendamento.valor)}</span>
        <span style="font-size:10px;color:var(--color-text-subtle);">${agendamento.duracaoMin}min</span>
      </div>
    `;

    card.addEventListener('click', () => {
      if (!draggedId) AppointmentModal.open(agendamento);
    });

    /* Hover card */
    card.addEventListener('mouseenter', () => {
      if (!draggedId) KanbanHoverCard.show(card, agendamento);
    });
    card.addEventListener('mouseleave', () => {
      KanbanHoverCard.scheduleHide();
    });

    card.addEventListener('dragstart', (e) => {
      draggedId = agendamento.id;
      requestAnimationFrame(() => card.classList.add('is-dragging'));
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', agendamento.id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      requestAnimationFrame(() => { draggedId = null; });
      stopAutoScroll();
      removeGhost();
      boardEl.querySelectorAll('.kanban-column__body').forEach((b) => b.classList.remove('is-drag-over'));
      boardEl.querySelectorAll('.kanban-column').forEach((c) => c.classList.remove('is-drop-target'));
    });

    return card;
  }

  /* Ghost visual que aparece na coluna de destino durante o drag */
  function createGhost() {
    ghostEl = document.createElement('div');
    ghostEl.className = 'kanban-card--drop-ghost';
    return ghostEl;
  }
  function removeGhost() {
    if (ghostEl && ghostEl.parentNode) ghostEl.parentNode.removeChild(ghostEl);
    ghostEl = null;
  }

  function buildColumn(columnDef, agendamentosDaColuna) {
    const col = document.createElement('div');
    col.className = 'kanban-column';
    col.dataset.status = columnDef.id;

    col.innerHTML = `
      <div class="kanban-column__head">
        <span class="kanban-column__title">
          <span class="kanban-column__dot"></span>${columnDef.label}
        </span>
        <span class="kanban-column__count">${agendamentosDaColuna.length}</span>
      </div>
      <div class="kanban-column__body" data-status="${columnDef.id}"></div>
    `;

    const body = col.querySelector('.kanban-column__body');

    if (!agendamentosDaColuna.length) {
      body.innerHTML = '<div class="kanban-column__empty">Nenhum agendamento aqui</div>';
    } else {
      agendamentosDaColuna
        .sort((a, b) => (a.data + a.horarioInicio).localeCompare(b.data + b.horarioInicio))
        .forEach((a) => body.appendChild(buildCard(a)));
    }

    bindDropZone(body, col, columnDef.id);
    return col;
  }

  function startAutoScroll(direction) {
    if (autoScrollRAF) return;
    const step = () => {
      boardEl.scrollLeft += direction * 14;
      autoScrollRAF = requestAnimationFrame(step);
    };
    autoScrollRAF = requestAnimationFrame(step);
  }
  function stopAutoScroll() {
    if (autoScrollRAF) { cancelAnimationFrame(autoScrollRAF); autoScrollRAF = null; }
  }
  function handleBoardDragOver(e) {
    const rect = boardEl.getBoundingClientRect();
    const edge = 60;
    if (e.clientX < rect.left + edge) startAutoScroll(-1);
    else if (e.clientX > rect.right - edge) startAutoScroll(1);
    else stopAutoScroll();
  }

  function bindDropZone(bodyEl, colEl, statusId) {
    bodyEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      boardEl.querySelectorAll('.kanban-column__body').forEach((b) => b.classList.remove('is-drag-over'));
      boardEl.querySelectorAll('.kanban-column').forEach((c) => c.classList.remove('is-drop-target'));
      bodyEl.classList.add('is-drag-over');
      colEl.classList.add('is-drop-target');

      /* Insere ghost se ainda não estiver nessa coluna */
      if (!bodyEl.querySelector('.kanban-card--drop-ghost')) {
        removeGhost();
        const g = createGhost();

        /* Posiciona o ghost na ordem correta pelo horário */
        const id = draggedId;
        if (id) {
          const dragged = findAppointmentById(id);
          if (dragged) {
            const cards = [...bodyEl.querySelectorAll('.kanban-card:not(.is-dragging)')];
            let inserted = false;
            for (const c of cards) {
              const a = findAppointmentById(c.dataset.id);
              if (a && (dragged.data + dragged.horarioInicio) <= (a.data + a.horarioInicio)) {
                bodyEl.insertBefore(g, c);
                inserted = true;
                break;
              }
            }
            if (!inserted) bodyEl.appendChild(g);
            return;
          }
        }
        bodyEl.appendChild(g);
      }
    });

    bodyEl.addEventListener('dragleave', (e) => {
      if (!colEl.contains(e.relatedTarget)) {
        bodyEl.classList.remove('is-drag-over');
        colEl.classList.remove('is-drop-target');
        removeGhost();
      }
    });

    bodyEl.addEventListener('drop', (e) => {
      e.preventDefault();
      bodyEl.classList.remove('is-drag-over');
      colEl.classList.remove('is-drop-target');
      removeGhost();
      const id = e.dataTransfer.getData('text/plain') || draggedId;
      if (!id) return;
      moveAppointment(id, statusId);
    });
  }

  function findAppointmentById(id) {
    return DataStore.getAgendamentos({ radiologiaId: 'all' }).find(a => String(a.id) === String(id));
  }

  async function moveAppointment(id, newStatus) {
    const agendamento = findAppointmentById(id);
    if (!agendamento || AppCache.statusConfig[agendamento.status].kanbanColumn === newStatus) return;

    const novoStatus = Object.entries(AppCache.statusConfig)
      .find(([, cfg]) => cfg.kanbanColumn === newStatus)?.[0];
    if (!novoStatus) return;

    showToast(`Movendo para "${AppCache.statusConfig[novoStatus].label}"…`);

    try {
      await Api.updateAgendamento(agendamento.id, { status: novoStatus });
      showToast(`Status movido para "${AppCache.statusConfig[novoStatus].label}"!`);
      const st = AppState.getState();
      await DataStore.refresh(st);
      AppState.update({});
      document.dispatchEvent(new CustomEvent('appointment:statusChanged', { detail: { agendamento } }));
    } catch (err) {
      console.error('[KanbanView] Erro ao salvar status:', err);
      showToast('Erro ao salvar status. Tente novamente.', 'error');
    }
  }

  function render(state) {
    const agendamentos = agendamentosDoKanban(state);
    boardEl.innerHTML = '';
    AppCache.kanbanColumns.forEach((columnDef) => {
      const daColuna = agendamentos.filter(
        (a) => AppCache.statusConfig[a.status]?.kanbanColumn === columnDef.id
      );
      boardEl.appendChild(buildColumn(columnDef, daColuna));
    });
  }

  function bindEvents() {
    searchInput.addEventListener('input', () => render(AppState.getState()));
    boardEl.addEventListener('dragover', handleBoardDragOver);
    boardEl.addEventListener('dragleave', (e) => {
      if (!boardEl.contains(e.relatedTarget)) stopAutoScroll();
    });

    AppState.subscribe(render);
    document.addEventListener('appointment:statusChanged', () => render(AppState.getState()));

    document.getElementById('btnNovoAgendamento').addEventListener('click', () => {
      NewAppointmentModal.open();
    });
  }

  function init() {
    boardEl = document.getElementById('kanbanBoard');
    searchInput = document.getElementById('kanbanSearch');
    render(AppState.getState());
    bindEvents();
  }

  return { init, render };
})();


/* =================================================================
   12. DAY VIEW (MODO DIA — TIMELINE)
================================================================= */
const DayView = (() => {
  let timelineEl, summaryEl, labelEl, prevBtn, nextBtn, todayBtn, statusPillsEl;

  const HORAS = Array.from({ length: 12 }, (_, i) => 7 + i); // 07h–18h

  function agendamentosDoDia(state) {
    const iso = AppCache.toISODate(state.dayDate);
    const todos = DataStore.getAgendamentos({ radiologiaId: state.radiologiaSelecionada });
    const buscaLower = state.busca.trim().toLowerCase();
    return todos.filter((a) => {
      if (a.data !== iso) return false;
      if (state.status !== 'all' && a.status !== state.status) return false;
      if (buscaLower && !`${a.paciente} ${a.tipoExame} ${a.medico}`.toLowerCase().includes(buscaLower)) return false;
      return true;
    });
  }

  function renderSummary(agendamentos) {
    const total = agendamentos.length;
    const realizados = agendamentos.filter((a) => a.status === 'realizado').length;
    const faturamento = agendamentos
      .filter((a) => a.status !== 'cancelado')
      .reduce((s, a) => s + a.valor, 0);
    const ocupacaoPct = Math.min(100, Math.round((total / 24) * 100));

    summaryEl.innerHTML = `
      <div class="day-summary__card">
        <svg class="day-summary__card-icon" viewBox="0 0 24 24" fill="none"><path d="M8 7V3M16 7V3M3 11h18M5 5h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="day-summary__label">Total Agendado</span>
        <span class="day-summary__value">${Kpis.formatNumber(total)}</span>
        <span class="day-summary__sub">pacientes no dia</span>
      </div>
      <div class="day-summary__card">
        <svg class="day-summary__card-icon" viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 3M12 22a10 10 0 100-20 10 10 0 000 20z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="day-summary__label">Ocupação do Dia</span>
        <span class="day-summary__value">${ocupacaoPct}%</span>
        <div class="day-summary__bar"><div class="day-summary__bar-fill" style="width: ${ocupacaoPct}%"></div></div>
        <span class="day-summary__sub">dos slots disponíveis</span>
      </div>
      <div class="day-summary__card">
        <svg class="day-summary__card-icon" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4M22 12a10 10 0 11-20 0 10 10 0 0120 0z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="day-summary__label">Realizados</span>
        <span class="day-summary__value">${realizados}</span>
        <span class="day-summary__sub">de ${total} agendados</span>
      </div>
      <div class="day-summary__card">
        <svg class="day-summary__card-icon" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="day-summary__label">Faturamento Estimado</span>
        <span class="day-summary__value">${Kpis.formatCurrency(faturamento)}</span>
        <span class="day-summary__sub">excluindo cancelados</span>
      </div>
    `;
  }

  function renderStatusPills(agendamentos) {
    if (!statusPillsEl) return;
    const counts = {};
    agendamentos.forEach((a) => { counts[a.status] = (counts[a.status] || 0) + 1; });
    statusPillsEl.innerHTML = Object.entries(counts)
      .map(([status, n]) => `<span class="status-badge status-badge--${status}">${n} ${AppCache.statusConfig[status]?.label || status}</span>`)
      .join('');
  }

  function buildAppointmentRow(agendamento, state) {
    const row = document.createElement('div');
    row.className = 'timeline-appt';
    row.dataset.status = agendamento.status;

    const radiologiaMeta = state.radiologiaSelecionada === 'all' ? ` · ${agendamento.radiologiaNome}` : '';

    const initials = agendamento.paciente
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(n => n[0])
      .join('');

    row.innerHTML = `
      <div class="timeline-appt__avatar">${initials}</div>
      <span class="timeline-appt__time">${agendamento.horarioInicio}–${agendamento.horarioFim}</span>
      <div class="timeline-appt__main">
        <span class="timeline-appt__patient">${agendamento.paciente}</span>
        <span class="timeline-appt__meta">${agendamento.tipoExame} · ${agendamento.medico}${radiologiaMeta}</span>
      </div>
      <div class="timeline-appt__aside">
        <span class="timeline-appt__value">${Kpis.formatCurrency(agendamento.valor)}</span>
        <span class="status-badge status-badge--${agendamento.status}">${AppCache.statusConfig[agendamento.status]?.label || agendamento.status}</span>
      </div>
    `;

    row.addEventListener('click', () => AppointmentModal.open(agendamento));
    return row;
  }

  function renderTimeline(state, agendamentos) {
    timelineEl.innerHTML = '';

    // Header da timeline
    const header = document.createElement('div');
    header.className = 'day-timeline__header';
    header.innerHTML = '<span>Horário</span><span>Agendamentos</span>';
    timelineEl.appendChild(header);

    const body = document.createElement('div');
    body.className = 'day-timeline__body';

    const isHoje = AppCache.toISODate(state.dayDate) === AppCache.toISODate(new Date());

    if (!agendamentos.length) {
      body.innerHTML = `
        <div class="timeline-empty-state">
          <div class="timeline-empty-state__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M7 2v3M17 2v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="var(--color-text-subtle)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <p>Nenhum agendamento neste dia</p>
        </div>`;
      timelineEl.appendChild(body);
      return;
    }

    const hojeHora = new Date().getHours();

    HORAS.forEach((hora) => {
      const label = `${AppCache.pad(hora)}:00`;
      const doHorario = agendamentos
        .filter((a) => parseInt(a.horarioInicio.split(':')[0], 10) === hora)
        .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio));

      const isCurrent = isHoje && hora === hojeHora;

      const row = document.createElement('div');
      row.className = 'timeline-row';

      const hourEl = document.createElement('span');
      hourEl.className = 'timeline-row__hour' + (isCurrent ? ' timeline-row__hour--current' : '');
      hourEl.textContent = label;

      const track = document.createElement('div');
      track.className = 'timeline-row__track' + (isCurrent ? ' timeline-row__track--current' : '');

      if (doHorario.length) {
        doHorario.forEach((a) => track.appendChild(buildAppointmentRow(a, state)));
      } else {
        const empty = document.createElement('span');
        empty.className = 'timeline-row__empty';
        empty.textContent = '·';
        track.appendChild(empty);
      }

      row.appendChild(hourEl);
      row.appendChild(track);
      body.appendChild(row);
    });

    timelineEl.appendChild(body);
  }

  /** CORREÇÃO: removido o guard `if (state.agendaView !== 'dia') return;` */
  function render(state) {
    const label = state.dayDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    labelEl.textContent = label.charAt(0).toUpperCase() + label.slice(1);

    const todayChip = document.getElementById('dayTodayChip');
    const isToday = AppCache.toISODate(state.dayDate) === AppCache.toISODate(new Date());
    if (todayChip) todayChip.hidden = !isToday;

    const agendamentos = agendamentosDoDia(state);
    renderSummary(agendamentos);
    renderStatusPills(agendamentos);
    renderTimeline(state, agendamentos);
  }

  function bindEvents() {
    prevBtn.addEventListener('click', () => {
      const state = AppState.getState();
      AppState.update({ dayDate: DateUtils.addDays(state.dayDate, -1) });
    });
    nextBtn.addEventListener('click', () => {
      const state = AppState.getState();
      AppState.update({ dayDate: DateUtils.addDays(state.dayDate, 1) });
    });
    todayBtn.addEventListener('click', () => AppState.update({ dayDate: new Date() }));

    AppState.subscribe(render);
    document.addEventListener('appointment:statusChanged', () => render(AppState.getState()));
  }

  function init() {
    timelineEl = document.getElementById('dayTimeline');
    summaryEl = document.getElementById('daySummary');
    labelEl = document.getElementById('dayLabel');
    prevBtn = document.getElementById('dayPrev');
    nextBtn = document.getElementById('dayNext');
    todayBtn = document.getElementById('dayToday');
    statusPillsEl = document.getElementById('dayStatusPills');

    render(AppState.getState());
    bindEvents();
  }

  return { init, render };
})();


/* =================================================================
   13. VIEW SWITCHER  ← PRINCIPAL CORREÇÃO DO BUG
   -----------------------------------------------------------------
   PROBLEMA ORIGINAL:
     1. Os painéis usavam o atributo `hidden` do HTML para controle
        de visibilidade. Mas `.agenda-view { display: flex }` no CSS
        cria uma especificidade que sobrepõe o user-agent stylesheet
        que define `[hidden] { display: none }`. Em muitos browsers,
        o `hidden` não conseguia ocultar o elemento quando há um
        `display: flex` explícito com especificidade de classe.
     2. As funções render() dos módulos CalendarView, KanbanView e
        DayView tinham guards como `if (state.agendaView !== X) return`.
        Esses guards impediam que o painel re-renderizasse quando o
        usuário mudava filtros enquanto o painel estava ativo, porque
        a ordem das operações (update state → fire listeners → render)
        às vezes produzia estados intermediários inconsistentes.

   SOLUÇÃO:
     - Visibilidade controlada 100% por classes CSS:
         .agenda-view            → display: none  (sempre oculto)
         .agenda-view--active    → display: flex  (ativo)
     - O HTML não usa mais o atributo `hidden` nos painéis.
     - Os guards foram removidos de render() nos módulos; eles sempre
       re-renderizam quando chamados.
     - ViewSwitcher é o único ponto que gerencia qual painel é ativo.
     - AppState.update({ agendaView }) ainda é chamado para que outros
       módulos possam saber qual view está ativa (ex: modal de dia que
       decide navegar para o Modo Dia).
================================================================= */
const ViewSwitcher = (() => {
  let toggleEl;
  const panels = { agenda: null, kanban: null, dia: null };

  function showView(viewId) {
    // 1. Remove a classe ativa de todos os painéis
    Object.values(panels).forEach((panel) => {
      panel.classList.remove('agenda-view--active');
    });

    // 2. Ativa o painel correto
    if (panels[viewId]) {
      panels[viewId].classList.add('agenda-view--active');
    }

    // 3. Atualiza o estado global (para outros módulos que precisem saber)
    AppState.update({ agendaView: viewId });

    // 4. Força re-render do painel ativado para garantir que ele
    //    reflita quaisquer mudanças de filtro feitas enquanto estava oculto
    const state = AppState.getState();
    if (viewId === 'agenda') CalendarView.render(state);
    if (viewId === 'kanban') KanbanView.render(state);
    if (viewId === 'dia') DayView.render(state);
  }

  function bindEvents() {
    toggleEl.querySelectorAll('.view-toggle__btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        // Atualiza estado visual dos botões
        toggleEl.querySelectorAll('.view-toggle__btn').forEach((b) => {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');

        // Mostra a view correspondente
        showView(btn.dataset.view);
      });
    });
  }

  function init() {
    toggleEl = document.getElementById('agendaViewToggle');
    panels.agenda = document.getElementById('viewAgenda');
    panels.kanban = document.getElementById('viewKanban');
    panels.dia = document.getElementById('viewDia');

    // Estado inicial: agenda ativa (class já está no HTML, confirma aqui)
    showView('agenda');
    bindEvents();
  }

  return { init };
})();

/* =================================================================
   TOAST — feedback visual rápido
================================================================= */
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const icons = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `${icons[type] || ''}<span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 240ms ease forwards';
    setTimeout(() => toast.remove(), 240);
  }, 3200);
}


/* =================================================================
   NEW APPOINTMENT MODAL — v2 (fluxo em cascata)
================================================================= */
const NewAppointmentModal = (() => {
  let overlay, closeBtn, cancelBtn, saveBtn;
  let editingAppointment = null;

  /* ------------------------------------------------------------------
     HELPERS
  ------------------------------------------------------------------ */
  function pad(n) { return String(n).padStart(2, '0'); }

  /* Gera todos os slots de 30 min entre 07:00 e 18:00 */
  function allSlots() {
    const slots = [];
    for (let h = 7; h <= 17; h++) {
      slots.push(`${pad(h)}:00`);
      slots.push(`${pad(h)}:30`);
    }
    slots.push('18:00');
    return slots;
  }

  function toMinutes(hora) {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
  }

  function horariosOcupados(radId, isoDate, tipoExameId) {
    if (!radId || !isoDate) return [];
    // Busca o label correspondente ao ID para comparar com o DataStore
    const tipoInfo = DataStore.getTiposExame().find(t => t.id === tipoExameId);
    const tipoLabel = tipoInfo ? tipoInfo.label : tipoExameId;
    return DataStore.getAgendamentos({ radiologiaId: radId })
      .filter(a =>
        a.data === isoDate &&
        (a.tipoExame === tipoLabel || a.tipoExameId === tipoExameId) &&
        a.status !== 'cancelado' &&
        a.status !== 'faltou'
      )
      .map(a => ({ inicio: toMinutes(a.horarioInicio), fim: toMinutes(a.horarioFim) }));
  }


  function horarioLivre(slot, duracao, ocupados) {
    const inicio = toMinutes(slot);
    const fim = inicio + duracao;
    return !ocupados.some(ag =>
      inicio < ag.fim &&
      fim > ag.inicio
    );
  }

  /* Calcula hora fim a partir de hora início + duração */
  function calcFim(horarioInicio, duracao) {
    if (!horarioInicio || !duracao) return '';
    const [hh, mm] = horarioInicio.split(':').map(Number);
    const total = hh * 60 + mm + duracao;
    return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
  }

  /* ------------------------------------------------------------------
     CASCATA: Radiologia → Clínica
  ------------------------------------------------------------------ */
  async function onRadiologiaChange() {
    const radId = document.getElementById('newRadiologia').value;
    const selCli = document.getElementById('newClinica');
    const hintCli = document.getElementById('newClinicaHint');

    selCli.innerHTML = '<option value="">Carregando clínicas...</option>';
    selCli.disabled = true;
    hintCli.textContent = '';

    onClinicaChange(); // reset médico

    if (!radId) {
      selCli.innerHTML = '<option value="">Selecione a clínica...</option>';
      hintCli.textContent = '— selecione uma radiologia primeiro';
      return;
    }

    try {
      const clinicas = await Api.getClinicasPorRadiologia(radId);
      selCli.innerHTML = '<option value="">Selecione a clínica...</option>';
      clinicas.data.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id ?? c.nome; opt.textContent = c.nome;
        selCli.appendChild(opt);
      });
      selCli.disabled = false;
    } catch (err) {
      console.error('[NewAppointmentModal] Erro ao buscar clínicas:', err);
      selCli.innerHTML = '<option value="">Erro ao carregar</option>';
      hintCli.textContent = 'Erro ao carregar clínicas.';
    }

    tryUpdateHorarios();
  }

  /* ------------------------------------------------------------------
     CASCATA: Clínica → Médico
  ------------------------------------------------------------------ */
  async function onClinicaChange() {
    const clinicaId = document.getElementById('newClinica').value;
    const radId = document.getElementById('newRadiologia').value;
    const selMed = document.getElementById('newMedico');
    const hintMed = document.getElementById('newMedicoHint');

    selMed.innerHTML = '<option value="">Selecione o médico...</option>';
    selMed.disabled = true;
    hintMed.textContent = '— selecione uma clínica primeiro';

    if (!clinicaId) return;

    selMed.innerHTML = '<option value="">Carregando médicos...</option>';

    try {
      const medicos = await Api.getMedicos({ clinicaId, radiologiaId: radId, semPeriodo: true });
      selMed.innerHTML = '<option value="">Selecione o médico...</option>';
      medicos.data.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id ?? m.name;
        opt.textContent = m.name || m.nome; // ← aceita os dois
        selMed.appendChild(opt);
      });
      selMed.disabled = false;
      hintMed.textContent = '';
    } catch (err) {
      console.error('[NewAppointmentModal] Erro ao buscar médicos:', err);
      selMed.innerHTML = '<option value="">Erro ao carregar</option>';
      hintMed.textContent = 'Erro ao carregar médicos.';
    }
  }

  /* ------------------------------------------------------------------
     HORÁRIOS DISPONÍVEIS (com spinner simulado)
  ------------------------------------------------------------------ */
  let horarioDebounce = null;

  function tryUpdateHorarios() {
    const radId = document.getElementById('newRadiologia').value;
    const tipoExame = document.getElementById('newTipoExame').value;
    const data = document.getElementById('newDate').value;
    const selTime = document.getElementById('newTimeStart');
    const hint = document.getElementById('newTimeHint');

    /* Só ativa quando os 3 campos estão preenchidos */
    if (!radId || !tipoExame || !data) {
      selTime.innerHTML = '<option value="">Selecione o horário...</option>';
      selTime.disabled = true;
      hint.textContent = '— preencha exame, radiologia e data';
      document.getElementById('newTimeEnd').value = '';
      return;
    }

    /* Debounce de 600ms para simular latência */
    clearTimeout(horarioDebounce);
    horarioDebounce = setTimeout(() => {

      try {

        const duracao = DURACAO_POR_EXAME[tipoExame] || 30;

        const ocupados = horariosOcupados(
          radId,
          data,
          tipoExame
        );

        

        // Primeiro: remove horários ocupados
        let disponiveis = allSlots().filter(slot =>
          horarioLivre(slot, duracao, ocupados)
        );

        // Segundo: se a data é hoje, remove horários que já passaram
        const hoje = AppCache.toISODate(new Date());

        if (data === hoje) {

          const agora = new Date();
          const agoraMin = agora.getHours() * 60 + agora.getMinutes();

          disponiveis = disponiveis.filter(slot =>
            toMinutes(slot) > agoraMin
          );

        }

        selTime.innerHTML = '<option value="">Selecione o horário...</option>';

        if (!disponiveis.length) {

          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'Nenhum horário disponível neste dia';

          selTime.appendChild(opt);
          selTime.disabled = true;
          hint.textContent = 'Nenhum horário disponível';
          document.getElementById('newTimeEnd').value = '';

          return;
        }

        // O primeiro horário disponível já será automaticamente o sugerido
        const sugestao = disponiveis[0];

        disponiveis.forEach(slot => {

          const opt = document.createElement('option');

          opt.value = slot;

          const fim = calcFim(slot, duracao);

          opt.textContent = `${slot} → ${fim} (${duracao}min)`;

          if (slot === sugestao) {
            opt.selected = true;
          }

          selTime.appendChild(opt);

        });

        selTime.disabled = false;
        hint.textContent = `${disponiveis.length} horários disponíveis`;

        document.getElementById('newTimeEnd').value = calcFim(sugestao, duracao);

      } catch (err) {

        console.error('Erro ao verificar horários:', err);

        selTime.innerHTML = '<option value="">Erro ao carregar horários</option>';
        selTime.disabled = true;
        hint.textContent = 'Ocorreu um erro ao verificar os horários.';

        showToast('Erro ao verificar horários disponíveis.', 'error');

      } finally {

      }

    }, 850);
  }

  /* Quando o usuário muda manualmente o horário, recalcula hora fim */
  function onHorarioChange() {
    const tipoExameId = document.getElementById('newTipoExame').value;
    const horario = document.getElementById('newTimeStart').value;
    const duracao = DURACAO_POR_EXAME[tipoExameId] || 30;
    document.getElementById('newTimeEnd').value = calcFim(horario, duracao);
  }

  /* ------------------------------------------------------------------
     PREVIEW DE VALOR
  ------------------------------------------------------------------ */
  function updateValuePreview() {
    const tipoExameId = document.getElementById('newTipoExame').value;
    const preview = document.getElementById('newValuePreview');
    if (!tipoExameId) { preview.hidden = true; return; }
    const valor   = VALOR_POR_EXAME[tipoExameId]    || 0;
    const duracao = DURACAO_POR_EXAME[tipoExameId]  || 30;
    document.getElementById('newValueAmount').textContent =
      valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('newValueDuration').textContent =
      `· duração estimada: ${duracao} min`;
    preview.hidden = false;
  }

  /* ------------------------------------------------------------------
     RESET / FILL
  ------------------------------------------------------------------ */
  function resetForm() {
    const today = new Date().toISOString().split('T')[0];

    document.getElementById('newPaciente').value = '';
    document.getElementById('newCpf').value = '';
    document.getElementById('newTelefone').value = '';
    document.getElementById('newIdade').value = '';
    document.getElementById('newRadiologia').value = '';
    document.getElementById('newTipoExame').value = '';
    document.getElementById('newDate').value = today;
    document.getElementById('newTimeEnd').value = '';
    document.getElementById('newStatus').value = 'agendado';
    document.getElementById('newObservacoes').value = '';
    document.getElementById('newValuePreview').hidden = true;

    /* Reset cascatas */
    const selCli = document.getElementById('newClinica');
    selCli.innerHTML = '<option value="">Selecione a clínica...</option>';
    selCli.disabled = true;
    document.getElementById('newClinicaHint').textContent = '— selecione uma radiologia primeiro';

    const selMed = document.getElementById('newMedico');
    selMed.innerHTML = '<option value="">Selecione o médico...</option>';
    selMed.disabled = true;
    document.getElementById('newMedicoHint').textContent = '— selecione uma clínica primeiro';

    const selTime = document.getElementById('newTimeStart');
    selTime.innerHTML = '<option value="">Selecione o horário...</option>';
    selTime.disabled = true;
    document.getElementById('newTimeHint').textContent = '— preencha exame, radiologia e data';

    overlay.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  }

  function fillFormForEdit(ag) {
    document.getElementById('newPaciente').value = ag.paciente || '';
    document.getElementById('newCpf').value = ag.pacienteCpf || '';
    document.getElementById('newTelefone').value = ag.pacienteTelefone || '';
    document.getElementById('newIdade').value = ag.pacienteIdade || '';
    // tipoExameId é o id do banco (ex: 'tomografia'); tipoExame é o label
    document.getElementById('newTipoExame').value = ag.tipoExameId || ag.tipoExame || '';
    document.getElementById('newDate').value = ag.data || '';
    document.getElementById('newStatus').value = ag.status || 'agendado';
    document.getElementById('newObservacoes').value = ag.observacoes || '';

    /* Dispara cascatas em sequência */
    document.getElementById('newRadiologia').value = ag.radiologiaId || '';
    onRadiologiaChange();

    if (ag.clinicaId) {
      const selCli = document.getElementById('newClinica');
      setTimeout(() => {
        selCli.value = String(ag.clinicaId);
        onClinicaChange();
        setTimeout(() => {
          if (ag.medicoId) {
            document.getElementById('newMedico').value = String(ag.medicoId);
          }
        }, 600);
      }, 600);
    }

    updateValuePreview();

    /* Dispara cálculo de horários e pré-seleciona o slot do agendamento */
    tryUpdateHorarios();
    setTimeout(() => {
      const selTime = document.getElementById('newTimeStart');
      if (ag.horarioInicio) {
        const match = [...selTime.options].find(o => o.value === ag.horarioInicio);
        if (match) { match.selected = true; onHorarioChange(); }
        else {
          const opt = document.createElement('option');
          opt.value = ag.horarioInicio;
          const dur = DURACAO_POR_EXAME[ag.tipoExameId] || DURACAO_POR_EXAME[ag.tipoExame] || 30;
          opt.textContent = `${ag.horarioInicio} → ${ag.horarioFim}  (${dur}min) — atual`;
          opt.selected = true;
          selTime.insertBefore(opt, selTime.options[1]);
          selTime.disabled = false;
          document.getElementById('newTimeEnd').value = ag.horarioFim;
        }
      }
    }, 950);
  }

  /* ------------------------------------------------------------------
     VALIDAÇÃO
  ------------------------------------------------------------------ */
  function validate() {
    const required = [
      { id: 'newPaciente', label: 'Nome do paciente' },
      { id: 'newRadiologia', label: 'Radiologia' },
      { id: 'newTipoExame', label: 'Tipo de exame' },
      { id: 'newDate', label: 'Data' },
      { id: 'newTimeStart', label: 'Horário' },
    ];
    let valid = true;
    overlay.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    required.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el.value.trim()) { el.classList.add('is-invalid'); valid = false; }
    });
    return valid;
  }

  /* ------------------------------------------------------------------
     BUILD / SAVE
  ------------------------------------------------------------------ */
  function buildNewAppointment() {
    const tipoExame = document.getElementById('newTipoExame').value;
    const radId = document.getElementById('newRadiologia').value;
    const data = document.getElementById('newDate').value;
    const horarioInicio = document.getElementById('newTimeStart').value;
    const horarioFim = document.getElementById('newTimeEnd').value
      || calcFim(horarioInicio, DURACAO_POR_EXAME[tipoExame] || 30);

    return {
      id: editingAppointment ? editingAppointment.id : `${radId}_${data}_new_${Date.now()}`,
      radiologiaId: radId,
      radiologiaNome: DataStore.nomeRadiologiaPorId(radId),
      data,
      horarioInicio,
      horarioFim,
      duracaoMin: DURACAO_POR_EXAME[tipoExame] || 30,
      paciente: document.getElementById('newPaciente').value.trim(),
      pacienteCpf: document.getElementById('newCpf').value.trim(),
      pacienteTelefone: document.getElementById('newTelefone').value.trim(),
      pacienteIdade: parseInt(document.getElementById('newIdade').value) || null,
      tipoExame,
      valor: VALOR_POR_EXAME[tipoExame] || 0,
      medicoId: document.getElementById('newMedico').value.trim() || null,
      medico: document.getElementById('newMedico').options[document.getElementById('newMedico').selectedIndex]?.text || '',
      clinicaId: document.getElementById('newClinica').value.trim() || null,
      clinica: document.getElementById('newClinica').options[document.getElementById('newClinica').selectedIndex]?.text || '',
      status: document.getElementById('newStatus').value,
      observacoes: document.getElementById('newObservacoes').value.trim(),
    };
  }

  async function saveAppointment() {
    if (!validate()) { showToast('Preencha os campos obrigatórios.', 'error'); return; }

    const appt = buildNewAppointment();
    saveBtn.disabled = true;

    try {
      if (editingAppointment) {
        await Api.updateAgendamento(editingAppointment.id, appt);
        showToast(`Agendamento de ${appt.paciente} atualizado com sucesso!`);
      } else {
        await Api.postAgendamento(appt);
        showToast(`Agendamento de ${appt.paciente} criado com sucesso!`);
      }
      close();
      // Busca dados frescos do servidor e dispara re-render via AppState
      const stateAtual = AppState.getState();
      await DataStore.refresh(stateAtual);
      AppState.update({});   // notifica todos os subscribers automaticamente
      document.dispatchEvent(new CustomEvent('appointment:statusChanged', { detail: { agendamento: appt } }));
    } catch (err) {
      console.error('[NewAppointmentModal] Erro ao salvar:', err);
      showToast('Erro ao salvar agendamento. Tente novamente.', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  function _populateRadiologiaSelect() {
    const sel = document.getElementById('newRadiologia');
    if (!sel) return;
    const radiologias = DataStore.getRadiologias().filter(r => r.id !== 'all');
    sel.innerHTML = '<option value="">Selecione a radiologia...</option>';
    radiologias.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.nome;
      sel.appendChild(opt);
    });
  }

  function _populateTipoExameSelect() {
    const sel = document.getElementById('newTipoExame');
    if (!sel) return;
    const tipos = DataStore.getTiposExame();
    sel.innerHTML = '<option value="">Selecione o exame...</option>';
    tipos.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      sel.appendChild(opt);
    });
  }

  /* ------------------------------------------------------------------
     OPEN / CLOSE
  ------------------------------------------------------------------ */
  function open() {
    editingAppointment = null;
    resetForm();
    _populateRadiologiaSelect();          
    _populateTipoExameSelect();           
    document.querySelector('.new-appointment-modal__title').textContent = 'Novo Agendamento';
    saveBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Salvar Agendamento`;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('newPaciente').focus();
  }

  function openEdit(ag) {
    editingAppointment = ag;
    resetForm();
    _populateRadiologiaSelect();          
    _populateTipoExameSelect();           
    fillFormForEdit(ag);
    document.querySelector('.new-appointment-modal__title').textContent = 'Editar Agendamento';
    saveBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Salvar Alterações`;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    editingAppointment = null;
    clearTimeout(horarioDebounce);
  }

  /* ------------------------------------------------------------------
     BIND EVENTS
  ------------------------------------------------------------------ */
  function bindEvents() {
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', saveAppointment);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });

    document.getElementById('newRadiologia').addEventListener('change', onRadiologiaChange);
    document.getElementById('newClinica').addEventListener('change', onClinicaChange);
    document.getElementById('newTipoExame').addEventListener('change', () => { updateValuePreview(); tryUpdateHorarios(); });
    document.getElementById('newDate').addEventListener('change', tryUpdateHorarios);
    document.getElementById('newTimeStart').addEventListener('change', onHorarioChange);

    /* CPF: máscara simples */
    document.getElementById('newCpf').addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 9) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
      else if (v.length > 6) v = `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
      else if (v.length > 3) v = `${v.slice(0, 3)}.${v.slice(3)}`;
      e.target.value = v;
    });

    /* Remove marcação de erro ao interagir */
    overlay.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', () => el.classList.remove('is-invalid'));
      el.addEventListener('change', () => el.classList.remove('is-invalid'));
    });
  }

  function init() {
    overlay = document.getElementById('newAppointmentModalOverlay');
    closeBtn = document.getElementById('newModalCloseBtn');
    cancelBtn = document.getElementById('newModalCancelBtn');
    saveBtn = document.getElementById('newModalSaveBtn');
    bindEvents();
  }

  return { init, open, openEdit, close };
})();

/* =================================================================
   14. SIDEBAR
================================================================= */
const Sidebar = (() => {
  function init() {
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        if (link.dataset.page === 'agendamentos') e.preventDefault();
      });
    });
  }
  return { init };
})();

/* =================================================================
   PENDING LIST — painel "Pendentes de Confirmação"
   Integrado aos filtros globais: radiologia, período e busca.
   Com filtro interno por status (agendado / confirmado).
================================================================= */
const PendingList = (() => {
  let listEl, badgeEl, subtitleEl;
  let currentFilter = 'agendado'; // estado interno do filtro de pills

  const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function formatDateLabel(isoDate) {
    const d = new Date(`${isoDate}T00:00:00`);
    const hoje = AppCache.toISODate(new Date());
    const amanha = AppCache.toISODate(DateUtils.addDays(new Date(), 1));
    if (isoDate === hoje) return 'Hoje';
    if (isoDate === amanha) return 'Amanhã';
    return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} ${MESES_CURTO[d.getMonth()]}`;
  }

  /* ------------------------------------------------------------------
     Mensagem de confirmação (status === 'agendado')
  ------------------------------------------------------------------ */
  function buildWhatsAppLinkConfirmacao(appt) {
    const phone = (appt.pacienteTelefone || '').replace(/\D/g, '').replace(/^0/, '');
    const num = phone.startsWith('55') ? phone : `55${phone}`;
    const dataLabel = new Date(`${appt.data}T00:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    const msg = encodeURIComponent(
      `Olá, ${appt.paciente.split(' ')[0]}! 😊 Passando para confirmar seu agendamento na *${appt.radiologiaNome}*.\n\n` +
      `📅 *Data:* ${dataLabel}\n` +
      `⏰ *Horário:* ${appt.horarioInicio}\n` +
      `🩺 *Exame:* ${appt.tipoExame}\n\n` +
      `Por favor, confirme sua presença respondendo esta mensagem. Qualquer dúvida, estamos à disposição! 🙏`
    );
    return `https://wa.me/${num}?text=${msg}`;
  }

  /* ------------------------------------------------------------------
     Mensagem de lembrete (status === 'confirmado')
  ------------------------------------------------------------------ */
  function buildWhatsAppLinkLembrete(appt) {
    const phone = (appt.pacienteTelefone || '').replace(/\D/g, '').replace(/^0/, '');
    const num = phone.startsWith('55') ? phone : `55${phone}`;
    const dataLabel = new Date(`${appt.data}T00:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    const msg = encodeURIComponent(
      `Olá, ${appt.paciente.split(' ')[0]}! 👋 Lembrando do seu exame agendado:\n\n` +
      `📍 *Local:* ${appt.radiologiaNome}\n` +
      `📅 *Data:* ${dataLabel}\n` +
      `⏰ *Horário:* ${appt.horarioInicio}\n` +
      `🩺 *Exame:* ${appt.tipoExame}\n\n` +
      `Por favor, chegue com 10 minutos de antecedência. Em caso de imprevisto, entre em contato para reagendarmos. Até lá! 😊`
    );
    return `https://wa.me/${num}?text=${msg}`;
  }

  function scrollToAndOpenAppointment(appt) {
    const agendaToggle = document.getElementById('agendaViewToggle');
    const agendaBtn = agendaToggle?.querySelector('[data-view="agenda"]');
    if (agendaBtn && !agendaBtn.classList.contains('is-active')) agendaBtn.click();

    AppState.update({ calDate: new Date(`${appt.data}T00:00:00`), calGranularity: 'mensal' });

    setTimeout(() => {
      document.querySelector('.agenda-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);

    setTimeout(() => AppointmentModal.open(appt), 420);
  }

  /* ------------------------------------------------------------------
     FILTRO CENTRAL
     Mesma lógica anterior, mas filtra pelo `currentFilter` em vez de
     fixar em 'agendado'.
  ------------------------------------------------------------------ */
  function getPendentes(state) {
    const { start, end } = DateUtils.getPeriodRange(state);
    const hoje = DateUtils.startOfDay(new Date());
    const effectiveStart = start >= hoje ? start : hoje;

    if (end < hoje) return [];

    const base = DataStore.getAgendamentos({ radiologiaId: state.radiologiaSelecionada });
    const buscaLower = state.busca.trim().toLowerCase();

    return base
      .filter(a => {
        if (a.status !== currentFilter) return false;
        if (!DateUtils.isWithinRange(a.data, effectiveStart, end)) return false;
        if (buscaLower) {
          const alvo = `${a.paciente || ''} ${a.tipoExame || ''} ${a.medico || ''} ${a.clinica || ''}`.toLowerCase();
          if (!alvo.includes(buscaLower)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.data + a.horarioInicio).localeCompare(b.data + b.horarioInicio))
      .slice(0, 50);
  }

  /* ------------------------------------------------------------------
     BUILD DE ITEM
  ------------------------------------------------------------------ */
  function buildItem(appt) {
    const item = document.createElement('div');
    item.className = 'pending-item';

    const isConfirmado = appt.status === 'confirmado';
    const waLink = isConfirmado
      ? buildWhatsAppLinkLembrete(appt)
      : buildWhatsAppLinkConfirmacao(appt);
    const waLabel = isConfirmado ? 'Lembrete' : 'WhatsApp';
    const waTitle = isConfirmado
      ? 'Enviar lembrete pelo WhatsApp'
      : 'Enviar confirmação pelo WhatsApp';

    item.innerHTML = `
      <div class="pending-item__main">
        <span class="pending-item__patient">${appt.paciente}</span>
        <span class="pending-item__meta">${formatDateLabel(appt.data)} · ${appt.horarioInicio}</span>
        <div class="pending-item__tags">
          <span class="exam-tag">${appt.tipoExame}</span>
          <span class="radiology-tag">${appt.radiologiaNome.replace('Radiologia ', '')}</span>
        </div>
      </div>
      <div class="pending-item__actions">
        <button type="button" class="pending-btn-view" title="Ver na agenda">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
          </svg>
          Ver
        </button>
        <a href="${waLink}" target="_blank" rel="noopener noreferrer"
           class="pending-btn-whatsapp ${isConfirmado ? 'pending-btn-whatsapp--lembrete' : ''}"
           title="${waTitle}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ${waLabel}
        </a>
      </div>
    `;

    item.querySelector('.pending-btn-view').addEventListener('click', () =>
      scrollToAndOpenAppointment(appt)
    );

    return item;
  }

  /* ------------------------------------------------------------------
     RENDER
  ------------------------------------------------------------------ */
  function render(state) {
    if (!listEl) return;

    const pendentes = getPendentes(state);

    badgeEl.textContent = pendentes.length;

    if (subtitleEl) {
      const periodoLabels = {
        hoje: 'hoje',
        amanha: 'amanhã',
        esta_semana: 'nesta semana',
        este_mes: 'neste mês',
        proximos_30: 'nos próximos 30 dias',
        custom: 'no período selecionado',
      };
      const periodoLabel = periodoLabels[state.periodo] ?? 'no período';
      const radLabel = state.radiologiaSelecionada === 'all'
        ? 'todas as radiologias'
        : DataStore.nomeRadiologiaPorId(state.radiologiaSelecionada);
      const filterLabel = currentFilter === 'confirmado' ? 'confirmados' : 'agendados';

      subtitleEl.textContent = pendentes.length
        ? `${pendentes.length} ${filterLabel} · ${periodoLabel} · ${radLabel}`
        : `Nenhum ${filterLabel} · ${periodoLabel} · ${radLabel}`;
    }

    listEl.innerHTML = '';

    if (!pendentes.length) {
      const emptyLabel = currentFilter === 'confirmado'
        ? 'Nenhum confirmado para este filtro'
        : 'Nenhum pendente para este filtro';
      listEl.innerHTML = `
        <div class="pending-panel__empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="var(--color-positive)"
                  stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>${emptyLabel}</span>
        </div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    pendentes.forEach(appt => frag.appendChild(buildItem(appt)));
    listEl.appendChild(frag);
  }

  /* ------------------------------------------------------------------
     INIT
  ------------------------------------------------------------------ */
  function init() {
    listEl = document.getElementById('pendingList');
    badgeEl = document.getElementById('pendingCountBadge');
    subtitleEl = document.getElementById('pendingSubtitle');

    /* Pills de filtro interno */
    const pillsContainer = document.getElementById('pendingFilterPills');
    if (pillsContainer) {
      pillsContainer.querySelectorAll('.pill').forEach(pill => {
        pill.addEventListener('click', () => {
          currentFilter = pill.dataset.pendingFilter;

          pillsContainer.querySelectorAll('.pill').forEach(p => {
            p.classList.toggle('is-active', p === pill);
            p.setAttribute('aria-selected', String(p === pill));
          });

          render(AppState.getState());
        });
      });
    }

    render(AppState.getState());

    AppState.subscribe(render);

    document.addEventListener('appointment:statusChanged', () =>
      render(AppState.getState())
    );
  }

  return { init };
})();

// Variáveis globais de tipos de exame
// Lookups globais de valor e duração por tipo de exame
// (preenchidos pelo DataStore.loadTiposExame)
let VALOR_POR_EXAME   = {};
let DURACAO_POR_EXAME = {};

/* =================================================================
   15. INIT — bootstrap assíncrono (sem cache)
================================================================= */
document.addEventListener('DOMContentLoaded', async () => {

  const loadingEl = document.getElementById('pageLoadingOverlay');
  if (loadingEl) loadingEl.hidden = false;

  try {
    // 1. Carrega radiologias e tipos de exame em paralelo
    await Promise.all([
      DataStore.loadRadiologias(),
      DataStore.loadTiposExame(),
    ]);

    // 2. Carrega agendamentos do período inicial (hoje por padrão)
    await DataStore.loadAgendamentos(AppState.getState());

  } catch (err) {
    console.error('[Init] Erro ao carregar dados iniciais:', err);
    showToast('Erro ao carregar dados. Recarregue a página.', 'error');
  } finally {
    if (loadingEl) loadingEl.hidden = true;
  }

  // Inicia os módulos de UI (DataStore já preenchido)
  Filters.init();
  Kpis.init();
  OccupancyChart.init();
  AppointmentModal.init();
  DayListModal.init();
  NewAppointmentModal.init();
  PendingList.init();
  CalendarView.init();
  KanbanHoverCard.init();
  KanbanView.init();
  DayView.init();
  ViewSwitcher.init();
  Sidebar.init();

  // Subscriber: recarrega do servidor sempre que filtros relevantes mudam.
  // Não re-fetcha para mudanças de UI pura (agendaView, busca, status, etc.)
  const FETCH_KEYS = new Set(['radiologiaSelecionada', 'periodo', 'customDateStart', 'customDateEnd']);
  let _prevState = AppState.getState();
  let _fetchDebounce = null;

  AppState.subscribe(async (state) => {
    const changedKeys = Object.keys(state).filter(k => state[k] !== _prevState[k]);
    _prevState = state;

    const needsFetch = changedKeys.some(k => FETCH_KEYS.has(k));

    if (!needsFetch) {
      // Apenas re-renderiza localmente com os dados em memória
      OccupancyChart.render(state);
      CalendarView.render(state);
      KanbanView.render(state);
      DayView.render(state);
      PendingList.render(state);
      return;
    }

    // Mudou radiologia ou período → busca dados frescos do servidor
    clearTimeout(_fetchDebounce);
    _fetchDebounce = setTimeout(async () => {
      try {
        await DataStore.loadAgendamentos(state);
        OccupancyChart.render(state);
        CalendarView.render(state);
        KanbanView.render(state);
        DayView.render(state);
        PendingList.render(state);
      } catch (err) {
        console.error('[Init] Erro ao atualizar agendamentos:', err);
        showToast('Erro ao atualizar dados. Verifique sua conexão.', 'error');
      }
    }, 300);
  });
});