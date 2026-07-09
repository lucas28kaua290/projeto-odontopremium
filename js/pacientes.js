/* =============================================================
   IORD — Painel de Gestão | Radiologias Odontológicas
   Tela de Pacientes — JavaScript
============================================================= */

'use strict';

/* =============================================================
   DADOS MOCK
============================================================= */
const PACIENTES = [
  {
    id: 'P-0001',
    nome: 'Juliana Sales de Andrade',
    cpf: '312.456.789-00',
    telefone: '(84) 99812-3456',
    email: 'juliana.andrade@email.com',
    nascimento: '1990-03-15',
    endereco: 'Rua das Flores, 142 — Tirol, Natal/RN',
    status: 'ativo',
    cadastro: '2022-01-10',
    observacoes: 'Paciente com histórico de ansiedade durante exames. Prefere agendamentos matutinos.',
    exames: [
      { data: '2024-11-20', tipo: 'Tomografia Cone Beam', unidade: 'Unidade Natal Centro', valor: 420.00, status: 'realizado' },
      { data: '2024-07-05', tipo: 'Panorâmica Digital', unidade: 'Unidade Natal Centro', valor: 120.00, status: 'realizado' },
      { data: '2023-12-18', tipo: 'Periapical', unidade: 'Unidade Mossoró', valor: 60.00, status: 'realizado' },
      { data: '2023-05-22', tipo: 'Panorâmica Digital', unidade: 'Unidade Natal Centro', valor: 120.00, status: 'realizado' },
    ],
    agendamentos: [
      { data: '2025-02-14', hora: '09:00', unidade: 'Unidade Natal Centro', tipo: 'Tomografia Cone Beam', status: 'confirmado' },
      { data: '2024-11-20', hora: '10:30', unidade: 'Unidade Natal Centro', tipo: 'Tomografia Cone Beam', status: 'realizado' },
    ],
    notas: [
      { texto: 'Paciente relatou alergia a látex. Verificar luvas e materiais antes do atendimento.', data: '2024-01-15' },
    ],
  },
  {
    id: 'P-0002',
    nome: 'Carlos Eduardo Figueiredo',
    cpf: '089.234.567-11',
    telefone: '(84) 98723-0011',
    email: 'carlosf@gmail.com',
    nascimento: '1985-07-22',
    endereco: 'Av. Prudente de Morais, 800 — Lagoa Nova, Natal/RN',
    status: 'ativo',
    cadastro: '2021-06-03',
    observacoes: '',
    exames: [
      { data: '2024-10-10', tipo: 'Panorâmica Digital', unidade: 'Unidade Natal Norte', valor: 120.00, status: 'realizado' },
      { data: '2024-03-14', tipo: 'Periapical', unidade: 'Unidade Natal Norte', valor: 60.00, status: 'realizado' },
      { data: '2023-08-01', tipo: 'Cefalométrica', unidade: 'Unidade Natal Norte', valor: 90.00, status: 'realizado' },
    ],
    agendamentos: [
      { data: '2025-03-05', hora: '14:00', unidade: 'Unidade Natal Norte', tipo: 'Panorâmica Digital', status: 'pendente' },
    ],
    notas: [],
  },
  {
    id: 'P-0003',
    nome: 'Fernanda Lopes Moura',
    cpf: '456.789.012-33',
    telefone: '(84) 99600-7788',
    email: 'fernanda.moura@hotmail.com',
    nascimento: '2001-11-30',
    endereco: 'Rua Seridó, 55 — Petrópolis, Natal/RN',
    status: 'novo',
    cadastro: '2025-01-02',
    observacoes: 'Primeira consulta. Encaminhada pelo Dr. Renato Alves.',
    exames: [
      { data: '2025-01-10', tipo: 'Tomografia Cone Beam', unidade: 'Unidade Natal Centro', valor: 420.00, status: 'realizado' },
    ],
    agendamentos: [
      { data: '2025-01-10', hora: '08:30', unidade: 'Unidade Natal Centro', tipo: 'Tomografia Cone Beam', status: 'realizado' },
    ],
    notas: [],
  },
  {
    id: 'P-0004',
    nome: 'Roberto Nunes Cavalcante',
    cpf: '222.333.444-55',
    telefone: '(84) 98811-2233',
    email: 'roberto.nunes@empresa.com',
    nascimento: '1972-04-08',
    endereco: 'Rua Açu, 300 — Mossoró/RN',
    status: 'inativo',
    cadastro: '2020-09-15',
    observacoes: 'Paciente não retornou desde 2022.',
    exames: [
      { data: '2022-06-14', tipo: 'Panorâmica Digital', unidade: 'Unidade Mossoró', valor: 120.00, status: 'realizado' },
      { data: '2021-11-20', tipo: 'Periapical', unidade: 'Unidade Mossoró', valor: 60.00, status: 'realizado' },
    ],
    agendamentos: [
      { data: '2022-06-14', hora: '15:00', unidade: 'Unidade Mossoró', tipo: 'Panorâmica Digital', status: 'realizado' },
    ],
    notas: [
      { texto: 'Tentativa de contato em outubro/2023 sem retorno.', data: '2023-10-05' },
    ],
  },
  {
    id: 'P-0005',
    nome: 'Beatriz Teixeira Sampaio',
    cpf: '599.001.234-77',
    telefone: '(84) 99900-5544',
    email: 'beatriz.sampaio@bol.com.br',
    nascimento: '1995-09-03',
    endereco: 'Rua João XXIII, 10 — Centro, Caicó/RN',
    status: 'ativo',
    cadastro: '2023-03-22',
    observacoes: '',
    exames: [
      { data: '2024-12-01', tipo: 'Cefalométrica', unidade: 'Unidade Natal Centro', valor: 90.00, status: 'realizado' },
      { data: '2024-05-19', tipo: 'Panorâmica Digital', unidade: 'Unidade Natal Centro', valor: 120.00, status: 'realizado' },
      { data: '2023-09-10', tipo: 'Tomografia Cone Beam', unidade: 'Unidade Natal Centro', valor: 420.00, status: 'realizado' },
    ],
    agendamentos: [
      { data: '2025-02-20', hora: '11:00', unidade: 'Unidade Natal Centro', tipo: 'Panorâmica Digital', status: 'confirmado' },
    ],
    notas: [],
  },
  {
    id: 'P-0006',
    nome: 'Thiago Almeida Brandão',
    cpf: '711.822.933-44',
    telefone: '(84) 98755-3322',
    email: 'thiago.brandao@outlook.com',
    nascimento: '1988-12-17',
    endereco: 'Av. Alexandrino de Alencar, 1200 — Tirol, Natal/RN',
    status: 'ativo',
    cadastro: '2022-07-18',
    observacoes: 'Paciente hipertenso. Comunicar equipe antes do atendimento.',
    exames: [
      { data: '2024-09-05', tipo: 'Tomografia Cone Beam', unidade: 'Unidade Natal Norte', valor: 420.00, status: 'realizado' },
      { data: '2024-01-22', tipo: 'Panorâmica Digital', unidade: 'Unidade Natal Norte', valor: 120.00, status: 'realizado' },
      { data: '2023-04-11', tipo: 'Periapical', unidade: 'Unidade Natal Norte', valor: 60.00, status: 'realizado' },
      { data: '2022-09-30', tipo: 'Cefalométrica', unidade: 'Unidade Natal Norte', valor: 90.00, status: 'realizado' },
    ],
    agendamentos: [],
    notas: [
      { texto: 'Pressão alta registrada na última visita. Orientado a trazer receita médica.', data: '2024-09-05' },
    ],
  },
  {
    id: 'P-0007',
    nome: 'Patrícia Sousa Lima',
    cpf: '100.200.300-40',
    telefone: '(84) 99120-6677',
    email: 'patricia.lima@gmail.com',
    nascimento: '2003-06-25',
    endereco: 'Rua Bela Vista, 77 — Nova Parnamirim, Parnamirim/RN',
    status: 'novo',
    cadastro: '2025-01-28',
    observacoes: '',
    exames: [
      { data: '2025-01-30', tipo: 'Panorâmica Digital', unidade: 'Unidade Natal Sul', valor: 120.00, status: 'realizado' },
    ],
    agendamentos: [
      { data: '2025-01-30', hora: '09:30', unidade: 'Unidade Natal Sul', tipo: 'Panorâmica Digital', status: 'realizado' },
    ],
    notas: [],
  },
  {
    id: 'P-0008',
    nome: 'Marcos Vinícius Rocha',
    cpf: '850.960.070-88',
    telefone: '(84) 98644-9900',
    email: 'mvinirocha@terra.com.br',
    nascimento: '1979-02-14',
    endereco: 'Rua Dr. Barata, 5 — Centro, Mossoró/RN',
    status: 'ativo',
    cadastro: '2020-11-05',
    observacoes: 'Prefere atendimento no período da tarde.',
    exames: [
      { data: '2024-08-22', tipo: 'Tomografia Cone Beam', unidade: 'Unidade Mossoró', valor: 420.00, status: 'realizado' },
      { data: '2023-11-14', tipo: 'Panorâmica Digital', unidade: 'Unidade Mossoró', valor: 120.00, status: 'realizado' },
      { data: '2022-05-03', tipo: 'Cefalométrica', unidade: 'Unidade Mossoró', valor: 90.00, status: 'realizado' },
      { data: '2021-03-19', tipo: 'Periapical', unidade: 'Unidade Mossoró', valor: 60.00, status: 'realizado' },
      { data: '2020-12-08', tipo: 'Panorâmica Digital', unidade: 'Unidade Mossoró', valor: 120.00, status: 'realizado' },
    ],
    agendamentos: [
      { data: '2025-03-10', hora: '16:00', unidade: 'Unidade Mossoró', tipo: 'Tomografia Cone Beam', status: 'confirmado' },
    ],
    notas: [],
  },
];

/* =============================================================
   ESTADO DA APLICAÇÃO
============================================================= */
const state = {
  pacientes: [...PACIENTES],
  filtrados: [...PACIENTES],
  paginaAtual: 1,
  porPagina: 8,
  buscaTexto: '',
  buscaScope: 'todos',
  filtroRapido: 'todos',
  pacienteAtivo: null,
  editandoId: null,
  historicoAba: 'exames',
};

/* =============================================================
   UTILITÁRIOS
============================================================= */
function iniciais(nome) {
  return nome.trim().split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function formatarData(dataStr) {
  if (!dataStr) return '—';
  const [a, m, d] = dataStr.split('-');
  return `${d}/${m}/${a}`;
}

function calcularIdade(nascimento) {
  if (!nascimento) return null;
  const hoje = new Date();
  const nasc = new Date(nascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function tempoRelativo(dataStr) {
  if (!dataStr) return '—';
  const agora = new Date();
  const data = new Date(dataStr);
  const diffMs = agora - data;
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDias < 1) return 'hoje';
  if (diffDias === 1) return 'ontem';
  if (diffDias < 30) return `há ${diffDias} dias`;
  const meses = Math.floor(diffDias / 30);
  if (meses < 12) return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  return `há ${anos} ${anos === 1 ? 'ano' : 'anos'}`;
}

function formatarValor(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function unidadeMaisFrequente(exames) {
  if (!exames.length) return '—';
  const contagem = {};
  exames.forEach(e => { contagem[e.unidade] = (contagem[e.unidade] || 0) + 1; });
  return Object.entries(contagem).sort((a, b) => b[1] - a[1])[0][0];
}

function ultimoExame(exames) {
  if (!exames.length) return null;
  return exames.slice().sort((a, b) => new Date(b.data) - new Date(a.data))[0];
}

function formatarCPF(valor) {
  return valor.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatarTelefone(valor) {
  const n = valor.replace(/\D/g, '');
  if (n.length <= 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

function gerarId() {
  const max = state.pacientes.reduce((acc, p) => {
    const n = parseInt(p.id.replace('P-', ''));
    return n > acc ? n : acc;
  }, 0);
  return `P-${String(max + 1).padStart(4, '0')}`;
}

function statusLabel(status) {
  const map = { ativo: 'Ativo', novo: 'Novo', inativo: 'Inativo', confirmado: 'Confirmado', pendente: 'Pendente', realizado: 'Realizado', cancelado: 'Cancelado' };
  return map[status] || status;
}

function statusTagClass(status) {
  const map = { ativo: 'status-tag--active', novo: 'status-tag--new', inativo: 'status-tag--inactive', confirmado: 'status-tag--active', pendente: 'status-tag--new', realizado: 'status-tag--inactive', cancelado: 'status-tag--inactive' };
  return map[status] || '';
}

/* =============================================================
   REFERÊNCIAS DOM
============================================================= */
const $ = id => document.getElementById(id);
const viewLista = $('view-lista');
const viewPerfil = $('view-perfil');
const tabelaBody = $('tabela-pacientes-body');
const emptyState = $('empty-state');
const contadorResultados = $('contador-resultados');
const paginacaoEl = $('paginacao');
const paginacaoExibindo = $('paginacao-exibindo');
const paginacaoTotal = $('paginacao-total');
const inputBusca = $('input-busca');
const btnClearSearch = $('btn-clear-search');
const scopePills = $('scope-pills');
const quickFilterPills = $('quick-filter-pills');
const modalPaciente = $('modal-paciente');
const formPaciente = $('form-paciente');
const modalTitulo = $('modal-titulo');
const btnNovoPaciente = $('btn-novo-paciente');
const btnFecharModal = $('btn-fechar-modal');
const btnCancelarModal = $('btn-cancelar-modal');
const toast = $('toast');
const toastText = $('toast-text');

/* =============================================================
   FILTROS & BUSCA
============================================================= */
function aplicarFiltros() {
  const texto = state.buscaTexto.toLowerCase().trim();
  const scope = state.buscaScope;
  const filtro = state.filtroRapido;
  const hoje = new Date();
  const trintaDias = new Date(hoje - 30 * 24 * 60 * 60 * 1000);

  state.filtrados = state.pacientes.filter(p => {
    // Filtro rápido
    if (filtro === 'ativos' && p.status !== 'ativo') return false;
    if (filtro === 'novos' && p.status !== 'novo') return false;
    if (filtro === 'agendamentos') {
      const temRecente = p.agendamentos.some(a => new Date(a.data) >= trintaDias);
      if (!temRecente) return false;
    }

    // Busca por texto
    if (!texto) return true;
    if (scope === 'todos') {
      return p.nome.toLowerCase().includes(texto)
        || p.cpf.includes(texto)
        || p.telefone.replace(/\D/g, '').includes(texto.replace(/\D/g, ''))
        || p.id.toLowerCase().includes(texto);
    }
    if (scope === 'nome') return p.nome.toLowerCase().includes(texto);
    if (scope === 'cpf') return p.cpf.replace(/\D/g, '').includes(texto.replace(/\D/g, ''));
    if (scope === 'telefone') return p.telefone.replace(/\D/g, '').includes(texto.replace(/\D/g, ''));
    if (scope === 'codigo') return p.id.toLowerCase().includes(texto);
    return true;
  });

  state.paginaAtual = 1;
  contadorResultados.textContent = state.filtrados.length;
  renderTabela();
}

/* =============================================================
   RENDERIZAR TABELA
============================================================= */
function renderTabela() {
  const inicio = (state.paginaAtual - 1) * state.porPagina;
  const fim = inicio + state.porPagina;
  const pagina = state.filtrados.slice(inicio, fim);

  tabelaBody.innerHTML = '';

  if (!pagina.length) {
    emptyState.hidden = false;
    $('tabela-footer').hidden = true;
    return;
  }

  emptyState.hidden = true;
  $('tabela-footer').hidden = false;

  pagina.forEach(p => {
    const ultimo = ultimoExame(p.exames);
    const unidade = unidadeMaisFrequente(p.exames);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="data-table__name-cell">
          <div class="data-table__avatar">${iniciais(p.nome)}</div>
          <div>
            <span class="data-table__name-primary">${p.nome}</span>
            <span class="data-table__name-secondary">${p.id}</span>
          </div>
        </div>
      </td>
      <td>${p.cpf}</td>
      <td>${p.telefone}</td>
      <td>
        ${ultimo ? `<span>${formatarData(ultimo.data)}</span><span class="data-table__exam-type">${ultimo.tipo}</span>` : '<span>—</span>'}
      </td>
      <td class="data-table__num">${p.exames.length}</td>
      <td>${unidade}</td>
      <td class="data-table__action">
        <div class="data-table__actions-cell">
          <button class="row-action-btn" data-action="ver" data-id="${p.id}" title="Ver perfil" aria-label="Ver perfil de ${p.nome}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
          <button class="row-action-btn" data-action="editar" data-id="${p.id}" title="Editar" aria-label="Editar ${p.nome}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H6C4.9 4 4 4.9 4 6V18C4 19.1 4.9 20 6 20H18C19.1 20 20 19.1 20 18V13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18.5 2.5C19.33 1.67 20.67 1.67 21.5 2.5C22.33 3.33 22.33 4.67 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    `;
    // Clicar na linha abre o perfil (exceto na célula de ações)
    tr.addEventListener('click', e => {
      if (e.target.closest('[data-action]')) return;
      abrirPerfil(p.id);
    });
    tabelaBody.appendChild(tr);
  });

  renderPaginacao();
  atualizarRodapePaginacao(inicio, fim);
}

/* =============================================================
   PAGINAÇÃO
============================================================= */
function renderPaginacao() {
  const total = state.filtrados.length;
  const totalPaginas = Math.ceil(total / state.porPagina);
  paginacaoEl.innerHTML = '';

  if (totalPaginas <= 1) return;

  const criarBtn = (label, pagina, desabilitado = false, ativo = false) => {
    const btn = document.createElement('button');
    btn.className = 'pagination__btn' + (ativo ? ' is-active' : '');
    btn.textContent = label;
    btn.disabled = desabilitado;
    if (!desabilitado && !ativo) {
      btn.addEventListener('click', () => {
        state.paginaAtual = pagina;
        renderTabela();
        viewLista.querySelector('.table-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    return btn;
  };

  paginacaoEl.appendChild(criarBtn('‹', state.paginaAtual - 1, state.paginaAtual === 1));

  for (let i = 1; i <= totalPaginas; i++) {
    if (totalPaginas > 7 && i > 2 && i < totalPaginas - 1 && Math.abs(i - state.paginaAtual) > 1) {
      if (i === 3 || i === totalPaginas - 2) {
        const sep = document.createElement('span');
        sep.textContent = '…';
        sep.style.cssText = 'padding:0 4px;color:var(--color-text-subtle);font-size:var(--fs-xs)';
        paginacaoEl.appendChild(sep);
      }
      continue;
    }
    paginacaoEl.appendChild(criarBtn(i, i, false, i === state.paginaAtual));
  }

  paginacaoEl.appendChild(criarBtn('›', state.paginaAtual + 1, state.paginaAtual === totalPaginas));
}

function atualizarRodapePaginacao(inicio, fim) {
  paginacaoExibindo.textContent = Math.min(fim, state.filtrados.length) - inicio;
  paginacaoTotal.textContent = state.filtrados.length;
}

/* =============================================================
   PERFIL DO PACIENTE
============================================================= */
function abrirPerfil(id) {
  const p = state.pacientes.find(x => x.id === id);
  if (!p) return;
  state.pacienteAtivo = p;
  state.historicoAba = 'exames';

  viewLista.hidden = true;
  viewLista.style.display = 'none';
  viewPerfil.hidden = false;
  viewPerfil.style.display = 'flex';

  // Avatar e nome
  $('perfil-avatar').textContent = iniciais(p.nome);
  $('perfil-nome').textContent = p.nome;

  // Status
  const statusEl = $('perfil-status');
  statusEl.textContent = statusLabel(p.status);
  statusEl.className = `status-tag ${statusTagClass(p.status)}`;

  // Meta (CPF · Idade · Código)
  const idade = calcularIdade(p.nascimento);
  $('perfil-meta').innerHTML = `
    <span>${p.cpf}</span>
    <span>${idade !== null ? idade + ' anos' : '—'}</span>
    <span>Cód. ${p.id}</span>
  `;

  // KPIs
  const totalGasto = p.exames.reduce((s, e) => s + e.valor, 0);
  const unidadeFreq = unidadeMaisFrequente(p.exames);
  const contUnidade = p.exames.filter(e => e.unidade === unidadeFreq).length;

  $('kpi-visitas').textContent = p.exames.length;
  $('kpi-total-gasto').textContent = formatarValor(totalGasto);
  $('kpi-paciente-desde').textContent = formatarData(p.cadastro);
  $('kpi-tempo-relativo').textContent = tempoRelativo(p.cadastro);
  $('kpi-radiologia-frequente').textContent = unidadeFreq;
  $('kpi-radiologia-visitas').textContent = `${contUnidade} visita${contUnidade !== 1 ? 's' : ''}`;

  // Contato Rápido
  const contatoEl = $('perfil-contato-rapido');
  contatoEl.innerHTML = `
    <a href="tel:${p.telefone}" class="contact-quick-item">
      <span class="contact-quick-item__icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 16.92V19.92C22 20.48 21.56 20.93 21 20.97C20.17 21.03 19.33 21 18.5 20.88C14.57 20.24 10.89 18.46 7.89 15.82C5.15 13.42 2.99 10.47 1.62 7.14C1.21 6.17 0.92 5.16 0.76 4.12C0.69 3.57 1.11 3.08 1.67 3.04H4.67C5.14 3.04 5.55 3.37 5.64 3.83C5.76 4.45 5.96 5.06 6.22 5.64C6.37 5.97 6.28 6.36 6.01 6.59L4.83 7.57C6.15 10.01 8.11 12.08 10.49 13.56L11.67 12.58C11.9 12.31 12.29 12.22 12.62 12.37C13.2 12.63 13.81 12.83 14.43 12.95C14.89 13.04 15.22 13.45 15.22 13.92V16.92" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <div>
        <span class="contact-quick-item__label">Ligar</span>
        <span class="contact-quick-item__value">${p.telefone}</span>
      </div>
    </a>
    <a href="https://wa.me/55${p.telefone.replace(/\D/g, '')}" target="_blank" class="contact-quick-item">
      <span class="contact-quick-item__icon contact-quick-item__icon--whatsapp">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.258-.155-2.844.843.849-2.812-.168-.277A8 8 0 1112 20z"/></svg>
      </span>
      <div>
        <span class="contact-quick-item__label">WhatsApp</span>
        <span class="contact-quick-item__value">${p.telefone}</span>
      </div>
    </a>
    ${p.email ? `
    <a href="mailto:${p.email}" class="contact-quick-item">
      <span class="contact-quick-item__icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M22 7L13.03 12.7a1.94 1.94 0 01-2.06 0L2 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <div>
        <span class="contact-quick-item__label">E-mail</span>
        <span class="contact-quick-item__value">${p.email}</span>
      </div>
    </a>` : ''}
  `;

  // Informações básicas
  const infoBasica = $('perfil-info-basica');
  const campos = [
    ['Telefone', p.telefone],
    ['E-mail', p.email || '—'],
    ['Nascimento', formatarData(p.nascimento)],
    ['Endereço', p.endereco || '—'],
    ['Cadastro', formatarData(p.cadastro)],
    ['Status', statusLabel(p.status)],
  ];
  infoBasica.innerHTML = campos.map(([label, valor]) => `
    <div>
      <dt>${label}</dt>
      <dd>${valor}</dd>
    </div>
  `).join('');

  // Notas
  renderNotas(p);

  // Histórico: exames ativos por padrão
  ativarAbaHistorico('exames');

  // Scroll topo
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderNotas(p) {
  const lista = $('perfil-notas');
  if (!p.notas.length) {
    lista.innerHTML = '';
    return;
  }
  lista.innerHTML = p.notas.map(n => `
    <li class="note-item">
      <span class="note-item__text">${n.texto}</span>
      <span class="note-item__meta">${formatarData(n.data)}</span>
    </li>
  `).join('');
}

function renderTimeline(exames) {
  const lista = $('timeline-exames');
  if (!exames.length) {
    lista.innerHTML = '<li style="padding:var(--space-5);color:var(--color-text-subtle);font-size:var(--fs-sm);">Nenhum exame registrado.</li>';
    return;
  }
  const ordenados = [...exames].sort((a, b) => new Date(b.data) - new Date(a.data));
  lista.innerHTML = ordenados.map(e => `
    <li class="timeline-item">
      <div class="timeline-item__rail">
        <div class="timeline-item__dot"></div>
        <div class="timeline-item__line"></div>
      </div>
      <div class="timeline-item__content">
        <div class="timeline-item__top">
          <span class="timeline-item__exam">${e.tipo}</span>
          <span class="timeline-item__date">${formatarData(e.data)}</span>
        </div>
        <span class="timeline-item__unit">${e.unidade}</span>
        <span class="timeline-item__value">${formatarValor(e.valor)}</span>
      </div>
    </li>
  `).join('');
}

function renderTabelaAgendamentos(agendamentos) {
  const tbody = $('tabela-agendamentos-body');
  if (!agendamentos.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:var(--space-5);color:var(--color-text-subtle);font-size:var(--fs-sm);">Nenhum agendamento registrado.</td></tr>';
    return;
  }
  const ordenados = [...agendamentos].sort((a, b) => new Date(b.data) - new Date(a.data));
  tbody.innerHTML = ordenados.map(a => `
    <tr>
      <td>${formatarData(a.data)}</td>
      <td>${a.hora}</td>
      <td>${a.unidade}</td>
      <td>${a.tipo}</td>
      <td><span class="status-tag ${statusTagClass(a.status)}">${statusLabel(a.status)}</span></td>
    </tr>
  `).join('');
}

function ativarAbaHistorico(aba) {
  state.historicoAba = aba;
  const p = state.pacienteAtivo;

  document.querySelectorAll('[data-historico]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.historico === aba);
  });

  $('painel-exames').hidden = aba !== 'exames';
  $('painel-agendamentos').hidden = aba !== 'agendamentos';

  if (aba === 'exames') renderTimeline(p.exames);
  else renderTabelaAgendamentos(p.agendamentos);
}

/* =============================================================
   MODAL (NOVO / EDITAR)
============================================================= */
function abrirModal(id = null) {
  state.editandoId = id;
  modalTitulo.textContent = id ? 'Editar Paciente' : 'Novo Paciente';
  formPaciente.reset();

  if (id) {
    const p = state.pacientes.find(x => x.id === id);
    if (p) {
      $('f-nome').value = p.nome;
      $('f-cpf').value = p.cpf;
      $('f-telefone').value = p.telefone;
      $('f-nascimento').value = p.nascimento || '';
      $('f-email').value = p.email || '';
      $('f-endereco').value = p.endereco || '';
      $('f-observacoes').value = p.observacoes || '';
    }
  }

  modalPaciente.hidden = false;
  modalPaciente.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('f-nome').focus(), 100);
}

function fecharModal() {
  modalPaciente.style.display = 'none';
  modalPaciente.hidden = true;
  document.body.style.overflow = '';
  state.editandoId = null;
  formPaciente.reset();
}

function salvarPaciente(e) {
  e.preventDefault();

  const nome = $('f-nome').value.trim();
  const cpf = $('f-cpf').value.trim();
  const telefone = $('f-telefone').value.trim();
  const nascimento = $('f-nascimento').value;
  const email = $('f-email').value.trim();
  const endereco = $('f-endereco').value.trim();
  const observacoes = $('f-observacoes').value.trim();

  if (state.editandoId) {
    const idx = state.pacientes.findIndex(x => x.id === state.editandoId);
    if (idx !== -1) {
      state.pacientes[idx] = { ...state.pacientes[idx], nome, cpf, telefone, nascimento, email, endereco, observacoes };
      if (state.pacienteAtivo?.id === state.editandoId) {
        state.pacienteAtivo = state.pacientes[idx];
        abrirPerfil(state.editandoId);
      }
    }
    mostrarToast('Paciente atualizado com sucesso.');
  } else {
    const hoje = new Date().toISOString().split('T')[0];
    const novoPaciente = {
      id: gerarId(),
      nome, cpf, telefone, nascimento, email, endereco, observacoes,
      status: 'novo',
      cadastro: hoje,
      exames: [],
      agendamentos: [],
      notas: [],
    };
    state.pacientes.unshift(novoPaciente);
    mostrarToast('Paciente cadastrado com sucesso.');
  }

  fecharModal();
  aplicarFiltros();
}

/* =============================================================
   TOAST
============================================================= */
let toastTimer = null;
function mostrarToast(msg, duracao = 3000) {
  toastText.textContent = msg;
  // Remove display:none e qualquer estado anterior
  toast.removeAttribute('hidden');
  toast.style.display = 'flex';
  toast.style.opacity = '1';
  toast.style.pointerEvents = 'none';
  toast.style.animation = 'none';

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.transition = 'opacity 400ms ease';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.style.display = 'none';
      toast.setAttribute('hidden', '');
      toast.style.transition = '';
      toast.style.animation = '';
    }, 420);
  }, duracao);
}

/* =============================================================
   MÁSCARA DE CAMPOS
============================================================= */
$('f-cpf').addEventListener('input', function () {
  let v = this.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
  else if (v.length > 3) v = v.replace(/(\d{3})(\d+)/, '$1.$2');
  this.value = v;
});

$('f-telefone').addEventListener('input', function () {
  let v = this.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
  else if (v.length > 2) v = v.replace(/(\d{2})(\d+)/, '($1) $2');
  this.value = v;
});

/* =============================================================
   EVENT LISTENERS
============================================================= */

// Busca
inputBusca.addEventListener('input', () => {
  state.buscaTexto = inputBusca.value;
  btnClearSearch.classList.toggle('is-visible', !!inputBusca.value);
  aplicarFiltros();
});

btnClearSearch.addEventListener('click', () => {
  inputBusca.value = '';
  state.buscaTexto = '';
  btnClearSearch.classList.remove('is-visible');
  aplicarFiltros();
  inputBusca.focus();
});

// Scope pills
scopePills.addEventListener('click', e => {
  const pill = e.target.closest('[data-scope]');
  if (!pill) return;
  scopePills.querySelectorAll('.pill').forEach(p => p.classList.remove('is-active'));
  pill.classList.add('is-active');
  state.buscaScope = pill.dataset.scope;
  aplicarFiltros();
});

// Filtros rápidos
quickFilterPills.addEventListener('click', e => {
  const pill = e.target.closest('[data-filter]');
  if (!pill) return;
  quickFilterPills.querySelectorAll('.pill').forEach(p => p.classList.remove('is-active'));
  pill.classList.add('is-active');
  state.filtroRapido = pill.dataset.filter;
  aplicarFiltros();
});

// Ações na tabela (ver / editar)
tabelaBody.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  e.stopPropagation();
  const { action, id } = btn.dataset;
  if (action === 'ver') abrirPerfil(id);
  if (action === 'editar') abrirModal(id);
});

// Novo paciente
btnNovoPaciente.addEventListener('click', () => abrirModal());

// Fechar modal
btnFecharModal.addEventListener('click', fecharModal);
btnCancelarModal.addEventListener('click', fecharModal);
modalPaciente.addEventListener('click', e => {
  if (e.target === modalPaciente) fecharModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modalPaciente.hidden) fecharModal();
});

// Salvar
formPaciente.addEventListener('submit', salvarPaciente);

// Voltar para lista
$('btn-voltar-lista').addEventListener('click', () => {
  viewPerfil.hidden = true;
  viewPerfil.style.display = 'none';
  viewLista.hidden = false;
  viewLista.style.display = 'flex';
  state.pacienteAtivo = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Editar paciente (no perfil)
$('btn-editar-paciente').addEventListener('click', () => {
  if (state.pacienteAtivo) abrirModal(state.pacienteAtivo.id);
});

// Toggle histórico (Exames / Agendamentos)
$('historico-toggle').addEventListener('click', e => {
  const btn = e.target.closest('[data-historico]');
  if (!btn) return;
  ativarAbaHistorico(btn.dataset.historico);
});

// Adicionar nota
$('btn-add-nota').addEventListener('click', () => {
  if (!state.pacienteAtivo) return;
  const texto = prompt('Nova observação:');
  if (!texto?.trim()) return;
  const hoje = new Date().toISOString().split('T')[0];
  state.pacienteAtivo.notas.unshift({ texto: texto.trim(), data: hoje });
  const idx = state.pacientes.findIndex(x => x.id === state.pacienteAtivo.id);
  if (idx !== -1) state.pacientes[idx].notas = state.pacienteAtivo.notas;
  renderNotas(state.pacienteAtivo);
  mostrarToast('Nota adicionada.');
});

// Exportar PDF (placeholder)
$('btn-exportar-pdf').addEventListener('click', () => {
  mostrarToast('Exportação de PDF em desenvolvimento.');
});

/* =============================================================
   INICIALIZAÇÃO
============================================================= */
function init() {
  // Garante estados iniciais corretos independente do HTML
  modalPaciente.style.display = 'none';
  modalPaciente.hidden = true;
  toast.style.display = 'none';
  toast.setAttribute('hidden', '');
  viewPerfil.hidden = true;
  viewPerfil.style.display = 'none';
  viewLista.hidden = false;
  viewLista.style.display = 'flex';
  aplicarFiltros();
}

init();