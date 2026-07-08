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
   1. MOCK DATA
   -----------------------------------------------------------------
   Estrutura de negócio:
     Radiologia (unidade própria do Dr. Iago)
       └── Clínicas Referenciadoras
             └── Médicos Referenciadores
   Cada médico carrega exames/faturamento/comissão/pendente —
   os totais de clínica e radiologia são somados a partir deles,
   garantindo consistência entre a tabela hierárquica, os KPIs
   e a seção de comissões.
================================================================= */
const MockData = (() => {

  const TAXA_COMISSAO = 0.15; // 15% do faturamento — usado para simular comissão devida

  /** Lista de radiologias próprias (as 4 unidades) */
  const radiologias = [
    { id: 'all', nome: 'Todas as Radiologias' },
    { id: 'rad_centro', nome: 'Radiologia Centro' },
    { id: 'rad_norte', nome: 'Radiologia Zona Norte' },
    { id: 'rad_sul', nome: 'Radiologia Zona Sul' },
    { id: 'rad_leste', nome: 'Radiologia Zona Leste' },
  ];

  /**
   * Estrutura hierárquica completa: radiologia -> clínicas -> médicos.
   * `pendentePercent` simula a fração da comissão ainda não paga.
   */
  const hierarchy = {
    rad_centro: {
      nome: 'Radiologia Centro',
      clinicas: [
        {
          id: 'cl_1', nome: 'Clínica OdontoVida',
          medicos: [
            { id: 'md_1', nome: 'Dra. Beatriz Nunes', exames: 182, faturamento: 28400, pendentePercent: 0.10 },
            { id: 'md_2', nome: 'Dr. Rafael Costa', exames: 130, faturamento: 19800, pendentePercent: 0.35 },
          ],
        },
        {
          id: 'cl_2', nome: 'Sorriso & Cia',
          medicos: [
            { id: 'md_3', nome: 'Dr. Marcelo Alves', exames: 201, faturamento: 31500, pendentePercent: 0.0 },
          ],
        },
        {
          id: 'cl_3', nome: 'Clínica Dental Plus',
          medicos: [
            { id: 'md_4', nome: 'Dra. Camila Rocha', exames: 158, faturamento: 22800, pendentePercent: 0.55 },
          ],
        },
      ],
    },
    rad_norte: {
      nome: 'Radiologia Zona Norte',
      clinicas: [
        {
          id: 'cl_4', nome: 'Clínica Bem Estar Odonto',
          medicos: [
            { id: 'md_5', nome: 'Dr. Henrique Lima', exames: 260, faturamento: 39100, pendentePercent: 0.20 },
          ],
        },
        {
          id: 'cl_5', nome: 'Odonto Norte',
          medicos: [
            { id: 'md_6', nome: 'Dra. Patrícia Souza', exames: 112, faturamento: 16200, pendentePercent: 0.0 },
            { id: 'md_7', nome: 'Dr. Diego Farias', exames: 77, faturamento: 11400, pendentePercent: 0.42 },
          ],
        },
      ],
    },
    rad_sul: {
      nome: 'Radiologia Zona Sul',
      clinicas: [
        {
          id: 'cl_6', nome: 'Clínica Dental Sul',
          medicos: [
            { id: 'md_8', nome: 'Dra. Larissa Prado', exames: 224, faturamento: 33400, pendentePercent: 0.08 },
          ],
        },
        {
          id: 'cl_7', nome: 'OrtoSorriso',
          medicos: [
            { id: 'md_9', nome: 'Dr. Vinícius Teixeira', exames: 197, faturamento: 29800, pendentePercent: 0.15 },
          ],
        },
        {
          id: 'cl_8', nome: 'Clínica Vitallis',
          medicos: [
            { id: 'md_10', nome: 'Dra. Fernanda Dutra', exames: 121, faturamento: 18200, pendentePercent: 0.60 },
          ],
        },
      ],
    },
    rad_leste: {
      nome: 'Radiologia Zona Leste',
      clinicas: [
        {
          id: 'cl_9', nome: 'Clínica Leste Odonto',
          medicos: [
            { id: 'md_11', nome: 'Dr. Thiago Martins', exames: 172, faturamento: 25700, pendentePercent: 0.25 },
          ],
        },
        {
          id: 'cl_10', nome: 'Sorridental',
          medicos: [
            { id: 'md_12', nome: 'Dra. Juliana Ramos', exames: 143, faturamento: 21300, pendentePercent: 0.05 },
          ],
        },
      ],
    },
  };

  /** Série temporal (12 pontos) por radiologia — para o gráfico de linha */
  const serieTemporalPorRadiologia = {
    rad_centro: [58000, 61200, 59800, 64500, 67200, 65800, 70100, 72400, 71000, 74800, 76200, 78500],
    rad_norte:  [41000, 42500, 40800, 44200, 45900, 44700, 47300, 48600, 47900, 50100, 51400, 52700],
    rad_sul:    [46200, 47800, 45300, 49100, 50600, 49200, 52800, 54100, 53400, 55900, 57200, 58600],
    rad_leste:  [32100, 33400, 31800, 34600, 35900, 34700, 37200, 38100, 37600, 39400, 40300, 41200],
  };

  const labelsTempo = ['Ago', 'Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul'];

  const examesPorMesPorRadiologia = {
    rad_centro: [612, 634, 601, 655, 671, 660, 690, 705, 698, 720, 734, 748],
    rad_norte:  [420, 431, 408, 445, 452, 447, 468, 479, 471, 488, 496, 505],
    rad_sul:    [468, 482, 455, 497, 508, 498, 519, 531, 524, 540, 552, 563],
    rad_leste:  [325, 338, 318, 349, 358, 350, 368, 375, 369, 382, 390, 398],
  };

  const nomeRadiologiaPorId = radiologias.reduce((acc, r) => { acc[r.id] = r.nome; return acc; }, {});

  /** Lista de clínicas de uma radiologia (compat. com gráfico de barras / tooltips) */
  function clinicasDe(radId) {
    return (hierarchy[radId]?.clinicas || []).map((c) => ({
      id: c.id,
      nome: c.nome,
      faturamento: c.medicos.reduce((s, m) => s + m.faturamento, 0),
      exames: c.medicos.reduce((s, m) => s + m.exames, 0),
      medicos: c.medicos,
    }));
  }

  const clinicasPorRadiologia = radiologias
    .filter((r) => r.id !== 'all')
    .reduce((acc, r) => { acc[r.id] = clinicasDe(r.id); return acc; }, {});

  /** Calcula agregados (exames, faturamento, comissão, pendente) de uma lista de médicos */
  function agregarMedicos(medicos) {
    return medicos.reduce((acc, m) => {
      const comissao = m.faturamento * TAXA_COMISSAO;
      const pendente = comissao * m.pendentePercent;
      acc.exames += m.exames;
      acc.faturamento += m.faturamento;
      acc.comissao += comissao;
      acc.pendente += pendente;
      return acc;
    }, { exames: 0, faturamento: 0, comissao: 0, pendente: 0 });
  }

  /** Retorna a árvore completa (todas as radiologias) já com totais calculados por nível */
  function getHierarchyTree() {
    return radiologias.filter((r) => r.id !== 'all').map((rad) => {
      const radData = hierarchy[rad.id];
      const clinicasComTotais = radData.clinicas.map((clinica) => {
        const totais = agregarMedicos(clinica.medicos);
        const medicosComComissao = clinica.medicos.map((m) => {
          const comissao = m.faturamento * TAXA_COMISSAO;
          const pendente = comissao * m.pendentePercent;
          return { ...m, comissao, pendente };
        });
        return { id: clinica.id, nome: clinica.nome, medicos: medicosComComissao, totais };
      });
      const totaisRadiologia = agregarMedicos(radData.clinicas.flatMap((c) => c.medicos));
      return { id: rad.id, nome: radData.nome, clinicas: clinicasComTotais, totais: totaisRadiologia };
    });
  }

  /** Retorna todos os médicos "achatados" (flat), com contexto de clínica/radiologia — usado em Comissões */
  function getAllDoctorsFlat() {
    const out = [];
    radiologias.filter((r) => r.id !== 'all').forEach((rad) => {
      hierarchy[rad.id].clinicas.forEach((clinica) => {
        clinica.medicos.forEach((m) => {
          const comissao = m.faturamento * TAXA_COMISSAO;
          const pendente = comissao * m.pendentePercent;
          out.push({
            id: m.id, nome: m.nome, exames: m.exames, faturamento: m.faturamento,
            comissao, pendente,
            clinicaId: clinica.id, clinicaNome: clinica.nome,
            radiologiaId: rad.id, radiologiaNome: hierarchy[rad.id].nome,
          });
        });
      });
    });
    return out;
  }

  /** KPIs consolidados por radiologia (chave 'all' = soma agregada), derivados da hierarquia */
  function buildKpis() {
    const porRadiologia = {};
    let totalFat = 0, totalExames = 0, totalComissao = 0, totalPendente = 0, totalClinicas = 0;

    radiologias.filter((r) => r.id !== 'all').forEach((rad) => {
      const radData = hierarchy[rad.id];
      const totais = agregarMedicos(radData.clinicas.flatMap((c) => c.medicos));
      const clinicasAtivas = radData.clinicas.length;

      porRadiologia[rad.id] = {
        faturamentoTotal: totais.faturamento,
        faturamentoVariacao: 4 + Math.random() * 7,
        totalExames: totais.exames,
        examesVariacao: 2 + Math.random() * 6,
        faturamentoMedioPorClinica: Math.round(totais.faturamento / clinicasAtivas),
        clinicasAtivas,
        previsibilidadeCaixa: Math.round(totais.faturamento * 0.38),
        examesAgendados: Math.round(totais.exames * 0.08),
        comissoesTotais: Math.round(totais.comissao),
        comissoesPendentes: Math.round(totais.pendente),
        comissoesPercentualFaturamento: TAXA_COMISSAO * 100,
        comissoesVariacao: 1 + Math.random() * 4,
      };

      totalFat += totais.faturamento;
      totalExames += totais.exames;
      totalComissao += totais.comissao;
      totalPendente += totais.pendente;
      totalClinicas += clinicasAtivas;
    });

    porRadiologia.all = {
      faturamentoTotal: totalFat,
      faturamentoVariacao: 8.4,
      totalExames: totalExames,
      examesVariacao: 5.9,
      faturamentoMedioPorClinica: Math.round(totalFat / totalClinicas),
      clinicasAtivas: totalClinicas,
      previsibilidadeCaixa: Math.round(totalFat * 0.38),
      examesAgendados: Math.round(totalExames * 0.08),
      comissoesTotais: Math.round(totalComissao),
      comissoesPendentes: Math.round(totalPendente),
      comissoesPercentualFaturamento: TAXA_COMISSAO * 100,
      comissoesVariacao: 3.2,
    };

    return porRadiologia;
  }

  const kpisPorRadiologia = buildKpis();

  function labelPeriodo(periodoId) {
    const mapa = {
      mes_atual: 'mês atual',
      ultimos_30: 'últimos 30 dias',
      trimestre: 'trimestre',
      ano: 'ano',
      custom: 'período personalizado',
    };
    return mapa[periodoId] || 'período selecionado';
  }

  return {
    radiologias,
    clinicasPorRadiologia,
    serieTemporalPorRadiologia,
    labelsTempo,
    examesPorMesPorRadiologia,
    kpisPorRadiologia,
    nomeRadiologiaPorId,
    labelPeriodo,
    getHierarchyTree,
    getAllDoctorsFlat,
    TAXA_COMISSAO,
  };
})();


/* =================================================================
   2. APP STATE
================================================================= */
const AppState = (() => {
  let state = {
    radiologiaSelecionada: 'all',
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

  function renderRadiologyPills() {
    pillsContainer.innerHTML = '';
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

  function getKpiData(radiologiaId) { return MockData.kpisPorRadiologia[radiologiaId]; }

  function renderChangeEl(el, changeValue) {
    if (!el) return;
    const { text, isPositive } = formatChange(changeValue);
    el.textContent = text;
    el.classList.toggle('is-positive', isPositive);
    el.classList.toggle('is-negative', !isPositive);
  }

  function render(state) {
    const data = getKpiData(state.radiologiaSelecionada);
    if (!data) return;

    const kpiRevenue = document.getElementById('kpiRevenue');
    kpiRevenue.querySelector('[data-field="value"]').textContent = formatCurrency(data.faturamentoTotal);
    renderChangeEl(kpiRevenue.querySelector('[data-field="change"]'), data.faturamentoVariacao);

    const kpiExams = document.getElementById('kpiExams');
    kpiExams.querySelector('[data-field="value"]').textContent = formatNumber(data.totalExames);
    renderChangeEl(kpiExams.querySelector('[data-field="change"]'), data.examesVariacao);

    const kpiAvg = document.getElementById('kpiAvgPerClinic');
    kpiAvg.querySelector('[data-field="value"]').textContent = formatCurrency(data.faturamentoMedioPorClinica);
    kpiAvg.querySelector('[data-field="context"]').textContent =
      `${data.clinicasAtivas} clínica${data.clinicasAtivas > 1 ? 's' : ''} referenciadora${data.clinicasAtivas > 1 ? 's' : ''} ativa${data.clinicasAtivas > 1 ? 's' : ''}`;

    const kpiCash = document.getElementById('kpiCashForecast');
    kpiCash.querySelector('[data-field="value"]').textContent = formatCurrency(data.previsibilidadeCaixa);
    kpiCash.querySelector('[data-field="context"]').textContent = `${data.examesAgendados} exames agendados`;

    const kpiCommissions = document.getElementById('kpiCommissions');
    kpiCommissions.querySelector('[data-field="value"]').textContent = formatCurrency(data.comissoesTotais);
    renderChangeEl(kpiCommissions.querySelector('[data-field="change"]'), data.comissoesVariacao);
    kpiCommissions.querySelector('[data-field="context"]').textContent =
      `${formatCurrency(data.comissoesPendentes)} pendente · ${data.comissoesPercentualFaturamento.toFixed(1)}% do faturamento`;
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
    let tooltipEl = chart.canvas.parentNode.querySelector('.chartjs-tooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'chartjs-tooltip';
      chart.canvas.parentNode.appendChild(tooltipEl);
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

      const { offsetLeft: chartLeft, offsetTop: chartTop } = chart.canvas;
      const chartWidth = chart.canvas.offsetWidth;
      const tooltipWidth = tooltipEl.offsetWidth || 260;

      let left = chartLeft + tooltip.caretX + 16;
      // Evita que o tooltip vaze para fora da direita do card
      if (left + tooltipWidth > chartLeft + chartWidth) {
        left = chartLeft + tooltip.caretX - tooltipWidth - 16;
      }
      let top = chartTop + tooltip.caretY;
      top -= tooltipEl.offsetHeight ? tooltipEl.offsetHeight / 2 : 0;

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
  function buildLineDatasets(state) {
    const { radiologiaSelecionada, visualizacao } = state;
    const fonteDados = visualizacao === 'faturamento' ? MockData.serieTemporalPorRadiologia : MockData.examesPorMesPorRadiologia;

    if (radiologiaSelecionada === 'all') {
      return MockData.radiologias.filter((r) => r.id !== 'all').map((rad, i) => ({
        label: rad.nome,
        data: fonteDados[rad.id],
        borderColor: SERIES_COLORS[i % SERIES_COLORS.length],
        backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] + '1F',
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: SERIES_COLORS[i % SERIES_COLORS.length],
        pointHoverBorderColor: '#FFFFFF',
        pointHoverBorderWidth: 2,
        fill: false,
        _isPrimary: true,
        _radId: rad.id,
      }));
    }

    // Radiologia específica: apenas a linha dela, em destaque — nenhuma outra
    // radiologia aparece no gráfico.
    const clinicas = MockData.clinicasPorRadiologia[radiologiaSelecionada] || [];
    const principal = fonteDados[radiologiaSelecionada];
    const corPrincipal = SERIES_COLORS[0];

    const datasets = [{
      label: MockData.nomeRadiologiaPorId[radiologiaSelecionada],
      data: principal,
      borderColor: corPrincipal,
      backgroundColor: corPrincipal + '26',
      borderWidth: 3.25,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: corPrincipal,
      pointHoverBorderColor: '#FFFFFF',
      pointHoverBorderWidth: 2,
      fill: true,
      order: 0,
      _isPrimary: true,
      _radId: radiologiaSelecionada,
    }];

    // Linhas secundárias, discretas e tracejadas, mostrando a proporção de
    // cada clínica referenciadora dentro da radiologia selecionada.
    const totalClinicas = clinicas.reduce((s, c) => s + c.faturamento, 0) || 1;
    clinicas.slice(0, 3).forEach((clinica, i) => {
      const fator = clinica.faturamento / totalClinicas;
      const cor = SERIES_COLORS[(i + 1) % SERIES_COLORS.length];
      datasets.push({
        label: clinica.nome,
        data: principal.map((v) => Math.round(v * fator)),
        borderColor: cor,
        borderWidth: 1.5,
        borderDash: [5, 4],
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: cor,
        pointHoverBorderColor: '#FFFFFF',
        pointHoverBorderWidth: 1.5,
        fill: false,
        order: 1,
        _isPrimary: false,
        _clinicaId: clinica.id,
      });
    });

    return datasets;
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

  function renderLineChart(state) {
    const ctx = document.getElementById('evolutionChart');
    const datasets = buildLineDatasets(state);

    if (lineChartInstance) lineChartInstance.destroy();

    lineChartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels: MockData.labelsTempo, datasets },
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

  function buildBarData(state) {
    const { radiologiaSelecionada, visualizacao } = state;

    if (radiologiaSelecionada === 'all') {
      const labels = MockData.radiologias.filter((r) => r.id !== 'all').map((r) => r.nome);
      const values = MockData.radiologias.filter((r) => r.id !== 'all').map((r) => {
        const kpi = MockData.kpisPorRadiologia[r.id];
        return visualizacao === 'faturamento' ? kpi.faturamentoTotal : kpi.totalExames;
      });
      const meta = MockData.radiologias.filter((r) => r.id !== 'all').map((r) => ({
        tipo: 'radiologia',
        clinicas: MockData.clinicasPorRadiologia[r.id] || [],
      }));
      return { labels, values, meta };
    }

    const clinicas = MockData.clinicasPorRadiologia[radiologiaSelecionada] || [];
    return {
      labels: clinicas.map((c) => c.nome),
      values: clinicas.map((c) => (visualizacao === 'faturamento' ? c.faturamento : c.exames)),
      meta: clinicas.map((c) => ({ tipo: 'clinica', clinicaId: c.id, medicos: c.medicos })),
    };
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

  function renderBarChart(state) {
    const ctx = document.getElementById('entityChart');
    const { labels, values, meta } = buildBarData(state);

    if (barChartInstance) barChartInstance.destroy();

    barChartInstance = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{
        label: state.visualizacao === 'faturamento' ? 'Faturamento' : 'Exames',
        data: values,
        backgroundColor: SERIES_COLORS[0],
        hoverBackgroundColor: SERIES_COLORS[1],
        borderRadius: 4,
        maxBarThickness: 42,
      }] },
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
    const nomeRadiologia = MockData.nomeRadiologiaPorId[state.radiologiaSelecionada];
    const labelPeriodo = MockData.labelPeriodo(state.periodo);
    const isAll = state.radiologiaSelecionada === 'all';

    document.getElementById('lineChartTitle').textContent = state.visualizacao === 'faturamento' ? 'Evolução de Faturamento' : 'Evolução de Exames Realizados';
    document.getElementById('lineChartSubtitle').textContent = isAll
      ? `Comparativo entre as 4 radiologias — ${labelPeriodo}`
      : `${nomeRadiologia} — ${labelPeriodo}`;

    document.getElementById('barChartTitle').textContent = isAll
      ? (state.visualizacao === 'faturamento' ? 'Faturamento por Radiologia' : 'Exames por Radiologia')
      : (state.visualizacao === 'faturamento' ? 'Faturamento por Clínica Referenciadora' : 'Exames por Clínica Referenciadora');
    document.getElementById('barChartSubtitle').textContent = isAll
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

  function renderAll(state) {
    updateChartHeadings(state);
    renderLineChart(state);
    renderBarChart(state);
  }

  function init() {
    bindViewToggle();
    renderAll(AppState.getState());
    AppState.subscribe(renderAll);
  }

  return { init, externalTooltipHandler, formatCurrencyFull, formatNumberFull, SERIES_COLORS };
})();


/* =================================================================
   6. HIERARCHY TABLE (Accordion / Tree Table)
   -----------------------------------------------------------------
   Renderiza a árvore Radiologia -> Clínica -> Médico como linhas
   colapsáveis. Respeita o filtro global de radiologia: quando uma
   radiologia específica é selecionada, apenas seus dados aparecem
   (já expandidos); em "Todas", mostra as 4 radiologias (colapsadas
   por padrão, com opção "Ver todas / Recolher").
================================================================= */
const HierarchyTable = (() => {
  let bodyEl, sortSelect, expandAllBtn, collapseAllBtn, toggleLimitBtn, toggleLimitLabel;

  const LIMITE_RADIOLOGIAS_RESUMO = 2; // versão resumida: mostra até N radiologias antes do "ver mais"

  // Estado de UI local (independente do AppState): quais nós estão expandidos + se a versão resumida está ativa
  let expandedNodes = new Set();      // ids de radiologia/clínica expandidos
  let showAllRows = false;            // controla o limite de linhas (versão resumida)

  function formatCurrency(v) { return Kpis.formatCurrency(v); }
  function formatNumber(v) { return Kpis.formatNumber(v); }

  /** Ordena um array de nós (radiologias, clínicas ou médicos) conforme o critério selecionado */
  function ordenar(nodes, criterio) {
    const arr = [...nodes];
    const getFat = (n) => n.totais ? n.totais.faturamento : n.faturamento;
    const getPend = (n) => n.totais ? n.totais.pendente : n.pendente;
    const getExames = (n) => n.totais ? n.totais.exames : n.exames;

    switch (criterio) {
      case 'faturamento_asc': arr.sort((a, b) => getFat(a) - getFat(b)); break;
      case 'pendente_desc': arr.sort((a, b) => getPend(b) - getPend(a)); break;
      case 'exames_desc': arr.sort((a, b) => getExames(b) - getExames(a)); break;
      case 'nome_asc': arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); break;
      case 'faturamento_desc':
      default: arr.sort((a, b) => getFat(b) - getFat(a));
    }
    return arr;
  }

  function criarLinha({ nome, level, exames, faturamento, comissao, pendente, nodeId, hasChildren, isTotal, childCount, childLabel }) {
    const row = document.createElement('div');
    row.className = `tree-row tree-row--level-${level}` + (isTotal ? ' tree-row--total' : '');
    if (nodeId) row.dataset.nodeId = nodeId;

    const isExpanded = nodeId ? expandedNodes.has(nodeId) : true;
    if (hasChildren && !isExpanded) row.classList.add('is-collapsed');

    const badge = level === 1 ? 'Radiologia' : level === 2 ? 'Clínica' : '';
    const contagem = (hasChildren && childCount) ? `<span class="tree-row__count">${childCount} ${childLabel}</span>` : '';

    row.innerHTML = `
      <span class="tree-row__name-cell">
        ${hasChildren
          ? `<button type="button" class="tree-row__toggle" aria-label="Expandir/recolher" data-toggle-id="${nodeId}">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
             </button>`
          : `<span class="tree-row__toggle-spacer"></span>`}
        <span class="tree-row__name" title="${nome}">${nome}</span>
        ${badge ? `<span class="tree-row__badge">${badge}</span>` : ''}
        ${contagem}
      </span>
      <span class="tree-row__num" data-label="Exames">${formatNumber(exames)}</span>
      <span class="tree-row__num" data-label="Faturamento">${formatCurrency(faturamento)}</span>
      <span class="tree-row__num" data-label="Comissão Devida">${formatCurrency(comissao)}</span>
      <span class="tree-row__num ${pendente > 0 ? 'tree-row__num--pending' : 'tree-row__num--pending is-zero'}" data-label="Pendente">${pendente > 0 ? formatCurrency(pendente) : '—'}</span>
      <span class="tree-row__action">
        ${level === 3 || isTotal ? '' : `<button type="button" class="row-action-btn" aria-label="Ver detalhes" title="Ver detalhes">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>
        </button>`}
      </span>
    `;
    return row;
  }

  /** Renderiza os médicos (nível 3) de uma clínica dentro de um contêiner de grupo */
  function renderMedicos(clinica, criterio) {
    const group = document.createElement('div');
    group.className = 'tree-group';
    group.dataset.parentId = clinica.id;
    if (!expandedNodes.has(clinica.id)) group.classList.add('is-collapsed');

    ordenar(clinica.medicos, criterio).forEach((medico) => {
      group.appendChild(criarLinha({
        nome: medico.nome, level: 3,
        exames: medico.exames, faturamento: medico.faturamento,
        comissao: medico.comissao, pendente: medico.pendente,
        hasChildren: false,
      }));
    });
    return group;
  }

  /** Renderiza as clínicas (nível 2) de uma radiologia dentro de um contêiner de grupo */
  function renderClinicas(radiologia, criterio) {
    const group = document.createElement('div');
    group.className = 'tree-group';
    group.dataset.parentId = radiologia.id;
    if (!expandedNodes.has(radiologia.id)) group.classList.add('is-collapsed');

    ordenar(radiologia.clinicas, criterio).forEach((clinica) => {
      const row = criarLinha({
        nome: clinica.nome, level: 2,
        exames: clinica.totais.exames, faturamento: clinica.totais.faturamento,
        comissao: clinica.totais.comissao, pendente: clinica.totais.pendente,
        nodeId: clinica.id, hasChildren: clinica.medicos.length > 0,
        childCount: clinica.medicos.length,
        childLabel: clinica.medicos.length === 1 ? 'médico' : 'médicos',
      });
      group.appendChild(row);
      group.appendChild(renderMedicos(clinica, criterio));
    });
    return group;
  }

  /** Monta a linha de total geral (soma de todas as radiologias visíveis no momento) */
  function criarLinhaTotalGeral(radiologiasVisiveis) {
    const total = radiologiasVisiveis.reduce((acc, r) => ({
      exames: acc.exames + r.totais.exames,
      faturamento: acc.faturamento + r.totais.faturamento,
      comissao: acc.comissao + r.totais.comissao,
      pendente: acc.pendente + r.totais.pendente,
    }), { exames: 0, faturamento: 0, comissao: 0, pendente: 0 });

    return criarLinha({
      nome: 'Total Geral', level: 1,
      exames: total.exames, faturamento: total.faturamento,
      comissao: total.comissao, pendente: total.pendente,
      hasChildren: false, isTotal: true,
    });
  }

  /** Renderização principal: respeita o filtro global de radiologia + versão resumida */
  function render(state) {
    const criterio = sortSelect.value;
    const tree = MockData.getHierarchyTree();
    bodyEl.innerHTML = '';

    let radiologiasVisiveis;
    let isFiltrado = state.radiologiaSelecionada !== 'all';

    if (isFiltrado) {
      // Radiologia específica: mostra só ela, já expandida por padrão
      radiologiasVisiveis = tree.filter((r) => r.id === state.radiologiaSelecionada);
      radiologiasVisiveis.forEach((r) => {
        expandedNodes.add(r.id);
        r.clinicas.forEach((c) => expandedNodes.add(c.id));
      });
    } else {
      radiologiasVisiveis = ordenar(tree, criterio);
    }

    const totalDisponivel = radiologiasVisiveis.length;
    const aplicarLimite = !isFiltrado && !showAllRows && totalDisponivel > LIMITE_RADIOLOGIAS_RESUMO;
    const radiologiasParaExibir = aplicarLimite ? radiologiasVisiveis.slice(0, LIMITE_RADIOLOGIAS_RESUMO) : radiologiasVisiveis;

    if (!radiologiasParaExibir.length) {
      bodyEl.innerHTML = '<div class="empty-state">Nenhum dado encontrado para esta seleção.</div>';
    }

    radiologiasParaExibir.forEach((rad) => {
      const row = criarLinha({
        nome: rad.nome, level: 1,
        exames: rad.totais.exames, faturamento: rad.totais.faturamento,
        comissao: rad.totais.comissao, pendente: rad.totais.pendente,
        nodeId: rad.id, hasChildren: rad.clinicas.length > 0,
        childCount: rad.clinicas.length,
        childLabel: rad.clinicas.length === 1 ? 'clínica' : 'clínicas',
      });
      bodyEl.appendChild(row);
      bodyEl.appendChild(renderClinicas(rad, criterio));
    });

    // Total geral — soma tudo que está visível no momento (respeita o filtro global)
    if (radiologiasVisiveis.length > 1) {
      bodyEl.appendChild(criarLinhaTotalGeral(radiologiasVisiveis));
    }

    // Rodapé "ver todas / recolher": só faz sentido em "Todas as Radiologias" com mais itens do que o limite
    const footerBtn = toggleLimitBtn.closest('.tree-table__footer');
    footerBtn.style.display = (!isFiltrado && totalDisponivel > LIMITE_RADIOLOGIAS_RESUMO) ? 'flex' : 'none';
    toggleLimitLabel.textContent = showAllRows ? 'Ver resumo (2 primeiras)' : `Ver todas as radiologias (${totalDisponivel})`;
    toggleLimitBtn.classList.toggle('is-expanded', showAllRows);

    bindRowToggles();
  }

  /** Liga os cliques dos botões de expandir/recolher em cada linha (delegação simplificada) */
  function bindRowToggles() {
    bodyEl.querySelectorAll('[data-toggle-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggleId;
        const isExpanded = expandedNodes.has(id);
        if (isExpanded) expandedNodes.delete(id); else expandedNodes.add(id);
        render(AppState.getState());
      });
    });
  }

  function expandAll() {
    const tree = MockData.getHierarchyTree();
    tree.forEach((r) => {
      expandedNodes.add(r.id);
      r.clinicas.forEach((c) => expandedNodes.add(c.id));
    });
    render(AppState.getState());
  }

  function collapseAll() {
    expandedNodes.clear();
    render(AppState.getState());
  }

  function bindEvents() {
    sortSelect.addEventListener('change', () => render(AppState.getState()));
    expandAllBtn.addEventListener('click', expandAll);
    collapseAllBtn.addEventListener('click', collapseAll);
    toggleLimitBtn.addEventListener('click', () => {
      showAllRows = !showAllRows;
      render(AppState.getState());
    });
    AppState.subscribe(render);
  }

  function init() {
    bodyEl = document.getElementById('treeTableBody');
    sortSelect = document.getElementById('hierarchySort');
    expandAllBtn = document.getElementById('hierarchyExpandAll');
    collapseAllBtn = document.getElementById('hierarchyCollapseAll');
    toggleLimitBtn = document.getElementById('hierarchyToggleLimit');
    toggleLimitLabel = document.getElementById('hierarchyToggleLimitLabel');
    render(AppState.getState());
    bindEvents();
  }

  return { init };
})();


/* =================================================================
   7. COMMISSIONS (resumo + gráficos + tabela top comissões)
   -----------------------------------------------------------------
   Toda a seção respeita o filtro global de radiologia: quando uma
   radiologia específica é selecionada, os cards, gráficos e a
   tabela consideram apenas os médicos daquela unidade.
================================================================= */
const Commissions = (() => {
  const SERIES_COLORS = ['#018093', '#01C6BF', '#5C6A6E', '#8FBFC7', '#B7C2C4', '#046B85'];

  let topDoctorsChart = null;
  let distributionChart = null;
  let byEntityChart = null;

  function formatCurrency(v) { return Kpis.formatCurrency(v); }
  function formatNumber(v) { return Kpis.formatNumber(v); }

  /** Retorna apenas os médicos da radiologia selecionada (ou todos, se 'all') */
  function getDoctorsForState(state) {
    const all = MockData.getAllDoctorsFlat();
    return state.radiologiaSelecionada === 'all' ? all : all.filter((d) => d.radiologiaId === state.radiologiaSelecionada);
  }

  // -----------------------------------------------------------
  // RESUMO GERAL (cards)
  // -----------------------------------------------------------
  function renderSummary(state, doctors) {
    const totalComissao = doctors.reduce((s, d) => s + d.comissao, 0);
    const totalPendente = doctors.reduce((s, d) => s + d.pendente, 0);
    const totalPago = totalComissao - totalPendente;
    const totalFaturamento = doctors.reduce((s, d) => s + d.faturamento, 0);
    const medicosComPendencia = doctors.filter((d) => d.pendente > 0.01).length;

    document.getElementById('commSummaryTotal').textContent = formatCurrency(totalComissao);
    document.getElementById('commSummaryTotalHint').textContent =
      totalFaturamento > 0 ? `${((totalComissao / totalFaturamento) * 100).toFixed(1)}% do faturamento` : '-- % do faturamento';

    document.getElementById('commSummaryPaid').textContent = formatCurrency(totalPago);
    document.getElementById('commSummaryPaidHint').textContent =
      totalComissao > 0 ? `${((totalPago / totalComissao) * 100).toFixed(1)}% do total` : '-- % do total';

    document.getElementById('commSummaryPending').textContent = formatCurrency(totalPendente);
    document.getElementById('commSummaryPendingHint').textContent =
      `${medicosComPendencia} médico${medicosComPendencia !== 1 ? 's' : ''} aguardando`;

    document.getElementById('commSummaryDoctors').textContent = formatNumber(doctors.length);
    document.getElementById('commSummaryDoctorsHint').textContent = 'ativos no período';

    const nomeRadiologia = MockData.nomeRadiologiaPorId[state.radiologiaSelecionada];
    const labelPeriodo = MockData.labelPeriodo(state.periodo);
    document.getElementById('commissionsSubtitle').textContent = `${nomeRadiologia} — ${labelPeriodo}`;
    document.getElementById('commTopDoctorsSubtitle').textContent = `Maiores comissões — ${labelPeriodo}`;
    document.getElementById('commDistributionSubtitle').textContent = state.radiologiaSelecionada === 'all' ? 'Por radiologia' : 'Por clínica referenciadora';
    document.getElementById('commByEntitySubtitle').textContent = state.radiologiaSelecionada === 'all'
      ? 'Pago vs. pendente, por radiologia'
      : 'Pago vs. pendente, por clínica referenciadora';
  }

  // -----------------------------------------------------------
  // GRÁFICO — TOP 10 MÉDICOS (barras horizontais)
  // -----------------------------------------------------------
  function renderTopDoctorsChart(doctors) {
    const ctx = document.getElementById('commTopDoctorsChart');
    const top10 = [...doctors].sort((a, b) => b.comissao - a.comissao).slice(0, 10);

    if (topDoctorsChart) topDoctorsChart.destroy();

    topDoctorsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top10.map((d) => d.nome),
        datasets: [{
          label: 'Comissão Devida',
          data: top10.map((d) => d.comissao),
          backgroundColor: '#018093',
          hoverBackgroundColor: '#01C6BF',
          borderRadius: 4,
          maxBarThickness: 20,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            position: 'nearest',
            external: Charts.externalTooltipHandler((tooltip) => {
              const item = tooltip.dataPoints[0];
              const medico = top10[item.dataIndex];
              const temPendencia = medico.pendente > 0.01;
              return {
                eyebrow: `${medico.radiologiaNome} · ${medico.clinicaNome}`,
                headline: { label: 'Comissão devida', value: formatCurrency(medico.comissao), color: '#018093' },
                metrics: [
                  { label: 'Exames realizados', value: formatNumber(medico.exames) },
                  { label: 'Faturamento gerado', value: formatCurrency(medico.faturamento) },
                  { label: 'Pendente de pagamento', value: temPendencia ? formatCurrency(medico.pendente) : 'Quitado' },
                ],
              };
            }),
          },
        },
        scales: {
          x: { grid: { color: '#E3E7E8' }, ticks: { font: { size: 11 }, callback: (v) => `R$ ${(v / 1000).toFixed(1).replace('.0', '')} mil` } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  // -----------------------------------------------------------
  // GRÁFICO — DISTRIBUIÇÃO (pizza)
  // -----------------------------------------------------------
  function renderDistributionChart(state, doctors) {
    const ctx = document.getElementById('commDistributionChart');
    let labels, values;

    if (state.radiologiaSelecionada === 'all') {
      const porRadiologia = {};
      doctors.forEach((d) => { porRadiologia[d.radiologiaNome] = (porRadiologia[d.radiologiaNome] || 0) + d.comissao; });
      labels = Object.keys(porRadiologia);
      values = Object.values(porRadiologia);
    } else {
      const porClinica = {};
      doctors.forEach((d) => { porClinica[d.clinicaNome] = (porClinica[d.clinicaNome] || 0) + d.comissao; });
      labels = Object.keys(porClinica);
      values = Object.values(porClinica);
    }

    if (distributionChart) distributionChart.destroy();

    const total = values.reduce((s, v) => s + v, 0) || 1;

    distributionChart = new Chart(ctx, {
      type: 'pie',
      data: { labels, datasets: [{ data: values, backgroundColor: SERIES_COLORS, borderColor: '#FFFFFF', borderWidth: 2 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } } },
          tooltip: {
            enabled: false,
            position: 'nearest',
            external: Charts.externalTooltipHandler((tooltip) => {
              const item = tooltip.dataPoints[0];
              const valor = item.parsed;
              const percent = (valor / total) * 100;
              return {
                eyebrow: state.radiologiaSelecionada === 'all' ? 'Radiologia' : 'Clínica referenciadora',
                headline: {
                  label: item.label,
                  value: formatCurrency(valor),
                  color: SERIES_COLORS[item.dataIndex % SERIES_COLORS.length],
                },
                breakdown: {
                  title: 'Participação no total de comissões',
                  rows: [{ label: 'do total geral', percent, color: SERIES_COLORS[item.dataIndex % SERIES_COLORS.length] }],
                },
              };
            }),
          },
        },
      },
    });
  }

  // -----------------------------------------------------------
  // GRÁFICO — POR RADIOLOGIA/CLÍNICA (barras empilhadas: pago x pendente)
  // -----------------------------------------------------------
  function renderByEntityChart(state, doctors) {
    const ctx = document.getElementById('commByEntityChart');
    const chave = state.radiologiaSelecionada === 'all' ? 'radiologiaNome' : 'clinicaNome';

    const agrupado = {};
    doctors.forEach((d) => {
      const key = d[chave];
      if (!agrupado[key]) agrupado[key] = { pago: 0, pendente: 0 };
      agrupado[key].pendente += d.pendente;
      agrupado[key].pago += d.comissao - d.pendente;
    });

    const labels = Object.keys(agrupado);
    const pagos = labels.map((l) => agrupado[l].pago);
    const pendentes = labels.map((l) => agrupado[l].pendente);

    if (byEntityChart) byEntityChart.destroy();

    byEntityChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Pago', data: pagos, backgroundColor: '#018093', borderRadius: 4, maxBarThickness: 46, stack: 'comissao' },
          { label: 'Pendente', data: pendentes, backgroundColor: '#01C6BF', borderRadius: 4, maxBarThickness: 46, stack: 'comissao' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } } },
          tooltip: {
            enabled: false,
            position: 'nearest',
            external: Charts.externalTooltipHandler((tooltip) => {
              const idx = tooltip.dataPoints[0].dataIndex;
              const label = labels[idx];
              const pago = pagos[idx];
              const pendente = pendentes[idx];
              const totalEntidade = pago + pendente || 1;
              return {
                eyebrow: chave === 'radiologiaNome' ? 'Radiologia' : 'Clínica referenciadora',
                headline: { label, value: formatCurrency(totalEntidade), color: '#018093' },
                breakdown: {
                  title: 'Comissão devida: pago vs. pendente',
                  rows: [
                    { label: 'Pago', value: formatCurrency(pago), percent: (pago / totalEntidade) * 100, color: '#018093' },
                    { label: 'Pendente', value: formatCurrency(pendente), percent: (pendente / totalEntidade) * 100, color: '#01C6BF' },
                  ],
                },
              };
            }),
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, autoSkip: false, maxRotation: 18 } },
          y: { stacked: true, grid: { color: '#E3E7E8' }, ticks: { font: { size: 11 }, callback: (v) => `R$ ${(v / 1000).toFixed(1).replace('.0', '')} mil` } },
        },
        scales_x_stacked: true,
      },
    });
    // Habilita empilhamento no eixo X também (Chart.js exige a flag em ambos os eixos)
    byEntityChart.options.scales.x.stacked = true;
    byEntityChart.update();
  }

  // -----------------------------------------------------------
  // TABELA — TOP COMISSÕES
  // -----------------------------------------------------------
  function renderTopTable(doctors) {
    const tbody = document.getElementById('commTopTableBody');
    tbody.innerHTML = '';

    const top = [...doctors].sort((a, b) => b.comissao - a.comissao).slice(0, 8);

    if (!top.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum médico encontrado para esta seleção.</td></tr>';
      return;
    }

    top.forEach((d) => {
      const tr = document.createElement('tr');
      const temPendencia = d.pendente > 0.01;
      tr.innerHTML = `
        <td>
          <span class="data-table__name-primary">${d.nome}</span>
          <span class="data-table__name-secondary">${d.clinicaNome} &middot; ${d.radiologiaNome}</span>
        </td>
        <td class="data-table__num">${formatNumber(d.exames)}</td>
        <td class="data-table__num">${formatCurrency(d.comissao)}</td>
        <td class="data-table__num">
          ${temPendencia
            ? `<span class="pending-tag">${formatCurrency(d.pendente)}</span>`
            : `<span class="pending-tag pending-tag--none">Quitado</span>`}
        </td>
        <td class="data-table__action">
          <button type="button" class="row-action-btn" aria-label="Ver detalhes de ${d.nome}" title="Ver detalhes">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function bindFullReportButton() {
    document.getElementById('btnFullCommissionReport').addEventListener('click', () => {
      // Ponto de extensão futuro: navegação para relatório detalhado de comissões
      // Ex: Router.navigate('relatorios/comissoes', { radiologia: AppState.getState().radiologiaSelecionada })
      alert('Relatório completo de comissões — em desenvolvimento. Este botão navegará para a página detalhada de comissões.');
    });
  }

  function render(state) {
    const doctors = getDoctorsForState(state);
    renderSummary(state, doctors);
    renderTopDoctorsChart(doctors);
    renderDistributionChart(state, doctors);
    renderByEntityChart(state, doctors);
    renderTopTable(doctors);
  }

  function init() {
    render(AppState.getState());
    bindFullReportButton();
    AppState.subscribe(render);
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
   9. INIT (bootstrap da aplicação)
================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  Filters.init();
  Kpis.init();
  Charts.init();
  HierarchyTable.init();
  Commissions.init();
  Sidebar.init();
});