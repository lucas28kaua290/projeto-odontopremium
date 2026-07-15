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
        ticketMedioExame: totais.faturamento / totais.exames,
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
      ticketMedioExame: totalFat / totalExames,
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
      pill.addEventListener('click', () => AppState.update({radiologiaSelecionada: rad.id, clinicaSelecionada:'all'}));
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

    const kpiTicket = document.getElementById('kpiTicketMedio');

    kpiTicket.querySelector('[data-field="value"]').textContent =
      formatCurrency(data.ticketMedioExame);

    renderChangeEl(
      kpiTicket.querySelector('[data-field="change"]'),
      data.faturamentoVariacao
    );
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
      let top  = canvasRect.top  + tooltip.caretY - tooltipHeight / 2;

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
      tooltipEl.style.top  = top  + 'px';
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
   7. EXAM ANALYSIS — Análise de Exames
   KPIs rápidos + pizza por tipo + ranking clínicas/médicos
   + destaque por médicos (minicards) + destaques do período.
   Responde ao filtro global de radiologia.
================================================================= */
const ExamAnalysis = (() => {

  /* ---------------------------------------------------------------
     DADOS: tipos de exame por radiologia
  --------------------------------------------------------------- */
  const EXAM_TYPES_BY_RAD = {
    rad_centro: { 'Panorâmica': 248, 'Tomografia': 156, 'Periapical': 184, 'Interproximal': 78, 'Cefalométrica': 82 },
    rad_norte:  { 'Panorâmica': 198, 'Tomografia': 112, 'Periapical': 124, 'Interproximal': 48, 'Cefalométrica': 43 },
    rad_sul:    { 'Panorâmica': 214, 'Tomografia': 134, 'Periapical': 148, 'Interproximal': 62, 'Cefalométrica': 58 },
    rad_leste:  { 'Panorâmica': 162, 'Tomografia':  98, 'Periapical': 112, 'Interproximal': 44, 'Cefalométrica': 36 },
  };

  /*
   * Distribuição simulada de tipos de exame por médico.
   * Array ordenado por relevância — os 2 primeiros viram tags no minicard.
   * Numa API real, viria do breakdown de laudos por CRM.
   */
  const DOCTOR_EXAM_TYPES = {

    md_1: [
        { tipo: "Panorâmica", exames: 248 },
        { tipo: "Periapical", exames: 184 },
        { tipo: "Tomografia", exames: 156 },
        { tipo: "Interproximal", exames: 78 },
        { tipo: "Raio-X", exames: 52 }
    ],

    md_2: [
        { tipo: "Tomografia", exames: 212 },
        { tipo: "Panorâmica", exames: 145 },
        { tipo: "Cefalométrica", exames: 84 },
        { tipo: "Raio-X", exames: 66 }
    ],

    md_3: [
        { tipo: "Periapical", exames: 192 },
        { tipo: "Panorâmica", exames: 167 },
        { tipo: "Interproximal", exames: 63 },
        { tipo: "Raio-X", exames: 41 }
    ],

    md_4: [
        { tipo: "Panorâmica", exames: 231 },
        { tipo: "Tomografia", exames: 174 },
        { tipo: "Cefalométrica", exames: 92 },
        { tipo: "Raio-X", exames: 58 }
    ],

    md_5: [
        { tipo: "Tomografia", exames: 226 },
        { tipo: "Panorâmica", exames: 181 },
        { tipo: "Periapical", exames: 109 },
        { tipo: "Raio-X", exames: 76 }
    ],

    md_6: [
        { tipo: "Panorâmica", exames: 208 },
        { tipo: "Interproximal", exames: 116 },
        { tipo: "Periapical", exames: 102 },
        { tipo: "Raio-X", exames: 61 }
    ],

    md_7: [
        { tipo: "Cefalométrica", exames: 171 },
        { tipo: "Panorâmica", exames: 148 },
        { tipo: "Tomografia", exames: 119 },
        { tipo: "Raio-X", exames: 53 }
    ],

    md_8: [
        { tipo: "Panorâmica", exames: 243 },
        { tipo: "Periapical", exames: 178 },
        { tipo: "Tomografia", exames: 152 },
        { tipo: "Interproximal", exames: 84 },
        { tipo: "Raio-X", exames: 45 }
    ],

    md_9: [
        { tipo: "Tomografia", exames: 238 },
        { tipo: "Panorâmica", exames: 182 },
        { tipo: "Periapical", exames: 121 },
        { tipo: "Raio-X", exames: 73 }
    ],

    md_10: [
        { tipo: "Periapical", exames: 214 },
        { tipo: "Interproximal", exames: 126 },
        { tipo: "Panorâmica", exames: 118 },
        { tipo: "Raio-X", exames: 54 }
    ],

    md_11: [
        { tipo: "Panorâmica", exames: 259 },
        { tipo: "Tomografia", exames: 183 },
        { tipo: "Periapical", exames: 146 },
        { tipo: "Raio-X", exames: 69 }
    ],

    md_12: [
        { tipo: "Cefalométrica", exames: 184 },
        { tipo: "Panorâmica", exames: 161 },
        { tipo: "Interproximal", exames: 98 },
        { tipo: "Raio-X", exames: 48 }
    ]

  };

  const REFERENCED_PCT_BY_RAD = {
    rad_centro: 87.4, rad_norte: 91.2, rad_sul: 84.7, rad_leste: 88.9,
  };

  const VARIATION_BY_RAD = {
    rad_centro: 6.3, rad_norte: 4.1, rad_sul: 7.8, rad_leste: 3.5, all: 5.9,
  };

  const TYPE_COLORS = ['#018093','#01C6BF','#046B85','#8FBFC7','#B7C2C4'];

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

  function getExamTypes(radId) {
    if (radId === 'all') {
      const merged = {};
      Object.values(EXAM_TYPES_BY_RAD).forEach(types => {
        Object.entries(types).forEach(([tipo, qtd]) => { merged[tipo] = (merged[tipo] || 0) + qtd; });
      });
      return merged;
    }
    return { ...EXAM_TYPES_BY_RAD[radId] };
  }

  function getClinicsData(radId) {
    const allDoctors = MockData.getAllDoctorsFlat();
    const filtered = radId === 'all' ? allDoctors : allDoctors.filter(d => d.radiologiaId === radId);
    const clinicMap = {};
    filtered.forEach(d => {
      if (!clinicMap[d.clinicaNome]) clinicMap[d.clinicaNome] = { nome: d.clinicaNome, radiologia: d.radiologiaNome, exames: 0 };
      clinicMap[d.clinicaNome].exames += d.exames;
    });
    return Object.values(clinicMap).sort((a, b) => b.exames - a.exames).slice(0, 6);
  }

  function getDoctorsData(radId, clinic = 'all') {
    const allDoctors = MockData.getAllDoctorsFlat();
    let filtered =
      radId === 'all'
        ? allDoctors
        : allDoctors.filter(d => d.radiologiaId === radId);

    if (clinic !== 'all') {
      filtered = filtered.filter(
        d => d.clinicaNome === clinic
      );
    }

    return [...filtered]
      .sort((a,b)=>b.exames-a.exames)
      .map(d=>({
        id:d.id,
        nome:d.nome,
        clinica:d.clinicaNome,
        radiologia:d.radiologiaNome,
        exames:d.exames,
        faturamento:d.faturamento

      }));

  }

  function renderDoctorClinicFilter(state){

    const select = document.getElementById('doctorClinicFilter');
    if(!select) return;
    const radId = state.radiologiaSelecionada;
    const doctors = getDoctorsData(radId);
    const clinics = [
      ...new Set(
      doctors.map(d=>d.clinica)
    )

    ].sort();

    select.innerHTML = `
      <option value="all">
        Todas
      </option>
    `;

    clinics.forEach(clinic=>{
      select.insertAdjacentHTML(
        'beforeend',
          `<option value="${clinic}">
            ${clinic}
          </option>`
      );
    });

    select.value = state.clinicaSelecionada;

  }
  /* ---------------------------------------------------------------
     RENDER: KPIs
  --------------------------------------------------------------- */
  function renderKPIs(state) {
    const radId = state.radiologiaSelecionada;
    const types  = getExamTypes(radId);
    const total  = Object.values(types).reduce((s, v) => s + v, 0);
    const topEntry = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    const topType  = topEntry ? topEntry[0] : '--';
    const topQtd   = topEntry ? topEntry[1] : 0;
    const DIAS_UTEIS = 22;
    const mediaDia = total / DIAS_UTEIS;

    let pctRef;
    if (radId === 'all') {
      const allDrs = MockData.getAllDoctorsFlat();
      const totalExAll = allDrs.reduce((s, d) => s + d.exames, 0);
      pctRef = Object.entries(REFERENCED_PCT_BY_RAD).reduce((acc, [rId, pct]) => {
        const radTotal = allDrs.filter(d => d.radiologiaId === rId).reduce((s, d) => s + d.exames, 0);
        return acc + (pct * radTotal / totalExAll);
      }, 0);
    } else {
      pctRef = REFERENCED_PCT_BY_RAD[radId] || 0;
    }

    const variation  = VARIATION_BY_RAD[radId] || 0;
    const nomeRad    = MockData.nomeRadiologiaPorId[radId];
    const labelPer   = MockData.labelPeriodo(state.periodo);

    const subtitleEl = document.getElementById('examsSectionSubtitle');
    if (subtitleEl) subtitleEl.textContent = `${nomeRad} — ${labelPer}`;

    const kpiTotal = document.getElementById('examKpiTotal');
    if (kpiTotal) {
      kpiTotal.querySelector('[data-field="value"]').textContent = formatNumber(total);
      const changeEl = kpiTotal.querySelector('[data-field="change"]');
      const isPos = variation >= 0;
      changeEl.textContent = `${isPos ? '▲' : '▼'} ${isPos ? '+' : ''}${variation.toFixed(1)}%`;
      changeEl.className = `kpi-card__change ${isPos ? 'is-positive' : 'is-negative'}`;
    }
    const kpiAvg = document.getElementById('examKpiAvgDay');
    if (kpiAvg) kpiAvg.querySelector('[data-field="value"]').textContent = mediaDia.toFixed(1).replace('.', ',');

    const kpiTop = document.getElementById('examKpiTopType');
    if (kpiTop) {
      kpiTop.querySelector('[data-field="value"]').textContent = topType;
      kpiTop.querySelector('[data-field="context"]').textContent = `${formatNumber(topQtd)} exames no período`;
    }
    const kpiRef = document.getElementById('examKpiReferenced');
    if (kpiRef) kpiRef.querySelector('[data-field="value"]').textContent = `${pctRef.toFixed(1).replace('.', ',')}%`;
  }

  /* ---------------------------------------------------------------
     RENDER: Gráfico de Pizza
  --------------------------------------------------------------- */
  function renderPieChart(state) {
    const ctx = document.getElementById('examTypeChart');
    if (!ctx) return;
    const types  = getExamTypes(state.radiologiaSelecionada);
    const labels = Object.keys(types);
    const values = Object.values(types);
    const total  = values.reduce((s, v) => s + v, 0);
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
  function renderDoctorsSpotlight(state) {

    const grid = document.getElementById('examsDoctorsGrid');
    const subtitle = document.getElementById('examsDoctorsSpotlightSubtitle');

    if (!grid) return;

    const radId = state.radiologiaSelecionada;
    const isAll = radId === 'all';

    const doctorsData = getDoctorsData(
      radId,
      state.clinicaSelecionada
    );

    const doctors =
      (radId === 'all' && state.clinicaSelecionada === 'all')
        ? doctorsData.slice(0, 5)
        : doctorsData;

    if (subtitle) {
      subtitle.textContent = isAll
        ? 'Exames solicitados por médicos de todas as radiologias'
        : `Exames solicitados por médicos • ${MockData.nomeRadiologiaPorId[radId]}`;
    }

    grid.innerHTML = '';

    doctors.forEach(doc => {

      const initials = getInitials(doc.nome);

      const exams = [...(DOCTOR_EXAM_TYPES[doc.id] || [{
          tipo: 'Sem dados',
          exames: 0
      }])];

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
            title="${doc.nome}">
            ${doc.nome}
          </span>

          <span
            class="doctor-spotlight-card__clinic"
            title="${doc.clinica}">
            ${doc.clinica}${isAll ? ` · ${doc.radiologia}` : ''}
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
    const li  = document.createElement('li');
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

  function renderRankLists(state) {
    const radId   = state.radiologiaSelecionada;
    const isAll   = radId === 'all';
    const clinics = getClinicsData(radId);
    const doctors = getDoctorsData(radId);
    const totalClinicas = clinics.reduce((s, c) => s + c.exames, 0);
    const totalMedicos  = doctors.reduce((s, d) => s + d.exames, 0);

    const subEl = document.getElementById('examsListsSubtitle');
    if (subEl) subEl.textContent = isAll ? 'Top clínicas e médicos — todas as radiologias' : `Top clínicas e médicos — ${MockData.nomeRadiologiaPorId[radId]}`;

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
      clinics.forEach((c, i) => clinicsList.appendChild(buildRankItem(c.nome, isAll ? c.radiologia : null, c.exames, totalClinicas, TYPE_COLORS[i % TYPE_COLORS.length])));
    }

    const doctorsList = document.getElementById('examsDoctorsRankList');
    if (doctorsList) {
      doctorsList.innerHTML = '';
      doctors.forEach((d, i) => doctorsList.appendChild(buildRankItem(d.nome, isAll ? `${d.clinica} · ${d.radiologia}` : d.clinica, d.exames, totalMedicos, TYPE_COLORS[i % TYPE_COLORS.length])));
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

  function renderHighlights(state) {
    const radId   = state.radiologiaSelecionada;
    const isAll   = radId === 'all';
    const grid    = document.getElementById('examsHighlightsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const doctors = getDoctorsData(radId);
    const clinics = getClinicsData(radId);
    const types   = getExamTypes(radId);

    const topDoc = doctors[0];
    grid.appendChild(buildHighlightBox(
      isAll ? 'Médico destaque' : 'Maior volume',
      topDoc ? topDoc.nome : '--',
      topDoc ? `${formatNumber(topDoc.exames)} exames${isAll ? ` · ${topDoc.clinica}` : ''}` : 'Sem dados'
    ));

    const topClinic = clinics[0];
    grid.appendChild(buildHighlightBox(
      'Clínica líder',
      topClinic ? topClinic.nome : '--',
      topClinic ? `${formatNumber(topClinic.exames)} exames no período` : 'Sem dados'
    ));

    const sortedTypes = Object.entries(types).sort((a, b) => b[1] - a[1]);
    const risingEntry = sortedTypes[1] || sortedTypes[0];
    const topEntry    = sortedTypes[0];
    const risingPct   = topEntry && topEntry[1] > 0 ? ((risingEntry[1] / topEntry[1]) * 100).toFixed(0) : '0';
    grid.appendChild(buildHighlightBox(
      'Tipo em destaque',
      risingEntry ? risingEntry[0] : '--',
      risingEntry ? `${formatNumber(risingEntry[1])} exames · ${risingPct}% do líder` : 'Sem dados'
    ));

    const secondDoc = doctors[1];
    grid.appendChild(buildHighlightBox(
      isAll ? 'Crescimento no período' : 'Destaque em Tomografia',
      isAll ? `+${VARIATION_BY_RAD['all'].toFixed(1)}% exames` : (secondDoc ? secondDoc.nome : '--'),
      isAll ? 'vs. período anterior em todas as unidades' : (secondDoc ? `${formatNumber(secondDoc.exames)} exames · ${secondDoc.clinica}` : 'Sem dados')
    ));
  }

  /* ---------------------------------------------------------------
     RENDER GERAL
  --------------------------------------------------------------- */
  function render(state) {
    renderKPIs(state);
    renderPieChart(state);
    renderDoctorClinicFilter(state);
    renderDoctorsSpotlight(state);
    renderRankLists(state);
    renderHighlights(state);
  }

  function init() {

    render(AppState.getState());
    AppState.subscribe(render);
    const doctorClinicFilter = document.getElementById('doctorClinicFilter');
    if (doctorClinicFilter) {
      doctorClinicFilter.addEventListener('change', (e) => {
        AppState.update({
          clinicaSelecionada: e.target.value
        });

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
    const toggle  = document.getElementById('sidebarToggle');
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
});