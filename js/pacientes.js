/* =============================================================
   IORD — Pacientes | pacientes.js
   Estrutura pronta para backend futuro.
   - Dados mock separados em MOCK_DATA
   - Todas as funções de API isoladas em PacientesAPI
   - UI separada da lógica
============================================================= */

'use strict';

/* =============================================================
   MOCK DATA — substituir por chamadas reais à API
============================================================= */
const MOCK_DATA = {
  pacientes: [
    {
      id: 'P001',
      nome: 'Ana Clara Ferreira',
      cpf: '123.456.789-00',
      telefone: '(84) 99812-3456',
      whatsapp: '(84) 99812-3456',
      email: 'ana.clara@email.com',
      dataNascimento: '1985-03-12',
      genero: 'Feminino',
      endereco: 'Rua das Flores, 142, Apto 301 — Natal/RN',
      status: 'ativo',
      dataCadastro: '2022-01-15',
      ultimoExame: { data: '2024-11-20', tipo: 'Panorâmica' },
      totalExames: 8,
      radiologiaMaisFrequente: 'Clínica Natal Centro',
      totalGasto: 1240.00,
      observacoes: 'Paciente com histórico de bruxismo. Preferência por horários matutinos.',
      exames: [
        { id: 'E001', data: '2024-11-20', tipo: 'Panorâmica', clinica: 'Clínica Natal Centro', valor: 120.00, status: 'Concluído', arquivo: 'panoramica_ana_2024.pdf' },
        { id: 'E002', data: '2024-08-05', tipo: 'Periapical', clinica: 'Clínica Natal Centro', valor: 80.00, status: 'Concluído', arquivo: 'periapical_ana_2024.pdf' },
        { id: 'E003', data: '2024-03-18', tipo: 'Tomografia CBCT', clinica: 'Clínica Norte', valor: 350.00, status: 'Concluído', arquivo: 'cbct_ana_2024.pdf' },
        { id: 'E004', data: '2023-11-02', tipo: 'Panorâmica', clinica: 'Clínica Natal Centro', valor: 120.00, status: 'Concluído', arquivo: 'panoramica_ana_2023.pdf' },
        { id: 'E005', data: '2023-06-14', tipo: 'Bite-wing', clinica: 'Clínica Norte', valor: 90.00, status: 'Concluído', arquivo: null },
      ],
      agendamentos: [
        { id: 'AG001', data: '2025-01-10', hora: '09:00', tipo: 'Panorâmica', clinica: 'Clínica Natal Centro', status: 'Confirmado' },
        { id: 'AG002', data: '2024-11-20', hora: '10:30', tipo: 'Panorâmica', clinica: 'Clínica Natal Centro', status: 'Realizado' },
        { id: 'AG003', data: '2024-07-22', hora: '08:00', tipo: 'Periapical', clinica: 'Clínica Natal Centro', status: 'Cancelado' },
      ],
    },
    {
      id: 'P002',
      nome: 'Bruno Soares Lima',
      cpf: '987.654.321-11',
      telefone: '(84) 98765-4321',
      whatsapp: '(84) 98765-4321',
      email: 'bruno.lima@email.com',
      dataNascimento: '1978-07-25',
      genero: 'Masculino',
      endereco: 'Av. Roberto Freire, 2000, Sala 5 — Natal/RN',
      status: 'ativo',
      dataCadastro: '2023-06-01',
      ultimoExame: { data: '2025-01-03', tipo: 'Tomografia CBCT' },
      totalExames: 3,
      radiologiaMaisFrequente: 'Clínica Norte',
      totalGasto: 680.00,
      observacoes: '',
      exames: [
        { id: 'E006', data: '2025-01-03', tipo: 'Tomografia CBCT', clinica: 'Clínica Norte', valor: 350.00, status: 'Concluído', arquivo: 'cbct_bruno_2025.pdf' },
        { id: 'E007', data: '2024-05-15', tipo: 'Panorâmica', clinica: 'Clínica Norte', valor: 120.00, status: 'Concluído', arquivo: null },
        { id: 'E008', data: '2023-09-20', tipo: 'Periapical', clinica: 'Clínica Norte', valor: 80.00, status: 'Concluído', arquivo: null },
      ],
      agendamentos: [
        { id: 'AG004', data: '2025-01-03', hora: '14:00', tipo: 'Tomografia CBCT', clinica: 'Clínica Norte', status: 'Realizado' },
      ],
    },
    {
      id: 'P003',
      nome: 'Carla Mendes Oliveira',
      cpf: '456.789.123-22',
      telefone: '(84) 99123-4567',
      whatsapp: null,
      email: 'carla.oliveira@email.com',
      dataNascimento: '1992-12-01',
      genero: 'Feminino',
      endereco: 'Rua Potengi, 55 — Mossoró/RN',
      status: 'novo',
      dataCadastro: '2025-01-02',
      ultimoExame: { data: '2025-01-02', tipo: 'Panorâmica' },
      totalExames: 1,
      radiologiaMaisFrequente: 'Clínica Mossoró',
      totalGasto: 120.00,
      observacoes: 'Primeira visita. Encaminhada pelo Dr. Fernandes.',
      exames: [
        { id: 'E009', data: '2025-01-02', tipo: 'Panorâmica', clinica: 'Clínica Mossoró', valor: 120.00, status: 'Concluído', arquivo: 'panoramica_carla_2025.pdf' },
      ],
      agendamentos: [
        { id: 'AG005', data: '2025-01-02', hora: '11:00', tipo: 'Panorâmica', clinica: 'Clínica Mossoró', status: 'Realizado' },
      ],
    },
    {
      id: 'P004',
      nome: 'Daniel Rocha Figueiredo',
      cpf: '321.654.987-33',
      telefone: '(84) 99234-5678',
      whatsapp: '(84) 99234-5678',
      email: '',
      dataNascimento: '1965-04-30',
      genero: 'Masculino',
      endereco: 'Av. Hermes da Fonseca, 301 — Natal/RN',
      status: 'ativo',
      dataCadastro: '2021-08-10',
      ultimoExame: { data: '2024-10-05', tipo: 'Bite-wing' },
      totalExames: 12,
      radiologiaMaisFrequente: 'Clínica Natal Centro',
      totalGasto: 2150.00,
      observacoes: 'Paciente fidelizado. Traz toda a família.',
      exames: [
        { id: 'E010', data: '2024-10-05', tipo: 'Bite-wing', clinica: 'Clínica Natal Centro', valor: 90.00, status: 'Concluído', arquivo: null },
        { id: 'E011', data: '2024-04-18', tipo: 'Panorâmica', clinica: 'Clínica Natal Centro', valor: 120.00, status: 'Concluído', arquivo: 'panoramica_daniel_2024.pdf' },
      ],
      agendamentos: [
        { id: 'AG006', data: '2025-02-15', hora: '09:30', tipo: 'Tomografia CBCT', clinica: 'Clínica Natal Centro', status: 'Confirmado' },
        { id: 'AG007', data: '2024-10-05', hora: '08:30', tipo: 'Bite-wing', clinica: 'Clínica Natal Centro', status: 'Realizado' },
      ],
    },
    {
      id: 'P005',
      nome: 'Elisa Monteiro Santos',
      cpf: '654.321.098-44',
      telefone: '(84) 98345-6789',
      whatsapp: '(84) 98345-6789',
      email: 'elisa.santos@email.com',
      dataNascimento: '2000-09-14',
      genero: 'Feminino',
      endereco: 'Rua das Pedras, 78 — Caicó/RN',
      status: 'inativo',
      dataCadastro: '2022-05-20',
      ultimoExame: { data: '2023-02-10', tipo: 'Panorâmica' },
      totalExames: 2,
      radiologiaMaisFrequente: 'Clínica Caicó',
      totalGasto: 240.00,
      observacoes: '',
      exames: [
        { id: 'E012', data: '2023-02-10', tipo: 'Panorâmica', clinica: 'Clínica Caicó', valor: 120.00, status: 'Concluído', arquivo: null },
        { id: 'E013', data: '2022-06-30', tipo: 'Panorâmica', clinica: 'Clínica Caicó', valor: 120.00, status: 'Concluído', arquivo: null },
      ],
      agendamentos: [],
    },
    {
      id: 'P006',
      nome: 'Felipe Augusto Costa',
      cpf: '789.012.345-55',
      telefone: '(84) 99456-7890',
      whatsapp: '(84) 99456-7890',
      email: 'felipe.costa@email.com',
      dataNascimento: '1990-06-22',
      genero: 'Masculino',
      endereco: 'Conj. Ponta Negra, Bl. C, 203 — Natal/RN',
      status: 'agendado',
      dataCadastro: '2024-11-01',
      ultimoExame: { data: '2024-11-05', tipo: 'Tomografia CBCT' },
      totalExames: 2,
      radiologiaMaisFrequente: 'Clínica Norte',
      totalGasto: 470.00,
      observacoes: 'Agendamento recorrente mensal.',
      exames: [
        { id: 'E014', data: '2024-11-05', tipo: 'Tomografia CBCT', clinica: 'Clínica Norte', valor: 350.00, status: 'Concluído', arquivo: 'cbct_felipe_2024.pdf' },
        { id: 'E015', data: '2024-11-01', tipo: 'Periapical', clinica: 'Clínica Norte', valor: 80.00, status: 'Concluído', arquivo: null },
      ],
      agendamentos: [
        { id: 'AG008', data: '2025-01-20', hora: '16:00', tipo: 'Periapical', clinica: 'Clínica Norte', status: 'Confirmado' },
        { id: 'AG009', data: '2024-11-05', hora: '15:00', tipo: 'Tomografia CBCT', clinica: 'Clínica Norte', status: 'Realizado' },
      ],
    },
  ],
};

/* =============================================================
   API LAYER — trocar implementações por fetch() real no futuro
============================================================= */
const PacientesAPI = {
  _baseUrl: '/api/v1', // trocar pela URL real

  /**
   * Lista todos os pacientes, com opção de filtro.
   * @param {Object} params - { q, tipo, status, page, limit }
   * @returns {Promise<{data: Array, total: number, page: number}>}
   */
  async listar(params = {}) {
    // --- MOCK ---
    return new Promise((resolve) => {
      setTimeout(() => {
        let lista = [...MOCK_DATA.pacientes];

        if (params.status && params.status !== 'todos') {
          lista = lista.filter(p => p.status === params.status);
        }

        if (params.q && params.q.trim()) {
          const q = params.q.trim().toLowerCase();
          const tipo = params.tipo || 'todos';
          lista = lista.filter(p => {
            if (tipo === 'nome' || tipo === 'todos') {
              if (p.nome.toLowerCase().includes(q)) return true;
            }
            if (tipo === 'cpf' || tipo === 'todos') {
              if (p.cpf.replace(/\D/g, '').includes(q.replace(/\D/g, ''))) return true;
            }
            if (tipo === 'telefone' || tipo === 'todos') {
              if (p.telefone.replace(/\D/g, '').includes(q.replace(/\D/g, ''))) return true;
              if (p.whatsapp && p.whatsapp.replace(/\D/g, '').includes(q.replace(/\D/g, ''))) return true;
            }
            if (tipo === 'codigo' || tipo === 'todos') {
              if (p.id.toLowerCase().includes(q)) return true;
            }
            return false;
          });
        }

        resolve({ data: lista, total: lista.length, page: 1 });
      }, 180);
    });
    // --- FIM MOCK ---

    // --- REAL (descomentar quando houver backend) ---
    // const qs = new URLSearchParams(params).toString();
    // const res = await fetch(`${this._baseUrl}/pacientes?${qs}`, { headers: this._headers() });
    // if (!res.ok) throw new Error('Erro ao listar pacientes');
    // return res.json();
  },

  /**
   * Busca um paciente pelo ID.
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async buscarPorId(id) {
    // --- MOCK ---
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const p = MOCK_DATA.pacientes.find(x => x.id === id);
        if (p) resolve(p);
        else reject(new Error('Paciente não encontrado'));
      }, 120);
    });
    // --- REAL ---
    // const res = await fetch(`${this._baseUrl}/pacientes/${id}`, { headers: this._headers() });
    // if (!res.ok) throw new Error('Paciente não encontrado');
    // return res.json();
  },

  /**
   * Cria um novo paciente.
   * @param {Object} dados
   * @returns {Promise<Object>}
   */
  async criar(dados) {
    // --- MOCK ---
    return new Promise((resolve) => {
      setTimeout(() => {
        const novo = {
          ...dados,
          id: 'P' + String(MOCK_DATA.pacientes.length + 1).padStart(3, '0'),
          status: 'novo',
          dataCadastro: new Date().toISOString().split('T')[0],
          ultimoExame: null,
          totalExames: 0,
          radiologiaMaisFrequente: '—',
          totalGasto: 0,
          exames: [],
          agendamentos: [],
        };
        MOCK_DATA.pacientes.unshift(novo);
        resolve(novo);
      }, 300);
    });
    // --- REAL ---
    // const res = await fetch(`${this._baseUrl}/pacientes`, {
    //   method: 'POST',
    //   headers: this._headers(),
    //   body: JSON.stringify(dados),
    // });
    // if (!res.ok) throw new Error('Erro ao criar paciente');
    // return res.json();
  },

  /**
   * Atualiza um paciente existente.
   * @param {string} id
   * @param {Object} dados
   * @returns {Promise<Object>}
   */
  async atualizar(id, dados) {
    // --- MOCK ---
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const idx = MOCK_DATA.pacientes.findIndex(x => x.id === id);
        if (idx === -1) return reject(new Error('Paciente não encontrado'));
        MOCK_DATA.pacientes[idx] = { ...MOCK_DATA.pacientes[idx], ...dados };
        resolve(MOCK_DATA.pacientes[idx]);
      }, 250);
    });
    // --- REAL ---
    // const res = await fetch(`${this._baseUrl}/pacientes/${id}`, {
    //   method: 'PATCH',
    //   headers: this._headers(),
    //   body: JSON.stringify(dados),
    // });
    // if (!res.ok) throw new Error('Erro ao atualizar paciente');
    // return res.json();
  },

  _headers() {
    return {
      'Content-Type': 'application/json',
      // 'Authorization': `Bearer ${localStorage.getItem('token')}`,
    };
  },
};

/* =============================================================
   ESTADO DA APLICAÇÃO
============================================================= */
const State = {
  pacientes: [],
  filtroStatus: 'todos',
  busca: { q: '', tipo: 'todos' },
  carregando: false,
  pacienteAtivo: null,
  modoEdicao: false,
};

/* =============================================================
   UTILITÁRIOS
============================================================= */
const Utils = {
  formatarData(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },

  formatarMoeda(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  },

  calcularIdade(dataNasc) {
    if (!dataNasc) return '—';
    const hoje = new Date();
    const nasc = new Date(dataNasc);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade + ' anos';
  },

  iniciais(nome) {
    if (!nome) return '?';
    return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  },

  statusLabel(status) {
    const map = {
      ativo: { label: 'Ativo', cls: 'badge--positive' },
      novo: { label: 'Novo', cls: 'badge--info' },
      inativo: { label: 'Inativo', cls: 'badge--neutral' },
      agendado: { label: 'Agendado', cls: 'badge--warning' },
    };
    return map[status] || { label: status, cls: 'badge--neutral' };
  },

  agendamentoStatusLabel(status) {
    const map = {
      Confirmado: 'badge--warning',
      Realizado: 'badge--positive',
      Cancelado: 'badge--negative',
      Pendente: 'badge--neutral',
    };
    return map[status] || 'badge--neutral';
  },

  debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  escaparHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};

/* =============================================================
   RENDERIZAÇÃO DA TABELA
============================================================= */
const Tabela = {
  el: null,
  tbody: null,
  emptyState: null,

  init() {
    this.el = document.getElementById('tabela-pacientes');
    this.tbody = document.getElementById('tabela-body');
    this.emptyState = document.getElementById('empty-state');
  },

  renderizar(lista) {
    if (!this.tbody) return;

    if (lista.length === 0) {
      this.tbody.innerHTML = '';
      this.emptyState.hidden = false;
      return;
    }

    this.emptyState.hidden = true;
    this.tbody.innerHTML = lista.map(p => this._linha(p)).join('');

    // eventos das linhas
    this.tbody.querySelectorAll('[data-action="ver-perfil"]').forEach(btn => {
      btn.addEventListener('click', () => Perfil.abrir(btn.dataset.id));
    });
    this.tbody.querySelectorAll('[data-action="editar"]').forEach(btn => {
      btn.addEventListener('click', () => Modal.abrirEdicao(btn.dataset.id));
    });
  },

  _linha(p) {
    const { label, cls } = Utils.statusLabel(p.status);
    const ultimoExame = p.ultimoExame
      ? `${Utils.formatarData(p.ultimoExame.data)}<span class="td-sub">${Utils.escaparHtml(p.ultimoExame.tipo)}</span>`
      : '<span class="td-empty">—</span>';

    return `
      <tr class="tabela-row" data-id="${p.id}">
        <td>
          <div class="td-nome">
            <div class="avatar-sm">${Utils.iniciais(p.nome)}</div>
            <div>
              <span class="td-nome__principal">${Utils.escaparHtml(p.nome)}</span>
              <span class="td-sub">${p.id}</span>
            </div>
          </div>
        </td>
        <td class="td-mono">${Utils.escaparHtml(p.cpf)}</td>
        <td>${Utils.escaparHtml(p.telefone)}</td>
        <td>${ultimoExame}</td>
        <td class="td-center td-mono">${p.totalExames}</td>
        <td><span class="td-clinica">${Utils.escaparHtml(p.radiologiaMaisFrequente)}</span></td>
        <td><span class="badge ${cls}">${label}</span></td>
        <td>
          <div class="td-acoes">
            <button class="btn-acao btn-acao--primary" data-action="ver-perfil" data-id="${p.id}" title="Ver perfil">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Ver perfil
            </button>
            <button class="btn-acao btn-acao--ghost" data-action="editar" data-id="${p.id}" title="Editar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
  },
};

/* =============================================================
   TELA DE PERFIL
============================================================= */
const Perfil = {
  el: null,
  listaEl: null,

  init() {
    this.el = document.getElementById('tela-perfil');
    this.listaEl = document.getElementById('tela-lista');
    document.getElementById('btn-voltar').addEventListener('click', () => this.fechar());
    document.getElementById('btn-editar-perfil').addEventListener('click', () => Modal.abrirEdicao(State.pacienteAtivo?.id));
    document.getElementById('btn-exportar-pdf').addEventListener('click', () => this.exportarPDF());
  },

  async abrir(id) {
    try {
      const paciente = await PacientesAPI.buscarPorId(id);
      State.pacienteAtivo = paciente;
      this._renderizar(paciente);
      this.listaEl.hidden = true;
      this.el.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      UI.toast('Erro ao carregar perfil do paciente.', 'error');
    } finally {
    }
  },

  fechar() {
    this.el.hidden = true;
    this.listaEl.hidden = false;
    State.pacienteAtivo = null;
  },

  _renderizar(p) {
    const { label, cls } = Utils.statusLabel(p.status);

    // cabeçalho do perfil
    document.getElementById('perfil-avatar').textContent = Utils.iniciais(p.nome);
    document.getElementById('perfil-nome').textContent = p.nome;
    document.getElementById('perfil-id').textContent = p.id;
    document.getElementById('perfil-badge').textContent = label;
    document.getElementById('perfil-badge').className = `badge ${cls}`;
    document.getElementById('perfil-cadastro').textContent = 'Cadastrado em ' + Utils.formatarData(p.dataCadastro);

    // KPIs rápidos
    document.getElementById('kpi-total-exames').textContent = p.totalExames;
    document.getElementById('kpi-total-gasto').textContent = Utils.formatarMoeda(p.totalGasto);
    document.getElementById('kpi-ultimo-exame').textContent = p.ultimoExame ? Utils.formatarData(p.ultimoExame.data) : '—';
    document.getElementById('kpi-agendamentos').textContent = p.agendamentos.filter(a => a.status === 'Confirmado').length;

    // informações básicas
    document.getElementById('info-cpf').textContent = p.cpf || '—';
    document.getElementById('info-nascimento').textContent = Utils.formatarData(p.dataNascimento) + (p.dataNascimento ? ` (${Utils.calcularIdade(p.dataNascimento)})` : '');
    document.getElementById('info-genero').textContent = p.genero || '—';
    document.getElementById('info-telefone').textContent = p.telefone || '—';
    document.getElementById('info-whatsapp').textContent = p.whatsapp || '—';
    document.getElementById('info-email').textContent = p.email || '—';
    document.getElementById('info-endereco').textContent = p.endereco || '—';
    document.getElementById('info-clinica-freq').textContent = p.radiologiaMaisFrequente || '—';
    document.getElementById('info-obs').textContent = p.observacoes || 'Nenhuma observação registrada.';

    // histórico de exames
    this._renderExames(p.exames);

    // histórico de agendamentos
    this._renderAgendamentos(p.agendamentos);
  },

  _renderExames(exames) {
    const el = document.getElementById('lista-exames');
    if (!exames || exames.length === 0) {
      el.innerHTML = '<p class="empty-list">Nenhum exame registrado.</p>';
      return;
    }
    el.innerHTML = exames.map(e => `
      <div class="hist-item">
        <div class="hist-item__icon hist-item__icon--exame">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
        </div>
        <div class="hist-item__body">
          <span class="hist-item__titulo">${Utils.escaparHtml(e.tipo)}</span>
          <span class="hist-item__sub">${Utils.escaparHtml(e.clinica)} · ${Utils.formatarData(e.data)}</span>
        </div>
        <div class="hist-item__right">
          <span class="hist-item__valor">${Utils.formatarMoeda(e.valor)}</span>
          <span class="badge badge--sm ${e.status === 'Concluído' ? 'badge--positive' : 'badge--neutral'}">${e.status}</span>
          ${e.arquivo ? `<button class="btn-link" title="Baixar arquivo" onclick="UI.toast('Download: ${Utils.escaparHtml(e.arquivo)}', 'info')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>` : ''}
        </div>
      </div>`).join('');
  },

  _renderAgendamentos(agendamentos) {
    const el = document.getElementById('lista-agendamentos');
    if (!agendamentos || agendamentos.length === 0) {
      el.innerHTML = '<p class="empty-list">Nenhum agendamento encontrado.</p>';
      return;
    }
    el.innerHTML = agendamentos.map(a => `
      <div class="hist-item">
        <div class="hist-item__icon hist-item__icon--agend">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <div class="hist-item__body">
          <span class="hist-item__titulo">${Utils.escaparHtml(a.tipo)}</span>
          <span class="hist-item__sub">${Utils.escaparHtml(a.clinica)} · ${Utils.formatarData(a.data)} às ${a.hora}</span>
        </div>
        <div class="hist-item__right">
          <span class="badge badge--sm ${Utils.agendamentoStatusLabel(a.status)}">${a.status}</span>
        </div>
      </div>`).join('');
  },

  exportarPDF() {
    // Integrar com biblioteca PDF (ex: jsPDF) no futuro
    UI.toast('Exportação de PDF em desenvolvimento.', 'info');
  },
};

/* =============================================================
   MODAL (Novo / Editar Paciente)
============================================================= */
const Modal = {
  el: null,
  form: null,
  titulo: null,
  modoEdicaoId: null,

  init() {
    this.el = document.getElementById('modal-paciente');
    this.form = document.getElementById('form-paciente');
    this.titulo = document.getElementById('modal-titulo');

    document.getElementById('btn-novo-paciente').addEventListener('click', () => this.abrirNovo());
    document.getElementById('btn-fechar-modal').addEventListener('click', () => this.fechar());
    document.getElementById('btn-cancelar-modal').addEventListener('click', () => this.fechar());
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.fechar(); });
    this.form.addEventListener('submit', (e) => this._onSubmit(e));

    // máscara CPF
    document.getElementById('campo-cpf').addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 11);
      v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      e.target.value = v;
    });

    // máscara telefone
    ['campo-telefone', 'campo-whatsapp'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').slice(0, 11);
        v = v.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
        e.target.value = v;
      });
    });
  },

  abrirNovo() {
    this.modoEdicaoId = null;
    this.titulo.textContent = 'Novo Paciente';
    this.form.reset();
    this._mostrar();
  },

  async abrirEdicao(id) {
    try {
      const p = await PacientesAPI.buscarPorId(id);
      this.modoEdicaoId = id;
      this.titulo.textContent = 'Editar Paciente';
      this._preencherForm(p);
      this._mostrar();
    } catch {
      UI.toast('Erro ao carregar dados do paciente.', 'error');
    } finally {
    }
  },

  _preencherForm(p) {
    document.getElementById('campo-nome').value = p.nome || '';
    document.getElementById('campo-cpf').value = p.cpf || '';
    document.getElementById('campo-nascimento').value = p.dataNascimento || '';
    document.getElementById('campo-genero').value = p.genero || '';
    document.getElementById('campo-telefone').value = p.telefone || '';
    document.getElementById('campo-whatsapp').value = p.whatsapp || '';
    document.getElementById('campo-email').value = p.email || '';
    document.getElementById('campo-endereco').value = p.endereco || '';
    document.getElementById('campo-observacoes').value = p.observacoes || '';
  },

  _mostrar() {
    this.el.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.el.classList.add('modal--visible'), 10);
    document.getElementById('campo-nome').focus();
  },

  fechar() {
    this.el.classList.remove('modal--visible');
    setTimeout(() => {
      this.el.hidden = true;
      document.body.style.overflow = '';
    }, 220);
  },

  async _onSubmit(e) {
    e.preventDefault();
    const dados = {
      nome: document.getElementById('campo-nome').value.trim(),
      cpf: document.getElementById('campo-cpf').value.trim(),
      dataNascimento: document.getElementById('campo-nascimento').value,
      genero: document.getElementById('campo-genero').value,
      telefone: document.getElementById('campo-telefone').value.trim(),
      whatsapp: document.getElementById('campo-whatsapp').value.trim(),
      email: document.getElementById('campo-email').value.trim(),
      endereco: document.getElementById('campo-endereco').value.trim(),
      observacoes: document.getElementById('campo-observacoes').value.trim(),
    };

    const btnSalvar = document.getElementById('btn-salvar-modal');
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando…';

    try {
      if (this.modoEdicaoId) {
        const atualizado = await PacientesAPI.atualizar(this.modoEdicaoId, dados);
        UI.toast(`Paciente "${atualizado.nome}" atualizado com sucesso!`, 'success');
        if (State.pacienteAtivo?.id === this.modoEdicaoId) {
          State.pacienteAtivo = atualizado;
          Perfil._renderizar(atualizado);
        }
      } else {
        const novo = await PacientesAPI.criar(dados);
        UI.toast(`Paciente "${novo.nome}" cadastrado com sucesso!`, 'success');
      }
      this.fechar();
      await App.carregarPacientes();
    } catch (err) {
      UI.toast('Erro ao salvar. Tente novamente.', 'error');
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.textContent = 'Salvar Paciente';
    }
  },
};

/* =============================================================
   UI — utilitários de interface
============================================================= */
const UI = {

  toast(msg, tipo = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast--${tipo}`;
    toast.innerHTML = `
      <span class="toast__icon">${this._toastIcon(tipo)}</span>
      <span>${Utils.escaparHtml(msg)}</span>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
    setTimeout(() => {
      toast.classList.remove('toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  _toastIcon(tipo) {
    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ',
      warning: '⚠',
    };
    return icons[tipo] || 'ℹ';
  },

  atualizarContadorResultados(total) {
    const el = document.getElementById('contador-resultados');
    if (el) el.textContent = `${total} paciente${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`;
  },
};

/* =============================================================
   APLICAÇÃO PRINCIPAL
============================================================= */
const App = {
  async init() {
    Tabela.init();
    Perfil.init();
    Modal.init();
    this._bindBusca();
    this._bindFiltros();
    await this.carregarPacientes();
  },

  _bindBusca() {
    const inputBusca = document.getElementById('input-busca');
    const selectTipo = document.getElementById('select-tipo-busca');

    const buscar = Utils.debounce(async () => {
      State.busca.q = inputBusca.value;
      State.busca.tipo = selectTipo.value;
      await this.carregarPacientes();
    }, 320);

    inputBusca.addEventListener('input', buscar);
    selectTipo.addEventListener('change', buscar);

    document.getElementById('btn-limpar-busca').addEventListener('click', () => {
      inputBusca.value = '';
      State.busca.q = '';
      this.carregarPacientes();
    });
  },

  _bindFiltros() {
    document.querySelectorAll('[data-filtro-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-filtro-status]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        State.filtroStatus = btn.dataset.filtroStatus;
        this.carregarPacientes();
      });
    });
  },

  async carregarPacientes() {
    try {
      const { data, total } = await PacientesAPI.listar({
        q: State.busca.q,
        tipo: State.busca.tipo,
        status: State.filtroStatus,
      });
      State.pacientes = data;
      Tabela.renderizar(data);
      UI.atualizarContadorResultados(total);
    } catch {
      UI.toast('Erro ao carregar pacientes.', 'error');
    } finally {
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());