/* =============================================================
   IORD — Financeiro | financeiro-saidas.js
   -------------------------------------------------------------
   Módulo autônomo da aba "Saídas".
   Depende de:
     • Chart.js (carregado no HTML)
     • api.js   (window.Api)
     • auth.js  (window.IORDPermissions / window.IORDAuth)
     • Os IDs do financeiro.html (abas + modal + tabela)

   Estratégia:
     – Escuta o evento de troca de aba (fin-tab[data-tab="saidas"])
       e só faz a primeira carga quando a aba é aberta.
     – Todos os filtros (período, radiologia, categoria, forma,
       busca) chamam reload() que rebusca KPIs + lista.
     – O modal trata criação e edição no mesmo formulário.
     – Não altera nenhum módulo existente do financeiro.js.
============================================================= */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     PALETA / CONSTANTES
  ───────────────────────────────────────────────────────── */
  const CORES_PIZZA = [
    '#018093', '#01C6BF', '#F5A623', '#7B68EE',
    '#E05C5C', '#0E8F63', '#B27A0E',
  ];

  const CATEGORIAS = [
    { value: 'material', label: 'Material' },
    { value: 'manutencao', label: 'Manutenção' },
    { value: 'limpeza', label: 'Limpeza' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'transporte', label: 'Transporte' },
    { value: 'pessoal', label: 'Pessoal' },
    { value: 'outros', label: 'Outros' },
  ];

  const FORMAS = [
    { value: 'pix', label: 'PIX' },
    { value: 'dinheiro', label: 'Dinheiro' },
    { value: 'cartao', label: 'Cartão' },
    { value: 'transferencia', label: 'Transferência' },
    { value: 'boleto', label: 'Boleto' },
  ];

  /* ─────────────────────────────────────────────────────────
     ESTADO LOCAL
  ───────────────────────────────────────────────────────── */
  const S = {
    initialized: false,         // primeira carga feita?
    pizzaChart: null,           // instância Chart.js
    radiologias: [],            // [{ id, nome }]
    isAdmin: false,
    radiologiaFixa: null,       // id para não-admin
    // filtros ativos
    periodo: 'mes_atual',
    customStart: null,
    customEnd: null,
    radiologiaId: null,         // null = all (admin)
    categoria: '',
    forma: '',
    q: '',
    // dados em cache para export CSV
    _rows: [],
  };

  /* ─────────────────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────────────────── */
  function fmt(val) {
    if (val === null || val === undefined) return 'R$ --';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(val);
  }

  function fmtDate(iso) {
    if (!iso) return '--';
    const [y, m, d] = String(iso).split(/[-T ]/);
    return `${d}/${m}/${y}`;
  }

  function today() {
    return new Date().toISOString().split('T')[0];
  }

  function labelCategoria(v) {
    return CATEGORIAS.find(c => c.value === v)?.label || v || '--';
  }

  function labelForma(v) {
    return FORMAS.find(f => f.value === v)?.label || v || '--';
  }

  function unmaskMoney(str) {
    return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
  }

  function maskMoney(num) {
    if (!num && num !== 0) return '';
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(num);
  }

  function toast(msg, type = 'info') {
    let el = document.getElementById('iord-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'iord-toast';
      el.style.cssText = [
        'position:fixed', 'bottom:24px', 'right:24px', 'z-index:9999',
        'padding:12px 20px', 'border-radius:10px', 'font-size:0.8125rem',
        'font-weight:600', 'color:#fff',
        'box-shadow:0 8px 24px -6px rgba(19,39,43,.3)',
        'transition:opacity .3s,transform .3s', 'pointer-events:none',
        'max-width:320px', 'line-height:1.5',
      ].join(';');
      document.body.appendChild(el);
    }
    el.style.background = type === 'success' ? '#0E8F63'
      : type === 'error' ? '#C23B32' : '#273237';
    el.textContent = msg;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
    }, 3200);
  }

  function buildFiltros() {
    const base = {
      periodo: S.periodo,
      dataInicio: S.customStart || undefined,
      dataFim: S.customEnd || undefined,
      categoria: S.categoria || undefined,
      formaPagamento: S.forma || undefined,
      q: S.q || undefined,
    };
    if (S.isAdmin) {
      base.radiologiaId = S.radiologiaId || undefined;
    } else {
      base.radiologiaId = S.radiologiaFixa;
    }
    return base;
  }

  /* ─────────────────────────────────────────────────────────
     PIZZA — gráfico de forma de pagamento
  ───────────────────────────────────────────────────────── */
  function renderPizza(data) {
    const canvas = document.getElementById('saidasFormaChart');
    const legendEl = document.getElementById('saidasFormaLegend');
    if (!canvas) return;

    const items = (data || []).filter(i => i.valor > 0);

    if (S.pizzaChart) {
      S.pizzaChart.destroy();
      S.pizzaChart = null;
    }

    if (!items.length) {
      canvas.style.display = 'none';
      if (legendEl) legendEl.innerHTML = '<span style="color:var(--color-text-muted);font-size:.75rem">Sem dados</span>';
      return;
    }

    canvas.style.display = '';
    const labels = items.map(i => labelForma(i.forma));
    const values = items.map(i => i.valor);
    const cores = items.map((_, idx) => CORES_PIZZA[idx % CORES_PIZZA.length]);

    S.pizzaChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: cores,
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 4,
          clip: false // Impede o corte dos elementos nos limites do canvas
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        layout: {
          padding: 6 // Respiro interno para o tooltip/hoverOffset não cortarem nas bordas
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            displayColors: false,
            callbacks: {
              label: ctx => ` ${fmt(ctx.raw)} (${items[ctx.dataIndex]?.percentual ?? 0}%)`,
            },
          },
        },
      },
    });

    if (legendEl) {
      legendEl.innerHTML = items.map((item, i) => `
        <div class="saidas-pizza-leg-item">
          <span class="saidas-pizza-leg-left">
            <span class="saidas-pizza-leg-dot" style="background:${cores[i]}"></span>
            <span class="saidas-pizza-leg-label">${labelForma(item.forma)}</span>
          </span>
          <span class="saidas-pizza-leg-val">${item.percentual ?? 0}%</span>
        </div>
      `).join('');
    }
  }

  /* ─────────────────────────────────────────────────────────
     KPIs
  ───────────────────────────────────────────────────────── */
  async function renderKPIs() {
    try {
      const res = await Api.getSaidasKPIs(buildFiltros());
      const d = res?.data || {};

      const totalEl = document.getElementById('kpiSaidasTotalVal');
      const totalCtx = document.getElementById('kpiSaidasTotalCtx');
      if (totalEl) totalEl.textContent = fmt(d.totalSaidas ?? 0);
      if (totalCtx) totalCtx.textContent = 'no período selecionado';

      const catEl = document.getElementById('kpiSaidasCategoriaVal');
      const catCtx = document.getElementById('kpiSaidasCategoriaCtx');
      if (d.maiorCategoria?.nome) {
        if (catEl) catEl.textContent = labelCategoria(d.maiorCategoria.nome);
        if (catCtx) catCtx.textContent = fmt(d.maiorCategoria.valor);
      } else {
        if (catEl) catEl.textContent = '--';
        if (catCtx) catCtx.textContent = 'sem dados';
      }

      renderPizza(d.porFormaPagamento || []);

    } catch (err) {
      console.error('[Saídas] KPIs:', err);
    }
  }

  /* ─────────────────────────────────────────────────────────
     TABELA
  ───────────────────────────────────────────────────────── */
  function renderTabela(rows) {
    S._rows = rows;
    const tbody = document.getElementById('saidasTableBody');
    const hint = document.getElementById('saidasTableHint');
    if (!tbody) return;

    if (hint) hint.textContent = `${rows.length} registro${rows.length !== 1 ? 's' : ''} encontrado${rows.length !== 1 ? 's' : ''}`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="data-table__empty">Nenhuma saída encontrada para os filtros selecionados.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const catBadge = `<span class="saidas-cat-badge saidas-cat-badge--${r.categoria || 'outros'}">${labelCategoria(r.categoria)}</span>`;
      const formaBadge = `<span class="saidas-forma-badge">${labelForma(r.formaPagamento)}</span>`;
      const radioNome = r.radiologiaNome || r.radiologiaId || '--';
      return `
        <tr>
          <td class="data-table__date">${fmtDate(r.dataSaida)}</td>
          <td class="saidas-desc-cell" title="${escHtml(r.descricao)}">${escHtml(r.descricao)}</td>
          <td>${catBadge}</td>
          <td class="data-table__num saidas-valor-cell">${fmt(r.valor)}</td>
          <td>${formaBadge}</td>
          <td class="saidas-radio-cell">${escHtml(radioNome)}</td>
          <td class="data-table__action">
            <button type="button" class="btn-icon btn-icon--edit"
              data-saida-edit="${r.id}" title="Editar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                  stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                  stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
            <button type="button" class="btn-icon btn-icon--delete"
              data-saida-del="${r.id}" title="Excluir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="round"/>
                <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"
                  stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </button>
          </td>
        </tr>`;
    }).join('');

    // delegação de eventos na tabela
    tbody.querySelectorAll('[data-saida-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.saidaEdit);
        const row = S._rows.find(r => r.id === id);
        if (row) Modal.open(row);
      });
    });
    tbody.querySelectorAll('[data-saida-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.saidaDel);
        confirmDelete(id);
      });
    });
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─────────────────────────────────────────────────────────
     RELOAD principal (KPIs + tabela)
  ───────────────────────────────────────────────────────── */
  async function reload() {
    // KPIs em paralelo com a lista
    const [, res] = await Promise.allSettled([
      renderKPIs(),
      Api.getSaidas(buildFiltros()),
    ]);

    const rows = res.status === 'fulfilled'
      ? (res.value?.data || [])
      : [];

    if (res.status === 'rejected') {
      console.error('[Saídas] getSaidas:', res.reason);
    }

    renderTabela(rows);
  }

  /* ─────────────────────────────────────────────────────────
     DELETE com confirmação
  ───────────────────────────────────────────────────────── */
  async function confirmDelete(id) {
    if (!confirm('Deseja excluir esta saída? A ação não pode ser desfeita.')) return;
    try {
      await Api.deleteSaida(id);
      toast('Saída excluída com sucesso.', 'success');
      reload();
    } catch (err) {
      toast('Erro ao excluir saída. Tente novamente.', 'error');
      console.error('[Saídas] delete:', err);
    }
  }

  /* ─────────────────────────────────────────────────────────
     MODAL
  ───────────────────────────────────────────────────────── */
  const Modal = (() => {
    function el(id) { return document.getElementById(id); }

    function applyMoneyMask(input) {
      input.addEventListener('input', () => {
        const raw = input.value.replace(/\D/g, '') || '0';
        const num = parseInt(raw, 10) / 100;
        input.value = num === 0 ? '' : maskMoney(num);
      });
    }

    function populateRadiologiaSelect() {
      const sel = el('saidaRadiologia');
      if (!sel) return;
      sel.innerHTML = '';
      if (S.isAdmin) {
        S.radiologias.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = r.nome;
          sel.appendChild(opt);
        });
        sel.disabled = false;
      } else {
        const r = S.radiologias.find(x => x.id === S.radiologiaFixa) || { id: S.radiologiaFixa, nome: S.radiologiaFixa };
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.nome;
        sel.appendChild(opt);
        sel.disabled = true;
      }
    }

    function open(row) {
      const isEdit = !!row;
      el('modalSaidaTitle').textContent = isEdit ? 'Editar Saída' : 'Nova Saída';
      el('saidaEditId').value = isEdit ? row.id : '';

      // campos
      el('saidaData').value = isEdit ? String(row.dataSaida).split('T')[0] : today();
      el('saidaDescricao').value = isEdit ? (row.descricao || '') : '';
      el('saidaCategoria').value = isEdit ? (row.categoria || '') : '';
      el('saidaForma').value = isEdit ? (row.formaPagamento || '') : '';
      el('saidaValor').value = isEdit ? maskMoney(row.valor) : '';
      el('saidaObservacao').value = isEdit ? (row.observacao || '') : '';

      populateRadiologiaSelect();
      if (isEdit && S.isAdmin) {
        el('saidaRadiologia').value = row.radiologiaId || '';
      }

      // preview
      const prev = el('saidaModalPreview');
      if (prev) prev.hidden = true;

      const backdrop = el('modalSaidaBackdrop');
      backdrop.hidden = false;
      backdrop.removeAttribute('aria-hidden');
      el('saidaData').focus();
    }

    function close() {
      const backdrop = el('modalSaidaBackdrop');
      if (backdrop) { backdrop.hidden = true; backdrop.setAttribute('aria-hidden', 'true'); }
    }

    async function save() {
      // validação
      const data = el('saidaData').value;
      const desc = el('saidaDescricao').value.trim();
      const cat = el('saidaCategoria').value;
      const forma = el('saidaForma').value;
      const valStr = el('saidaValor').value;
      const obs = el('saidaObservacao').value.trim();
      const radioId = el('saidaRadiologia').value;
      const editId = el('saidaEditId').value;
      const valor = unmaskMoney(valStr);

      if (!data || !desc || !cat || !forma || !valor || !radioId) {
        toast('Preencha todos os campos obrigatórios.', 'error');
        return;
      }

      const payload = {
        radiologiaId: radioId,
        dataSaida: data,
        descricao: desc,
        categoria: cat,
        valor: valor,
        formaPagamento: forma,
        observacao: obs || undefined,
      };

      const confirmBtn = el('modalSaidaConfirm');
      if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Salvando...'; }

      try {
        if (editId) {
          await Api.updateSaida(Number(editId), payload);
          toast('Saída atualizada com sucesso.', 'success');
        } else {
          await Api.postSaida(payload);
          toast('Saída cadastrada com sucesso.', 'success');
        }
        close();
        reload();
      } catch (err) {
        toast('Erro ao salvar saída. Tente novamente.', 'error');
        console.error('[Saídas] save:', err);
      } finally {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Salvar Saída`;
        }
      }
    }

    function bind() {
      const backdrop = el('modalSaidaBackdrop');
      if (!backdrop) return;

      el('modalSaidaClose')?.addEventListener('click', close);
      el('modalSaidaCancel')?.addEventListener('click', close);
      el('modalSaidaConfirm')?.addEventListener('click', save);
      backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

      const valorInput = el('saidaValor');
      if (valorInput) applyMoneyMask(valorInput);

      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !backdrop.hidden) close();
      });
    }

    return { open, close, bind };
  })();

  /* ─────────────────────────────────────────────────────────
     FILTROS DA ABA (radiologia, categoria, forma, busca)
  ───────────────────────────────────────────────────────── */
  function initFiltrosAba() {
    // Radiologia
    const radSel = document.getElementById('saidasRadiologiaFilter');
    if (radSel) {
      if (S.isAdmin) {
        radSel.innerHTML = '<option value="">Todas</option>';
        S.radiologias.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = r.nome;
          radSel.appendChild(opt);
        });
        radSel.addEventListener('change', () => {
          S.radiologiaId = radSel.value || null;
          reload();
        });
      } else {
        // não-admin: mostra só a dele, desabilitado
        const r = S.radiologias.find(x => x.id === S.radiologiaFixa) || { id: S.radiologiaFixa, nome: S.radiologiaFixa };
        radSel.innerHTML = `<option value="${r.id}">${r.nome}</option>`;
        radSel.disabled = true;
        const grp = document.getElementById('saidasRadiologiaGroup');
        if (grp) grp.style.opacity = '.5';
      }
    }

    // Categoria
    document.getElementById('saidasCategoriaFilter')?.addEventListener('change', e => {
      S.categoria = e.target.value;
      reload();
    });

    // Forma de pgto
    document.getElementById('saidasFormaFilter')?.addEventListener('change', e => {
      S.forma = e.target.value;
      reload();
    });

    // Busca — debounce 400ms
    let searchTimer;
    document.getElementById('saidasSearch')?.addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        S.q = e.target.value.trim();
        reload();
      }, 400);
    });

    // Exportar CSV
    document.getElementById('btnExportSaidas')?.addEventListener('click', exportCSV);
  }

  /* ─────────────────────────────────────────────────────────
     EXPORT CSV
  ───────────────────────────────────────────────────────── */
  function exportCSV() {
    if (!S._rows.length) { toast('Nenhum dado para exportar.', 'info'); return; }

    const header = ['Data', 'Descrição', 'Categoria', 'Valor', 'Forma de Pgto', 'Radiologia', 'Observação'];
    const lines = S._rows.map(r => [
      fmtDate(r.dataSaida),
      `"${(r.descricao || '').replace(/"/g, '""')}"`,
      labelCategoria(r.categoria),
      String(r.valor).replace('.', ','),
      labelForma(r.formaPagamento),
      r.radiologiaNome || r.radiologiaId || '',
      `"${(r.observacao || '').replace(/"/g, '""')}"`,
    ].join(';'));

    const csv = [header.join(';'), ...lines].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saidas_${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ─────────────────────────────────────────────────────────
     SINCRONIZA COM FILTRO DE PERÍODO GLOBAL
     (ouve o select #periodFilter do financeiro.js)
  ───────────────────────────────────────────────────────── */
  function syncPeriodo() {
    const periodoSel = document.getElementById('periodFilter');
    const customStart = document.getElementById('customDateStart');
    const customEnd = document.getElementById('customDateEnd');

    function update() {
      S.periodo = periodoSel?.value || 'mes_atual';
      S.customStart = S.periodo === 'custom' ? (customStart?.value || null) : null;
      S.customEnd = S.periodo === 'custom' ? (customEnd?.value || null) : null;
    }

    periodoSel?.addEventListener('change', () => {
      update();
      // só recarrega se a aba Saídas estiver ativa
      if (document.getElementById('tab-saidas')?.classList.contains('is-active') === false &&
        !document.getElementById('tab-saidas')?.hidden === false) {
        // verifica outra forma: se o panel não tem a classe fin-panel--hidden
        if (!document.getElementById('tab-saidas')?.classList.contains('fin-panel--hidden')) {
          reload();
        }
      }
    });

    customStart?.addEventListener('change', () => { update(); });
    customEnd?.addEventListener('change', () => {
      update();
      if (!document.getElementById('tab-saidas')?.classList.contains('fin-panel--hidden')) {
        reload();
      }
    });

    update(); // lê o valor atual ao inicializar
  }

  /* ─────────────────────────────────────────────────────────
     HOOK NAS ABAS — carrega ao clicar em "Saídas"
  ───────────────────────────────────────────────────────── */
  function hookTab() {
    // O financeiro.js já controla a lógica de show/hide das abas.
    // Aqui apenas observamos quando o panel de Saídas fica visível.
    const tabBtn = document.querySelector('.fin-tab[data-tab="saidas"]');
    if (!tabBtn) return;

    tabBtn.addEventListener('click', () => {
      if (!S.initialized) {
        S.initialized = true;
        // Sincroniza período atual antes da primeira carga
        S.periodo = document.getElementById('periodFilter')?.value || 'mes_atual';
        reload();
      } else {
        // Recarrega sempre que voltar à aba (período pode ter mudado)
        S.periodo = document.getElementById('periodFilter')?.value || 'mes_atual';
        reload();
      }
    });
  }

  /* ─────────────────────────────────────────────────────────
     BOOTSTRAP
  ───────────────────────────────────────────────────────── */
  async function init() {
    try { window.IORDAuth?.requireLogin(); } catch (_) { }

    // Descobre permissões
    S.isAdmin = typeof IORDPermissions !== 'undefined'
      ? IORDPermissions.isAdmin()
      : true;

    S.radiologiaFixa = typeof IORDPermissions !== 'undefined'
      ? IORDPermissions.getRadiologiaId?.()
      : null;

    // Carrega lista de radiologias (já foi buscada pelo financeiro.js,
    // mas a buscamos novamente para garantir independência)
    try {
      const res = await Api.getRadiologias();
      const lista = res?.data || [];
      // filtra 'all' se vier da API
      S.radiologias = lista.filter(r => r.id !== 'all');
    } catch (err) {
      console.warn('[Saídas] Não foi possível carregar radiologias:', err);
    }

    // Sincroniza filtro de período com o select global
    syncPeriodo();

    // Inicializa filtros da aba
    initFiltrosAba();

    // Binda o botão Nova Saída
    document.getElementById('btnNovaSaida')?.addEventListener('click', () => {
      Modal.open(null);
    });

    // Binda modal
    Modal.bind();

    // Hookea a aba
    hookTab();
  }

  // Aguarda DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();