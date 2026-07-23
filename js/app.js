/**
 * =================================================================
 * IORD — Painel de Gestão | JavaScript único
 * -----------------------------------------------------------------
 * Módulos (IIFE independentes, ordem = ordem de dependência):
 *   1. MockData        — fonte de dados (simula API)
 *   2. AppState         — estado global + pub/sub
 *   3. Filters          — pills de radiologia + seletor de período
 *   4. Kpis             — cards de indicadores
 *   5. Charts           — gráfico de linha + gráfico de barras
 *   6. HierarchyTable   — tabela hierárquica (accordion 3 níveis)
 *   7. Commissions      — seção de comissões (cards + gráficos + tabela)
 *   8. Sidebar          — navegação lateral
 *   9. Init             — bootstrap
 * =================================================================
 */


/* =================================================================
   2. APP STATE
================================================================= */
const AppState = (() => {
  let state = {
    radiologiaSelecionada: 'all',
    clinicaSelecionada: 'all',
    periodo: 'mes_atual',
    customDateStart: null,
    customDateEnd: null,
    visualizacao: 'faturamento', // 'faturamento' | 'quantidade'
  };

  const listeners = [];

  function getState() { return { ...state }; }

  function update(partialState) {
    state = { ...state, ...partialState };
    listeners.forEach((listener) => listener(getState()));
  }

  function subscribe(listener) { listeners.push(listener); }

  return { getState, update, subscribe };
})();


/* =================================================================
   3. FILTERS
================================================================= */
const Filters = (() => {
  let pillsContainer, periodSelect, customRangeWrapper, customDateStart, customDateEnd;

  async function renderRadiologyPills() {
    pillsContainer.innerHTML = '';
    let lista = [];
    try {
      const res = await Api.getRadiologias();
      lista = res.data || [];
    } catch (e) {
      console.error('[Filters] Erro ao carregar radiologias:', e);
      // Fallback mínimo: só a pill "Todas"
      lista = [{ id: 'all', nome: 'Todas as Radiologias' }];
    }

    lista.forEach((rad) => {
      const isActive = rad.id === AppState.getState().radiologiaSelecionada;
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pill' + (isActive ? ' is-active' : '');
      pill.textContent = rad.nome;
      pill.setAttribute('role', 'tab');
      pill.setAttribute('aria-selected', String(isActive));
      pill.dataset.radiologyId = rad.id;
      pill.addEventListener('click', () => AppState.update({ radiologiaSelecionada: rad.id, clinicaSelecionada: 'all' }));
      pillsContainer.appendChild(pill);
    });
  }

  function syncActivePill(radiologiaSelecionada) {
    pillsContainer.querySelectorAll('.pill').forEach((pill) => {
      const isActive = pill.dataset.radiologyId === radiologiaSelecionada;
      pill.classList.toggle('is-active', isActive);
      pill.setAttribute('aria-selected', String(isActive));
    });
  }

  function toggleCustomRangeVisibility(periodo) {
    customRangeWrapper.hidden = periodo !== 'custom';
  }

  function bindEvents() {
    periodSelect.addEventListener('change', (e) => AppState.update({ periodo: e.target.value }));
    customDateStart.addEventListener('change', (e) => AppState.update({ customDateStart: e.target.value }));
    customDateEnd.addEventListener('change', (e) => AppState.update({ customDateEnd: e.target.value }));

    AppState.subscribe((state) => {
      syncActivePill(state.radiologiaSelecionada);
      toggleCustomRangeVisibility(state.periodo);
    });
  }

  function init() {
    pillsContainer = document.getElementById('radiologyFilters');
    periodSelect = document.getElementById('periodFilter');
    customRangeWrapper = document.getElementById('customRangeInputs');
    customDateStart = document.getElementById('customDateStart');
    customDateEnd = document.getElementById('customDateEnd');
    renderRadiologyPills();
    bindEvents();
  }

  return { init };
})();


/* =================================================================
   4. KPIS
================================================================= */
const Kpis = (() => {
  function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  function formatNumber(value) { return value.toLocaleString('pt-BR'); }

  function formatChange(value) {
    const isPositive = value >= 0;
    const arrow = isPositive ? '▲' : '▼';
    const sign = isPositive ? '+' : '';
    return { text: `${arrow} ${sign}${value.toFixed(1)}%`, isPositive };
  }

  function renderChangeEl(el, changeValue) {
    if (!el) return;
    const { text, isPositive } = formatChange(changeValue);
    el.textContent = text;
    el.classList.toggle('is-positive', isPositive);
    el.classList.toggle('is-negative', !isPositive);
  }

  function setKpisLoading() {
    ['kpiRevenue', 'kpiExams', 'kpiAvgPerClinic', 'kpiCashForecast', 'kpiTicketMedio'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const val = el.querySelector('[data-field="value"]');
      if (val) val.textContent = '...';
    });
  }

  async function render(state) {
    setKpisLoading();
    try {
      const filtros = Api.filtrosDoState(state);
      const res = await Api.getKPIs(filtros);
      const data = res.data;
      if (!data) return;

      const kpiRevenue = document.getElementById('kpiRevenue');
      if (kpiRevenue) {
        kpiRevenue.querySelector('[data-field="value"]').textContent = formatCurrency(data.faturamentoTotal);
        renderChangeEl(kpiRevenue.querySelector('[data-field="change"]'), data.faturamentoVariacao);
      }

      const kpiExams = document.getElementById('kpiExams');
      if (kpiExams) {
        kpiExams.querySelector('[data-field="value"]').textContent = formatNumber(data.totalExames);
        renderChangeEl(kpiExams.querySelector('[data-field="change"]'), data.examesVariacao);
      }

      const kpiAvg = document.getElementById('kpiAvgPerClinic');
      if (kpiAvg) {
        kpiAvg.querySelector('[data-field="value"]').textContent = formatCurrency(data.faturamentoMedioPorClinica);
        kpiAvg.querySelector('[data-field="context"]').textContent =
          `${data.clinicasAtivas} clínica${data.clinicasAtivas > 1 ? 's' : ''} referenciadora${data.clinicasAtivas > 1 ? 's' : ''} ativa${data.clinicasAtivas > 1 ? 's' : ''}`;
      }

      const kpiCash = document.getElementById('kpiCashForecast');
      if (kpiCash) {
        kpiCash.querySelector('[data-field="value"]').textContent = formatCurrency(data.previsibilidadeCaixa);
        kpiCash.querySelector('[data-field="context"]').textContent = `${data.examesAgendados} exames agendados`;
      }

      const kpiTicket = document.getElementById('kpiTicketMedio');
      if (kpiTicket) {
        kpiTicket.querySelector('[data-field="value"]').textContent = formatCurrency(data.ticketMedioExame);
        renderChangeEl(kpiTicket.querySelector('[data-field="change"]'), data.faturamentoVariacao);
      }
    } catch (e) {
      console.error('[Kpis] Erro ao carregar KPIs financeiros:', e);
      ['kpiRevenue', 'kpiExams', 'kpiAvgPerClinic', 'kpiCashForecast', 'kpiTicketMedio'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = el.querySelector('[data-field="value"]');
        if (val) val.textContent = '--';
      });
    }
  }

  function init() {
    render(AppState.getState());
    AppState.subscribe(render);
  }

  return { init, formatCurrency, formatNumber };
})();


/* =================================================================
   5. CHARTS (Evolução + Comparativo por entidade)
================================================================= */
const Charts = (() => {
  const SERIES_COLORS = ['#018093', '#01C6BF', '#5C6A6E', '#8FBFC7', '#B7C2C4'];

  let lineChartInstance = null;
  let barChartInstance = null;

  function formatCurrencyShort(value) {
    if (value >= 1000) return `R$ ${(value / 1000).toFixed(1).replace('.0', '')} mil`;
    return `R$ ${value}`;
  }
  function formatCurrencyFull(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  function formatNumberFull(value) {
    return Math.round(value).toLocaleString('pt-BR');
  }

  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.color = '#5C6A6E';
  Chart.defaults.borderColor = '#E3E7E8';

  /**
   * -----------------------------------------------------------
   * TOOLTIP PADRÃO (compartilhado por todos os gráficos)
   * -----------------------------------------------------------
   * Usa o "external tooltip" do Chart.js (renderizado em HTML,
   * não em canvas) para permitir hierarquia visual real:
   * eyebrow com data/período, valor principal em destaque,
   * métricas secundárias e um breakdown organizado com barras
   * de participação percentual — muito mais legível do que o
   * tooltip padrão baseado apenas em linhas de texto no canvas.
   */
  function getOrCreateTooltipEl(chart) {
    // Usa um id único por chart para evitar conflito entre múltiplos gráficos
    const tooltipId = 'chartjs-tooltip-' + chart.id;
    let tooltipEl = document.getElementById(tooltipId);
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = tooltipId;
      tooltipEl.className = 'chartjs-tooltip';
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  /**
   * Constrói o HTML interno do tooltip a partir de um "modelo" declarativo:
   * {
   *   eyebrow: 'Julho 2026',                 // data/período (pequeno, acima do título)
   *   headline: { label: 'Faturamento', value: 'R$ 78.500' }, // valor principal em destaque
   *   metrics: [{ label: 'Exames realizados', value: '748' }], // métricas secundárias
   *   breakdown: {
   *     title: 'Por radiologia',
   *     rows: [{ label: 'Radiologia Centro', value: 'R$ 78.500', percent: 42, color: '#018093' }]
   *   }
   * }
   */
  function renderTooltipHtml(model) {
    const parts = [];

    if (model.eyebrow) {
      parts.push(`<div class="cjs-tooltip__eyebrow">${model.eyebrow}</div>`);
    }

    if (model.headline) {
      parts.push(`
        <div class="cjs-tooltip__headline">
          ${model.headline.color ? `<span class="cjs-tooltip__dot" style="background:${model.headline.color}"></span>` : ''}
          <span class="cjs-tooltip__headline-label">${model.headline.label}</span>
          <span class="cjs-tooltip__headline-value">${model.headline.value}</span>
        </div>
      `);
    }

    if (model.metrics && model.metrics.length) {
      parts.push(`
        <div class="cjs-tooltip__metrics">
          ${model.metrics.map((m) => `
            <div class="cjs-tooltip__metric">
              <span class="cjs-tooltip__metric-label">${m.label}</span>
              <span class="cjs-tooltip__metric-value">${m.value}</span>
            </div>
          `).join('')}
        </div>
      `);
    }

    if (model.breakdown && model.breakdown.rows && model.breakdown.rows.length) {
      parts.push(`<div class="cjs-tooltip__divider"></div>`);
      if (model.breakdown.title) {
        parts.push(`<div class="cjs-tooltip__section-title">${model.breakdown.title}</div>`);
      }
      parts.push(`
        <div class="cjs-tooltip__breakdown">
          ${model.breakdown.rows.map((row) => `
            <div class="cjs-tooltip__row" style="${row.indent ? `padding-left:${row.indent * 12}px` : ''}">
              <div class="cjs-tooltip__row-top">
                <span class="cjs-tooltip__row-label">
                  ${row.color ? `<span class="cjs-tooltip__dot cjs-tooltip__dot--sm" style="background:${row.color}"></span>` : ''}
                  ${row.label}
                </span>
                ${row.value ? `<span class="cjs-tooltip__row-value">${row.value}</span>` : ''}
              </div>
              ${typeof row.percent === 'number' ? `
                <div class="cjs-tooltip__bar-track">
                  <div class="cjs-tooltip__bar-fill" style="width:${Math.min(100, Math.max(0, row.percent))}%; background:${row.color || '#018093'}"></div>
                </div>
                <div class="cjs-tooltip__row-percent">${row.percent.toFixed(1)}% do total</div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `);
    }

    return `<div class="cjs-tooltip__inner">${parts.join('')}</div>`;
  }

  /**
   * Handler genérico de external tooltip. `buildModel(context)` deve
   * retornar o objeto de modelo consumido por renderTooltipHtml, ou
   * `null` para esconder o tooltip.
   */
  function externalTooltipHandler(buildModel) {
    return (context) => {
      const { chart, tooltip } = context;
      const tooltipEl = getOrCreateTooltipEl(chart);

      if (tooltip.opacity === 0) {
        tooltipEl.style.opacity = 0;
        return;
      }

      if (tooltip.dataPoints && tooltip.dataPoints.length) {
        const model = buildModel(tooltip);
        if (!model) { tooltipEl.style.opacity = 0; return; }
        tooltipEl.innerHTML = renderTooltipHtml(model);
      }

      const canvasRect = chart.canvas.getBoundingClientRect();
      const tooltipWidth = tooltipEl.offsetWidth || 260;
      const tooltipHeight = tooltipEl.offsetHeight || 160;
      const OFFSET = 14;
      const MARGIN = 8;

      // Posição bruta: à direita do caret
      let left = canvasRect.left + tooltip.caretX + OFFSET;
      let top = canvasRect.top + tooltip.caretY - tooltipHeight / 2;

      // Vaza pela direita? → vai para a esquerda do caret
      if (left + tooltipWidth + MARGIN > window.innerWidth) {
        left = canvasRect.left + tooltip.caretX - tooltipWidth - OFFSET;
      }
      // Vaza pelo topo?
      if (top < MARGIN) {
        top = MARGIN;
      }
      // Vaza pelo rodapé?
      if (top + tooltipHeight + MARGIN > window.innerHeight) {
        top = window.innerHeight - tooltipHeight - MARGIN;
      }
      // Garante que nunca saia pela esquerda
      if (left < MARGIN) {
        left = MARGIN;
      }

      tooltipEl.style.opacity = 1;
      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top = top + 'px';
    };
  }

  /**
   * Constrói os datasets do gráfico de linha (Evolução de Faturamento/Exames).
   *
   * - "Todas as Radiologias": uma linha por radiologia, cada uma com cor
   *   própria e destaque igual entre si (visão comparativa).
   * - Radiologia específica selecionada: TODAS as outras radiologias somem;
   *   fica só a linha principal daquela radiologia, em destaque (mais grossa,
   *   com preenchimento sutil), acompanhada — quando fizer sentido — de linhas
   *   secundárias tracejadas e discretas das clínicas daquela radiologia.
   */
  async function buildLineDatasets(state) {
    const { radiologiaSelecionada, visualizacao } = state;
    const filtros = Api.filtrosDoState(state);

    let labels, series;

    if (visualizacao === 'faturamento') {
      const res = await Api.getFaturamentoEvolucao(filtros);
      labels = res.data.labels;
      series = res.data.series;
    } else {
      const res = await Api.getExamesEvolucao(filtros);
      labels = res.data.labels;
      series = res.data.series;
    }

    const datasets = series.map((s, i) => {
      const cor = SERIES_COLORS[i % SERIES_COLORS.length];
      const isPrimary = radiologiaSelecionada === 'all' || s.radiologiaId === radiologiaSelecionada;
      return {
        label: s.nome,
        data: s.dados,
        borderColor: cor,
        backgroundColor: cor + (isPrimary ? '26' : '1F'),
        borderWidth: isPrimary ? 3.25 : 1.5,
        borderDash: isPrimary ? [] : [5, 4],
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: isPrimary ? 6 : 4,
        pointHoverBackgroundColor: cor,
        pointHoverBorderColor: '#FFFFFF',
        pointHoverBorderWidth: isPrimary ? 2 : 1.5,
        fill: isPrimary && radiologiaSelecionada !== 'all',
        order: isPrimary ? 0 : 1,
        _isPrimary: isPrimary,
        _radId: s.radiologiaId,
      };
    });

    return { labels, datasets };
  }

  function lineTooltipModel(state, tooltip) {
    const dataPoints = tooltip.dataPoints;
    const periodo = tooltip.title && tooltip.title[0];
    const unidade = state.visualizacao === 'faturamento' ? 'faturamento' : 'exames realizados';
    const isAll = state.radiologiaSelecionada === 'all';

    let headline, breakdown;

    if (isAll) {
      // "Todas as Radiologias": o valor principal é a SOMA de todas as
      // radiologias no ponto (não o valor de uma única linha).
      const total = dataPoints.reduce((s, dp) => s + dp.parsed.y, 0);

      headline = {
        label: state.visualizacao === 'faturamento' ? 'Faturamento total' : 'Exames realizados (total)',
        value: state.visualizacao === 'faturamento' ? formatCurrencyFull(total) : `${formatNumberFull(total)} exames`,
        color: '#5C6A6E',
      };

      const rows = [...dataPoints]
        .sort((a, b) => b.parsed.y - a.parsed.y)
        .map((dp) => ({
          label: dp.dataset.label,
          value: state.visualizacao === 'faturamento' ? formatCurrencyFull(dp.parsed.y) : `${formatNumberFull(dp.parsed.y)} exames`,
          percent: total ? (dp.parsed.y / total) * 100 : 0,
          color: dp.dataset.borderColor,
        }));
      breakdown = { title: 'Radiologia → participação no total', rows };
    } else {
      // Radiologia específica: o valor principal é o da linha PRINCIPAL
      // (a radiologia selecionada), nunca de uma clínica secundária.
      const principal = dataPoints.find((dp) => dp.dataset._isPrimary) || dataPoints[0];
      const valorPrincipal = principal.parsed.y;

      headline = {
        label: state.visualizacao === 'faturamento' ? 'Faturamento' : 'Exames realizados',
        value: state.visualizacao === 'faturamento' ? formatCurrencyFull(valorPrincipal) : `${formatNumberFull(valorPrincipal)} exames`,
        color: principal.dataset.borderColor,
      };

      // Breakdown com as clínicas (linhas secundárias), se houver mais de uma série no hover.
      const secundarias = dataPoints.filter((dp) => !dp.dataset._isPrimary);
      if (secundarias.length) {
        const totalClinicas = secundarias.reduce((s, dp) => s + dp.parsed.y, 0) || 1;
        const rows = [...secundarias]
          .sort((a, b) => b.parsed.y - a.parsed.y)
          .map((dp) => ({
            label: dp.dataset.label,
            value: state.visualizacao === 'faturamento' ? formatCurrencyFull(dp.parsed.y) : `${formatNumberFull(dp.parsed.y)} exames`,
            percent: (dp.parsed.y / totalClinicas) * 100,
            color: dp.dataset.borderColor,
          }));
        breakdown = { title: 'Clínicas referenciadoras', rows };
      } else {
        breakdown = null;
      }
    }

    return {
      eyebrow: `${periodo} · ${unidade}`,
      headline,
      breakdown,
    };
  }

  async function renderLineChart(state) {
    const ctx = document.getElementById('evolutionChart');
    const { labels, datasets } = await buildLineDatasets(state);

    if (lineChartInstance) lineChartInstance.destroy();

    lineChartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle',
              padding: 18, font: { size: 11.5, weight: '500' },
            },
          },
          tooltip: {
            enabled: false,
            position: 'nearest',
            external: externalTooltipHandler((tooltip) => lineTooltipModel(state, tooltip)),
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            grid: { color: '#E3E7E8' },
            ticks: { font: { size: 11 }, callback: (value) => state.visualizacao === 'faturamento' ? formatCurrencyShort(value) : value },
          },
        },
      },
    });
  }

  async function buildBarData(state) {
    const filtros = Api.filtrosDoState(state);

    let res;
    if (state.visualizacao === 'faturamento') {
      res = await Api.getFaturamentoPorEntidade(filtros);
    } else {
      res = await Api.getExamesPorEntidade(filtros);
    }

    const itens = res.data.itens;
    const agrupamento = res.data.agrupamento;

    const labels = itens.map((i) => i.nome);
    const values = itens.map((i) => state.visualizacao === 'faturamento' ? i.faturamento : i.exames);
    const meta = itens.map((i) => ({
      tipo: agrupamento,
      clinicas: i.breakdown || [],
      medicos: i.breakdown || [],
    }));

    return { labels, values, meta };
  }

  function barTooltipModel(state, meta, tooltip) {
    const item = tooltip.dataPoints[0];
    const valor = item.parsed.y;
    const info = meta[item.dataIndex];

    const headline = {
      label: state.visualizacao === 'faturamento' ? 'Faturamento' : 'Exames realizados',
      value: state.visualizacao === 'faturamento' ? formatCurrencyFull(valor) : `${formatNumberFull(valor)} exames`,
      color: SERIES_COLORS[0],
    };

    let breakdown = null;
    if (info && info.tipo === 'radiologia' && info.clinicas.length) {
      const totalClinicas = info.clinicas.reduce((s, c) => s + (state.visualizacao === 'faturamento' ? c.faturamento : c.exames), 0) || 1;
      const rows = [...info.clinicas]
        .sort((a, b) => b.faturamento - a.faturamento)
        .map((c, i) => {
          const v = state.visualizacao === 'faturamento' ? c.faturamento : c.exames;
          return {
            label: c.nome,
            value: state.visualizacao === 'faturamento' ? formatCurrencyFull(v) : `${formatNumberFull(v)} exames`,
            percent: (v / totalClinicas) * 100,
            color: SERIES_COLORS[(i + 1) % SERIES_COLORS.length],
          };
        });
      breakdown = { title: 'Clínicas referenciadoras', rows };
    } else if (info && info.tipo === 'clinica' && info.medicos.length) {
      const total = info.medicos.reduce(
        (s, m) =>
          s +
          (state.visualizacao === 'faturamento'
            ? m.faturamento
            : m.exames),
        0
      );

      breakdown = {
        title: 'Médicos referenciadores',
        rows: info.medicos
          .sort((a, b) =>
            state.visualizacao === 'faturamento'
              ? b.faturamento - a.faturamento
              : b.exames - a.exames
          )
          .map((m, i) => {

            const valor =
              state.visualizacao === 'faturamento'
                ? m.faturamento
                : m.exames;

            return {
              label: m.nome,
              value:
                state.visualizacao === 'faturamento'
                  ? formatCurrencyFull(valor)
                  : `${formatNumberFull(valor)} exames`,
              percent: total ? (valor / total) * 100 : 0,
              color: SERIES_COLORS[(i + 1) % SERIES_COLORS.length],
            };
          }),
      };
    }

    return {
      eyebrow: item.label,
      headline,
      breakdown,
    };
  }

  async function renderBarChart(state) {
    const ctx = document.getElementById('entityChart');
    const { labels, values, meta } = await buildBarData(state);

    if (barChartInstance) barChartInstance.destroy();

    barChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels, datasets: [{
          label: state.visualizacao === 'faturamento' ? 'Faturamento' : 'Exames',
          data: values,
          backgroundColor: SERIES_COLORS[0],
          hoverBackgroundColor: SERIES_COLORS[1],
          borderRadius: 4,
          maxBarThickness: 42,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            position: 'nearest',
            external: externalTooltipHandler((tooltip) => barTooltipModel(state, meta, tooltip)),
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, autoSkip: false, maxRotation: 18, minRotation: 0 } },
          y: { grid: { color: '#E3E7E8' }, ticks: { font: { size: 11 }, callback: (value) => state.visualizacao === 'faturamento' ? formatCurrencyShort(value) : value } },
        },
      },
    });
  }

  function updateChartHeadings(state) {
    // Pega o nome real a partir da pill ativa no DOM (evita depender do estado isolado)
    const pillAtiva = document.querySelector('#radiologyFilters .pill.is-active');
    const nomeRadiologia = pillAtiva ? pillAtiva.textContent.trim() : (state.radiologiaSelecionada === 'all' ? 'Todas as Radiologias' : state.radiologiaSelecionada);
    const labelPeriodo = { mes_atual: 'mês atual', ultimos_30: 'últimos 30 dias', trimestre: 'trimestre', semestre: 'semestre', ano: 'ano', custom: 'período personalizado' }[state.periodo] || 'período selecionado';
    const isAll = state.radiologiaSelecionada === 'all';

    const lineTitle = document.getElementById('lineChartTitle');
    const lineSub = document.getElementById('lineChartSubtitle');
    const barTitle = document.getElementById('barChartTitle');
    const barSub = document.getElementById('barChartSubtitle');

    if (lineTitle) lineTitle.textContent = state.visualizacao === 'faturamento' ? 'Evolução de Faturamento' : 'Evolução de Exames Realizados';
    if (lineSub) lineSub.textContent = isAll
      ? `Comparativo entre as radiologias — ${labelPeriodo}`
      : `${nomeRadiologia} — ${labelPeriodo}`;

    if (barTitle) barTitle.textContent = isAll
      ? (state.visualizacao === 'faturamento' ? 'Faturamento por Radiologia' : 'Exames por Radiologia')
      : (state.visualizacao === 'faturamento' ? 'Faturamento por Clínica Referenciadora' : 'Exames por Clínica Referenciadora');
    if (barSub) barSub.textContent = isAll
      ? `Comparativo entre unidades — ${labelPeriodo}`
      : `Comparativo dentro de ${nomeRadiologia} — ${labelPeriodo}`;
  }

  function bindViewToggle() {
    const buttons = document.querySelectorAll('.view-toggle__btn');
    const toggle = document.querySelector('.view-toggle');

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;

        buttons.forEach((b) => {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-selected', String(b === btn));
        });

        // Move o slider para o botão clicado
        const index = [...buttons].indexOf(btn);
        toggle.classList.toggle('is-right', index === 1);

        AppState.update({ visualizacao: view });
      });
    });
  }

  async function renderAll(state) {
    updateChartHeadings(state);
    try {
      await renderLineChart(state);
    } catch (e) {
      console.error('[Charts] Erro ao renderizar gráfico de linha:', e);
    }
    try {
      await renderBarChart(state);
    } catch (e) {
      console.error('[Charts] Erro ao renderizar gráfico de barras:', e);
    }
  }

  function init() {
    bindViewToggle();
    renderAll(AppState.getState());
    AppState.subscribe(renderAll);
  }

  return { init, externalTooltipHandler, formatCurrencyFull, formatNumberFull, SERIES_COLORS };
})();

/* =================================================================
   7. EXAM ANALYSIS — Análise de Exames
   KPIs rápidos + pizza por tipo + ranking clínicas/médicos
   + destaque por médicos (minicards) + destaques do período.
   Responde ao filtro global de radiologia.
================================================================= */
const ExamAnalysis = (() => {

  /* ---------------------------------------------------------------
     DADOS: tipos de exame por radiologia
  --------------------------------------------------------------- */

  /*
   * Distribuição simulada de tipos de exame por médico.
   * Array ordenado por relevância — os 2 primeiros viram tags no minicard.
   * Numa API real, viria do breakdown de laudos por CRM.
   */


  const TYPE_COLORS = ['#018093', '#01C6BF', '#046B85', '#8FBFC7', '#B7C2C4'];

  let pieChart = null;

  /* ---------------------------------------------------------------
     HELPERS
  --------------------------------------------------------------- */
  function formatNumber(v) { return Math.round(v).toLocaleString('pt-BR'); }
  function formatCurrency(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  /** Iniciais do nome para o avatar (ex: "Dra. Beatriz Nunes" → "BN") */
  function getInitials(nome) {
    const parts = nome.replace(/^(Dr\.|Dra\.)\s*/i, '').trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }


  async function renderDoctorClinicFilter(state) {
    const select = document.getElementById('doctorClinicFilter');
    if (!select) return;
    const filtros = Api.filtrosDoState(state);
    const res = await Api.getClinicasDisponiveisPorMedico(filtros);
    const clinicas = res.data;

    select.innerHTML = '';
    clinicas.forEach(c => {
      const option = document.createElement('option');
      option.value = c.clinicaId;
      option.textContent = c.clinicaNome;
      select.appendChild(option);
    });

    select.value = state.clinicaSelecionada || 'all';
  }
  /* ---------------------------------------------------------------
     RENDER: KPIs
  --------------------------------------------------------------- */
  async function renderKPIs(state) {
    const filtros = Api.filtrosDoState(state);
    const res = await Api.getExamesKPIs(filtros);
    const data = res.data;
    if (!data) return;

    const labelPer = { mes_atual: 'mês atual', ultimos_30: 'últimos 30 dias', trimestre: 'trimestre', semestre: 'semestre', ano: 'ano', custom: 'período personalizado' }[state.periodo] || 'período selecionado';
    const nomeRad = state.radiologiaSelecionada === 'all' ? 'Todas as Radiologias' : state.radiologiaSelecionada;

    const subtitleEl = document.getElementById('examsSectionSubtitle');
    if (subtitleEl) subtitleEl.textContent = `${nomeRad} — ${labelPer}`;

    const kpiTotal = document.getElementById('examKpiTotal');
    if (kpiTotal) {
      kpiTotal.querySelector('[data-field="value"]').textContent = formatNumber(data.totalExames);
      const changeEl = kpiTotal.querySelector('[data-field="change"]');
      const isPos = data.variacaoExames >= 0;
      changeEl.textContent = `${isPos ? '▲' : '▼'} ${isPos ? '+' : ''}${data.variacaoExames.toFixed(1)}%`;
      changeEl.className = `kpi-card__change ${isPos ? 'is-positive' : 'is-negative'}`;
    }

    const kpiAvg = document.getElementById('examKpiAvgDay');
    if (kpiAvg) kpiAvg.querySelector('[data-field="value"]').textContent = data.mediaPorDiaUtil.toFixed(1).replace('.', ',');

    const kpiTop = document.getElementById('examKpiTopType');
    if (kpiTop) {
      kpiTop.querySelector('[data-field="value"]').textContent = data.tipoMaisRealizado || '--';
      kpiTop.querySelector('[data-field="context"]').textContent = `${formatNumber(data.tipoMaisRealizadoQtd)} exames no período`;
    }

    const kpiRef = document.getElementById('examKpiReferenced');
    if (kpiRef) kpiRef.querySelector('[data-field="value"]').textContent = `${data.percentualReferenciados.toFixed(1).replace('.', ',')}%`;
  }

  /* ---------------------------------------------------------------
     RENDER: Gráfico de Pizza
  --------------------------------------------------------------- */
  async function renderPieChart(state) {
    const ctx = document.getElementById('examTypeChart');
    if (!ctx) return;
    const filtros = Api.filtrosDoState(state);
    const res = await Api.getExamesDistribuicaoPorTipo(filtros);
    const tipos = res.data.tipos;
    const labels = tipos.map(t => t.tipo);
    const values = tipos.map(t => t.quantidade);
    const total = values.reduce((s, v) => s + v, 0);
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    pieChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: TYPE_COLORS, borderColor: '#FFFFFF', borderWidth: 3, hoverOffset: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle',
              padding: 14, font: { size: 11.5, weight: '500' },
              generateLabels(chart) {
                return chart.data.labels.map((label, i) => {
                  const value = chart.data.datasets[0].data[i];
                  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                  return {
                    text: `${label} (${pct}%)`,
                    fillStyle: chart.data.datasets[0].backgroundColor[i],
                    strokeStyle: '#FFFFFF', lineWidth: 2, hidden: false, index: i, pointStyle: 'circle',
                  };
                });
              },
            },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const value = ctx.parsed;
                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                return ` ${formatNumber(value)} exames (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  /* ---------------------------------------------------------------
   RENDER: Exames Solicitados por Médico (Accordion)
  --------------------------------------------------------------- */
  async function renderDoctorsSpotlight(state) {

    const grid = document.getElementById('examsDoctorsGrid');
    const subtitle = document.getElementById('examsDoctorsSpotlightSubtitle');

    if (!grid) return;

    const radId = state.radiologiaSelecionada;
    const isAll = radId === 'all';

    const filtros = Api.filtrosDoState(state);
    if (state.clinicaSelecionada && state.clinicaSelecionada !== 'all') {
      filtros.clinicaId = state.clinicaSelecionada;
    }

    const res = await Api.getMedicosSpotlight(filtros);
    const doctors = res.data;

    if (subtitle) {
      subtitle.textContent = isAll
        ? 'Exames solicitados por médicos de todas as radiologias'
        : `Exames solicitados por médicos • ${radId}`;
    }

    grid.innerHTML = '';

    doctors.forEach(doc => {

      const initials = getInitials(doc.medicoNome);
      const exams = (doc.tiposDeExame && doc.tiposDeExame.length > 0)
        ? [...doc.tiposDeExame]
        : [{ tipo: 'Sem dados', exames: 0 }];

      // Ordena do maior para o menor
      exams.sort((a, b) => b.exames - a.exames);

      const principal = exams[0];

      const maiorQuantidade = Math.max(
        ...exams.map(e => e.exames),
        1
      );

      const examRows = exams.map(exam => {

        const pct = (exam.exames / maiorQuantidade) * 100;

        return `
          <div class="doctor-exam-item">

            <span class="doctor-exam-name">
              ${exam.tipo}
            </span>

            <span class="doctor-exam-value">
              ${formatNumber(exam.exames)}
            </span>

            <div class="doctor-exam-progress">
              <span style="width:${pct}%"></span>
            </div>

          </div>
        `;

      }).join('');

      const card = document.createElement('div');

      card.className = 'doctor-spotlight-card';

      card.innerHTML = `

        <div class="doctor-spotlight-card__avatar">
          ${initials}
        </div>

        <div class="doctor-spotlight-card__info">

          <span
            class="doctor-spotlight-card__name"
            title="${doc.medicoNome}">
            ${doc.medicoNome}
          </span>

          <span
            class="doctor-spotlight-card__clinic"
            title="${doc.clinicaNome}">
            ${doc.clinicaNome}${isAll ? ` · ${doc.radiologiaNome}` : ''}
          </span>

          <span class="doctor-spotlight-card__main-exam">
            Principal exame:
            <strong>${principal.tipo}</strong>
            • ${formatNumber(principal.exames)} exames
          </span>

        </div>

        <div class="doctor-spotlight-card__toggle">

          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none">

            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"/>

          </svg>

        </div>

        <div class="doctor-spotlight-card__details">

          <div class="doctor-exam-list">

            ${examRows}

          </div>

          <div class="doctor-spotlight-footer">

            <span class="doctor-spotlight-footer__label">
              Faturamento total do período
            </span>

            <span class="doctor-spotlight-footer__value">
              ${formatCurrency(doc.faturamento)}
            </span>

          </div>

        </div>

      `;

      grid.appendChild(card);

    });

    // Accordion
    grid.querySelectorAll('.doctor-spotlight-card').forEach(card => {

      card.addEventListener('click', () => {
        grid.querySelectorAll('.doctor-spotlight-card').forEach(c => {
          if (c !== card) {
            c.classList.remove('is-open');
          }
        });
        card.classList.toggle('is-open');
      });

    });

  }

  /* ---------------------------------------------------------------
     RENDER: Listas de Ranking (Clínicas + Médicos) — inalterado
  --------------------------------------------------------------- */
  function buildRankItem(nome, sub, exames, totalExames, color) {
    const pct = totalExames > 0 ? (exames / totalExames) * 100 : 0;
    const li = document.createElement('li');
    li.className = 'exams-rank-item';
    li.innerHTML = `
      <div class="exams-rank-item__header">
        <span class="exams-rank-item__name" title="${nome}">${nome}</span>
        <span class="exams-rank-item__count">${formatNumber(exames)} exames</span>
      </div>
      ${sub ? `<span class="exams-rank-item__sub" title="${sub}">${sub}</span>` : ''}
      <div class="exams-rank-item__bar-track">
        <div class="exams-rank-item__bar-fill" style="width:${pct.toFixed(1)}%; background:${color}"></div>
      </div>
    `;
    return li;
  }

  async function renderRankLists(state) {
    const radId = state.radiologiaSelecionada;
    const isAll = radId === 'all';
    const filtros = Api.filtrosDoState(state);

    const resClinicas = await Api.getRankingClinicasPorExames(filtros);
    const resMedicos = await Api.getRankingMedicosPorExames(filtros);
    const clinics = resClinicas.data;
    const doctors = resMedicos.data;

    const totalClinicas = clinics.reduce((s, c) => s + c.totalExames, 0);
    const totalMedicos = doctors.reduce((s, d) => s + d.totalExames, 0);

    const subEl = document.getElementById('examsListsSubtitle');
    if (subEl) subEl.textContent = isAll ? 'Top clínicas e médicos — todas as radiologias' : `Top clínicas e médicos — ${radId}`;

    const clinicsColTitle = document.querySelector('#examsClinicsCol .exams-rank-col__title');
    if (clinicsColTitle) {
      clinicsColTitle.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
        ${isAll ? 'Clínicas com Maior Volume' : 'Clínicas desta Radiologia'}
      `;
    }

    const clinicsList = document.getElementById('examsClinicsRankList');
    if (clinicsList) {
      clinicsList.innerHTML = '';
      clinics.forEach((c, i) => clinicsList.appendChild(buildRankItem(c.clinicaNome, isAll ? c.radiologiaNome : null, c.totalExames, totalClinicas, TYPE_COLORS[i % TYPE_COLORS.length])));
    }

    const doctorsList = document.getElementById('examsDoctorsRankList');
    if (doctorsList) {
      doctorsList.innerHTML = '';
      doctors.forEach((d, i) => doctorsList.appendChild(buildRankItem(d.medicoNome, isAll ? `${d.clinicaNome} · ${d.radiologiaNome}` : d.clinicaNome, d.totalExames, totalMedicos, TYPE_COLORS[i % TYPE_COLORS.length])));
    }
  }

  /* ---------------------------------------------------------------
     RENDER: Destaques do Período — inalterado
  --------------------------------------------------------------- */
  function buildHighlightBox(eyebrow, value, hint) {
    const div = document.createElement('div');
    div.className = 'exams-highlight-box';
    div.innerHTML = `
      <span class="exams-highlight-box__eyebrow">${eyebrow}</span>
      <span class="exams-highlight-box__value">${value}</span>
      <span class="exams-highlight-box__hint">${hint}</span>
    `;
    return div;
  }

  async function renderHighlights(state) {
    const grid = document.getElementById('examsHighlightsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtros = Api.filtrosDoState(state);
    const res = await Api.getExamesDestaques(filtros);
    const data = res.data;

    const isAll = state.radiologiaSelecionada === 'all';

    grid.appendChild(buildHighlightBox(
      isAll ? 'Médico destaque' : 'Maior volume',
      data.medicoDestaque ? data.medicoDestaque.nome : '--',
      data.medicoDestaque ? `${formatNumber(data.medicoDestaque.totalExames)} exames${isAll ? ` · ${data.medicoDestaque.clinicaNome}` : ''}` : 'Sem dados'
    ));

    grid.appendChild(buildHighlightBox(
      'Clínica líder',
      data.clinicaLider ? data.clinicaLider.nome : '--',
      data.clinicaLider ? `${formatNumber(data.clinicaLider.totalExames)} exames no período` : 'Sem dados'
    ));

    grid.appendChild(buildHighlightBox(
      'Tipo em destaque',
      data.tipoEmDestaque ? data.tipoEmDestaque.tipo : '--',
      data.tipoEmDestaque ? `${formatNumber(data.tipoEmDestaque.quantidade)} exames · ${data.tipoEmDestaque.percentualDoLider}% do líder` : 'Sem dados'
    ));

    const variacaoGeral = data.variacaoGeral || 0;
    grid.appendChild(buildHighlightBox(
      'Crescimento no período',
      `${variacaoGeral >= 0 ? '+' : ''}${variacaoGeral.toFixed(1)}% exames`,
      'vs. período anterior'
    ));
  }

  /* ---------------------------------------------------------------
     RENDER GERAL
  --------------------------------------------------------------- */
  async function render(state) {
    const steps = [
      ['KPIs de exames', () => renderKPIs(state)],
      ['Pizza por tipo', () => renderPieChart(state)],
      ['Filtro de clínica', () => renderDoctorClinicFilter(state)],
      ['Spotlight médicos', () => renderDoctorsSpotlight(state)],
      ['Rankings clín./méd.', () => renderRankLists(state)],
      ['Destaques do período', () => renderHighlights(state)],
    ];
    for (const [label, fn] of steps) {
      try {
        await fn();
      } catch (e) {
        console.error(`[ExamAnalysis] Erro em "${label}":`, e);
      }
    }
  }

  function init() {
    render(AppState.getState());
    AppState.subscribe(render);
    const doctorClinicFilter = document.getElementById('doctorClinicFilter');
    if (doctorClinicFilter) {
      doctorClinicFilter.addEventListener('change', (e) => {
        AppState.update({ clinicaSelecionada: e.target.value });
      });
    }
  }

  return { init };
})();

/* =================================================================
   8. SIDEBAR
================================================================= */
const Sidebar = (() => {
  let navLinks;

  function setActiveLink(clickedLink) {
    navLinks.forEach((link) => link.classList.toggle('is-active', link === clickedLink));
  }

  function bindEvents() {
    navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        const isRealLink = href && href !== '#';

        if (!isRealLink) e.preventDefault(); // só bloqueia links sem destino real

        if (link.classList.contains('is-active')) return;
        setActiveLink(link);
      });
    });
  }

  function init() {
    navLinks = document.querySelectorAll('.nav-link');
    bindEvents();
  }

  return { init };
})();

/* =================================================================
   8b. MOBILE NAV — Sidebar hambúrguer
================================================================= */
const MobileNav = (() => {
  function init() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!toggle || !sidebar || !overlay) return;

    function open() {
      sidebar.classList.add('is-open');
      overlay.classList.add('is-visible');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      sidebar.classList.remove('is-open');
      overlay.classList.remove('is-visible');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    toggle.addEventListener('click', () => {
      sidebar.classList.contains('is-open') ? close() : open();
    });
    overlay.addEventListener('click', close);

    // Fecha ao clicar num link (UX: navega e fecha o drawer)
    sidebar.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 1024) close();
      });
    });

    // Fecha ao redimensionar para desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024) close();
    });
  }
  return { init };
})();

/* =================================================================
   9. INIT (bootstrap da aplicação)
================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  Filters.init();
  Kpis.init();
  Charts.init();
  ExamAnalysis.init();
  MobileNav.init();
  Sidebar.init();

  // ----------------------------------------------------------------
  // AUTO-REFRESH: re-dispara o estado atual quando o usuário volta
  // ao dashboard (botão Voltar do navegador ou troca de aba).
  // Garante que dados criados em Agendamentos/Pacientes apareçam
  // sem precisar de F5 manual.
  // ----------------------------------------------------------------
  function refreshDashboard() {
    // Força um "notify" no state atual sem alterar nada
    AppState.update({});
  }

  // Quando a aba volta ao foco (troca de aba no navegador)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshDashboard();
    }
  });

  // Quando o usuário volta via botão "Voltar" do browser (bfcache)
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      refreshDashboard();
    }
  });
});