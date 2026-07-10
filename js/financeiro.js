/* =============================================================
   IORD — Financeiro | financeiro.js
   -------------------------------------------------------------
   Arquitetura: IIFE modular, sem dependências externas além
   de Chart.js (já carregado no HTML).

   Mock data estruturado para espelhar o shape futuro da API
   REST. Cada seção marcada com:
     // [API] GET /endpoint → shape esperado
   para facilitar a substituição futura.

   Módulos:
     1.  Config & Constantes
     2.  Mock Data
     3.  State (estado global reativo)
     4.  Helpers (formatação, datas, cálculos)
     5.  ChartFactory (configurações base do Chart.js)
     6.  Module: Filtros (radiologia + período)
     7.  Module: Tabs (navegação por abas)
     8.  Module: VisaoGeral (KPIs + gráficos + tabelas + insights)
     9.  Module: Comissoes (KPIs + tree table + gráficos)
    10.  Module: Metas (KPIs + tabelas editáveis + simulador)
    11.  Module: Relatorios (cards + custom report + histórico)
    12.  Module: Modais (pagamento + meta)
    13.  Bootstrap (inicialização)
============================================================= */

(function () {
  'use strict';

  /* ===========================================================
     1. CONFIG & CONSTANTES
  =========================================================== */
  const CFG = {
    colors: {
      primary:      '#018093',
      primaryLight: '#01C6BF',
      primaryDark:  '#015A68',
      primary50:    '#EAF6F6',
      primary100:   '#D2ECEC',
      positive:     '#0E8F63',
      positiveBg:   '#E6F6EF',
      negative:     '#C23B32',
      negativeBg:   '#FCEBEA',
      warning:      '#B27A0E',
      warningBg:    '#FCF3E1',
      text:         '#273237',
      textMuted:    '#5C6E72',
      textSubtle:   '#8B9C9F',
      border:       '#E7ECED',
      surface:      '#FFFFFF',
      surfaceMuted: '#F3F7F7',
    },
    chartDefaults: {
      fontFamily: "'Inter', sans-serif",
      monoFamily: "'IBM Plex Mono', monospace",
    },
    radiologies: [
      { id: 'all',    label: 'Todas as Radiologias' },
      { id: 'centro', label: 'Radiologia Centro'     },
      { id: 'norte',  label: 'Radiologia Zona Norte' },
      { id: 'sul',    label: 'Radiologia Zona Sul'   },
      { id: 'leste',  label: 'Radiologia Zona Leste' },
    ],
    periods: {
      mes_atual:   'Mês Atual',
      ultimos_30:  'Últimos 30 Dias',
      trimestre:   'Trimestre',
      semestre:    'Semestre',
      ano:         'Ano',
      custom:      'Personalizado',
    },
    reportColumns: [
      'Faturamento Total', 'Faturamento Líquido', 'Margem de Lucro',
      'Total de Exames', 'Ticket Médio', 'Comissões Devidas',
      'Comissões Pagas', 'Comissões Pendentes', 'Meta Mensal',
      '% Meta Atingida', 'Top Clínica', 'Top Médico',
    ],
  };

  // Paleta de séries para gráficos multi-radiologia
  const SERIES_COLORS = [
    CFG.colors.primary,
    CFG.colors.primaryLight,
    '#F5A623',
    '#7B68EE',
    '#E05C5C',
  ];

  /* ===========================================================
     2. MOCK DATA
     Shape espelha o que a API REST irá retornar.
     [API] GET /financeiro?radiologia=:id&periodo=:periodo
  =========================================================== */

  // Meses para eixo X dos gráficos de evolução
  const MONTHS_12 = ['Ago/24','Set/24','Out/24','Nov/24','Dez/24','Jan/25','Fev/25','Mar/25','Abr/25','Mai/25','Jun/25','Jul/25'];
  const MONTHS_6  = ['Fev/25','Mar/25','Abr/25','Mai/25','Jun/25','Jul/25'];

  // [API] GET /financeiro/kpis
  const MOCK_KPIS = {
    faturamentoTotal:    { value: 284750, changeMonth: 12.4,  changeYoY: 23.8 },
    faturamentoLiquido:  { value: 241637, context: 'após comissões' },
    margemLucro:         { value: 84.9,   changeMonth: 1.2 },
    totalExames:         { value: 1847,   changeMonth: 8.7 },
    ticketMedio:         { value: 154.18, changeMonth: 3.4 },
    previsao30d:         { value: 301200, forecast60d: 589400 },
  };

  // [API] GET /financeiro/evolucao?periodo=12m
  const MOCK_EVOLUCAO = {
    labels: MONTHS_12,
    faturamento:    [198400, 211200, 224800, 241300, 198700, 173200, 187400, 231800, 248200, 267400, 271900, 284750],
    exames:         [1284,   1342,   1418,   1521,   1287,   1122,   1214,   1487,   1603,   1728,   1761,   1847],
    faturamentoAno: [162000, 178400, 188900, 201700, 167200, 144800, 159200, 196400, 211300, 232100, 243700, 256800],
  };

  // [API] GET /financeiro/por-radiologia
  const MOCK_POR_RADIOLOGIA = [
    { id: 'centro', label: 'Centro',     faturamento: 97820,  exames: 634, variacao: 14.2, participacao: 34.3 },
    { id: 'norte',  label: 'Zona Norte', faturamento: 78340,  exames: 509, variacao: 9.8,  participacao: 27.5 },
    { id: 'sul',    label: 'Zona Sul',   faturamento: 63410,  exames: 411, variacao: -3.1, participacao: 22.3 },
    { id: 'leste',  label: 'Zona Leste', faturamento: 45180,  exames: 293, variacao: 18.7, participacao: 15.9 },
  ];

  // [API] GET /financeiro/top-clinicas?limit=10
  const MOCK_TOP_CLINICAS = [
    { nome: 'Clínica OdontoPremium', faturamento: 47320, participacao: 16.6 },
    { nome: 'Sorriso Perfeito',      faturamento: 38410, participacao: 13.5 },
    { nome: 'DentalVip',             faturamento: 29870, participacao: 10.5 },
    { nome: 'OrthoCenter',           faturamento: 24150, participacao:  8.5 },
    { nome: 'Clínica Raíz',          faturamento: 20340, participacao:  7.1 },
    { nome: 'BocaSana',             faturamento: 17820, participacao:  6.3 },
    { nome: 'Implanto RN',           faturamento: 14430, participacao:  5.1 },
    { nome: 'SorriRN',               faturamento: 11270, participacao:  4.0 },
    { nome: 'Estética Oral',         faturamento:  9840, participacao:  3.5 },
    { nome: 'Clínica Central',       faturamento:  7620, participacao:  2.7 },
  ];

  // [API] GET /financeiro/top-medicos?limit=15
  const MOCK_TOP_MEDICOS = [
    { nome: 'Dr. Thiago Almeida',    clinica: 'OdontoPremium',  exames: 184, faturamento: 28380, comissao: 15, comissaoEstimada: 4257 },
    { nome: 'Dra. Carla Menezes',    clinica: 'Sorriso Perfeito',exames: 162, faturamento: 24970, comissao: 15, comissaoEstimada: 3746 },
    { nome: 'Dr. Rafael Lima',       clinica: 'DentalVip',       exames: 148, faturamento: 22820, comissao: 12, comissaoEstimada: 2738 },
    { nome: 'Dra. Juliana Costa',    clinica: 'OrthoCenter',     exames: 137, faturamento: 21130, comissao: 15, comissaoEstimada: 3170 },
    { nome: 'Dr. Bruno Figueiredo',  clinica: 'Clínica Raíz',    exames: 124, faturamento: 19110, comissao: 10, comissaoEstimada: 1911 },
    { nome: 'Dra. Patrícia Souza',   clinica: 'BocaSana',       exames: 118, faturamento: 18190, comissao: 15, comissaoEstimada: 2729 },
    { nome: 'Dr. André Nascimento',  clinica: 'Implanto RN',     exames: 109, faturamento: 16810, comissao: 12, comissaoEstimada: 2017 },
    { nome: 'Dra. Fernanda Rocha',   clinica: 'SorriRN',         exames:  98, faturamento: 15110, comissao: 15, comissaoEstimada: 2267 },
    { nome: 'Dr. Marcos Vinicius',   clinica: 'Estética Oral',   exames:  91, faturamento: 14030, comissao: 10, comissaoEstimada: 1403 },
    { nome: 'Dra. Bianca Torres',    clinica: 'Clínica Central', exames:  84, faturamento: 12950, comissao: 15, comissaoEstimada: 1943 },
    { nome: 'Dr. Lucas Barros',      clinica: 'OdontoPremium',   exames:  79, faturamento: 12180, comissao: 12, comissaoEstimada: 1462 },
    { nome: 'Dra. Amanda Ferreira',  clinica: 'Sorriso Perfeito',exames:  73, faturamento: 11250, comissao: 15, comissaoEstimada: 1688 },
    { nome: 'Dr. Henrique Dias',     clinica: 'DentalVip',       exames:  67, faturamento: 10330, comissao: 10, comissaoEstimada: 1033 },
    { nome: 'Dra. Priscila Lemos',   clinica: 'OrthoCenter',     exames:  62, faturamento:  9560, comissao: 15, comissaoEstimada: 1434 },
    { nome: 'Dr. Eduardo Pinto',     clinica: 'Clínica Raíz',    exames:  57, faturamento:  8790, comissao: 12, comissaoEstimada: 1055 },
  ];

  // [API] GET /financeiro/tipos-exame
  const MOCK_TIPOS_EXAME = [
    { tipo: 'Panorâmica',      quantidade: 612, participacao: 33.1 },
    { tipo: 'Periapical',      quantidade: 441, participacao: 23.9 },
    { tipo: 'Bite-wing',       quantidade: 295, participacao: 16.0 },
    { tipo: 'Cefalométrica',   quantidade: 221, participacao: 12.0 },
    { tipo: 'CBCT (3D)',       quantidade: 148, participacao:  8.0 },
    { tipo: 'Oclusal',         quantidade:  87, participacao:  4.7 },
    { tipo: 'Outros',          quantidade:  43, participacao:  2.3 },
  ];

  // [API] GET /financeiro/ticket-medio-por-radiologia
  const MOCK_TICKET_MEDIO = {
    labels: CFG.radiologies.filter(r => r.id !== 'all').map(r => r.label.replace('Radiologia ', '')),
    atual:     [154.3, 153.9, 154.3, 154.2],
    anterior:  [141.2, 148.1, 145.7, 137.8],
  };

  // [API] GET /comissoes?periodo=:periodo&radiologia=:id
  const MOCK_COMISSOES_KPIS = {
    totalDevido:   { value: 43113 },
    totalPago:     { value: 29847, percentual: 69.2 },
    pendente:      { value: 13266, medicos: 7 },
    percentPago:   { value: 69.2 },
    mediaPorMedico:{ value: 2874 },
  };

  // [API] GET /comissoes/hierarquia
  const MOCK_COMISSOES_TREE = [
    {
      id: 'radio-centro',
      nome: 'Radiologia Centro',
      exames: 634, faturamento: 97820, comissaoDevida: 14673, pago: 10200, pendente: 4473,
      clinicas: [
        {
          id: 'cli-odonto',
          nome: 'OdontoPremium',
          exames: 184, faturamento: 28380, comissaoDevida: 4257, pago: 4257, pendente: 0,
          medicos: [
            { id: 'med-1', nome: 'Dr. Thiago Almeida', exames: 118, faturamento: 18190, percComissao: 15, comissaoDevida: 2729, pago: 2729, pendente: 0,    status: 'paid'    },
            { id: 'med-2', nome: 'Dr. Lucas Barros',   exames:  66, faturamento: 10190, percComissao: 12, comissaoDevida: 1223, pago: 1223, pendente: 0,    status: 'paid'    },
          ],
        },
        {
          id: 'cli-sorriso',
          nome: 'Sorriso Perfeito',
          exames: 162, faturamento: 24970, comissaoDevida: 3746, pago: 1873, pendente: 1873,
          medicos: [
            { id: 'med-3', nome: 'Dra. Carla Menezes',   exames:  98, faturamento: 15110, percComissao: 15, comissaoDevida: 2267, pago: 1134, pendente: 1133, status: 'partial' },
            { id: 'med-4', nome: 'Dra. Amanda Ferreira', exames:  64, faturamento:  9860, percComissao: 15, comissaoDevida: 1479, pago:  739, pendente:  740, status: 'partial' },
          ],
        },
        {
          id: 'cli-implanto',
          nome: 'Implanto RN',
          exames: 109, faturamento: 16810, comissaoDevida: 2017, pago: 0, pendente: 2017,
          medicos: [
            { id: 'med-5', nome: 'Dr. André Nascimento', exames: 109, faturamento: 16810, percComissao: 12, comissaoDevida: 2017, pago: 0, pendente: 2017, status: 'pending' },
          ],
        },
        {
          id: 'cli-dental',
          nome: 'DentalVip',
          exames: 179, faturamento: 27660, comissaoDevida: 4653, pago: 4070, pendente: 583,
          medicos: [
            { id: 'med-6', nome: 'Dr. Rafael Lima',    exames: 112, faturamento: 17280, percComissao: 12, comissaoDevida: 2074, pago: 2074, pendente: 0,   status: 'paid'    },
            { id: 'med-7', nome: 'Dr. Henrique Dias',  exames:  67, faturamento: 10380, percComissao: 10, comissaoDevida: 1038, pago:  455, pendente: 583, status: 'partial' },
          ],
        },
      ],
    },
    {
      id: 'radio-norte',
      nome: 'Radiologia Zona Norte',
      exames: 509, faturamento: 78340, comissaoDevida: 11751, pago: 8814, pendente: 2937,
      clinicas: [
        {
          id: 'cli-ortho',
          nome: 'OrthoCenter',
          exames: 199, faturamento: 30690, comissaoDevida: 4604, pago: 3170, pendente: 1434,
          medicos: [
            { id: 'med-8',  nome: 'Dra. Juliana Costa',  exames: 137, faturamento: 21130, percComissao: 15, comissaoDevida: 3170, pago: 3170, pendente: 0,    status: 'paid'    },
            { id: 'med-9',  nome: 'Dra. Priscila Lemos', exames:  62, faturamento:  9560, percComissao: 15, comissaoDevida: 1434, pago:    0, pendente: 1434, status: 'pending' },
          ],
        },
        {
          id: 'cli-raiz',
          nome: 'Clínica Raíz',
          exames: 181, faturamento: 27900, comissaoDevida: 2966, pago: 2911, pendente: 55,
          medicos: [
            { id: 'med-10', nome: 'Dr. Bruno Figueiredo', exames: 124, faturamento: 19110, percComissao: 10, comissaoDevida: 1911, pago: 1911, pendente:  0,  status: 'paid'    },
            { id: 'med-11', nome: 'Dr. Eduardo Pinto',    exames:  57, faturamento:  8790, percComissao: 12, comissaoDevida: 1055, pago: 1000, pendente: 55,  status: 'partial' },
          ],
        },
        {
          id: 'cli-sorrirn',
          nome: 'SorriRN',
          exames: 129, faturamento: 19750, comissaoDevida: 4181, pago: 2733, pendente: 1448,
          medicos: [
            { id: 'med-12', nome: 'Dra. Fernanda Rocha', exames:  98, faturamento: 15110, percComissao: 15, comissaoDevida: 2267, pago: 2267, pendente:    0, status: 'paid'    },
            { id: 'med-13', nome: 'Dra. Bianca Torres',  exames:  84, faturamento: 12950, percComissao: 15, comissaoDevida: 1943, pago:  733, pendente: 1448, status: 'partial' },
          ],
        },
      ],
    },
    {
      id: 'radio-sul',
      nome: 'Radiologia Zona Sul',
      exames: 411, faturamento: 63410, comissaoDevida: 9512, pago: 7609, pendente: 1903,
      clinicas: [
        {
          id: 'cli-bocasana',
          nome: 'BocaSana',
          exames: 230, faturamento: 35460, comissaoDevida: 5319, pago: 5319, pendente: 0,
          medicos: [
            { id: 'med-14', nome: 'Dra. Patrícia Souza',  exames: 118, faturamento: 18190, percComissao: 15, comissaoDevida: 2729, pago: 2729, pendente: 0, status: 'paid' },
            { id: 'med-15', nome: 'Dr. Marcos Vinicius',  exames:  91, faturamento: 14030, percComissao: 10, comissaoDevida: 1403, pago: 1403, pendente: 0, status: 'paid' },
            { id: 'med-16', nome: 'Dra. Célia Brandão',   exames:  21, faturamento:  3240, percComissao: 15, comissaoDevida:  486, pago:  486, pendente: 0, status: 'paid' },
          ],
        },
        {
          id: 'cli-estetica',
          nome: 'Estética Oral',
          exames: 181, faturamento: 27950, comissaoDevida: 4193, pago: 2290, pendente: 1903,
          medicos: [
            { id: 'med-17', nome: 'Dr. Rodrigo Maia',   exames:  90, faturamento: 13880, percComissao: 15, comissaoDevida: 2082, pago: 2082, pendente:    0, status: 'paid'    },
            { id: 'med-18', nome: 'Dra. Sabrina Dutra', exames:  91, faturamento: 14070, percComissao: 15, comissaoDevida: 2111, pago:  208, pendente: 1903, status: 'partial' },
          ],
        },
      ],
    },
    {
      id: 'radio-leste',
      nome: 'Radiologia Zona Leste',
      exames: 293, faturamento: 45180, comissaoDevida: 6777, pago: 3224, pendente: 3553,
      clinicas: [
        {
          id: 'cli-central',
          nome: 'Clínica Central',
          exames: 146, faturamento: 22530, comissaoDevida: 3380, pago: 3380, pendente: 0,
          medicos: [
            { id: 'med-19', nome: 'Dra. Bianca Torres',   exames:  84, faturamento: 12950, percComissao: 15, comissaoDevida: 1943, pago: 1943, pendente: 0, status: 'paid' },
            { id: 'med-20', nome: 'Dr. Fábio Cavalcante', exames:  62, faturamento:  9580, percComissao: 15, comissaoDevida: 1437, pago: 1437, pendente: 0, status: 'paid' },
          ],
        },
        {
          id: 'cli-nova',
          nome: 'Nova Odonto',
          exames: 147, faturamento: 22650, comissaoDevida: 3397, pago: -156, pendente: 3553,
          medicos: [
            { id: 'med-21', nome: 'Dr. Yuri Monteiro',   exames: 89, faturamento: 13730, percComissao: 15, comissaoDevida: 2060, pago: 0, pendente: 2060, status: 'pending' },
            { id: 'med-22', nome: 'Dra. Leila Azevedo',  exames: 58, faturamento:  8920, percComissao: 15, comissaoDevida: 1338, pago: 0, pendente: 1493, status: 'pending' },
          ],
        },
      ],
    },
  ];

  // [API] GET /comissoes/evolucao?periodo=6m
  const MOCK_COMM_EVOLUCAO = {
    labels: MONTHS_6,
    pagas:    [28400, 31200, 27800, 33400, 30100, 29847],
    pendentes: [9800, 11400, 8200, 14300, 11700, 13266],
  };

  // [API] GET /metas
  const MOCK_METAS = {
    mensal:    { meta: 300000, realizado: 284750 },
    anual:     { meta: 3200000, realizado: 2317400 },
    porRadiologia: [
      { id: 'centro', nome: 'Centro',     meta: 110000, anual: 1200000, realizado: 97820,  anoRealizado: 812000 },
      { id: 'norte',  nome: 'Zona Norte', meta:  85000, anual:  900000, realizado: 78340,  anoRealizado: 648000 },
      { id: 'sul',    nome: 'Zona Sul',   meta:  70000, anual:  700000, realizado: 63410,  anoRealizado: 541200 },
      { id: 'leste',  nome: 'Zona Leste', meta:  55000, anual:  400000, realizado: 45180,  anoRealizado: 316200 },
    ],
  };

  // [API] GET /metas/historico
  const MOCK_HISTORICO_AJUSTES = [
    { data: '2025-07-01', tipo: 'Meta',     descricao: 'Meta Mensal Geral',          anterior: 'R$ 280.000', novo: 'R$ 300.000', responsavel: 'Dr. Iago' },
    { data: '2025-07-01', tipo: 'Comissão', descricao: 'Comissão — Dr. Rafael Lima', anterior: '15%',         novo: '12%',        responsavel: 'Dr. Iago' },
    { data: '2025-06-15', tipo: 'Meta',     descricao: 'Meta — Zona Leste',          anterior: 'R$ 42.000',  novo: 'R$ 55.000',  responsavel: 'Dr. Iago' },
    { data: '2025-06-10', tipo: 'Comissão', descricao: 'Taxa padrão',                anterior: '12%',         novo: '15%',        responsavel: 'Dr. Iago' },
    { data: '2025-05-20', tipo: 'Meta',     descricao: 'Meta Anual Geral',           anterior: 'R$ 2.800.000',novo: 'R$ 3.200.000',responsavel: 'Dr. Iago'},
  ];

  // [API] GET /relatorios/historico
  const MOCK_HISTORICO_RELATORIOS = [
    { nome: 'Relatório Geral de Faturamento', periodo: 'Jun/2025', radiologia: 'Todas', geradoEm: '2025-07-01 08:42', formato: 'PDF'   },
    { nome: 'Relatório de Comissões',          periodo: 'Jun/2025', radiologia: 'Centro', geradoEm: '2025-06-30 17:15', formato: 'Excel' },
    { nome: 'Metas vs. Realizado',             periodo: 'Jun/2025', radiologia: 'Todas', geradoEm: '2025-06-29 14:30', formato: 'PDF'   },
    { nome: 'Relatório por Médico',            periodo: 'Mai/2025', radiologia: 'Todas', geradoEm: '2025-06-05 09:10', formato: 'CSV'   },
    { nome: 'Relatório Completo do Período',   periodo: 'T2/2025',  radiologia: 'Todas', geradoEm: '2025-06-01 11:00', formato: 'PDF'   },
  ];


  /* ===========================================================
     3. STATE (estado global)
  =========================================================== */
  const State = {
    radiologia: 'all',
    periodo:    'mes_atual',
    activeTab:  'visao-geral',
    customStart: null,
    customEnd:   null,
    selectedForPayment: [], // IDs de médicos selecionados para pagamento em lote
    commSearch: '',
    commStatusFilter: 'todas',
    charts: {},             // instâncias Chart.js { id: ChartInstance }
    goalEditing: null,      // id da radiologia sendo editada na modal
    commRateEdits: {},      // { medId: novaPercentagem }
    goalEdits: {},          // { radioId: { meta, anual } }
  };


  /* ===========================================================
     4. HELPERS
  =========================================================== */
  const H = {
    /** Formata número como moeda BRL */
    currency(val) {
      if (val === null || val === undefined) return 'R$ --';
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
    },

    /** Formata número com casas decimais */
    number(val, decimals = 0) {
      return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val);
    },

    /** Formata percentual */
    percent(val, decimals = 1) {
      return `${H.number(val, decimals)}%`;
    },

    /** Badge de variação positiva/negativa */
    changeBadge(pct) {
      const cls = pct > 0 ? 'change-badge--positive' : pct < 0 ? 'change-badge--negative' : 'change-badge--neutral';
      const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '—';
      return `<span class="change-badge ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
    },

    /** Badge de status de comissão */
    statusBadge(status) {
      const map = {
        paid:    { cls: 'status-badge--paid',    label: 'Pago'    },
        pending: { cls: 'status-badge--pending', label: 'Pendente' },
        partial: { cls: 'status-badge--partial', label: 'Parcial'  },
      };
      const s = map[status] || map.pending;
      return `<span class="status-badge ${s.cls}">${s.label}</span>`;
    },

    /** Badge de formato de relatório */
    formatBadge(fmt) {
      const cls = fmt === 'PDF' ? 'format-badge--pdf' : fmt === 'Excel' ? 'format-badge--excel' : 'format-badge--csv';
      return `<span class="format-badge ${cls}">${fmt}</span>`;
    },

    /** Barra de progresso inline para tabelas */
    inlineProgress(pct) {
      const cls = pct >= 80 ? '' : pct >= 50 ? 'inline-progress__fill--warning' : 'inline-progress__fill--danger';
      return `
        <div class="inline-progress">
          <div class="inline-progress__bar">
            <div class="inline-progress__fill ${cls}" style="width:${Math.min(pct,100)}%"></div>
          </div>
          <span class="inline-progress__label">${H.percent(pct)}</span>
        </div>`;
    },

    /** Destroi um chart Chart.js existente */
    destroyChart(id) {
      if (State.charts[id]) {
        State.charts[id].destroy();
        delete State.charts[id];
      }
    },

    /** Retorna cor de SERIES_COLORS por index */
    seriesColor(i, alpha = 1) {
      const hex = SERIES_COLORS[i % SERIES_COLORS.length];
      if (alpha === 1) return hex;
      const r = parseInt(hex.slice(1,3),16);
      const g = parseInt(hex.slice(3,5),16);
      const b = parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    },

    /** Filtra dados do mock pela radiologia selecionada */
    filteredRadiologies() {
      if (State.radiologia === 'all') return MOCK_POR_RADIOLOGIA;
      return MOCK_POR_RADIOLOGIA.filter(r => r.id === State.radiologia);
    },

    /** Filtra tree de comissões pela radiologia */
    filteredCommTree() {
      if (State.radiologia === 'all') return MOCK_COMISSOES_TREE;
      return MOCK_COMISSOES_TREE.filter(r => r.id === `radio-${State.radiologia}`);
    },

    /** Data atual formatada para input date */
    today() {
      return new Date().toISOString().split('T')[0];
    },

    /** Formata data ISO para pt-BR */
    formatDate(iso) {
      if (!iso) return '--';
      const [y, m, d] = iso.split(/[-T ]/);
      return `${d}/${m}/${y}`;
    },

    /** Formata datetime ISO para pt-BR */
    formatDateTime(iso) {
      if (!iso) return '--';
      const parts = iso.split(' ');
      return `${H.formatDate(parts[0])} ${parts[1] || ''}`.trim();
    },

    /** Emite toast de feedback (não-bloqueante) */
    toast(msg, type = 'info') {
      let el = document.getElementById('iord-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'iord-toast';
        el.style.cssText = `
          position:fixed;bottom:24px;right:24px;z-index:9999;
          background:var(--color-text);color:var(--color-bg);
          padding:12px 20px;border-radius:10px;font-size:0.8125rem;
          font-weight:600;box-shadow:0 8px 24px -6px rgba(19,39,43,0.3);
          transition:opacity 0.3s,transform 0.3s;pointer-events:none;
          max-width:320px;line-height:1.5;
        `;
        document.body.appendChild(el);
      }
      if (type === 'success') el.style.background = CFG.colors.positive;
      else if (type === 'error') el.style.background = CFG.colors.negative;
      else el.style.background = CFG.colors.text;

      el.textContent = msg;
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      clearTimeout(el._t);
      el._t = setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
      }, 3000);
    },
  };


  /* ===========================================================
     5. CHART FACTORY
     Configurações base e builders para cada tipo de gráfico.
  =========================================================== */
  const ChartFactory = {
    defaults() {
      Chart.defaults.font.family = CFG.chartDefaults.fontFamily;
      Chart.defaults.color      = CFG.colors.textMuted;
      Chart.defaults.borderColor = CFG.colors.border;
      Chart.defaults.plugins.legend.display = false;
      Chart.defaults.plugins.tooltip.enabled = false; // usamos tooltips custom
      Chart.defaults.animation.duration = 500;
      Chart.defaults.animation.easing   = 'easeOutQuart';
    },

    /** Tooltip customizado usando HTML externo — versão enriquecida do Financeiro */
    externalTooltip(context) {
        const { chart, tooltip } = context;

        let el = document.body.querySelector('.chartjs-tooltip');
        
        if (!el) {
            el = document.createElement('div');
            el.className = 'chartjs-tooltip';
            el.innerHTML = '<div class="cjs-tooltip__inner"></div>';
            el.style.opacity = '0';
            el.style.position = 'fixed';
            el.style.pointerEvents = 'none';
            el.style.zIndex = '9999';
            el.style.transition = 'opacity 0.15s ease';
            document.body.appendChild(el);
        }

        // Remove classes de variante anteriores
        el.classList.remove('chartjs-tooltip--compact', 'chartjs-tooltip--wide');

        if (tooltip.opacity === 0) {
            el.style.opacity = '0';
            return;
        }

        const inner = el.querySelector('.cjs-tooltip__inner');
        const dp = tooltip.dataPoints?.[0];
        if (!dp) { el.style.opacity = '0'; return; }

        const canvasId = chart.canvas.id;
        const label = tooltip.title?.[0] || '';
        let html = '';

        // ------------------------------------------------------------------
        // GRÁFICO: Evolução Mensal — mostra faturamento + variação + exames
        // ------------------------------------------------------------------
        if (canvasId === 'evolutionChart') {
            const fatPoint = tooltip.dataPoints.find(p => p.dataset.label === 'Faturamento');
            const antPoint = tooltip.dataPoints.find(p => p.dataset.label === 'Mesmo período ano anterior');
            const exPoint  = tooltip.dataPoints.find(p => p.dataset.label === 'Exames');

            if (fatPoint) {
            const fatVal = fatPoint.raw;
            const antVal = antPoint ? antPoint.raw : null;
            let changeHtml = '';
            if (antVal !== null && antVal > 0) {
                const pct = ((fatVal - antVal) / antVal * 100);
                const cls = pct > 0 ? 'cjs-tooltip__change--up' : pct < 0 ? 'cjs-tooltip__change--down' : 'cjs-tooltip__change--flat';
                const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '—';
                changeHtml = `
                <div class="cjs-tooltip__change-row">
                    <span class="cjs-tooltip__change ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>
                    <span class="cjs-tooltip__change-context">vs. ano anterior</span>
                </div>`;
            }

            html = `
                <div class="cjs-tooltip__eyebrow">${label}</div>
                <div class="cjs-tooltip__headline">
                <span class="cjs-tooltip__headline-label">
                    <span class="cjs-tooltip__dot" style="background:${CFG.colors.primary}"></span>Faturamento
                </span>
                <span class="cjs-tooltip__headline-value">${H.currency(fatVal)}</span>
                </div>
                ${changeHtml}`;

            if (exPoint) {
                html += `
                <div class="cjs-tooltip__divider"></div>
                <div class="cjs-tooltip__metrics">
                    <div class="cjs-tooltip__metric">
                    <span class="cjs-tooltip__metric-label">
                        <span class="cjs-tooltip__dot cjs-tooltip__dot--sm" style="background:${CFG.colors.primaryLight}"></span>Exames
                    </span>
                    <span class="cjs-tooltip__metric-value">${H.number(exPoint.raw)}</span>
                    </div>
                    <div class="cjs-tooltip__metric">
                    <span class="cjs-tooltip__metric-label">Ticket médio</span>
                    <span class="cjs-tooltip__metric-value">${H.currency(Math.round(fatVal / Math.max(exPoint.raw, 1)))}</span>
                    </div>
                </div>`;
            }

            html += `<div class="cjs-tooltip__footer-note">Dados acumulados do mês</div>`;
            }
        }

        // ------------------------------------------------------------------
        // GRÁFICO: Por Radiologia — breakdown com barras de participação
        // ------------------------------------------------------------------
        else if (canvasId === 'byRadiologyChart') {
            const p = tooltip.dataPoints[0];
            const val = p.raw;
            const total = MOCK_POR_RADIOLOGIA.reduce((s, r) => s + r.faturamento, 0);
            const pct = total > 0 ? (val / total * 100) : 0;
            const radioData = MOCK_POR_RADIOLOGIA[p.dataIndex];
            const color = SERIES_COLORS[p.dataIndex % SERIES_COLORS.length];

            html = `
            <div class="cjs-tooltip__eyebrow">Radiologia</div>
            <div class="cjs-tooltip__headline">
                <span class="cjs-tooltip__headline-label">
                <span class="cjs-tooltip__dot" style="background:${color}"></span>${label}
                </span>
                <span class="cjs-tooltip__headline-value">${H.currency(val)}</span>
            </div>
            <div class="cjs-tooltip__divider"></div>
            <div class="cjs-tooltip__breakdown">
                <div class="cjs-tooltip__row">
                <div class="cjs-tooltip__row-top">
                    <span class="cjs-tooltip__row-label">Participação no total</span>
                    <div class="cjs-tooltip__row-right">
                    <span class="cjs-tooltip__row-value">${H.percent(pct)}</span>
                    </div>
                </div>
                <div class="cjs-tooltip__bar-track">
                    <div class="cjs-tooltip__bar-fill" style="width:${pct}%;background:${color}"></div>
                </div>
                </div>
            </div>
            <div class="cjs-tooltip__divider"></div>
            <div class="cjs-tooltip__metrics">
                <div class="cjs-tooltip__metric">
                <span class="cjs-tooltip__metric-label">Exames realizados</span>
                <span class="cjs-tooltip__metric-value">${radioData ? H.number(radioData.exames) : '--'}</span>
                </div>
                <div class="cjs-tooltip__metric">
                <span class="cjs-tooltip__metric-label">Ticket médio</span>
                <span class="cjs-tooltip__metric-value">${radioData ? H.currency(Math.round(val / Math.max(radioData.exames, 1))) : '--'}</span>
                </div>
                <div class="cjs-tooltip__metric">
                <span class="cjs-tooltip__metric-label">Variação mensal</span>
                <span class="cjs-tooltip__metric-value" style="color:${radioData && radioData.variacao >= 0 ? '#5EEAA4' : '#F58A83'}">${radioData ? (radioData.variacao >= 0 ? '+' : '') + H.percent(radioData.variacao) : '--'}</span>
                </div>
            </div>`;
        }

        // ------------------------------------------------------------------
        // GRÁFICO: Top Clínicas — faturamento + participação
        // ------------------------------------------------------------------
        
        // ------------------------------------------------------------------
        // GRÁFICO: Top Médicos — faturamento + comissão estimada
        // ------------------------------------------------------------------
        else if (canvasId === 'distribuicaoChart') {
            const p = tooltip.dataPoints[0];
            const val = p.raw;
            const filtered = H.filteredRadiologies();
            const total = filtered.reduce((s, r) => s + r.faturamento, 0);
            const pct = total > 0 ? (val / total * 100) : 0;
            const radioData = filtered[p.dataIndex];
            const color = p.dataset.backgroundColor instanceof Array
                ? p.dataset.backgroundColor[p.dataIndex]
                : p.dataset.backgroundColor;

            html = `
            <div class="cjs-tooltip__eyebrow">Radiologia</div>
            <div class="cjs-tooltip__headline">
                <span class="cjs-tooltip__headline-label">
                <span class="cjs-tooltip__dot" style="background:${color}"></span>${label}
                </span>
                <span class="cjs-tooltip__headline-value">${H.currency(val)}</span>
            </div>
            <div class="cjs-tooltip__breakdown">
                <div class="cjs-tooltip__row">
                <div class="cjs-tooltip__row-top">
                    <span class="cjs-tooltip__row-label">Participação no total</span>
                    <span class="cjs-tooltip__row-percent">${H.percent(pct)}</span>
                </div>
                <div class="cjs-tooltip__bar-track">
                    <div class="cjs-tooltip__bar-fill" style="width:${pct}%;background:${color}"></div>
                </div>
                </div>
            </div>
            <div class="cjs-tooltip__footer-note">${radioData ? H.number(radioData.exames) + ' exames no período' : ''}</div>`;

            el.classList.add('chartjs-tooltip--compact');
        }

        // ------------------------------------------------------------------
        // GRÁFICO: Distribuição de Exames (doughnut)
        // ------------------------------------------------------------------
        else if (canvasId === 'examTypesChart') {
            const p = tooltip.dataPoints[0];
            const val = p.raw;
            const total = MOCK_TIPOS_EXAME.reduce((s, t) => s + t.quantidade, 0);
            const pct = total > 0 ? (val / total * 100) : 0;
            const color = p.dataset.backgroundColor instanceof Array
            ? p.dataset.backgroundColor[p.dataIndex]
            : p.dataset.backgroundColor;

            html = `
            <div class="cjs-tooltip__eyebrow">Tipo de Exame</div>
            <div class="cjs-tooltip__headline">
                <span class="cjs-tooltip__headline-label">
                <span class="cjs-tooltip__dot" style="background:${color}"></span>${label}
                </span>
                <span class="cjs-tooltip__headline-value">${H.number(val)}</span>
            </div>
            <div class="cjs-tooltip__breakdown">
                <div class="cjs-tooltip__row">
                <div class="cjs-tooltip__row-top">
                    <span class="cjs-tooltip__row-label">Participação</span>
                    <div class="cjs-tooltip__row-right">
                    <span class="cjs-tooltip__row-value">${H.percent(pct)}</span>
                    </div>
                </div>
                <div class="cjs-tooltip__bar-track">
                    <div class="cjs-tooltip__bar-fill" style="width:${Math.min(pct * 2, 100)}%;background:${color}"></div>
                </div>
                </div>
            </div>
            <div class="cjs-tooltip__footer-note">Total no período: ${H.number(total)} exames</div>`;

            el.classList.add('chartjs-tooltip--compact');
        }

        // ------------------------------------------------------------------
        // GRÁFICO: Ticket Médio por Radiologia
        // ------------------------------------------------------------------
        else if (canvasId === 'avgTicketChart') {
            const atualPoint = tooltip.dataPoints.find(p => p.dataset.label === 'Mês Atual');
            const antPoint   = tooltip.dataPoints.find(p => p.dataset.label === 'Mês Anterior');

            if (atualPoint) {
            const atual = atualPoint.raw;
            const ant   = antPoint ? antPoint.raw : null;
            let diffHtml = '';
            if (ant !== null && ant > 0) {
                const diff = ((atual - ant) / ant * 100);
                const cls = diff > 0 ? 'cjs-tooltip__change--up' : diff < 0 ? 'cjs-tooltip__change--down' : 'cjs-tooltip__change--flat';
                const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '—';
                diffHtml = `
                <div class="cjs-tooltip__change-row">
                    <span class="cjs-tooltip__change ${cls}">${arrow} ${Math.abs(diff).toFixed(1)}%</span>
                    <span class="cjs-tooltip__change-context">vs. mês anterior</span>
                </div>`;
            }

            html = `
                <div class="cjs-tooltip__eyebrow">${label}</div>
                <div class="cjs-tooltip__headline">
                <span class="cjs-tooltip__headline-label">Ticket médio atual</span>
                <span class="cjs-tooltip__headline-value">${H.currency(atual)}</span>
                </div>
                ${diffHtml}
                <div class="cjs-tooltip__divider"></div>
                <div class="cjs-tooltip__metrics">
                <div class="cjs-tooltip__metric">
                    <span class="cjs-tooltip__metric-label">Mês anterior</span>
                    <span class="cjs-tooltip__metric-value">${ant !== null ? H.currency(ant) : '--'}</span>
                </div>
                <div class="cjs-tooltip__metric">
                    <span class="cjs-tooltip__metric-label">Diferença absoluta</span>
                    <span class="cjs-tooltip__metric-value">${ant !== null ? H.currency(Math.round(atual - ant)) : '--'}</span>
                </div>
                </div>`;

            el.classList.add('chartjs-tooltip--compact');
            }
        }

        // ------------------------------------------------------------------
        // GRÁFICOS DA ABA COMISSÕES
        // ------------------------------------------------------------------

        // Top 10 por Comissão Devida
        else if (canvasId === 'commTopDueChart') {
            const p = tooltip.dataPoints[0];
            const val = p.raw;
            const color = p.dataset.borderColor || p.dataset.backgroundColor;

            html = `
            <div class="cjs-tooltip__eyebrow">Comissão Devida</div>
            <div class="cjs-tooltip__headline">
                <span class="cjs-tooltip__headline-label">
                <span class="cjs-tooltip__dot" style="background:${color}"></span>${label}
                </span>
                <span class="cjs-tooltip__headline-value">${H.currency(val)}</span>
            </div>
            <div class="cjs-tooltip__footer-note">Valor total de comissão no período</div>`;

            el.classList.add('chartjs-tooltip--compact');
        }

        // Distribuição por Radiologia (doughnut)
        else if (canvasId === 'commByRadiologyChart') {
            const p = tooltip.dataPoints[0];
            const val = p.raw;
            const total = MOCK_COMISSOES_TREE.reduce((s, r) => s + r.comissaoDevida, 0);
            const pct = total > 0 ? (val / total * 100) : 0;
            const color = p.dataset.backgroundColor instanceof Array
            ? p.dataset.backgroundColor[p.dataIndex]
            : p.dataset.backgroundColor;

            html = `
            <div class="cjs-tooltip__eyebrow">Comissões por Unidade</div>
            <div class="cjs-tooltip__headline">
                <span class="cjs-tooltip__headline-label">
                <span class="cjs-tooltip__dot" style="background:${color}"></span>${label}
                </span>
                <span class="cjs-tooltip__headline-value">${H.currency(val)}</span>
            </div>
            <div class="cjs-tooltip__breakdown">
                <div class="cjs-tooltip__row">
                <div class="cjs-tooltip__row-top">
                    <span class="cjs-tooltip__row-label">% do total de comissões</span>
                    <span class="cjs-tooltip__row-percent">${H.percent(pct)}</span>
                </div>
                <div class="cjs-tooltip__bar-track">
                    <div class="cjs-tooltip__bar-fill" style="width:${Math.min(pct * 2.5, 100)}%;background:${color}"></div>
                </div>
                </div>
            </div>`;

            el.classList.add('chartjs-tooltip--compact');
        }

        // Evolução Pagas vs Pendentes
        else if (canvasId === 'commEvolutionChart') {
            const pagPoint  = tooltip.dataPoints.find(p => p.dataset.label === 'Pagas');
            const pendPoint = tooltip.dataPoints.find(p => p.dataset.label === 'Pendentes');

            html = `<div class="cjs-tooltip__eyebrow">${label}</div>`;

            if (pagPoint) {
            html += `
                <div class="cjs-tooltip__metrics">
                <div class="cjs-tooltip__metric">
                    <span class="cjs-tooltip__metric-label">
                    <span class="cjs-tooltip__dot cjs-tooltip__dot--sm" style="background:${CFG.colors.positive}"></span>Comissões pagas
                    </span>
                    <span class="cjs-tooltip__metric-value">${H.currency(pagPoint.raw)}</span>
                </div>
                <div class="cjs-tooltip__metric">
                    <span class="cjs-tooltip__metric-label">
                    <span class="cjs-tooltip__dot cjs-tooltip__dot--sm" style="background:${CFG.colors.warning}"></span>Comissões pendentes
                    </span>
                    <span class="cjs-tooltip__metric-value">${pendPoint ? H.currency(pendPoint.raw) : '--'}</span>
                </div>`;

            if (pagPoint.raw > 0) {
                const total = pagPoint.raw + (pendPoint ? pendPoint.raw : 0);
                const pctPago = total > 0 ? (pagPoint.raw / total * 100) : 0;
                html += `
                <div class="cjs-tooltip__divider"></div>
                <div class="cjs-tooltip__metric">
                    <span class="cjs-tooltip__metric-label">% pago no mês</span>
                    <span class="cjs-tooltip__metric-value" style="color:#5EEAA4">${H.percent(pctPago)}</span>
                </div>`;
            }

            html += `</div>`;
            }

            html += `<div class="cjs-tooltip__footer-note">Total no mês: ${H.currency((pagPoint?.raw || 0) + (pendPoint?.raw || 0))}</div>`;
        }

        // ------------------------------------------------------------------
        // GRÁFICO: Meta vs Realizado (aba Metas)
        // ------------------------------------------------------------------
        else if (canvasId === 'goalVsActualChart') {
            const metaPoint = tooltip.dataPoints.find(p => p.dataset.label === 'Meta');
            const realPoint = tooltip.dataPoints.find(p => p.dataset.label === 'Realizado');

            if (metaPoint) {
            const meta  = metaPoint.raw;
            const real  = realPoint ? realPoint.raw : 0;
            const pct   = meta > 0 ? (real / meta * 100) : 0;

            html = `
                <div class="cjs-tooltip__eyebrow">Meta vs. Realizado</div>
                <div class="cjs-tooltip__metrics">
                <div class="cjs-tooltip__metric">
                    <span class="cjs-tooltip__metric-label">
                    <span class="cjs-tooltip__dot cjs-tooltip__dot--sm" style="background:${CFG.colors.primaryLight}"></span>Meta
                    </span>
                    <span class="cjs-tooltip__metric-value">${H.currency(meta)}</span>
                </div>
                <div class="cjs-tooltip__metric">
                    <span class="cjs-tooltip__metric-label">
                    <span class="cjs-tooltip__dot cjs-tooltip__dot--sm" style="background:${CFG.colors.primary}"></span>Realizado
                    </span>
                    <span class="cjs-tooltip__metric-value">${H.currency(real)}</span>
                </div>
                <div class="cjs-tooltip__divider"></div>
                <div class="cjs-tooltip__metric">
                    <span class="cjs-tooltip__metric-label">% atingido</span>
                    <span class="cjs-tooltip__metric-value" style="color:${pct >= 90 ? '#5EEAA4' : pct >= 70 ? '#F5CC6B' : '#F58A83'}">${H.percent(pct)}</span>
                </div>
                <div class="cjs-tooltip__metric">
                    <span class="cjs-tooltip__metric-label">Faltam</span>
                    <span class="cjs-tooltip__metric-value">${H.currency(Math.max(meta - real, 0))}</span>
                </div>
                </div>`;

            el.classList.add('chartjs-tooltip--compact');
            }
        }

        // ------------------------------------------------------------------
        // FALLBACK: tooltip genérico (para gráficos não listados acima)
        // ------------------------------------------------------------------
        else {
            html = `<div class="cjs-tooltip__eyebrow">${label}</div>`;
            html += `<div class="cjs-tooltip__metrics">`;
            tooltip.dataPoints.forEach(p => {
            const color = p.dataset.backgroundColor instanceof Array
                ? p.dataset.backgroundColor[p.dataIndex]
                : p.dataset.borderColor || p.dataset.backgroundColor;
            html += `
                <div class="cjs-tooltip__metric">
                <span class="cjs-tooltip__metric-label" style="display:flex;align-items:center;gap:6px">
                    <span class="cjs-tooltip__dot" style="background:${color}"></span>${p.dataset.label || p.label}
                </span>
                <span class="cjs-tooltip__metric-value">${p.formattedValue}</span>
                </div>`;
            });
            html += `</div>`;
        }

                // ------------------------------------------------------------------
        // RENDERIZAÇÃO E POSICIONAMENTO (Individualizado por tipo de gráfico)
        // ------------------------------------------------------------------
        inner.innerHTML = html;

        // Força o browser a calcular layout antes de posicionar
        el.style.opacity = '0';
        // setTimeout 0 garante que o DOM já foi pintado antes de medir
        setTimeout(() => {
        const tooltipW = el.offsetWidth;
        const tooltipH = el.offsetHeight;
        const canvasBox = chart.canvas.getBoundingClientRect();

        let left, top;
        const GAP = 12;

        // Barras horizontais (Top Clínicas, Top Comissões)
        if (canvasId === 'topClinicasChart' || canvasId === 'commTopDueChart') {
            const active = chart.getActiveElements();
            if (active.length > 0) {
            const barBox = active[0].element.getBoundingClientRect();
            left = barBox.right + GAP;
            top  = barBox.top + barBox.height / 2 - tooltipH / 2;
            if (left + tooltipW > window.innerWidth - 8) {
                left = barBox.left - tooltipW - GAP;
            }
            } else {
            left = canvasBox.right + GAP;
            top  = canvasBox.top;
            }
        }

        // Gráficos de linha/área
        else if (canvasId === 'evolutionChart' || canvasId === 'commEvolutionChart') {
            left = canvasBox.left + tooltip.caretX + GAP;
            top  = canvasBox.top  + tooltip.caretY - tooltipH - GAP;
            if (left + tooltipW > window.innerWidth - 8) {
            left = canvasBox.left + tooltip.caretX - tooltipW - GAP;
            }
            if (top < 8) {
            top = canvasBox.top + tooltip.caretY + GAP;
            }
        }

        // Barras verticais (Por Radiologia, Ticket Médio, Meta)
        else if (
            canvasId === 'byRadiologyChart' ||
            canvasId === 'avgTicketChart'   ||
            canvasId === 'goalVsActualChart'||
            canvasId === 'commTopDueChart'
        ) {
            left = canvasBox.left + tooltip.caretX - tooltipW / 2;
            top  = canvasBox.top  + tooltip.caretY - tooltipH - GAP;
            if (left + tooltipW > window.innerWidth - 8) left = window.innerWidth - tooltipW - 8;
            if (left < 8) left = 8;
            if (top < 8)  top  = canvasBox.top + tooltip.caretY + GAP;
        }

        // Doughnut (Tipos de Exame, Comissões por Radiologia)
        else if (canvasId === 'examTypesChart' || canvasId === 'commByRadiologyChart' || canvasId === 'distribuicaoChart') {
            left = canvasBox.left + tooltip.caretX + GAP;
            top  = canvasBox.top  + tooltip.caretY - tooltipH / 2;
            if (left + tooltipW > window.innerWidth - 8) {
            left = canvasBox.left + tooltip.caretX - tooltipW - GAP;
            }
        }

        // Barras horizontais duplas (Top Médicos)
        
        // Fallback
        else {
            left = canvasBox.left + tooltip.caretX + GAP;
            top  = canvasBox.top  + tooltip.caretY - tooltipH - GAP;
            if (left + tooltipW > window.innerWidth - 8) {
            left = canvasBox.left + tooltip.caretX - tooltipW - GAP;
            }
            if (top < 8) top = canvasBox.top + tooltip.caretY + GAP;
        }

        // Clamp final
        if (top < 8) top = 8;
        if (top + tooltipH > window.innerHeight - 8) top = window.innerHeight - tooltipH - 8;
        if (left < 8) left = 8;
        if (left + tooltipW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - tooltipW - 8);

        el.style.left    = `${left}px`;
        el.style.top     = `${top}px`;
        el.style.opacity = '1';
        }, 0);
    },
    line(ctx, labels, datasets, opts = {}) {
      H.destroyChart(ctx.id);
      const instance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
            legend: { display: false },
            tooltip: { enabled: false, external: ChartFactory.externalTooltip },
            ...(opts.extra?.plugins || {}),
            },
            scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 11 }, maxRotation: 0 },
            },
            y: {
                grid: { color: CFG.colors.border },
                ticks: { font: { family: CFG.chartDefaults.monoFamily, size: 11 }, ...opts.yTicks },
                beginAtZero: false,
                ...opts.yScale,
            },
            ...(opts.y1 ? { y1: opts.y1 } : {}),
            },
            ...Object.fromEntries(Object.entries(opts.extra || {}).filter(([k]) => k !== 'plugins')),
        },
        });
      State.charts[ctx.id] = instance;
      return instance;
    },

    bar(ctx, labels, datasets, opts = {}) {
      H.destroyChart(ctx.id);
      const isHorizontal = opts.horizontal === true;
      const instance = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
            mode: isHorizontal ? 'y' : 'index',
            intersect: false,
            },
            plugins: {
            legend: { display: false },
            tooltip: { enabled: false, external: ChartFactory.externalTooltip },
            ...(opts.extra?.plugins || {}),
            },
            scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 11 } },
                stacked: opts.stacked || false,
            },
            y: {
                grid: { color: CFG.colors.border },
                ticks: { font: { family: CFG.chartDefaults.monoFamily, size: 11 }, ...opts.yTicks },
                beginAtZero: true,
                stacked: opts.stacked || false,
            },
            },
            indexAxis: opts.horizontal ? 'y' : 'x',
            ...Object.fromEntries(Object.entries(opts.extra || {}).filter(([k]) => k !== 'plugins')),
        },
        });
      State.charts[ctx.id] = instance;
      return instance;
    },

    doughnut(ctx, labels, data, colors, opts = {}) {
      H.destroyChart(ctx.id);
      const instance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: colors,
            borderColor: CFG.colors.surface,
            borderWidth: 3,
            hoverOffset: 8,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              display: true,
              position: opts.legendPosition || 'right',
              labels: {
                font: { size: 11 },
                padding: 12,
                boxWidth: 10,
                boxHeight: 10,
                color: CFG.colors.textMuted,
              },
            },
            tooltip: { enabled: false, external: ChartFactory.externalTooltip },
          },
        },
      });
      State.charts[ctx.id] = instance;
      return instance;
    },
  };


  /* ===========================================================
     6. MODULE: FILTROS
  =========================================================== */
  const Filtros = (() => {

    function renderRadiologyPills() {
      const container = document.getElementById('radiologyFilters');
      if (!container) return;
      container.innerHTML = CFG.radiologies.map(r => `
        <button type="button"
          class="pill${State.radiologia === r.id ? ' is-active' : ''}"
          data-radio="${r.id}"
          role="tab"
          aria-selected="${State.radiologia === r.id}">
          ${r.label}
        </button>
      `).join('');

      container.querySelectorAll('.pill').forEach(btn => {
        btn.addEventListener('click', () => {
          State.radiologia = btn.dataset.radio;
          renderRadiologyPills();
          onFiltersChange();
        });
      });
    }

    function bindPeriod() {
      const sel = document.getElementById('periodFilter');
      const customWrap = document.getElementById('customRangeInputs');
      if (!sel) return;

      sel.addEventListener('change', () => {
        State.periodo = sel.value;
        if (customWrap) customWrap.hidden = sel.value !== 'custom';
        onFiltersChange();
      });

      const startEl = document.getElementById('customDateStart');
      const endEl   = document.getElementById('customDateEnd');
      if (startEl) startEl.addEventListener('change', () => { State.customStart = startEl.value; onFiltersChange(); });
      if (endEl)   endEl.addEventListener('change',   () => { State.customEnd   = endEl.value;   onFiltersChange(); });
    }

    function onFiltersChange() {
      // Re-renderiza a aba ativa com os novos filtros
      const tab = State.activeTab;
      if (tab === 'visao-geral') VisaoGeral.render();
      if (tab === 'comissoes')   Comissoes.render();
      if (tab === 'metas')       Metas.render();
      if (tab === 'relatorios')  Relatorios.render();
    }

    function init() {
      renderRadiologyPills();
      bindPeriod();
    }

    return { init, onFiltersChange };
  })();


  /* ===========================================================
     7. MODULE: TABS
  =========================================================== */
  const Tabs = (() => {

    function setActive(tabId) {
      State.activeTab = tabId;

      document.querySelectorAll('.fin-tab').forEach(btn => {
        const active = btn.dataset.tab === tabId;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active);
      });

      document.querySelectorAll('.fin-panel').forEach(panel => {
        const match = panel.id === `tab-${tabId}`;
        panel.classList.toggle('fin-panel--hidden', !match);
        if (match) {
          panel.style.animation = 'none';
          requestAnimationFrame(() => {
            panel.style.animation = '';
            panel.classList.add('fin-panel');
          });
        }
      });

      // Renderiza a aba ativada
      if (tabId === 'visao-geral') VisaoGeral.render();
      if (tabId === 'comissoes')   Comissoes.render();
      if (tabId === 'metas')       Metas.render();
      if (tabId === 'relatorios')  Relatorios.render();
    }

    function init() {
      document.querySelectorAll('.fin-tab').forEach(btn => {
        btn.addEventListener('click', () => setActive(btn.dataset.tab));
      });
    }

    return { init, setActive };
  })();


  /* ===========================================================
     8. MODULE: VISÃO GERAL
  =========================================================== */
  const VisaoGeral = (() => {

    /* ----- KPIs ----- */
    function renderKPIs() {
      const kpi = MOCK_KPIS; // [API] substituir por fetch filtrado

      // Faturamento Total
      const kpiRev = document.getElementById('kpiTotalRevenue');
      if (kpiRev) {
        kpiRev.querySelector('[data-field="value"]').textContent    = H.currency(kpi.faturamentoTotal.value);
        kpiRev.querySelector('[data-field="change"]').innerHTML     = H.changeBadge(kpi.faturamentoTotal.changeMonth);
        kpiRev.querySelector('[data-field="yoy"]').textContent      = `${kpi.faturamentoTotal.changeYoY > 0 ? '+' : ''}${kpi.faturamentoTotal.changeYoY}% vs. mesmo mês ano passado`;
      }

      // Faturamento Líquido
      const kpiNet = document.getElementById('kpiNetRevenue');
      if (kpiNet) {
        kpiNet.querySelector('[data-field="value"]').textContent   = H.currency(kpi.faturamentoLiquido.value);
        kpiNet.querySelector('[data-field="context"]').textContent = kpi.faturamentoLiquido.context;
      }

      // Margem
      const kpiMar = document.getElementById('kpiMargin');
      if (kpiMar) {
        kpiMar.querySelector('[data-field="value"]').textContent   = H.percent(kpi.margemLucro.value);
        kpiMar.querySelector('[data-field="change"]').innerHTML    = H.changeBadge(kpi.margemLucro.changeMonth);
      }

      // Total Exames
      const kpiEx = document.getElementById('kpiTotalExams');
      if (kpiEx) {
        kpiEx.querySelector('[data-field="value"]').textContent   = H.number(kpi.totalExames.value);
        kpiEx.querySelector('[data-field="change"]').innerHTML    = H.changeBadge(kpi.totalExames.changeMonth);
      }

      // Previsão
      const kpiFc = document.getElementById('kpiForecast');
      if (kpiFc) {
        kpiFc.querySelector('[data-field="value"]').textContent      = H.currency(kpi.previsao30d.value);
        kpiFc.querySelector('[data-field="context30"]').textContent  = `${H.currency(kpi.previsao30d.value)} próximos 30 dias`;
        kpiFc.querySelector('[data-field="forecast60"]').textContent = `${H.currency(kpi.previsao30d.forecast60d)} próximos 60 dias`;
      }
    }

    /* ----- Insights ----- */
    function renderInsights() {
      const bar = document.getElementById('insightsBar');
      if (!bar) return;

      const insights = [
        { type: 'positive', text: 'Zona Leste cresceu 18,7% este mês' },
        { type: 'info',     text: 'OdontoPremium responsável por 16,6% do faturamento' },
        { type: 'warning',  text: '7 médicos com comissões pendentes — R$ 13.266' },
        { type: 'positive', text: 'Ticket médio cresceu 3,4% vs. mês anterior' },
        { type: 'info',     text: 'Dr. Thiago Almeida gerou R$ 28.380 em faturamento' },
      ];

      bar.innerHTML = insights.map((ins, i) => `
        <div class="insight-chip insight-chip--${ins.type}" style="animation-delay:${i * 40}ms">
          <span class="insight-chip__dot"></span>
          ${ins.text}
        </div>`).join('');
    }

    /* ----- Gráfico 1: Evolução Mensal ----- */
    function renderEvolutionChart() {
      const ctx = document.getElementById('evolutionChart');
      if (!ctx) return;

      const d = MOCK_EVOLUCAO;
      const formatCurrency = v => 'R$ ' + H.number(v / 1000, 0) + 'k';

      ChartFactory.line(ctx, d.labels, [
        {
          label: 'Faturamento',
          data: d.faturamento,
          borderColor: CFG.colors.primary,
          backgroundColor: `${CFG.colors.primary}18`,
          fill: true,
          tension: 0.4,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'y',
        },
        {
          label: 'Mesmo período ano anterior',
          data: d.faturamentoAno,
          borderColor: CFG.colors.border,
          borderDash: [5, 4],
          borderWidth: 1.8,
          pointRadius: 0,
          tension: 0.4,
          yAxisID: 'y',
        },
        {
          label: 'Exames',
          data: d.exames,
          borderColor: CFG.colors.primaryLight,
          backgroundColor: `${CFG.colors.primaryLight}10`,
          fill: false,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'y1',
        },
      ], {
        yTicks: { callback: formatCurrency },
        y1: {
          position: 'right',
          grid: { display: false },
          ticks: { font: { family: CFG.chartDefaults.monoFamily, size: 11 } },
        },
      });

      // Legenda customizada
      const leg = document.getElementById('evolutionLegend');
      if (leg) {
        leg.innerHTML = `
          <span class="chart-legend-item"><span class="chart-legend-line" style="background:${CFG.colors.primary}"></span>Faturamento</span>
          <span class="chart-legend-item"><span class="chart-legend-line" style="background:${CFG.colors.border};border-top:2px dashed ${CFG.colors.textSubtle};height:0"></span>Ano anterior</span>
          <span class="chart-legend-item"><span class="chart-legend-line" style="background:${CFG.colors.primaryLight}"></span>Exames</span>
        `;
      }
    }

    /* ----- Gráfico 2: Por Radiologia ----- */
    function renderByRadiologyChart() {
      const ctx = document.getElementById('byRadiologyChart');
      if (!ctx) return;

      const data = H.filteredRadiologies();
      ChartFactory.bar(ctx,
        data.map(r => r.label),
        [{
          label: 'Faturamento',
          data: data.map(r => r.faturamento),
          backgroundColor: data.map((_, i) => H.seriesColor(i, 0.85)),
          borderColor: data.map((_, i) => H.seriesColor(i)),
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        }],
        { yTicks: { callback: v => 'R$ ' + H.number(v / 1000, 0) + 'k' } }
      );
    }

    /* ----- Gráfico 3: Top Clínicas (horizontal) ----- */
    function renderDistribuicaoChart() {
        const ctx = document.getElementById('distribuicaoChart');
        if (!ctx) return;
        const data = H.filteredRadiologies();
        ChartFactory.doughnut(ctx,
            data.map(r => r.label),
            data.map(r => r.faturamento),
            data.map((_, i) => H.seriesColor(i)),
            { legendPosition: 'bottom' }
        );
    }

    function renderHighlightsPanel() {
        const panel = document.getElementById('highlightsPanel');
        if (!panel) return;

        const topClinicas = MOCK_TOP_CLINICAS.slice(0, 5);
        const topMedicos  = MOCK_TOP_MEDICOS.slice(0, 5);

        const clinicasHtml = topClinicas.map((c, i) => `
            <div class="highlight-row">
            <span class="highlight-row__rank">${i + 1}</span>
            <div class="highlight-row__info">
                <span class="highlight-row__name">${c.nome}</span>
                <span class="highlight-row__meta">${H.percent(c.participacao)} do total</span>
            </div>
            <span class="highlight-row__value">${H.currency(c.faturamento)}</span>
            </div>`).join('');

        const medicosHtml = topMedicos.map((m, i) => `
            <div class="highlight-row">
            <span class="highlight-row__rank">${i + 1}</span>
            <div class="highlight-row__info">
                <span class="highlight-row__name">${m.nome}</span>
                <span class="highlight-row__meta">${m.clinica} · ${H.number(m.exames)} exames</span>
            </div>
            <span class="highlight-row__value">${H.currency(m.faturamento)}</span>
            </div>`).join('');

        panel.innerHTML = `
            <div class="highlight-group">
            <div class="highlight-group__title">Top 5 Clínicas Referenciadoras</div>
            <div class="highlight-list">${clinicasHtml}</div>
            </div>
            <div class="highlight-group">
            <div class="highlight-group__title">Top 5 Médicos Referenciadores</div>
            <div class="highlight-list">${medicosHtml}</div>
            </div>`;
    }

    /* ----- Gráfico 5: Distribuição de Exames ----- */
    function renderExamTypesChart() {
      const ctx = document.getElementById('examTypesChart');
      if (!ctx) return;

      const data = MOCK_TIPOS_EXAME;
      const colors = [
        CFG.colors.primary,
        CFG.colors.primaryLight,
        '#F5A623',
        '#7B68EE',
        '#E05C5C',
        '#5C9E6E',
        CFG.colors.textSubtle,
      ];
      ChartFactory.doughnut(ctx,
        data.map(d => d.tipo),
        data.map(d => d.quantidade),
        colors,
        { legendPosition: 'right' }
      );
    }

    /* ----- Gráfico 6: Ticket Médio por Radiologia ----- */
    function renderAvgTicketChart() {
      const ctx = document.getElementById('avgTicketChart');
      if (!ctx) return;

      const d = MOCK_TICKET_MEDIO;
      ChartFactory.bar(ctx, d.labels, [
        {
          label: 'Mês Atual',
          data: d.atual,
          backgroundColor: CFG.colors.primary + 'CC',
          borderColor: CFG.colors.primary,
          borderWidth: 1.5,
          borderRadius: 5,
          borderSkipped: false,
        },
        {
          label: 'Mês Anterior',
          data: d.anterior,
          backgroundColor: CFG.colors.border,
          borderColor: CFG.colors.textSubtle,
          borderWidth: 1.5,
          borderRadius: 5,
          borderSkipped: false,
        },
      ], {
        yTicks: { callback: v => 'R$ ' + H.number(v, 0) },
        extra: {
          plugins: {
            legend: { display: true, position: 'top', labels: { font: { size: 11 }, boxWidth: 10, boxHeight: 10 } },
            tooltip: { enabled: false, external: ChartFactory.externalTooltip },
          },
        },
      });
    }

    /* ----- Tabela: Resumo por Radiologia ----- */
    function renderResumoTable() {
      const tbody = document.getElementById('resumoRadiologiaBody');
      if (!tbody) return;

      const data = H.filteredRadiologies();
      if (!data.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Nenhum dado para o filtro selecionado.</td></tr>`; return; }

      tbody.innerHTML = data.map(r => `
        <tr>
          <td><span class="data-table__name-primary">${r.label}</span></td>
          <td class="data-table__num">${H.currency(r.faturamento)}</td>
          <td class="td-change">${H.changeBadge(r.variacao)}</td>
          <td class="data-table__num">${H.number(r.exames)}</td>
          <td class="data-table__num">${H.currency(Math.round(r.faturamento / r.exames))}</td>
          <td>
            <div class="participation-cell">
              <span class="participation-cell__value">${H.percent(r.participacao)}</span>
              <div class="participation-bar"><div class="participation-bar__fill" style="width:${r.participacao}%"></div></div>
            </div>
          </td>
        </tr>`).join('');
    }

    /* ----- Tabela: Top Médicos ----- */
    function renderTopMedicosTable() {
      const tbody = document.getElementById('topMedicosTableBody');
      if (!tbody) return;

      tbody.innerHTML = MOCK_TOP_MEDICOS.slice(0, 10).map(m => `
        <tr>
          <td>
            <span class="data-table__name-primary">${m.nome}</span>
            <span class="data-table__name-secondary">${m.clinica}</span>
          </td>
          <td class="data-table__num">${H.number(m.exames)}</td>
          <td class="data-table__num">${H.currency(m.faturamento)}</td>
          <td class="data-table__num">${H.percent(m.comissao)}</td>
          <td class="data-table__num">${H.currency(m.comissaoEstimada)}</td>
        </tr>`).join('');
    }

    function render() {
        renderKPIs();
        renderInsights();
        renderEvolutionChart();
        renderByRadiologyChart();
        renderDistribuicaoChart();
        renderHighlightsPanel();
        renderExamTypesChart();
        renderAvgTicketChart();
        renderResumoTable();
        renderTopMedicosTable();
    }

    return { render };
  })();


  /* ===========================================================
     9. MODULE: COMISSÕES
  =========================================================== */
  const Comissoes = (() => {

    /* ----- KPIs ----- */
    function renderKPIs() {
      const k = MOCK_COMISSOES_KPIS; // [API] GET /comissoes/kpis

      const kpiTotal = document.getElementById('kpiCommTotal');
      if (kpiTotal) kpiTotal.querySelector('[data-field="value"]').textContent = H.currency(k.totalDevido.value);

      const kpiPaid = document.getElementById('kpiCommPaid');
      if (kpiPaid) {
        kpiPaid.querySelector('[data-field="value"]').textContent   = H.currency(k.totalPago.value);
        kpiPaid.querySelector('[data-field="context"]').textContent = `${H.percent(k.totalPago.percentual)} do total devido`;
      }

      const kpiPend = document.getElementById('kpiCommPending');
      if (kpiPend) {
        kpiPend.querySelector('[data-field="value"]').textContent   = H.currency(k.pendente.value);
        kpiPend.querySelector('[data-field="context"]').textContent = `${k.pendente.medicos} médicos aguardando`;
      }

      const kpiPct = document.getElementById('kpiCommPercent');
      if (kpiPct) {
        kpiPct.querySelector('[data-field="value"]').textContent = H.percent(k.percentPago.value);
        const fill = document.getElementById('commProgressFill');
        if (fill) fill.style.width = `${k.percentPago.value}%`;
      }

      const kpiAvg = document.getElementById('kpiCommAvg');
      if (kpiAvg) kpiAvg.querySelector('[data-field="value"]').textContent = H.currency(k.mediaPorMedico.value);
    }

    /* ----- Tree Table ----- */
    function buildTreeRows(tree) {
      let html = '';
      tree.forEach(radio => {
        // Linha nível 1: Radiologia
        html += buildLevel1Row(radio);
        // Grupos de clínicas (colapso por padrão)
        html += `<div class="tree-group is-collapsed" id="grp-${radio.id}">`;
        radio.clinicas.forEach(cli => {
          html += buildLevel2Row(cli, radio.id);
          html += `<div class="tree-group is-collapsed" id="grp-${cli.id}">`;
          cli.medicos.forEach(med => {
            html += buildLevel3Row(med, cli.id);
          });
          html += `</div>`;
        });
        html += `</div>`;
      });
      return html;
    }

    function buildLevel1Row(radio) {
      const pendCls = radio.pendente > 0 ? '' : 'is-zero';
      return `
        <div class="tree-row tree-row--level-1 tree-row--comm" data-id="${radio.id}" role="row">
          <div class="tree-row__select"></div>
          <div class="tree-row__name-cell">
            <button type="button" class="tree-row__toggle" data-toggle="${radio.id}" aria-expanded="false" aria-label="Expandir ${radio.nome}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <span class="tree-row__name">${radio.nome}</span>
            <span class="tree-row__badge">${radio.clinicas.length} clínicas</span>
          </div>
          <div class="tree-row__num" data-label="Exames">${H.number(radio.exames)}</div>
          <div class="tree-row__num" data-label="Faturamento">${H.currency(radio.faturamento)}</div>
          <div class="tree-row__num" data-label="% Comissão">—</div>
          <div class="tree-row__num" data-label="Total Devido">${H.currency(radio.comissaoDevida)}</div>
          <div class="tree-row__num" data-label="Já Pago">${H.currency(radio.pago)}</div>
          <div class="tree-row__num tree-row__num--comm-pending ${pendCls}" data-label="Pendente">${radio.pendente > 0 ? H.currency(radio.pendente) : '—'}</div>
          <div class="tree-row__action">—</div>
          <div class="tree-row__action"></div>
        </div>`;
    }

    function buildLevel2Row(cli, radioId) {
      const pendCls = cli.pendente > 0 ? '' : 'is-zero';
      return `
        <div class="tree-row tree-row--level-2 tree-row--comm" data-id="${cli.id}" data-parent="${radioId}" role="row">
          <div class="tree-row__select"></div>
          <div class="tree-row__name-cell">
            <button type="button" class="tree-row__toggle" data-toggle="${cli.id}" aria-expanded="false" aria-label="Expandir ${cli.nome}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <span class="tree-row__name">${cli.nome}</span>
            <span class="tree-row__badge">${cli.medicos.length} médicos</span>
          </div>
          <div class="tree-row__num" data-label="Exames">${H.number(cli.exames)}</div>
          <div class="tree-row__num" data-label="Faturamento">${H.currency(cli.faturamento)}</div>
          <div class="tree-row__num" data-label="% Comissão">—</div>
          <div class="tree-row__num" data-label="Total Devido">${H.currency(cli.comissaoDevida)}</div>
          <div class="tree-row__num" data-label="Já Pago">${H.currency(cli.pago)}</div>
          <div class="tree-row__num tree-row__num--comm-pending ${pendCls}" data-label="Pendente">${cli.pendente > 0 ? H.currency(cli.pendente) : '—'}</div>
          <div class="tree-row__action">—</div>
          <div class="tree-row__action"></div>
        </div>`;
    }

    function buildLevel3Row(med) {
      const pendCls = med.pendente > 0 ? '' : 'is-zero';
      return `
        <div class="tree-row tree-row--level-3 tree-row--comm" data-id="${med.id}" role="row">
          <div class="tree-row__select">
            ${med.pendente > 0 ? `<input type="checkbox" class="tree-row__checkbox comm-select-check" data-med-id="${med.id}" aria-label="Selecionar ${med.nome}">` : ''}
          </div>
          <div class="tree-row__name-cell">
            <span class="tree-row__toggle-spacer"></span>
            <span class="tree-row__name">${med.nome}</span>
          </div>
          <div class="tree-row__num" data-label="Exames">${H.number(med.exames)}</div>
          <div class="tree-row__num" data-label="Faturamento">${H.currency(med.faturamento)}</div>
          <div class="tree-row__num" data-label="% Comissão">${H.percent(med.percComissao)}</div>
          <div class="tree-row__num" data-label="Total Devido">${H.currency(med.comissaoDevida)}</div>
          <div class="tree-row__num" data-label="Já Pago">${H.currency(med.pago)}</div>
          <div class="tree-row__num tree-row__num--comm-pending ${pendCls}" data-label="Pendente">${med.pendente > 0 ? H.currency(med.pendente) : '—'}</div>
          <div class="tree-row__action">${H.statusBadge(med.status)}</div>
          <div class="tree-row__action">
            ${med.pendente > 0 ? `
              <button type="button" class="row-action-btn btn-pay-doctor"
                data-med-id="${med.id}"
                data-med-nome="${med.nome}"
                data-cli-nome="${med.clinica || ''}"
                data-total-due="${med.comissaoDevida}"
                data-already-paid="${med.pago}"
                data-pending="${med.pendente}"
                aria-label="Registrar pagamento para ${med.nome}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>` : ''}
          </div>
        </div>`;
    }

    function renderTree() {
      const body = document.getElementById('commTreeBody');
      if (!body) return;

      const tree = H.filteredCommTree();
      let filtered = tree;

      // Filtro de status
      if (State.commStatusFilter !== 'todas') {
        filtered = tree.map(radio => ({
          ...radio,
          clinicas: radio.clinicas.map(cli => ({
            ...cli,
            medicos: cli.medicos.filter(med => {
              if (State.commStatusFilter === 'pendentes') return med.status === 'pending';
              if (State.commStatusFilter === 'pagas')     return med.status === 'paid';
              if (State.commStatusFilter === 'parciais')  return med.status === 'partial';
              return true;
            }),
          })).filter(cli => cli.medicos.length > 0),
        })).filter(radio => radio.clinicas.length > 0);
      }

      // Filtro de busca
      if (State.commSearch.trim()) {
        const q = State.commSearch.trim().toLowerCase();
        filtered = filtered.map(radio => ({
          ...radio,
          clinicas: radio.clinicas.map(cli => ({
            ...cli,
            medicos: cli.medicos.filter(med => med.nome.toLowerCase().includes(q) || (med.clinica || '').toLowerCase().includes(q)),
          })).filter(cli => cli.medicos.length > 0 || cli.nome.toLowerCase().includes(q)),
        })).filter(radio => radio.clinicas.length > 0 || radio.nome.toLowerCase().includes(q));
      }

      if (!filtered.length) {
        body.innerHTML = `<div class="empty-state">Nenhum resultado para o filtro selecionado.</div>`;
        return;
      }

      body.innerHTML = buildTreeRows(filtered);
      bindTreeEvents();
    }

    function bindTreeEvents() {
      // Toggles de collapse
      document.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id  = btn.dataset.toggle;
          const grp = document.getElementById(`grp-${id}`);
          if (!grp) return;
          const collapsed = grp.classList.toggle('is-collapsed');
          btn.setAttribute('aria-expanded', !collapsed);
          const row = btn.closest('.tree-row');
          if (row) row.classList.toggle('is-collapsed', collapsed);
        });
      });

      // Botões de pagamento
      document.querySelectorAll('.btn-pay-doctor').forEach(btn => {
        btn.addEventListener('click', () => {
          Modais.openPayment({
            medId:       btn.dataset.medId,
            medNome:     btn.dataset.medNome,
            cliNome:     btn.dataset.cliNome,
            totalDue:    parseFloat(btn.dataset.totalDue),
            alreadyPaid: parseFloat(btn.dataset.alreadyPaid),
            pending:     parseFloat(btn.dataset.pending),
          });
        });
      });

      // Checkboxes de seleção múltipla
      document.querySelectorAll('.comm-select-check').forEach(cb => {
        cb.addEventListener('change', () => {
          const id = cb.dataset.medId;
          if (cb.checked) {
            if (!State.selectedForPayment.includes(id)) State.selectedForPayment.push(id);
          } else {
            State.selectedForPayment = State.selectedForPayment.filter(i => i !== id);
          }
          updateBatchPayBtn();
        });
      });
    }

    function updateBatchPayBtn() {
      const btn = document.getElementById('btnPaySelected');
      if (!btn) return;
      const n = State.selectedForPayment.length;
      btn.disabled = n === 0;
      btn.textContent = n > 0 ? `Pagar Selecionados (${n})` : 'Pagar Selecionados';
    }

    /* ----- Gráficos de suporte ----- */
    function renderSupportCharts() {
      // Top 10 por comissão devida
      const ctx1 = document.getElementById('commTopDueChart');
      if (ctx1) {
        const data = MOCK_TOP_MEDICOS.slice(0, 10);
        ChartFactory.bar(ctx1,
            data.map(m => m.nome.replace('Dr. ', '').replace('Dra. ', '')),
            [{
                label: 'Comissão Devida',
                data: data.map(m => m.comissaoEstimada),
                backgroundColor: CFG.colors.warning + 'BB',
                borderColor: CFG.colors.warning,
                borderWidth: 1.5,
                borderRadius: 4,
                borderSkipped: false,
            }],
            {
                horizontal: false,
                extra: {
                    scales: {
                        x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, maxRotation: 40, minRotation: 40 },
                        },
                        y: {
                        grid: { color: CFG.colors.border },
                        ticks: { callback: v => 'R$ ' + H.number(v, 0), font: { family: CFG.chartDefaults.monoFamily, size: 10 } },
                        },
                    },
                    plugins: { legend: { display: false }, tooltip: { enabled: false, external: ChartFactory.externalTooltip } },
                },
            }
        );
      }

      // Distribuição por radiologia
      const ctx2 = document.getElementById('commByRadiologyChart');
      if (ctx2) {
        ChartFactory.doughnut(ctx2,
          MOCK_POR_RADIOLOGIA.map(r => r.label),
          MOCK_COMISSOES_TREE.map(r => r.comissaoDevida),
          SERIES_COLORS,
          { legendPosition: 'bottom' }
        );
      }

      // Evolução pagas vs pendentes
      const ctx3 = document.getElementById('commEvolutionChart');
      if (ctx3) {
        const d = MOCK_COMM_EVOLUCAO;
        ChartFactory.line(ctx3, d.labels, [
          {
            label: 'Pagas',
            data: d.pagas,
            borderColor: CFG.colors.positive,
            backgroundColor: CFG.colors.positive + '18',
            fill: true,
            tension: 0.4,
            borderWidth: 2.5,
            pointRadius: 3,
          },
          {
            label: 'Pendentes',
            data: d.pendentes,
            borderColor: CFG.colors.warning,
            backgroundColor: CFG.colors.warning + '18',
            fill: true,
            tension: 0.4,
            borderWidth: 2.5,
            pointRadius: 3,
          },
        ], {
          yTicks: { callback: v => 'R$ ' + H.number(v / 1000, 0) + 'k' },
          extra: {
            plugins: {
              legend: { display: true, position: 'top', labels: { font: { size: 11 }, boxWidth: 10, boxHeight: 10 } },
              tooltip: { enabled: false, external: ChartFactory.externalTooltip },
            },
          },
        });
      }
    }

    function bindControls() {
      const expandAll = document.getElementById('commExpandAll');
      if (expandAll) {
        expandAll.addEventListener('click', () => {
          document.querySelectorAll('#commTreeBody .tree-group').forEach(g => {
            g.classList.remove('is-collapsed');
          });
          document.querySelectorAll('[data-toggle]').forEach(btn => btn.setAttribute('aria-expanded', 'true'));
        });
      }

      const collapseAll = document.getElementById('commCollapseAll');
      if (collapseAll) {
        collapseAll.addEventListener('click', () => {
          document.querySelectorAll('#commTreeBody .tree-group').forEach(g => {
            g.classList.add('is-collapsed');
          });
          document.querySelectorAll('[data-toggle]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
        });
      }

      const statusFilter = document.getElementById('commStatusFilter');
      if (statusFilter) {
        statusFilter.addEventListener('change', () => {
          State.commStatusFilter = statusFilter.value;
          renderTree();
        });
      }

      const searchEl = document.getElementById('commSearch');
      if (searchEl) {
        let debounce;
        searchEl.addEventListener('input', () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => {
            State.commSearch = searchEl.value;
            renderTree();
          }, 280);
        });
      }

      const batchBtn = document.getElementById('btnPaySelected');
      if (batchBtn) {
        batchBtn.addEventListener('click', () => {
          H.toast(`Iniciando pagamento em lote para ${State.selectedForPayment.length} médico(s)...`, 'info');
          // [API] POST /comissoes/pagamento-lote { medicos: State.selectedForPayment, data, metodo }
        });
      }
    }

    function render() {
      renderKPIs();
      renderTree();
      renderSupportCharts();
      bindControls();
    }

    return { render };
  })();


  /* ===========================================================
     10. MODULE: METAS
  =========================================================== */
  const Metas = (() => {

    function renderKPIs() {
      const m = MOCK_METAS; // [API] GET /metas

      // Meta mensal
      const kpiM = document.getElementById('kpiGoalMonthly');
      if (kpiM) {
        const pct = (m.mensal.realizado / m.mensal.meta) * 100;
        kpiM.querySelector('[data-field="value"]').textContent    = H.currency(m.mensal.meta);
        kpiM.querySelector('[data-field="context"]').textContent  = `${H.currency(m.mensal.realizado)} realizado`;
        const fill  = document.getElementById('goalMonthlyFill');
        const label = document.getElementById('goalMonthlyLabel');
        if (fill)  fill.style.width = `${Math.min(pct,100)}%`;
        if (label) label.textContent = `${H.percent(pct)} atingido`;
      }

      // Meta anual
      const kpiA = document.getElementById('kpiGoalYearly');
      if (kpiA) {
        const pct = (m.anual.realizado / m.anual.meta) * 100;
        kpiA.querySelector('[data-field="value"]').textContent    = H.currency(m.anual.meta);
        kpiA.querySelector('[data-field="context"]').textContent  = `${H.currency(m.anual.realizado)} realizado no ano`;
        const fill  = document.getElementById('goalYearlyFill');
        const label = document.getElementById('goalYearlyLabel');
        if (fill)  fill.style.width = `${Math.min(pct,100)}%`;
        if (label) label.textContent = `${H.percent(pct)} atingido`;
      }
    }

    function renderGoalVsActualChart() {
      const ctx = document.getElementById('goalVsActualChart');
      if (!ctx) return;

      const m = MOCK_METAS;
      ChartFactory.bar(ctx,
        ['Meta', 'Realizado'],
        [{
          label: 'Valor',
          data: [m.mensal.meta, m.mensal.realizado],
          backgroundColor: [CFG.colors.border, CFG.colors.primary + 'CC'],
          borderColor:     [CFG.colors.textSubtle, CFG.colors.primary],
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        }],
        {
            yTicks: { callback: v => 'R$ ' + H.number(v / 1000, 0) + 'k' },
            extra: {
                plugins: {
                tooltip: { enabled: false, external: ChartFactory.externalTooltip },
                },
            },
        }
      );
    }

    function renderMetasByRadiologiaTable() {
      const tbody = document.getElementById('metasByRadiologiaBody');
      if (!tbody) return;

      tbody.innerHTML = MOCK_METAS.porRadiologia.map(r => {
        const pctMes = (r.realizado / r.meta) * 100;
        const pctAno = (r.anoRealizado / r.anual) * 100;
        const savedGoalEdit = State.goalEdits[r.id] || {};
        return `
          <tr>
            <td><span class="data-table__name-primary">${r.nome}</span></td>
            <td class="data-table__num">
              <input type="number" class="goal-field" data-radio-id="${r.id}" data-field="meta"
                value="${savedGoalEdit.meta !== undefined ? savedGoalEdit.meta : r.meta}"
                aria-label="Meta mensal de ${r.nome}">
            </td>
            <td class="data-table__num">${H.currency(r.realizado)}</td>
            <td class="data-table__num">${H.percent(pctMes)}</td>
            <td>${H.inlineProgress(pctMes)}</td>
            <td class="data-table__num">
              <input type="number" class="goal-field" data-radio-id="${r.id}" data-field="anual"
                value="${savedGoalEdit.anual !== undefined ? savedGoalEdit.anual : r.anual}"
                aria-label="Meta anual de ${r.nome}">
            </td>
            <td class="data-table__action">
              <button type="button" class="row-action-btn btn-edit-goal"
                data-radio-id="${r.id}"
                data-radio-nome="${r.nome}"
                data-meta="${r.meta}"
                data-anual="${r.anual}"
                aria-label="Editar meta de ${r.nome}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </td>
          </tr>`;
      }).join('');

      // Bind inputs inline
      tbody.querySelectorAll('.goal-field').forEach(inp => {
        inp.addEventListener('change', () => {
          const rId = inp.dataset.radioId;
          const field = inp.dataset.field;
          if (!State.goalEdits[rId]) State.goalEdits[rId] = {};
          State.goalEdits[rId][field] = parseFloat(inp.value) || 0;
        });
      });

      // Bind botão editar meta (abre modal)
      tbody.querySelectorAll('.btn-edit-goal').forEach(btn => {
        btn.addEventListener('click', () => {
          Modais.openGoal({
            radioId:   btn.dataset.radioId,
            radioNome: btn.dataset.radioNome,
            meta:      parseFloat(btn.dataset.meta),
            anual:     parseFloat(btn.dataset.anual),
          });
        });
      });
    }

    function renderCommRatesTable() {
      const tbody = document.getElementById('commRatesBody');
      if (!tbody) return;

      tbody.innerHTML = MOCK_TOP_MEDICOS.map(m => {
        const editedRate = State.commRateEdits[m.nome];
        const rate = editedRate !== undefined ? editedRate : m.comissao;
        const estimated = Math.round(m.faturamento * rate / 100);
        return `
          <tr>
            <td><span class="data-table__name-primary">${m.nome}</span></td>
            <td>${m.clinica}</td>
            <td class="data-table__num">${H.percent(m.comissao)}</td>
            <td class="data-table__num">
              <input type="number" class="comm-rate-field${editedRate !== undefined ? ' is-modified' : ''}"
                data-med-nome="${m.nome}"
                data-fat="${m.faturamento}"
                value="${rate}" min="0" max="100" step="0.5"
                aria-label="Nova taxa de comissão para ${m.nome}">
            </td>
            <td class="data-table__num">${H.currency(m.faturamento)}</td>
            <td class="data-table__num comm-estimated-${m.nome.replace(/\s/g,'_')}">${H.currency(estimated)}</td>
          </tr>`;
      }).join('');

      tbody.querySelectorAll('.comm-rate-field').forEach(inp => {
        inp.addEventListener('input', () => {
          const nome = inp.dataset.medNome;
          const fat  = parseFloat(inp.dataset.fat);
          const rate = parseFloat(inp.value) || 0;
          State.commRateEdits[nome] = rate;
          inp.classList.add('is-modified');
          const estimated = Math.round(fat * rate / 100);
          const cell = tbody.querySelector(`.comm-estimated-${nome.replace(/\s/g,'_')}`);
          if (cell) cell.textContent = H.currency(estimated);
          updateImpactSimulator();
        });
      });
    }

    function renderAdjustmentHistory() {
      const tbody = document.getElementById('adjustmentHistoryBody');
      if (!tbody) return;

      tbody.innerHTML = MOCK_HISTORICO_AJUSTES.map(a => `
        <tr>
          <td>${H.formatDate(a.data)}</td>
          <td><span class="badge ${a.tipo === 'Meta' ? 'badge--info' : 'badge--partial'}">${a.tipo}</span></td>
          <td>${a.descricao}</td>
          <td class="data-table__num">${a.anterior}</td>
          <td class="data-table__num"><strong>${a.novo}</strong></td>
          <td>${a.responsavel}</td>
        </tr>`).join('');
    }

    function updateImpactSimulator() {
      const rateInput = document.getElementById('defaultCommRate');
      const impactVal = document.getElementById('impactValue');
      const impactRate = document.getElementById('impactRate');
      if (!rateInput || !impactVal) return;

      const newRate = parseFloat(rateInput.value) || 15;
      const currentRate = 15; // [API] puxar taxa atual do backend
      const totalFat = MOCK_KPIS.faturamentoTotal.value;
      const diff = ((newRate - currentRate) / 100) * totalFat;

      if (impactRate) impactRate.textContent = `${newRate}%`;
      impactVal.textContent = `${diff >= 0 ? '+' : ''}${H.currency(Math.abs(diff))} / mês`;
      impactVal.style.color = diff > 0 ? CFG.colors.warning : diff < 0 ? CFG.colors.positive : CFG.colors.textMuted;
    }

    function bindControls() {
      const rateInput = document.getElementById('defaultCommRate');
      if (rateInput) rateInput.addEventListener('input', updateImpactSimulator);

      const applyAll = document.getElementById('btnApplyAllComm');
      if (applyAll) {
        applyAll.addEventListener('click', () => {
          const rate = parseFloat(document.getElementById('defaultCommRate')?.value) || 15;
          document.querySelectorAll('.comm-rate-field').forEach(inp => {
            inp.value = rate;
            inp.classList.add('is-modified');
            const fat  = parseFloat(inp.dataset.fat) || 0;
            const nome = inp.dataset.medNome;
            State.commRateEdits[nome] = rate;
            const estimated = Math.round(fat * rate / 100);
            const cell = document.querySelector(`.comm-estimated-${nome.replace(/\s/g,'_')}`);
            if (cell) cell.textContent = H.currency(estimated);
          });
          H.toast('Taxa padrão aplicada para todos os médicos.', 'success');
        });
      }

      const saveRates = document.getElementById('btnSaveCommRates');
      if (saveRates) {
        saveRates.addEventListener('click', () => {
          // [API] POST /comissoes/taxas { taxas: State.commRateEdits }
          H.toast('Taxas de comissão salvas com sucesso!', 'success');
          State.commRateEdits = {};
          document.querySelectorAll('.comm-rate-field').forEach(inp => inp.classList.remove('is-modified'));
        });
      }

      const saveMetas = document.getElementById('btnSaveMetas');
      if (saveMetas) {
        saveMetas.addEventListener('click', () => {
          // [API] POST /metas { metas: State.goalEdits }
          H.toast('Metas salvas com sucesso!', 'success');
          State.goalEdits = {};
        });
      }
    }

    function render() {
      renderKPIs();
      renderGoalVsActualChart();
      renderMetasByRadiologiaTable();
      renderCommRatesTable();
      renderAdjustmentHistory();
      updateImpactSimulator();
      bindControls();
    }

    return { render };
  })();


  /* ===========================================================
     11. MODULE: RELATÓRIOS
  =========================================================== */
  const Relatorios = (() => {

    function renderHistory() {
      const tbody = document.getElementById('reportHistoryBody');
      if (!tbody) return;

      tbody.innerHTML = MOCK_HISTORICO_RELATORIOS.map(r => `
        <tr>
          <td><span class="data-table__name-primary">${r.nome}</span></td>
          <td>${r.periodo}</td>
          <td>${r.radiologia}</td>
          <td>${H.formatDateTime(r.geradoEm)}</td>
          <td>${H.formatBadge(r.formato)}</td>
          <td class="data-table__action">
            <button type="button" class="download-btn" aria-label="Baixar ${r.nome}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Baixar
            </button>
          </td>
        </tr>`).join('');
    }

    function renderCustomOptions() {
      // Radiologias no relatório customizado
      const radCont = document.getElementById('customReportRadiologies');
      if (radCont) {
        radCont.innerHTML = CFG.radiologies.filter(r => r.id !== 'all').map(r => `
          <label class="custom-check is-checked">
            <input type="checkbox" checked value="${r.id}">
            ${r.label.replace('Radiologia ','')}
          </label>`).join('');

        radCont.querySelectorAll('.custom-check').forEach(lbl => {
          lbl.addEventListener('click', () => lbl.classList.toggle('is-checked', lbl.querySelector('input').checked));
        });
      }

      // Colunas no relatório customizado
      const colCont = document.getElementById('customReportColumns');
      if (colCont) {
        colCont.innerHTML = CFG.reportColumns.map(col => `
          <label class="custom-check is-checked">
            <input type="checkbox" checked value="${col}">
            ${col}
          </label>`).join('');

        colCont.querySelectorAll('.custom-check').forEach(lbl => {
          lbl.addEventListener('click', () => lbl.classList.toggle('is-checked', lbl.querySelector('input').checked));
        });
      }
    }

    function bindExportButtons() {
      document.querySelectorAll('[data-export]').forEach(btn => {
        btn.addEventListener('click', () => {
          const fmt    = btn.dataset.export.toUpperCase();
          const report = btn.dataset.report;
          // [API] GET /relatorios/exportar?tipo=:report&formato=:fmt&periodo=:periodo&radiologia=:id
          H.toast(`Gerando ${report} em ${fmt}...`, 'info');
          setTimeout(() => H.toast(`Relatório exportado em ${fmt} com sucesso!`, 'success'), 1500);
        });
      });

      const generateCustom = document.getElementById('btnGenerateCustom');
      if (generateCustom) {
        generateCustom.addEventListener('click', () => {
          const radiologies = [...document.querySelectorAll('#customReportRadiologies .custom-check.is-checked input')].map(i => i.value);
          const columns     = [...document.querySelectorAll('#customReportColumns .custom-check.is-checked input')].map(i => i.value);
          const periodo     = document.getElementById('customReportPeriod')?.value || 'mes_atual';
          // [API] POST /relatorios/customizado { periodo, radiologies, columns }
          H.toast(`Gerando relatório customizado (${radiologies.length} radiologias, ${columns.length} colunas)...`, 'info');
          setTimeout(() => H.toast('Relatório customizado gerado!', 'success'), 1800);
        });
      }
    }

    function render() {
      renderHistory();
      renderCustomOptions();
      bindExportButtons();
    }

    return { render };
  })();


  /* ===========================================================
     12. MODULE: MODAIS
  =========================================================== */
  const Modais = (() => {

    /* ----- Modal de Pagamento ----- */
    function openPayment(data) {
      const backdrop = document.getElementById('modalPaymentBackdrop');
      if (!backdrop) return;

      document.getElementById('modalDoctorName').textContent  = data.medNome;
      document.getElementById('modalClinicName').textContent  = data.cliNome || '—';
      document.getElementById('modalTotalDue').textContent    = H.currency(data.totalDue);
      document.getElementById('modalAlreadyPaid').textContent = H.currency(data.alreadyPaid);
      document.getElementById('modalPending').textContent     = H.currency(data.pending);

      const amtInput = document.getElementById('paymentAmount');
      if (amtInput) amtInput.value = data.pending;

      const dateInput = document.getElementById('paymentDate');
      if (dateInput) dateInput.value = H.today();

      // Guarda referência para o confirm
      backdrop._currentMedId = data.medId;
      backdrop._currentPending = data.pending;

      backdrop.hidden = false;
      backdrop.removeAttribute('aria-hidden');
      document.getElementById('paymentAmount')?.focus();
    }

    function closePayment() {
      const backdrop = document.getElementById('modalPaymentBackdrop');
      if (backdrop) { backdrop.hidden = true; backdrop.setAttribute('aria-hidden','true'); }
    }

    function bindPaymentModal() {
      const backdrop = document.getElementById('modalPaymentBackdrop');
      const closeBtn = document.getElementById('modalPaymentClose');
      const cancelBtn = document.getElementById('modalPaymentCancel');
      const confirmBtn = document.getElementById('modalPaymentConfirm');

      if (closeBtn)  closeBtn.addEventListener('click', closePayment);
      if (cancelBtn) cancelBtn.addEventListener('click', closePayment);
      if (backdrop)  backdrop.addEventListener('click', e => { if (e.target === backdrop) closePayment(); });

      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          const amount = parseFloat(document.getElementById('paymentAmount')?.value) || 0;
          const date   = document.getElementById('paymentDate')?.value || H.today();
          const method = document.getElementById('paymentMethod')?.value || 'pix';
          const notes  = document.getElementById('paymentNotes')?.value || '';

          if (amount <= 0) { H.toast('Informe um valor válido para pagar.', 'error'); return; }

          // [API] POST /comissoes/pagamento { medId, amount, date, method, notes }
          H.toast(`Pagamento de ${H.currency(amount)} registrado com sucesso!`, 'success');
          closePayment();
        });
      }

      // Escape key
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          if (!document.getElementById('modalPaymentBackdrop')?.hidden) closePayment();
          if (!document.getElementById('modalGoalBackdrop')?.hidden)    closeGoal();
        }
      });
    }

    /* ----- Modal de Meta ----- */
    function openGoal(data) {
      const backdrop = document.getElementById('modalGoalBackdrop');
      if (!backdrop) return;

      State.goalEditing = data.radioId;

      const nameEl = document.getElementById('modalGoalRadiologia');
      if (nameEl) nameEl.textContent = `Radiologia ${data.radioNome}`;

      const monthInput = document.getElementById('goalMonthlyInput');
      const yearInput  = document.getElementById('goalYearlyInput');
      if (monthInput) monthInput.value = State.goalEdits[data.radioId]?.meta  ?? data.meta;
      if (yearInput)  yearInput.value  = State.goalEdits[data.radioId]?.anual ?? data.anual;

      backdrop.hidden = false;
      backdrop.removeAttribute('aria-hidden');
      monthInput?.focus();
    }

    function closeGoal() {
      const backdrop = document.getElementById('modalGoalBackdrop');
      if (backdrop) { backdrop.hidden = true; backdrop.setAttribute('aria-hidden','true'); }
      State.goalEditing = null;
    }

    function bindGoalModal() {
      const backdrop   = document.getElementById('modalGoalBackdrop');
      const closeBtn   = document.getElementById('modalGoalClose');
      const cancelBtn  = document.getElementById('modalGoalCancel');
      const confirmBtn = document.getElementById('modalGoalConfirm');

      if (closeBtn)  closeBtn.addEventListener('click', closeGoal);
      if (cancelBtn) cancelBtn.addEventListener('click', closeGoal);
      if (backdrop)  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeGoal(); });

      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          const radioId = State.goalEditing;
          if (!radioId) return;
          const meta  = parseFloat(document.getElementById('goalMonthlyInput')?.value) || 0;
          const anual = parseFloat(document.getElementById('goalYearlyInput')?.value)  || 0;

          if (!State.goalEdits[radioId]) State.goalEdits[radioId] = {};
          State.goalEdits[radioId].meta  = meta;
          State.goalEdits[radioId].anual = anual;

          // [API] PUT /metas/:radioId { meta, anual }
          H.toast('Meta atualizada! Clique em "Salvar Metas" para confirmar.', 'success');
          closeGoal();
          renderMetasByRadiologiaTable(); // re-render inline
        });
      }
    }

    // Referência local para re-render de tabela
    function renderMetasByRadiologiaTable() {
      Metas.render();
    }

    function init() {
      bindPaymentModal();
      bindGoalModal();
    }

    return { init, openPayment, openGoal };
  })();


  /* ===========================================================
     13. BOOTSTRAP
  =========================================================== */
  function init() {
    // Configura Chart.js defaults globais
    ChartFactory.defaults();

    // Inicializa módulos
    Filtros.init();
    Tabs.init();
    Modais.init();

    // Renderiza aba inicial (Visão Geral)
    VisaoGeral.render();

    // Set data inicial do input de pagamento
    const dateInput = document.getElementById('paymentDate');
    if (dateInput) dateInput.value = H.today();
  }

  // Aguarda DOM pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();