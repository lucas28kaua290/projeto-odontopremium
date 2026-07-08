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
   1. MOCK DATA
================================================================= */
const MockData = (() => {

  const radiologias = [
    { id: 'all',       nome: 'Todas as Radiologias' },
    { id: 'rad_centro', nome: 'Radiologia Centro' },
    { id: 'rad_norte',  nome: 'Radiologia Zona Norte' },
    { id: 'rad_sul',    nome: 'Radiologia Zona Sul' },
    { id: 'rad_leste',  nome: 'Radiologia Zona Leste' },
  ];

  const nomeRadiologiaPorId = radiologias.reduce((acc, r) => { acc[r.id] = r.nome; return acc; }, {});

  const tiposExame = ['Tomografia', 'Raio-X', 'Ultrassom', 'Panorâmica', 'Escaneamento 3D'];

  const statusConfig = {
    agendado:     { label: 'Agendado',     kanbanColumn: 'agendado' },
    confirmado:   { label: 'Confirmado',   kanbanColumn: 'confirmado' },
    em_andamento: { label: 'Em Andamento', kanbanColumn: 'em_andamento' },
    realizado:    { label: 'Realizado',    kanbanColumn: 'realizado' },
    cancelado:    { label: 'Cancelado',    kanbanColumn: 'cancelado' },
    faltou:       { label: 'Faltou',       kanbanColumn: 'cancelado' },
  };

  const kanbanColumns = [
    { id: 'agendado',     label: 'Aguardando Confirmação' },
    { id: 'confirmado',   label: 'Confirmado' },
    { id: 'em_andamento', label: 'Em Andamento' },
    { id: 'realizado',    label: 'Realizado' },
    { id: 'cancelado',    label: 'Cancelado / Faltou' },
  ];

  const PRIMEIRO_NOME = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Fábio', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Karina', 'Lucas', 'Marina', 'Nelson', 'Otávio', 'Patrícia', 'Rafael', 'Sabrina', 'Thiago', 'Vanessa'];
  const SOBRENOME     = ['Almeida', 'Barros', 'Cavalcante', 'Duarte', 'Ferreira', 'Gomes', 'Henriques', 'Lima', 'Martins', 'Nogueira', 'Oliveira', 'Pereira', 'Ramos', 'Souza', 'Teixeira'];
  const MEDICOS       = ['Dra. Beatriz Nunes', 'Dr. Rafael Costa', 'Dr. Marcelo Alves', 'Dra. Camila Rocha', 'Dr. Henrique Lima', 'Dra. Patrícia Souza', 'Dr. Diego Farias', 'Dra. Larissa Prado', 'Dr. Vinícius Teixeira', 'Dra. Fernanda Dutra'];
  const CLINICAS      = ['Clínica OdontoVida', 'Sorriso & Cia', 'Clínica Dental Plus', 'Bem Estar Odonto', 'Odonto Norte', 'Clínica Dental Sul', 'OrtoSorriso', 'Clínica Vitallis', 'Clínica Leste Odonto', 'Sorridental'];
  const VALOR_POR_EXAME   = { 'Tomografia': 380, 'Raio-X': 90, 'Ultrassom': 150, 'Panorâmica': 120, 'Escaneamento 3D': 420 };
  const DURACAO_POR_EXAME = { 'Tomografia': 45, 'Raio-X': 15, 'Ultrassom': 30, 'Panorâmica': 20, 'Escaneamento 3D': 50 };

  function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function next() {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }
  function pad(n) { return String(n).length < 2 ? `0${n}` : `${n}`; }
  function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

  function slotsDisponiveis() {
    const slots = [];
    for (let h = 7; h <= 18; h++) {
      slots.push(`${pad(h)}:00`);
      if (h !== 18) slots.push(`${pad(h)}:30`);
    }
    return slots;
  }
  const ALL_SLOTS = slotsDisponiveis();

  function gerarAgendamentosRadiologia(radId, diasAntes, diasDepois, seedBase) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const rnd = seededRandom(seedBase);
    const agendamentos = [];
    let counter = 0;

    for (let offset = -diasAntes; offset <= diasDepois; offset++) {
      const dia = new Date(hoje);
      dia.setDate(dia.getDate() + offset);
      if (dia.getDay() === 0) continue; // Domingo fechado

      const qtd = 3 + Math.floor(rnd() * 7);
      const slotsDoDia = [...ALL_SLOTS].sort(() => rnd() - 0.5).slice(0, qtd);

      slotsDoDia.forEach((horario) => {
        counter++;
        const tipoExame = pick(tiposExame, rnd);
        const duracao   = DURACAO_POR_EXAME[tipoExame];
        const valor     = VALOR_POR_EXAME[tipoExame];
        const paciente  = `${pick(PRIMEIRO_NOME, rnd)} ${pick(SOBRENOME, rnd)}`;
        const medico    = pick(MEDICOS, rnd);
        const clinica   = pick(CLINICAS, rnd);

        let status;
        const r = rnd();
        if (offset < 0) {
          status = r < 0.78 ? 'realizado' : (r < 0.92 ? 'faltou' : 'cancelado');
        } else if (offset === 0) {
          status = r < 0.35 ? 'confirmado' : (r < 0.55 ? 'em_andamento' : (r < 0.85 ? 'agendado' : 'realizado'));
        } else {
          status = r < 0.55 ? 'agendado' : (r < 0.9 ? 'confirmado' : 'cancelado');
        }

        const [hh, mm] = horario.split(':').map(Number);
        const fim = new Date(dia);
        fim.setHours(hh, mm + duracao, 0, 0);
        const horarioFim = `${pad(fim.getHours())}:${pad(fim.getMinutes())}`;

        agendamentos.push({
          id: `${radId}_${toISODate(dia)}_${counter}`,
          radiologiaId: radId,
          radiologiaNome: nomeRadiologiaPorId[radId],
          data: toISODate(dia),
          horarioInicio: horario,
          horarioFim,
          duracaoMin: duracao,
          paciente,
          pacienteTelefone: `(84) 9${String(1000 + Math.floor(rnd() * 8999)).slice(0, 4)}-${String(1000 + Math.floor(rnd() * 8999)).slice(0, 4)}`,
          pacienteIdade: 12 + Math.floor(rnd() * 68),
          tipoExame,
          valor,
          medico,
          clinica,
          status,
          observacoes: rnd() < 0.3 ? 'Paciente relatou leve desconforto na última consulta. Verificar histórico antes do exame.' : '',
        });
      });
    }
    return agendamentos;
  }

  const agendamentosPorRadiologia = {
    rad_centro: gerarAgendamentosRadiologia('rad_centro', 10, 21, 1001),
    rad_norte:  gerarAgendamentosRadiologia('rad_norte',  10, 21, 2002),
    rad_sul:    gerarAgendamentosRadiologia('rad_sul',    10, 21, 3003),
    rad_leste:  gerarAgendamentosRadiologia('rad_leste',  10, 21, 4004),
  };

  const todosAgendamentos = [
    ...agendamentosPorRadiologia.rad_centro,
    ...agendamentosPorRadiologia.rad_norte,
    ...agendamentosPorRadiologia.rad_sul,
    ...agendamentosPorRadiologia.rad_leste,
  ];

  function getAgendamentos({ radiologiaId = 'all' } = {}) {
    if (radiologiaId === 'all') return todosAgendamentos;
    return agendamentosPorRadiologia[radiologiaId] || [];
  }

  function getOcupacaoGeral() {
    return radiologias.filter((r) => r.id !== 'all').map((r) => {
      const ags = agendamentosPorRadiologia[r.id];
      const ocupados = ags.filter((a) => a.status !== 'cancelado' && a.status !== 'faltou').length;
      const pct = Math.min(96, Math.round((ocupados / (ags.length * 1.15)) * 55 + 30));
      return { id: r.id, nome: r.nome, ocupacao: pct };
    });
  }

  function getOcupacaoInterna(radiologiaId) {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const ags = agendamentosPorRadiologia[radiologiaId] || [];
    const porDia = [0, 0, 0, 0, 0, 0, 0];
    ags.forEach((a) => { porDia[new Date(`${a.data}T00:00:00`).getDay()]++; });
    const max = Math.max(...porDia, 1);
    return dias.map((nome, i) => ({
      nome,
      ocupacao: Math.round((porDia[i] / max) * 100),
      quantidade: porDia[i],
    })).filter((d) => d.nome !== 'Domingo');
  }

  return { radiologias, nomeRadiologiaPorId, tiposExame, statusConfig, kanbanColumns, getAgendamentos, getOcupacaoGeral, getOcupacaoInterna, toISODate, pad };
})();


/* =================================================================
   2. APP STATE
================================================================= */
const AppState = (() => {
  let state = {
    radiologiaSelecionada: 'all',
    periodo: 'este_mes',
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
    { id: 'hoje',        label: 'Hoje' },
    { id: 'amanha',      label: 'Amanhã' },
    { id: 'esta_semana', label: 'Esta Semana' },
    { id: 'este_mes',    label: 'Este Mês' },
    { id: 'proximos_30', label: 'Próximos 30 dias' },
    { id: 'custom',      label: 'Personalizado' },
  ];

  function renderRadiologyPills() {
    radPillsContainer.innerHTML = '';
    MockData.radiologias.forEach((rad) => {
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
    radPillsContainer    = document.getElementById('radiologyFilters');
    periodPillsContainer = document.getElementById('periodFilters');
    customRangeWrapper   = document.getElementById('customRangeInputs');
    customDateStart      = document.getElementById('customDateStart');
    customDateEnd        = document.getElementById('customDateEnd');
    searchInput          = document.getElementById('quickSearch');
    statusSelect         = document.getElementById('statusFilter');

    renderRadiologyPills();
    renderPeriodPills();
    syncActivePills(AppState.getState());
    bindEvents();

    AppState.subscribe((state) => {
      const subtitle = document.getElementById('pageHeadingSubtitle');
      const nome = MockData.nomeRadiologiaPorId[state.radiologiaSelecionada];
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
      case 'hoje':        return { start: hoje, end: hoje };
      case 'amanha':      { const t = addDays(hoje, 1); return { start: t, end: t }; }
      case 'esta_semana': { const s = startOfWeek(hoje); return { start: s, end: addDays(s, 6) }; }
      case 'este_mes':    { const s = new Date(hoje.getFullYear(), hoje.getMonth(), 1); return { start: s, end: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0) }; }
      case 'proximos_30': return { start: hoje, end: addDays(hoje, 30) };
      case 'custom':      {
        if (state.customDateStart && state.customDateEnd) {
          return { start: new Date(`${state.customDateStart}T00:00:00`), end: new Date(`${state.customDateEnd}T00:00:00`) };
        }
        return { start: hoje, end: addDays(hoje, 30) };
      }
      default:            return { start: hoje, end: addDays(hoje, 30) };
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
    const base = MockData.getAgendamentos({ radiologiaId: state.radiologiaSelecionada });
    const buscaLower = state.busca.trim().toLowerCase();
    return base.filter((a) => {
      if (!DateUtils.isWithinRange(a.data, start, end)) return false;
      if (state.status !== 'all' && a.status !== state.status) return false;
      if (buscaLower) {
        const alvo = `${a.paciente} ${a.tipoExame} ${a.medico}`.toLowerCase();
        if (!alvo.includes(buscaLower)) return false;
      }
      return true;
    });
  }

  function getFilteredNoPeriod(state) {
    const base = MockData.getAgendamentos({ radiologiaId: state.radiologiaSelecionada });
    const buscaLower = state.busca.trim().toLowerCase();
    return base.filter((a) => {
      if (state.status !== 'all' && a.status !== state.status) return false;
      if (buscaLower) {
        const alvo = `${a.paciente} ${a.tipoExame} ${a.medico}`.toLowerCase();
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
    const hojeISO = MockData.toISODate(new Date());

    const total = agendamentos.length;
    const kpiTotal = document.getElementById('kpiTotalAgendamentos');
    kpiTotal.querySelector('[data-field="value"]').textContent = formatNumber(total);
    renderChangeEl(kpiTotal.querySelector('[data-field="change"]'), total > 0 ? 6.4 : 0);

    const ocupacao = MockData.getOcupacaoGeral();
    const ocupacaoRelevante = state.radiologiaSelecionada === 'all'
      ? ocupacao
      : ocupacao.filter((o) => o.id === state.radiologiaSelecionada);
    const mediaOcupacao = ocupacaoRelevante.reduce((s, o) => s + o.ocupacao, 0) / (ocupacaoRelevante.length || 1);
    document.getElementById('kpiOcupacaoGeral').querySelector('[data-field="value"]').textContent = `${Math.round(mediaOcupacao)}%`;

    const todosDaRadiologia = MockData.getAgendamentos({ radiologiaId: state.radiologiaSelecionada });
    const doDia = todosDaRadiologia.filter((a) => a.data === hojeISO);
    const confirmadosHoje = doDia.filter((a) => a.status === 'confirmado' || a.status === 'realizado').length;
    const pendentesHoje = doDia.length - confirmadosHoje;
    const kpiHoje = document.getElementById('kpiHoje');
    kpiHoje.querySelector('[data-field="value"]').textContent = formatNumber(doDia.length);
    kpiHoje.querySelector('[data-field="context"]').textContent = `${confirmadosHoje} confirmados · ${pendentesHoje} pendentes`;

    const proximos7 = DateUtils.addDays(DateUtils.startOfDay(new Date()), 7);
    const janela7 = todosDaRadiologia.filter((a) => DateUtils.isWithinRange(a.data, DateUtils.startOfDay(new Date()), proximos7));
    const preenchimento = Math.min(100, Math.round((janela7.length / (24 * 7)) * 100 * 3));
    document.getElementById('kpiPreenchimento').querySelector('[data-field="value"]').textContent = `${preenchimento}%`;

    const faturamentoPrevisto = agendamentos
      .filter((a) => a.status === 'confirmado' || a.status === 'realizado' || a.status === 'em_andamento')
      .reduce((s, a) => s + a.valor, 0);
    document.getElementById('kpiFaturamentoPrevisto').querySelector('[data-field="value"]').textContent = formatCurrency(faturamentoPrevisto);

    const kpiExames = document.getElementById('kpiExamesAgendados');
    kpiExames.querySelector('[data-field="value"]').textContent = formatNumber(total);
    const porTipo = {};
    agendamentos.forEach((a) => { porTipo[a.tipoExame] = (porTipo[a.tipoExame] || 0) + 1; });
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
  const SERIES_COLORS = ['#018093', '#01C6BF', '#046B85', '#7FE0DA'];

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

  function externalTooltipHandler(buildContent) {
    return (context) => {
      const { chart: chartInstance, tooltip } = context;
      const el = getOrCreateTooltip(chartInstance);
      if (tooltip.opacity === 0) { el.style.opacity = 0; return; }
      const content = buildContent(tooltip);
      const inner = el.querySelector('.cjs-tooltip__inner');
      inner.innerHTML = `
        ${content.eyebrow ? `<span class="cjs-tooltip__eyebrow">${content.eyebrow}</span>` : ''}
        <div class="cjs-tooltip__headline">
          <span class="cjs-tooltip__dot" style="background:${content.headline.color}"></span>
          <span class="cjs-tooltip__headline-label">${content.headline.label}</span>
          <span class="cjs-tooltip__headline-value">${content.headline.value}</span>
        </div>
        ${content.metrics ? `
          <div class="cjs-tooltip__divider"></div>
          <div class="cjs-tooltip__metrics">
            ${content.metrics.map((m) => `<div class="cjs-tooltip__metric"><span class="cjs-tooltip__metric-label">${m.label}</span><span class="cjs-tooltip__metric-value">${m.value}</span></div>`).join('')}
          </div>` : ''}
      `;
      const { offsetLeft, offsetTop } = chartInstance.canvas;
      el.style.opacity = 1;
      el.style.left = `${offsetLeft + tooltip.caretX}px`;
      el.style.top = `${offsetTop + tooltip.caretY}px`;
      el.style.transform = 'translate(-50%, calc(-100% - 12px))';
    };
  }

  function renderAllRadiologies() {
    const ctx = document.getElementById('occupancyChart');
    const data = MockData.getOcupacaoGeral();
    document.getElementById('occupancyChartTitle').textContent = 'Ocupação das Radiologias';
    document.getElementById('occupancyChartSubtitle').textContent = 'Comparativo entre as 4 unidades';
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.nome),
        datasets: [{ label: 'Ocupação (%)', data: data.map((d) => d.ocupacao), backgroundColor: SERIES_COLORS, borderRadius: 6, maxBarThickness: 56 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false, position: 'nearest', external: externalTooltipHandler((t) => {
            const idx = t.dataPoints[0].dataIndex;
            const item = data[idx];
            const prev = Math.max(0, item.ocupacao - (4 + Math.round(Math.random() * 6)));
            return {
              eyebrow: 'Radiologia',
              headline: { label: item.nome, value: `${item.ocupacao}%`, color: SERIES_COLORS[idx % SERIES_COLORS.length] },
              metrics: [
                { label: 'Horários preenchidos', value: `${Math.round(item.ocupacao * 0.5)}/50` },
                { label: 'vs. semana anterior', value: `${item.ocupacao >= prev ? '+' : ''}${item.ocupacao - prev} p.p.` },
              ],
            };
          }) },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { min: 0, max: 100, grid: { color: '#E3E7E8' }, ticks: { font: { size: 11 }, callback: (v) => `${v}%` } },
        },
      },
    });
  }

  function renderInternalOccupancy(state) {
    const ctx = document.getElementById('occupancyChart');
    const nome = MockData.nomeRadiologiaPorId[state.radiologiaSelecionada];
    const data = MockData.getOcupacaoInterna(state.radiologiaSelecionada);
    document.getElementById('occupancyChartTitle').textContent = `Ocupação Interna — ${nome}`;
    document.getElementById('occupancyChartSubtitle').textContent = 'Distribuição por dia da semana';
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.nome),
        datasets: [{ label: 'Ocupação (%)', data: data.map((d) => d.ocupacao), backgroundColor: '#01C6BF', borderRadius: 6, maxBarThickness: 56 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false, position: 'nearest', external: externalTooltipHandler((t) => {
            const idx = t.dataPoints[0].dataIndex;
            const item = data[idx];
            return {
              eyebrow: 'Dia da semana',
              headline: { label: item.nome, value: `${item.ocupacao}%`, color: '#01C6BF' },
              metrics: [
                { label: 'Agendamentos', value: Kpis.formatNumber(item.quantidade) },
                { label: 'Disponíveis', value: Math.max(0, 24 - item.quantidade) },
              ],
            };
          }) },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { min: 0, max: 100, grid: { color: '#E3E7E8' }, ticks: { font: { size: 11 }, callback: (v) => `${v}%` } },
        },
      },
    });
  }

  function render(state) {
    if (state.radiologiaSelecionada === 'all') renderAllRadiologies();
    else renderInternalOccupancy(state);
  }

  function init() {
    render(AppState.getState());
    AppState.subscribe(render);
  }

  return { init, externalTooltipHandler };
})();


/* =================================================================
   8. APPOINTMENT MODAL
================================================================= */
const AppointmentModal = (() => {
  let overlay, closeBtn, statusBadge, statusSelect;
  let currentAppointment = null;

  function fill(agendamento) {
    currentAppointment = agendamento;
    const cfg = MockData.statusConfig[agendamento.status];

    document.getElementById('modalTime').textContent = `${agendamento.horarioInicio} – ${agendamento.horarioFim}`;
    statusBadge.textContent = cfg.label;
    statusBadge.className = `status-badge status-badge--${agendamento.status}`;
    statusSelect.value = agendamento.status;

    document.getElementById('modalPatientName').textContent = agendamento.paciente;
    document.getElementById('modalPatientPhone').textContent = agendamento.pacienteTelefone;
    document.getElementById('modalPatientAge').textContent = `${agendamento.pacienteIdade} anos`;

    document.getElementById('modalExamType').textContent = agendamento.tipoExame;
    document.getElementById('modalExamValue').textContent = Kpis.formatCurrency(agendamento.valor);
    document.getElementById('modalExamDuration').textContent = `${agendamento.duracaoMin} minutos`;

    document.getElementById('modalRadiologia').textContent = agendamento.radiologiaNome;
    document.getElementById('modalClinica').textContent = agendamento.clinica;
    document.getElementById('modalMedico').textContent = agendamento.medico;
    document.getElementById('modalObservations').textContent = agendamento.observacoes || 'Nenhuma observação registrada.';
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
    document.dispatchEvent(new CustomEvent('appointment:statusChanged', { detail: { agendamento } }));
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
    statusSelect.addEventListener('change', (e) => setStatus(e.target.value));
    document.getElementById('modalBtnConfirm').addEventListener('click', () => setStatus('confirmado'));
    document.getElementById('modalBtnDone').addEventListener('click', () => setStatus('realizado'));
    document.getElementById('modalBtnCancel').addEventListener('click', () => setStatus('cancelado'));
    document.getElementById('modalBtnReminder').addEventListener('click', () => {
      alert(`Lembrete enviado para ${currentAppointment.paciente} (${currentAppointment.pacienteTelefone}).`);
    });
    document.getElementById('modalBtnPrint').addEventListener('click', () => window.print());
    document.getElementById('modalBtnEdit').addEventListener('click', () => {
      alert('Edição de agendamento — em desenvolvimento.');
    });
  }

  function init() {
    overlay      = document.getElementById('appointmentModalOverlay');
    closeBtn     = document.getElementById('modalCloseBtn');
    statusBadge  = document.getElementById('modalStatusBadge');
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
          <span class="status-badge status-badge--${a.status}">${MockData.statusConfig[a.status].label}</span>
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
    overlay  = document.getElementById('dayListModalOverlay');
    closeBtn = document.getElementById('dayListModalCloseBtn');
    title    = document.getElementById('dayListModalTitle');
    body     = document.getElementById('dayListModalBody');
    bindEvents();
  }

  return { init, open, close };
})();


/* =================================================================
   10. CALENDAR VIEW (MODO AGENDA)
================================================================= */
const CalendarView = (() => {
  let gridEl, labelEl, prevBtn, nextBtn, todayBtn, granularityToggle;

  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  function agendamentosDoDia(state, isoDate) {
    const todos = MockData.getAgendamentos({ radiologiaId: state.radiologiaSelecionada });
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
    const iso      = MockData.toISODate(date);
    const ags      = agendamentosDoDia(state, iso);
    const isToday  = iso === MockData.toISODate(new Date());
    const ocupados = ags.filter((a) => a.status !== 'cancelado' && a.status !== 'faltou').length;
    const ocupacaoPct = Math.min(100, Math.round((ocupados / 12) * 100));

    const cell = document.createElement('div');
    cell.className = [
      'calendar-day',
      isOutsideMonth ? 'is-outside' : '',
      isToday ? 'is-today' : '',
      ags.length ? 'has-appointments' : '',
    ].filter(Boolean).join(' ');

    const topApts = [...ags].sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio)).slice(0, 2);

    cell.innerHTML = `
      <div class="calendar-day__head">
        <span class="calendar-day__number">${date.getDate()}</span>
        ${ags.length ? `<span class="calendar-day__count">${ags.length}</span>` : ''}
      </div>
      ${ags.length ? `<div class="calendar-day__occupancy-track"><div class="calendar-day__occupancy-fill" style="width:${ocupacaoPct}%"></div></div>` : ''}
      <div class="calendar-day__appointments">
        ${topApts.map((a) => `
          <span class="calendar-day__appt-pill">
            <span class="calendar-day__appt-pill-time">${a.horarioInicio}</span>
            <span class="calendar-day__appt-pill-name">${a.paciente.split(' ')[0]} · ${a.tipoExame}</span>
          </span>
        `).join('')}
        ${ags.length > 2 ? `<span class="calendar-day__more">+${ags.length - 2} mais</span>` : ''}
      </div>
    `;

    if (!isOutsideMonth) {
      cell.addEventListener('click', () => {
        const label = date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
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
    gridEl            = document.getElementById('calendarGrid');
    labelEl           = document.getElementById('calendarLabel');
    prevBtn           = document.getElementById('calPrevMonth');
    nextBtn           = document.getElementById('calNextMonth');
    todayBtn          = document.getElementById('calToday');
    granularityToggle = document.getElementById('calGranularityToggle');
    render(AppState.getState());
    bindEvents();
  }

  return { init, render };
})();


/* =================================================================
   11. KANBAN VIEW
================================================================= */
const KanbanView = (() => {
  let boardEl, searchInput;
  let draggedId = null;
  let autoScrollRAF = null;

  function agendamentosDoKanban(state) {
    const kanbanSearch = (searchInput?.value || '').trim().toLowerCase();
    const base = AgendaData.getFilteredNoPeriod(state);
    if (!kanbanSearch) return base;
    return base.filter((a) => `${a.paciente} ${a.tipoExame} ${a.medico}`.toLowerCase().includes(kanbanSearch));
  }

  function buildCard(agendamento) {
    const card = document.createElement('article');
    card.className = 'kanban-card';
    card.draggable = true;
    card.dataset.id = agendamento.id;
    card.dataset.status = agendamento.status;

    const dataLabel = new Date(`${agendamento.data}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    card.innerHTML = `
      <div class="kanban-card__top">
        <span class="kanban-card__time">${dataLabel} · ${agendamento.horarioInicio}</span>
        <span class="status-badge status-badge--${agendamento.status}">${MockData.statusConfig[agendamento.status].label}</span>
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

    // Clique abre modal (só se não estiver arrastando)
    card.addEventListener('click', (e) => {
      if (!draggedId) AppointmentModal.open(agendamento);
    });

    card.addEventListener('dragstart', (e) => {
      draggedId = agendamento.id;
      // Pequeno delay para aplicar a classe depois do browser capturar o ghost
      requestAnimationFrame(() => card.classList.add('is-dragging'));
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', agendamento.id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      // Reseta após o drop processar
      requestAnimationFrame(() => { draggedId = null; });
      stopAutoScroll();
      boardEl.querySelectorAll('.kanban-column__body').forEach((b) => b.classList.remove('is-drag-over'));
      boardEl.querySelectorAll('.kanban-column').forEach((c) => c.classList.remove('is-drop-target'));
    });

    return card;
  }

  function buildColumn(columnDef, agendamentosDaColuna) {
    const col = document.createElement('div');
    col.className = 'kanban-column';
    col.dataset.status = columnDef.id;

    col.innerHTML = `
      <div class="kanban-column__head">
        <span class="kanban-column__title"><span class="kanban-column__dot"></span>${columnDef.label}</span>
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
      // Limpa highlight das outras colunas
      boardEl.querySelectorAll('.kanban-column__body').forEach((b) => b.classList.remove('is-drag-over'));
      boardEl.querySelectorAll('.kanban-column').forEach((c) => c.classList.remove('is-drop-target'));
      bodyEl.classList.add('is-drag-over');
      colEl.classList.add('is-drop-target');
    });

    bodyEl.addEventListener('dragleave', (e) => {
      // Só remove se realmente saiu da coluna (não de um card filho)
      if (!colEl.contains(e.relatedTarget)) {
        bodyEl.classList.remove('is-drag-over');
        colEl.classList.remove('is-drop-target');
      }
    });

    bodyEl.addEventListener('drop', (e) => {
      e.preventDefault();
      bodyEl.classList.remove('is-drag-over');
      colEl.classList.remove('is-drop-target');
      const id = e.dataTransfer.getData('text/plain') || draggedId;
      if (!id) return;
      moveAppointment(id, statusId);
    });
  }

  function findAppointmentById(id) {
    return MockData.getAgendamentos({ radiologiaId: 'all' }).find((a) => a.id === id);
  }

  function moveAppointment(id, newStatus) {
    const agendamento = findAppointmentById(id);
    if (!agendamento || agendamento.status === newStatus) return;
    agendamento.status = newStatus;
    render(AppState.getState());
  }

  /** CORREÇÃO: removido o guard `if (state.agendaView !== 'kanban') return;` */
  function render(state) {
    const agendamentos = agendamentosDoKanban(state);
    boardEl.innerHTML = '';
    MockData.kanbanColumns.forEach((columnDef) => {
      const daColuna = agendamentos.filter((a) => MockData.statusConfig[a.status].kanbanColumn === columnDef.id);
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
      alert('Novo agendamento — em desenvolvimento. Este botão abrirá o formulário de criação.');
    });
  }

  function init() {
    boardEl     = document.getElementById('kanbanBoard');
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
    const iso = MockData.toISODate(state.dayDate);
    const todos = MockData.getAgendamentos({ radiologiaId: state.radiologiaSelecionada });
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
      .filter((a) => a.status !== 'cancelado' && a.status !== 'faltou')
      .reduce((s, a) => s + a.valor, 0);
    const ocupacaoPct = Math.min(100, Math.round((total / 24) * 100));

    summaryEl.innerHTML = `
      <div class="day-summary__card">
        <span class="day-summary__label">Total Agendado</span>
        <span class="day-summary__value">${Kpis.formatNumber(total)}</span>
        <span class="day-summary__sub">pacientes no dia</span>
      </div>
      <div class="day-summary__card">
        <span class="day-summary__label">Ocupação do Dia</span>
        <span class="day-summary__value">${ocupacaoPct}%</span>
        <span class="day-summary__sub">dos slots disponíveis</span>
      </div>
      <div class="day-summary__card">
        <span class="day-summary__label">Realizados</span>
        <span class="day-summary__value">${realizados}</span>
        <span class="day-summary__sub">de ${total} agendados</span>
      </div>
      <div class="day-summary__card">
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
      .map(([status, n]) => `<span class="status-badge status-badge--${status}">${n} ${MockData.statusConfig[status].label}</span>`)
      .join('');
  }

  function buildAppointmentRow(agendamento, state) {
    const row = document.createElement('div');
    row.className = 'timeline-appt';
    row.dataset.status = agendamento.status;

    const radiologiaMeta = state.radiologiaSelecionada === 'all' ? ` · ${agendamento.radiologiaNome}` : '';

    row.innerHTML = `
      <span class="timeline-appt__time">${agendamento.horarioInicio}–${agendamento.horarioFim}</span>
      <div class="timeline-appt__main">
        <span class="timeline-appt__patient">${agendamento.paciente}</span>
        <span class="timeline-appt__meta">${agendamento.tipoExame} · ${agendamento.medico}${radiologiaMeta}</span>
      </div>
      <div class="timeline-appt__aside">
        <span class="timeline-appt__value">${Kpis.formatCurrency(agendamento.valor)}</span>
        <span class="status-badge status-badge--${agendamento.status}">${MockData.statusConfig[agendamento.status].label}</span>
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
    const isHoje = MockData.toISODate(state.dayDate) === MockData.toISODate(new Date());

    HORAS.forEach((hora) => {
      const label = `${MockData.pad(hora)}:00`;
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
    timelineEl   = document.getElementById('dayTimeline');
    summaryEl    = document.getElementById('daySummary');
    labelEl      = document.getElementById('dayLabel');
    prevBtn      = document.getElementById('dayPrev');
    nextBtn      = document.getElementById('dayNext');
    todayBtn     = document.getElementById('dayToday');
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
    if (viewId === 'dia')    DayView.render(state);
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
    panels.dia    = document.getElementById('viewDia');

    // Estado inicial: agenda ativa (class já está no HTML, confirma aqui)
    showView('agenda');
    bindEvents();
  }

  return { init };
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
   15. INIT — bootstrap
================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  Filters.init();
  Kpis.init();
  OccupancyChart.init();
  AppointmentModal.init();
  DayListModal.init();
  CalendarView.init();
  KanbanView.init();
  DayView.init();
  ViewSwitcher.init();  // deve vir APÓS a init dos módulos de view
  Sidebar.init();
});