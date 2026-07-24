/* =============================================================
   IORD — Painel de Gestão | Radiologias Odontológicas
   Tela de Pacientes — JavaScript
============================================================= */

'use strict';

/* =============================================================
   ESTADO DA APLICAÇÃO
============================================================= */
const state = {
  pacientes: [],
  filtrados: [],
  paginaAtual: 1,
  porPagina: 8,
  buscaTexto: '',
  buscaScope: 'todos',
  filtroRapido: 'todos',
  pacienteAtivo: null,
  editandoId: null,
  historicoAba: 'exames',
  carregando: false,
};

/* =============================================================
   UTILITÁRIOS
============================================================= */
function iniciais(nome) {
  return nome.trim().split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function formatarData(dataStr) {
  if (!dataStr) return '—';
  // Remove a parte de hora se vier como datetime ISO (ex: "2026-07-23T21:43:11")
  const somenteData = String(dataStr).split('T')[0];
  const partes = somenteData.split('-');
  if (partes.length < 3) return '—';
  const [a, m, d] = partes;
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
  // Backend retorna campo como 'radiologia'; fallback para 'unidade' (mock legado)
  exames.forEach(e => {
    const key = e.radiologia || e.unidade || '—';
    contagem[key] = (contagem[key] || 0) + 1;
  });
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
  const map = { ativo: 'status-tag--active', novo: 'status-tag--new', inativo: 'status-tag--inactive', confirmado: 'status-tag--new', pendente: 'status-tag--new', realizado: 'status-tag--active', cancelado: 'status-tag--inactive' };
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
    // Usa campos pré-calculados pelo backend (_) quando disponíveis,
    // com fallback para cálculo local (exames carregados no perfil)
    const totalExames = p._totalExames ?? p.exames.length;
    const ultimaData = p._ultimoExame ?? (ultimoExame(p.exames)?.data || null);
    const ultimoTipo = p._ultimoExameTipo ?? (ultimoExame(p.exames)?.tipoExame || ultimoExame(p.exames)?.tipo || '');
    const radFrequente = p._radiologiaFrequente ?? unidadeMaisFrequente(p.exames);
    const cpfDisplay = p.cpf || '—';
    const telDisplay = p.telefone || '—';
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
      <td>${cpfDisplay}</td>
      <td>${telDisplay}</td>
      <td>
        ${ultimaData ? `<span>${formatarData(ultimaData)}</span><span class="data-table__exam-type">${ultimoTipo}</span>` : '<span>—</span>'}
      </td>
      <td class="data-table__num">${totalExames}</td>
      <td>${radFrequente}</td>
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
async function abrirPerfil(id) {
  viewLista.hidden = true;
  viewLista.style.display = 'none';
  viewPerfil.hidden = false;
  viewPerfil.style.display = 'flex';
  viewPerfil.setAttribute('aria-busy', 'true');

  let p, kpis, exames, agendamentos, notas;

  let _pRes, _kpisRes, _examesRes, _agendRes, _notasRes;
  try {
    [_pRes, _kpisRes, _examesRes, _agendRes, _notasRes] = await Promise.all([
      Api.getPaciente(id),
      Api.getPacienteKPIs(id),
      Api.getPacienteExames(id),
      Api.getPacienteAgendamentos(id),
      Api.getPacienteNotas(id),
    ]);
  } catch (err) {
    mostrarToast('Erro ao carregar dados do paciente.');
    console.error(err);
    viewPerfil.hidden = true;
    viewPerfil.style.display = 'none';
    viewLista.hidden = false;
    viewLista.style.display = 'flex';
    return;
  } finally {
    viewPerfil.removeAttribute('aria-busy');
  }

  // Unwrap do envelope { success, data } retornado pelo backend
  // Cada variável já recebe o conteúdo final — sem segundo unwrap depois
  p = _pRes.data || _pRes;
  kpis = _kpisRes.data || _kpisRes;   // <- kpis JÁ É o objeto com totalExames, totalGasto etc.
  exames = _examesRes.data || _examesRes || [];
  agendamentos = _agendRes.data || _agendRes || [];
  notas = _notasRes.data || _notasRes || [];

  // Monta objeto local para as funções de render
  state.pacienteAtivo = { ...p, exames, agendamentos, notas };
  state.historicoAba = 'exames';

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
    <span>${p.cpf || '—'}</span>
    <span>${idade !== null ? idade + ' anos' : '—'}</span>
    <span>Cód. ${p.id}</span>
  `;

  // KPIs — kpis já foi unwrappado acima, usar direto sem .data novamente
  const totalExames = kpis.totalExames != null ? Number(kpis.totalExames) : exames.length;
  const totalGasto = kpis.totalGasto != null ? Number(kpis.totalGasto)
    : exames.filter(e => e.status === 'realizado').reduce((s, e) => s + (Number(e.valor) || 0), 0);
  const unidadeFreq = kpis.unidadeMaisFrequente || unidadeMaisFrequente(exames) || '—';
  const visitasFreq = kpis.visitasUnidadeFreq != null
    ? Number(kpis.visitasUnidadeFreq)
    : exames.filter(e => (e.radiologia || e.unidade) === unidadeFreq).length;

  $('kpi-visitas').textContent = totalExames;
  $('kpi-total-gasto').textContent = formatarValor(isNaN(totalGasto) ? 0 : totalGasto);
  $('kpi-paciente-desde').textContent = formatarData(p.cadastro);
  $('kpi-tempo-relativo').textContent = tempoRelativo(p.cadastro);
  $('kpi-radiologia-frequente').textContent = unidadeFreq;
  $('kpi-radiologia-visitas').textContent = `${visitasFreq} visita${visitasFreq !== 1 ? 's' : ''}`;

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
    <div><dt>${label}</dt><dd>${valor}</dd></div>
  `).join('');

  renderNotas(state.pacienteAtivo);
  ativarAbaHistorico('exames');
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
      <span class="note-item__meta">${formatarData((n.data || n.criado_em || '').substring(0, 10))}</span>
    </li>
  `).join('');
}

function renderTimeline(exames) {
  const lista = $('timeline-exames');
  if (!exames.length) {
    lista.innerHTML = '<li style="padding:var(--space-5);color:var(--color-text-subtle);font-size:var(--fs-sm);">Nenhum exame realizado ainda.</li>';
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
          <span class="timeline-item__exam">${e.tipoExame || e.tipo || '—'}</span>
          <span class="timeline-item__date">${formatarData(e.data)}</span>
        </div>
        <span class="timeline-item__unit">${e.radiologia || e.unidade || '—'}</span>
        <div class="timeline-item__bottom">
          <span class="timeline-item__value">${formatarValor(Number(e.valor) || 0)}</span>
          <span class="status-tag ${statusTagClass(e.status)}">${statusLabel(e.status)}</span>
        </div>
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
      <td>${a.hora || '—'}</td>
      <td>${a.radiologia || a.unidade || '—'}</td>
      <td>${a.tipoExame || a.tipo || '—'}</td>
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
async function abrirModal(id = null) {
  state.editandoId = id;
  modalTitulo.textContent = id ? 'Editar Paciente' : 'Novo Paciente';
  formPaciente.reset();

  if (id) {
    // Prioriza o cache local; faz fallback para a API se não estiver carregado
    let p = state.pacientes.find(x => x.id === id);
    if (!p) {
      try {
        const res = await Api.getPaciente(id);
        p = res.data || res; // unwrap envelope
      } catch (err) {
        mostrarToast('Erro ao carregar dados do paciente.');
        console.error(err);
        return;
      }
    }

    $('f-nome').value = p.nome;
    $('f-cpf').value = p.cpf;
    $('f-telefone').value = p.telefone;
    $('f-nascimento').value = p.nascimento || '';
    $('f-email').value = p.email || '';
    $('f-endereco').value = p.endereco || '';
    $('f-observacoes').value = p.observacoes || '';
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

async function salvarPaciente(e) {
  e.preventDefault();

  const dados = {
    nome: $('f-nome').value.trim(),
    cpf: $('f-cpf').value.trim(),
    telefone: $('f-telefone').value.trim(),
    nascimento: $('f-nascimento').value,
    email: $('f-email').value.trim(),
    endereco: $('f-endereco').value.trim(),
    observacoes: $('f-observacoes').value.trim(),
  };

  try {
    if (state.editandoId) {
      const res = await Api.updatePaciente(state.editandoId, dados);
      const atualizado = res.data || res; // unwrap envelope
      // Atualiza cache local preservando exames/agendamentos/notas já carregados
      const idx = state.pacientes.findIndex(x => x.id === state.editandoId);
      if (idx !== -1) {
        state.pacientes[idx] = {
          ...state.pacientes[idx],
          ...atualizado,
          exames: state.pacientes[idx].exames || [],
          agendamentos: state.pacientes[idx].agendamentos || [],
          notas: state.pacientes[idx].notas || [],
          // Preserva campos calculados do backend
          _totalExames: state.pacientes[idx]._totalExames,
          _ultimoExame: state.pacientes[idx]._ultimoExame,
          _ultimoExameTipo: state.pacientes[idx]._ultimoExameTipo,
          _radiologiaFrequente: state.pacientes[idx]._radiologiaFrequente,
        };
      }
      if (state.pacienteAtivo?.id === state.editandoId) {
        await abrirPerfil(state.editandoId);
      }
      mostrarToast('Paciente atualizado com sucesso.');
    } else {
      const res = await Api.postPaciente(dados);
      const novoPaciente = res.data || res; // unwrap envelope
      // Adiciona ao topo do cache com arrays vazios (sem criar agendamentos!)
      state.pacientes.unshift({
        ...novoPaciente,
        exames: [],
        agendamentos: [],
        notas: [],
      });
      mostrarToast('Paciente cadastrado com sucesso.');
    }
  } catch (err) {
    mostrarToast('Erro ao salvar paciente. Tente novamente.');
    console.error(err);
    return; // mantém o modal aberto para o usuário tentar novamente
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

// Adicionar nota — usa modal inline em vez de prompt() (bloqueado em alguns browsers)
$('btn-add-nota').addEventListener('click', () => {
  if (!state.pacienteAtivo) return;
  abrirModalNota();
});

function abrirModalNota() {
  // Cria o modal na hora se ainda não existir
  let modal = $('modal-nota-inline');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-nota-inline';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:1000;
      display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.45);
    `;
    modal.innerHTML = `
      <div style="
        background:var(--color-surface,#fff);
        border-radius:var(--radius-lg,12px);
        padding:var(--space-6,24px);
        width:100%;max-width:440px;
        box-shadow:0 8px 32px rgba(0,0,0,0.18);
        display:flex;flex-direction:column;gap:var(--space-4,16px);
      ">
        <h3 style="margin:0;font-size:var(--fs-base,15px);font-weight:600;color:var(--color-text,#111);">
          Nova observação clínica
        </h3>
        <textarea id="nota-inline-texto" rows="4" placeholder="Digite a observação..." style="
          width:100%;resize:vertical;
          border:1px solid var(--color-border,#e2e8f0);
          border-radius:var(--radius-md,8px);
          padding:var(--space-3,12px);
          font-size:var(--fs-sm,13px);
          color:var(--color-text,#111);
          background:var(--color-surface,#fff);
          font-family:inherit;
          box-sizing:border-box;
        "></textarea>
        <div style="display:flex;justify-content:flex-end;gap:var(--space-3,12px);">
          <button id="nota-inline-cancelar" type="button" style="
            padding:var(--space-2,8px) var(--space-4,16px);
            border:1px solid var(--color-border,#e2e8f0);
            border-radius:var(--radius-md,8px);
            background:transparent;
            color:var(--color-text-subtle,#64748b);
            font-size:var(--fs-sm,13px);
            cursor:pointer;
          ">Cancelar</button>
          <button id="nota-inline-salvar" type="button" style="
            padding:var(--space-2,8px) var(--space-4,16px);
            border:none;
            border-radius:var(--radius-md,8px);
            background:var(--color-primary,#018093);
            color:#fff;
            font-size:var(--fs-sm,13px);
            font-weight:600;
            cursor:pointer;
          ">Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    $('nota-inline-cancelar').addEventListener('click', fecharModalNota);
    modal.addEventListener('click', e => { if (e.target === modal) fecharModalNota(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modal.hidden) fecharModalNota();
    });

    $('nota-inline-salvar').addEventListener('click', async () => {
      const texto = $('nota-inline-texto').value.trim();
      if (!texto) {
        $('nota-inline-texto').focus();
        return;
      }

      const btnSalvar = $('nota-inline-salvar');
      btnSalvar.disabled = true;
      btnSalvar.textContent = 'Salvando…';

      try {
        const res = await Api.postPacienteNota(state.pacienteAtivo.id, texto);
        const novaNota = res.data || res;
        state.pacienteAtivo.notas.unshift(novaNota);
        renderNotas(state.pacienteAtivo);
        fecharModalNota();
        mostrarToast('Observação adicionada.');
      } catch (err) {
        mostrarToast('Erro ao salvar observação. Tente novamente.');
        console.error(err);
      } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = 'Salvar';
      }
    });
  }

  $('nota-inline-texto').value = '';
  modal.style.display = 'flex';
  setTimeout(() => $('nota-inline-texto').focus(), 100);
}

function fecharModalNota() {
  const modal = $('modal-nota-inline');
  if (modal) modal.style.display = 'none';
}

$('btn-exportar-pdf').addEventListener('click', () => {
  if (!state.pacienteAtivo) return;
  exportarPerfilPDF(state.pacienteAtivo);
});

async function exportarPerfilPDF(p) {
  mostrarToast('Gerando PDF, aguarde…', 8000);

  const idade = calcularIdade(p.nascimento);

  // Mescla exames + agendamentos não cancelados, ordena por data desc
  const historico = [
    ...(p.exames || []).map(e => ({ ...e, _origem: 'exame' })),
    ...(p.agendamentos || []).filter(a => a.status !== 'cancelado').map(a => ({ ...a, _origem: 'agendamento' })),
  ].sort((a, b) => {
    const da = new Date(a.data + (a.hora ? 'T' + a.hora : ''));
    const db = new Date(b.data + (b.hora ? 'T' + b.hora : ''));
    return db - da;
  });

  const linhasHistorico = historico.length
    ? historico.map(item => `
        <tr>
          <td>${formatarData(item.data)}</td>
          <td>${item.hora || '—'}</td>
          <td>${item.tipoExame || item.tipo || '—'}</td>
          <td>${item.radiologia || item.unidade || '—'}</td>
          <td>${item.clinica || '—'}</td>
          <td>${item.medico || '—'}</td>
          <td>${item._origem === 'exame' ? formatarValor(Number(item.valor) || 0) : '—'}</td>
          <td><span class="pdf-badge pdf-badge--${item.status}">${statusLabel(item.status)}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="8" class="pdf-empty">Nenhum registro encontrado.</td></tr>`;

  const linhasNotas = (p.notas || []).length
    ? p.notas.map(n => `
        <div class="pdf-nota">
          <span class="pdf-nota__data">${formatarData((n.data || n.criado_em || '').substring(0, 10))}</span>
          <span class="pdf-nota__texto">${n.texto}</span>
        </div>`).join('')
    : '<p class="pdf-empty">Nenhuma observação registrada.</p>';

  // ─── CSS compartilhado entre todas as seções ───────────────────────────────
  const CSS = `
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:11px; color:#273237; background:#fff; }

    /* ── Cabeçalho ── */
    .pdf-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #018093; padding-bottom:14px; }
    .pdf-brand-name { font-size:20px; font-weight:700; color:#018093; letter-spacing:-0.5px; }
    .pdf-brand-sub  { font-size:10px; color:#8B9C9F; margin-top:3px; }
    .pdf-header-meta { text-align:right; font-size:10px; color:#8B9C9F; line-height:1.8; }

    /* ── Hero ── */
    .pdf-hero { display:flex; align-items:center; gap:14px; background:linear-gradient(135deg,#EAF6F6 0%,#f0fafa 100%); border:1px solid #D2ECEC; border-radius:10px; padding:16px 20px; }
    .pdf-avatar { width:52px; height:52px; border-radius:50%; flex-shrink:0; background:linear-gradient(135deg,#046B85 0%,#018093 52%,#01A9A0 100%); color:#fff; font-size:17px; font-weight:700; display:flex; align-items:center; justify-content:center; }
    .pdf-hero-name { font-size:15px; font-weight:700; color:#273237; }
    .pdf-hero-meta { font-size:10px; color:#5C6E72; margin-top:4px; line-height:1.6; }
    .pdf-hero-status { margin-left:auto; padding:5px 12px; border-radius:20px; font-size:10px; font-weight:600; background:#E6F6EF; color:#0E8F63; white-space:nowrap; }

    /* ── KPIs ── */
    .pdf-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
    .pdf-kpi { border:1px solid #E7ECED; border-radius:8px; padding:12px 14px; background:#FDFFFE; }
    .pdf-kpi__label { font-size:9px; color:#8B9C9F; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:5px; }
    .pdf-kpi__value { font-size:15px; font-weight:700; color:#273237; line-height:1.2; }
    .pdf-kpi__sub   { font-size:9px; color:#8B9C9F; margin-top:3px; }

    /* ── Seções ── */
    .pdf-section__title { font-size:9px; font-weight:700; color:#018093; text-transform:uppercase; letter-spacing:0.7px; border-bottom:1px solid #E7ECED; padding-bottom:6px; margin-bottom:12px; }

    /* ── Dados pessoais ── */
    .pdf-dados { display:grid; grid-template-columns:1fr 1fr; gap:10px 32px; }
    .pdf-dado { display:flex; flex-direction:column; gap:2px; }
    .pdf-dado__label { font-size:9px; color:#8B9C9F; text-transform:uppercase; letter-spacing:0.4px; }
    .pdf-dado__valor { font-size:11px; color:#273237; font-weight:500; line-height:1.4; }

    /* ── Tabela histórico ── */
    table { width:100%; border-collapse:collapse; }
    th { font-size:9px; font-weight:700; color:#5C6E72; text-transform:uppercase; letter-spacing:0.4px; text-align:left; padding:8px 10px; background:#F3F7F7; border-bottom:2px solid #D2ECEC; }
    td { font-size:10px; color:#273237; padding:8px 10px; border-bottom:1px solid #F0F4F4; vertical-align:middle; line-height:1.4; }
    tr:nth-child(even) td { background:#FAFCFC; }
    tr:last-child td { border-bottom:none; }

    /* ── Badges ── */
    .pdf-badge { display:inline-block; padding:3px 8px; border-radius:20px; font-size:9px; font-weight:600; }
    .pdf-badge--realizado  { background:#E6F6EF; color:#0E8F63; }
    .pdf-badge--confirmado { background:#FCF3E1; color:#B27A0E; }
    .pdf-badge--agendado   { background:#EAF6F6; color:#018093; }
    .pdf-badge--cancelado  { background:#FCEBEA; color:#C23B32; }
    .pdf-badge--pendente   { background:#FCF3E1; color:#B27A0E; }

    /* ── Notas ── */
    .pdf-nota { display:flex; gap:12px; padding:9px 12px; background:#F3F7F7; border-left:3px solid #018093; border-radius:0 6px 6px 0; margin-bottom:8px; }
    .pdf-nota:last-child { margin-bottom:0; }
    .pdf-nota__data  { font-size:9px; color:#8B9C9F; white-space:nowrap; padding-top:1px; min-width:64px; }
    .pdf-nota__texto { font-size:10px; color:#273237; line-height:1.6; }

    /* ── Utilitários ── */
    .pdf-empty { color:#8B9C9F; font-size:10px; padding:14px 0; text-align:center; }

    /* ── Rodapé ── */
    .pdf-footer { display:flex; justify-content:space-between; align-items:center; border-top:1px solid #E7ECED; padding-top:10px; font-size:9px; color:#8B9C9F; }
    .pdf-footer-page { font-size:9px; color:#B0BEC0; }
  `;

  // ─── Helper: cria um wrapper isolado com os estilos ───────────────────────
  function criarWrapper(conteudo, padding = '40px 44px') {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position:fixed; left:-9999px; top:0;
      width:794px; background:#fff;
      padding:${padding};
    `;
    wrap.innerHTML = `<style>${CSS}</style>${conteudo}`;
    document.body.appendChild(wrap);
    return wrap;
  }

  // ─── Helper: renderiza um elemento como canvas ────────────────────────────
  async function renderizarSecao(el) {
    return html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: 794,
      logging: false,
    });
  }

  // ─── Construção das seções HTML ───────────────────────────────────────────
  const dataGeracao = new Date().toLocaleString('pt-BR');
  const dataGeraCurta = new Date().toLocaleDateString('pt-BR');

  const htmlCabecalho = `
    <div class="pdf-header">
      <div>
        <div class="pdf-brand-name">IORD</div>
        <div class="pdf-brand-sub">Painel de Gestão · Radiologias Odontológicas</div>
      </div>
      <div class="pdf-header-meta">
        <div style="font-weight:600;color:#273237;margin-bottom:2px;">Perfil do Paciente</div>
        <div>Gerado em ${dataGeracao}</div>
        <div>Cód. interno: <strong>${p.id}</strong></div>
      </div>
    </div>`;

  const htmlHero = `
    <div class="pdf-hero">
      <div class="pdf-avatar">${iniciais(p.nome)}</div>
      <div>
        <div class="pdf-hero-name">${p.nome}</div>
        <div class="pdf-hero-meta">
          ${p.cpf || '—'}&nbsp;&nbsp;·&nbsp;&nbsp;${idade !== null ? idade + ' anos' : 'Idade não informada'}&nbsp;&nbsp;·&nbsp;&nbsp;${p.telefone || '—'}
        </div>
      </div>
      <span class="pdf-hero-status">${statusLabel(p.status)}</span>
    </div>`;

  const htmlKpis = `
    <div class="pdf-kpis">
      <div class="pdf-kpi">
        <div class="pdf-kpi__label">Total de visitas</div>
        <div class="pdf-kpi__value">${$('kpi-visitas').textContent || '0'}</div>
        <div class="pdf-kpi__sub">exames não cancelados</div>
      </div>
      <div class="pdf-kpi">
        <div class="pdf-kpi__label">Total gasto</div>
        <div class="pdf-kpi__value">${$('kpi-total-gasto').textContent || 'R$ 0,00'}</div>
        <div class="pdf-kpi__sub">exames realizados</div>
      </div>
      <div class="pdf-kpi">
        <div class="pdf-kpi__label">Paciente desde</div>
        <div class="pdf-kpi__value">${$('kpi-paciente-desde').textContent || '—'}</div>
        <div class="pdf-kpi__sub">${$('kpi-tempo-relativo').textContent || ''}</div>
      </div>
      <div class="pdf-kpi">
        <div class="pdf-kpi__label">Radiologia frequente</div>
        <div class="pdf-kpi__value" style="font-size:11px;">${$('kpi-radiologia-frequente').textContent || '—'}</div>
        <div class="pdf-kpi__sub">${$('kpi-radiologia-visitas').textContent || ''}</div>
      </div>
    </div>`;

  const htmlDadosPessoais = `
    <div>
      <div class="pdf-section__title">Dados pessoais</div>
      <div class="pdf-dados">
        <div class="pdf-dado"><span class="pdf-dado__label">Nome completo</span><span class="pdf-dado__valor">${p.nome}</span></div>
        <div class="pdf-dado"><span class="pdf-dado__label">CPF</span><span class="pdf-dado__valor">${p.cpf || '—'}</span></div>
        <div class="pdf-dado"><span class="pdf-dado__label">Telefone</span><span class="pdf-dado__valor">${p.telefone || '—'}</span></div>
        <div class="pdf-dado"><span class="pdf-dado__label">E-mail</span><span class="pdf-dado__valor">${p.email || '—'}</span></div>
        <div class="pdf-dado"><span class="pdf-dado__label">Data de nascimento</span><span class="pdf-dado__valor">${formatarData(p.nascimento)}</span></div>
        <div class="pdf-dado"><span class="pdf-dado__label">Data de cadastro</span><span class="pdf-dado__valor">${formatarData((p.cadastro || '').substring(0, 10))}</span></div>
        <div class="pdf-dado" style="grid-column:1/-1"><span class="pdf-dado__label">Endereço</span><span class="pdf-dado__valor">${p.endereco || '—'}</span></div>
      </div>
    </div>`;

  const htmlHistorico = `
    <div>
      <div class="pdf-section__title">Histórico completo — exames e agendamentos</div>
      <table>
        <thead>
          <tr>
            <th>Data</th><th>Horário</th><th>Tipo de exame</th>
            <th>Radiologia</th><th>Clínica</th><th>Médico</th>
            <th>Valor</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${linhasHistorico}</tbody>
      </table>
    </div>`;

  const htmlNotas = `
    <div>
      <div class="pdf-section__title">Observações clínicas</div>
      <div>${linhasNotas}</div>
    </div>`;

  // ─── Renderização seção a seção e montagem do PDF ─────────────────────────
  const wrappers = [];

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    // Dimensões A4 em pt (unidade nativa do jsPDF)
    const PAGE_W = pdf.internal.pageSize.getWidth();   // ~595 pt
    const PAGE_H = pdf.internal.pageSize.getHeight();  // ~842 pt
    const MARGIN = 28;   // margem lateral em pt
    const GAP = 16;   // espaço entre seções em pt
    const CONTENT_W = PAGE_W - MARGIN * 2;

    // Rodapé de página
    function adicionarRodape(pdf, pageNum, totalPages) {
      pdf.setFontSize(7.5);
      pdf.setTextColor(176, 190, 192);
      const texto = `IORD — Painel de Gestão de Radiologias Odontológicas  ·  Gerado em ${dataGeraCurta}  ·  uso interno`;
      const pagina = `Página ${pageNum}`;
      pdf.text(texto, MARGIN, PAGE_H - 14);
      pdf.text(pagina, PAGE_W - MARGIN, PAGE_H - 14, { align: 'right' });
      // linha divisória
      pdf.setDrawColor(231, 236, 237);
      pdf.setLineWidth(0.5);
      pdf.line(MARGIN, PAGE_H - 20, PAGE_W - MARGIN, PAGE_H - 20);
    }

    // Helper: converte canvas em imagem e adiciona ao PDF, quebrando páginas se necessário
    // Retorna o cursor Y após adicionar a imagem
    async function adicionarSecao(htmlConteudo, cursorY, pdfRef, pageTracker) {
      const wrap = criarWrapper(htmlConteudo);
      wrappers.push(wrap);

      const canvas = await renderizarSecao(wrap);
      const imgData = canvas.toDataURL('image/png');

      // Altura da imagem em pt, proporcional à largura do conteúdo
      const ratio = CONTENT_W / (canvas.width / 2); // canvas.width está em px @2x
      const imgH_pt = (canvas.height / 2) * ratio;

      const FOOTER_H = 30;
      const availableH = PAGE_H - MARGIN - FOOTER_H;

      // Se não couber na página atual, adiciona nova página
      if (cursorY + imgH_pt > availableH) {
        adicionarRodape(pdfRef, pageTracker.page, '?');
        pdfRef.addPage();
        pageTracker.page++;
        cursorY = MARGIN;
      }

      pdfRef.addImage(imgData, 'PNG', MARGIN, cursorY, CONTENT_W, imgH_pt);
      return cursorY + imgH_pt + GAP;
    }

    const pageTracker = { page: 1 };
    let cursorY = MARGIN;

    // Adiciona cada bloco, preservando espaçamentos e evitando cortes
    cursorY = await adicionarSecao(htmlCabecalho, cursorY, pdf, pageTracker);
    cursorY = await adicionarSecao(htmlHero, cursorY, pdf, pageTracker);
    cursorY = await adicionarSecao(htmlKpis, cursorY, pdf, pageTracker);
    cursorY = await adicionarSecao(htmlDadosPessoais, cursorY, pdf, pageTracker);
    cursorY = await adicionarSecao(htmlHistorico, cursorY, pdf, pageTracker);
    cursorY = await adicionarSecao(htmlNotas, cursorY, pdf, pageTracker);

    // Rodapé da última página
    adicionarRodape(pdf, pageTracker.page, pageTracker.page);

    // Corrige os números de página em páginas anteriores retroativamente
    // (não é possível retroativamente com jsPDF simples, mas o total na última é correto)

    pdf.save(`perfil-${p.nome.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    mostrarToast('PDF exportado com sucesso!');
  } catch (err) {
    mostrarToast('Erro ao gerar PDF. Tente novamente.');
    console.error(err);
  } finally {
    wrappers.forEach(w => { if (w.parentNode) w.parentNode.removeChild(w); });
  }
}

/* =============================================================
   INICIALIZAÇÃO
============================================================= */
async function init() {
  modalPaciente.style.display = 'none';
  modalPaciente.hidden = true;
  toast.style.display = 'none';
  toast.setAttribute('hidden', '');
  viewPerfil.hidden = true;
  viewPerfil.style.display = 'none';
  viewLista.hidden = false;
  viewLista.style.display = 'flex';

  tabelaBody.innerHTML = `
    <tr>
      <td colspan="7" style="text-align:center;padding:var(--space-6);color:var(--color-text-subtle);font-size:var(--fs-sm);">
        Carregando pacientes…
      </td>
    </tr>`;

  try {
    const res = await Api.getPacientes({ limite: 500 });
    state.pacientes = res.data || [];
    state.pacientes = state.pacientes.map(p => ({
      ...p,
      cpf: p.cpf || '',
      telefone: p.telefone || '',
      // Dados enriquecidos vindos do backend (prefixo _ indica campo calculado)
      exames: p._ultimoExame
        ? [{ data: p._ultimoExame, tipoExame: p._ultimoExameTipo || '', radiologia: p._radiologiaFrequente || '' }]
        : [],
      agendamentos: [],
      notas: [],
      // Totais para exibição na tabela
      _totalExames: p._totalExames || 0,
      _ultimoExame: p._ultimoExame || null,
      _ultimoExameTipo: p._ultimoExameTipo || null,
      _radiologiaFrequente: p._radiologiaFrequente || null,
    }));
  } catch (err) {
    mostrarToast('Erro ao carregar pacientes.');
    console.error(err);
    state.pacientes = [];
  }

  aplicarFiltros();
}

init();