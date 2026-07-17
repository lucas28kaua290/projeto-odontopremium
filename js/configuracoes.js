/* =============================================================
   IORD — Configurações | configuracoes.js
   -------------------------------------------------------------
   Módulos:
     1.  Estado Global (State)
     2.  Dados Mock (substituir por chamadas API)
     3.  Utilitários (helpers, formatação, toast)
     4.  Módulo: Navegação por Pills
     5.  Módulo: Aba Geral
     6.  Módulo: Aba Radiologias
     7.  Módulo: Aba Clínicas e Médicos
     8.  Módulo: Aba Usuários e Permissões
     9.  Módulo: Aba Parâmetros do Sistema
    10.  Módulo: Modais (Radiologia, Clínica, Médico, Usuário)
    11.  Inicialização
============================================================= */

; (function () {
    'use strict'

    /* ===========================================================
       1. ESTADO GLOBAL
    =========================================================== */
    const State = {
        // Aba ativa
        activeTab: 'geral',
        activeSubTab: 'clinicas',

        // Dados carregados
        radiologias: [],
        clinicas: [],
        medicos: [],
        usuarios: [],

        // Pesquisa / filtros
        clinicSearch: '',
        doctorSearch: '',
        doctorClinicFilter: '',
        userSearch: '',
        userLevelFilter: '',

        // Controle de modal
        modal: {
            type: null,      // 'radiologia' | 'clinica' | 'medico' | 'usuario'
            mode: null,      // 'create' | 'edit'
            editId: null,
        },

        // Alterações pendentes
        hasUnsavedChanges: false,
    }

    /* ===========================================================
       2. DADOS MOCK
       [API] Substituir cada objeto/array pela chamada REST correspondente
    =========================================================== */

    // [API] GET /configuracoes/geral
    const MOCK_GERAL = {
        systemName: 'IORD',
        systemTagline: 'Painel de Gestão — Radiologias Odontológicas',
        companyName: 'IORD Radiologias Odontológicas Ltda.',
        companyFantasy: 'IORD',
        companyCNPJ: '12.345.678/0001-90',
        companyPhone: '(84) 99999-0000',
        companyEmail: 'contato@iord.com.br',
        companySite: 'https://iord.com.br',
        companyAddress: 'Av. Senador Salgado Filho, 1234 — Tirol, Natal/RN — CEP 59020-000',
        notifications: {
            email: {
                enabled: true,
                from: 'noreply@iord.com.br',
                admin: 'admin@iord.com.br',
                events: ['novo_agendamento', 'cancelamento', 'confirmacao_pagamento', 'relatorio_semanal'],
            },
            whatsapp: {
                enabled: true,
                number: '+55 84 99999-0001',
                token: 'EAAxxxxxxxx',
                events: ['confirmacao_agendamento', 'lembrete_24h', 'laudo_disponivel'],
            },
        },
        regionalization: {
            language: 'pt-BR',
            timezone: 'America/Fortaleza',
            currency: 'BRL',
            dateFormat: 'DD/MM/YYYY',
            timeFormat: '24h',
        },
    }

    // [API] GET /radiologias
    const MOCK_RADIOLOGIAS = [
        {
            id: 'rad-001',
            name: 'IORD Centro',
            phone: '(84) 3232-1000',
            email: 'centro@iord.com.br',
            address: 'Av. Senador Salgado Filho, 1234 — Tirol, Natal/RN',
            openTime: '08:00',
            closeTime: '18:00',
            technician: 'Marcos Vinícius Costa',
            cro: 'CRO-RN 012345',
            status: 'ativo',
            color: '#018093',
        },
        {
            id: 'rad-002',
            name: 'IORD Capim Macio',
            phone: '(84) 3088-2200',
            email: 'capimmacio@iord.com.br',
            address: 'R. Manoel Dantas, 890 — Capim Macio, Natal/RN',
            openTime: '07:30',
            closeTime: '17:30',
            technician: 'Ana Paula Silveira',
            cro: 'CRO-RN 023456',
            status: 'ativo',
            color: '#5B93C8',
        },
        {
            id: 'rad-003',
            name: 'IORD Mossoró',
            phone: '(84) 3315-4400',
            email: 'mossoro@iord.com.br',
            address: 'Av. Alberto Maranhão, 567 — Centro, Mossoró/RN',
            openTime: '08:00',
            closeTime: '17:00',
            technician: 'Fernanda Leal',
            cro: 'CRO-RN 034567',
            status: 'ativo',
            color: '#7B68EE',
        },
        {
            id: 'rad-004',
            name: 'IORD Zona Norte',
            phone: '(84) 3201-5500',
            email: 'zonanorte@iord.com.br',
            address: 'Av. Tomaz Landim, 3310 — N. Sra. da Apresentação, Natal/RN',
            openTime: '08:00',
            closeTime: '17:00',
            technician: 'Carlos Eduardo Melo',
            cro: 'CRO-RN 045678',
            status: 'manutencao',
            color: '#E8974A',
        },
    ]

    // [API] GET /clinicas
    const MOCK_CLINICAS = [
        { id: 'cli-001', name: 'Clínica Odontofácil', city: 'Natal', state: 'RN', phone: '(84) 3232-5566', email: 'contato@odontofacil.com.br', address: 'R. das Orquídeas, 42 — Petrópolis', status: 'ativo' },
        { id: 'cli-002', name: 'OdontoCenter Natal', city: 'Natal', state: 'RN', phone: '(84) 3088-4411', email: 'admin@odontocenter.com.br', address: 'Av. Roberto Freire, 1800 — Capim Macio', status: 'ativo' },
        { id: 'cli-003', name: 'Sorriso Pleno', city: 'Mossoró', state: 'RN', phone: '(84) 3315-2233', email: 'sorriso@sorriso.com.br', address: 'Av. Jerônimo Rosado, 900 — Centro', status: 'ativo' },
        { id: 'cli-004', name: 'DentalArt Clínica', city: 'Parnamirim', state: 'RN', phone: '(84) 3647-8899', email: 'info@dentalart.com.br', address: 'R. José Bezerra Melo, 234', status: 'ativo' },
        { id: 'cli-005', name: 'OdontoLife Caicó', city: 'Caicó', state: 'RN', phone: '(84) 3421-0011', email: 'caico@odontolife.com.br', address: 'Av. Cel. Martiniano, 1200', status: 'inativo' },
        { id: 'cli-006', name: 'Clínica Bela Sorria', city: 'Natal', state: 'RN', phone: '(84) 3205-3344', email: 'sorria@belasorria.com.br', address: 'R. Apodi, 89 — Alecrim', status: 'ativo' },
    ]

    // [API] GET /medicos
    const MOCK_MEDICOS = [
        { id: 'med-001', name: 'Dra. Isabela Fonseca', specialty: 'ortodontia', clinicId: 'cli-001', phone: '(84) 99801-1122', email: 'isabela@email.com', comissao: 30, status: 'ativo' },
        { id: 'med-002', name: 'Dr. Ricardo Azevedo', specialty: 'implantodontia', clinicId: 'cli-001', phone: '(84) 99812-3344', email: 'ricardo@email.com', comissao: 30, status: 'ativo' },
        { id: 'med-003', name: 'Dra. Camila Torres', specialty: 'endodontia', clinicId: 'cli-002', phone: '(84) 99823-5566', email: 'camila@email.com', comissao: 25, status: 'ativo' },
        { id: 'med-004', name: 'Dr. André Menezes', specialty: 'cirurgia', clinicId: 'cli-002', phone: '(84) 99834-7788', email: 'andre@email.com', comissao: 35, status: 'ativo' },
        { id: 'med-005', name: 'Dra. Patrícia Lima', specialty: 'periodontia', clinicId: 'cli-003', phone: '(84) 99845-9900', email: 'patricia@email.com', comissao: 30, status: 'ativo' },
        { id: 'med-006', name: 'Dr. Felipe Carvalho', specialty: 'clinico', clinicId: 'cli-004', phone: '(84) 99856-1122', email: 'felipe@email.com', comissao: 28, status: 'inativo' },
        { id: 'med-007', name: 'Dra. Juliana Barbosa', specialty: 'pediatria', clinicId: 'cli-004', phone: '(84) 99867-3344', email: 'juliana@email.com', comissao: 30, status: 'ativo' },
        { id: 'med-008', name: 'Dr. Thiago Nunes', specialty: 'ortodontia', clinicId: 'cli-006', phone: '(84) 99878-5566', email: 'thiago@email.com', comissao: 32, status: 'ativo' },
    ]

    // [API] GET /usuarios
    const MOCK_USUARIOS = [
        { id: 'usr-001', name: 'Dr. Iago', email: 'iago@iord.com.br', role: 'Proprietário', level: 'admin', radiologia: 'todas', lastAccess: '2025-07-15T14:32:00', status: 'ativo' },
        { id: 'usr-002', name: 'Carla Mendonça', email: 'carla@iord.com.br', role: 'Gerente', level: 'admin', radiologia: 'todas', lastAccess: '2025-07-14T09:15:00', status: 'ativo' },
        { id: 'usr-003', name: 'Renata Oliveira', email: 'renata@iord.com.br', role: 'Recepcionista', level: 'recepcao', radiologia: 'rad-001', lastAccess: '2025-07-15T08:00:00', status: 'ativo' },
        { id: 'usr-004', name: 'Bruna Costa', email: 'bruna@iord.com.br', role: 'Recepcionista', level: 'recepcao', radiologia: 'rad-002', lastAccess: '2025-07-13T17:45:00', status: 'ativo' },
        { id: 'usr-005', name: 'Marcos Lopes', email: 'marcos@iord.com.br', role: 'Técnico', level: 'viewer', radiologia: 'rad-003', lastAccess: '2025-07-10T11:20:00', status: 'ativo' },
        { id: 'usr-006', name: 'Luana Ferreira', email: 'luana@iord.com.br', role: 'Recepcionista', level: 'recepcao', radiologia: 'rad-004', lastAccess: null, status: 'pendente' },
    ]

    // [API] GET /parametros
    const MOCK_PARAMETROS = {
        examDurations: [
            { id: 'periapical', label: 'Periapical', duration: 10 },
            { id: 'panoramica', label: 'Panorâmica', duration: 15 },
            { id: 'cefalometrica', label: 'Cefalométrica', duration: 15 },
            { id: 'tomografia', label: 'Tomografia (CBCT)', duration: 30 },
            { id: 'interproximal', label: 'Interproximal', duration: 10 },
            { id: 'oclusais', label: 'Oclusais', duration: 12 },
            { id: 'atm', label: 'ATM', duration: 20 },
            { id: 'seios_faciais', label: 'Seios da Face', duration: 20 },
            { id: 'total_face', label: 'Total de Face', duration: 25 },
        ],
        whatsappMessages: [
            {
                id: 'confirmacao',
                event: 'Confirmação de Agendamento',
                active: true,
                text: 'Olá, {nome}! Seu agendamento na {radiologia} foi confirmado para {data} às {hora}.\nExame: {exame}.\nQualquer dúvida, entre em contato. Até lá!',
            },
            {
                id: 'lembrete',
                event: 'Lembrete 24h Antes',
                active: true,
                text: 'Oi, {nome}! Lembrando que amanhã às {hora} você tem um exame de {exame} agendado na {radiologia}. Não se esqueça! 😊',
            },
            {
                id: 'laudo',
                event: 'Laudo Disponível',
                active: true,
                text: 'Olá, {nome}! O laudo do seu exame de {exame} realizado em {data} já está disponível. Acesse pelo link: {link}',
            },
            {
                id: 'cancelamento',
                event: 'Cancelamento',
                active: false,
                text: 'Olá, {nome}. Seu agendamento de {exame} em {data} às {hora} na {radiologia} foi cancelado. Para reagendar, entre em contato conosco.',
            },
        ],
        scheduling: {
            antecedenciaMin: 2,
            prazoCancelamento: 24,
            enviarConfirmacao: 24,
            intervaloMin: 10,
            maxDia: 40,
            exigirConfirmacaoLink: true,
            permitirReagendamento: false,
            bloquearAutomatico: true,
        },
        financial: {
            comissaoPadrao: 30,
            impostos: 6,
            vencimentoComissoes: 30,
            formasPagamento: ['dinheiro', 'debito', 'credito', 'pix'],
        },
    }

    // Mapa de especialidades (para exibição)
    const SPECIALTY_LABELS = {
        ortodontia: 'Ortodontia',
        implantodontia: 'Implantodontia',
        endodontia: 'Endodontia',
        periodontia: 'Periodontia',
        cirurgia: 'Cirurgia Bucomaxilofacial',
        pediatria: 'Odontopediatria',
        clinico: 'Clínico Geral',
        outro: 'Outro',
    }

    // Matriz de permissões
    const PERMISSION_MATRIX = [
        { feature: 'Ver Dashboard', admin: 'yes', recepcao: 'yes', viewer: 'yes' },
        { feature: 'Criar / Editar Agendamentos', admin: 'yes', recepcao: 'yes', viewer: 'no' },
        { feature: 'Cancelar Agendamentos', admin: 'yes', recepcao: 'yes', viewer: 'no' },
        { feature: 'Ver Pacientes', admin: 'yes', recepcao: 'yes', viewer: 'yes' },
        { feature: 'Editar Dados de Pacientes', admin: 'yes', recepcao: 'yes', viewer: 'no' },
        { feature: 'Ver Financeiro', admin: 'yes', recepcao: 'partial', viewer: 'no' },
        { feature: 'Lançar Recebimentos', admin: 'yes', recepcao: 'yes', viewer: 'no' },
        { feature: 'Ver Relatórios Financeiros', admin: 'yes', recepcao: 'no', viewer: 'no' },
        { feature: 'Exportar Dados', admin: 'yes', recepcao: 'partial', viewer: 'no' },
        { feature: 'Gerenciar Configurações', admin: 'yes', recepcao: 'no', viewer: 'no' },
        { feature: 'Criar / Editar Usuários', admin: 'yes', recepcao: 'no', viewer: 'no' },
        { feature: 'Gerenciar Clínicas e Médicos', admin: 'yes', recepcao: 'no', viewer: 'no' },
    ]

    /* ===========================================================
       3. UTILITÁRIOS
    =========================================================== */
    const Utils = {
        /** Retorna iniciais de um nome (até 2 letras) */
        initials(name) {
            if (!name) return '?'
            const parts = name.trim().split(' ')
            if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        },

        /** Formata data ISO para DD/MM/AAAA HH:mm */
        formatDateTime(iso) {
            if (!iso) return '—'
            const d = new Date(iso)
            const pad = n => String(n).padStart(2, '0')
            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
        },

        /** Escapa HTML para evitar XSS */
        escapeHtml(str) {
            if (!str) return ''
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
        },

        /** Gera ID único simples */
        uid(prefix = 'id') {
            return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9999)}`
        },

        /** Status badge HTML */
        statusBadge(status) {
            const map = {
                ativo: { cls: 'status-badge--active', label: 'Ativo' },
                inativo: { cls: 'status-badge--inactive', label: 'Inativo' },
                pendente: { cls: 'status-badge--pending', label: 'Pendente' },
                manutencao: { cls: 'status-badge--maintenance', label: 'Manutenção' },
            }
            const s = map[status] || map.inativo
            return `<span class="status-badge ${s.cls}">${Utils.escapeHtml(s.label)}</span>`
        },

        /** Level badge HTML */
        levelBadge(level) {
            const map = {
                admin: { cls: 'level-badge--admin', label: 'Administrador' },
                recepcao: { cls: 'level-badge--recepcao', label: 'Recepcionista' },
                viewer: { cls: 'level-badge--viewer', label: 'Visualizador' },
            }
            const l = map[level] || map.viewer
            return `<span class="level-badge ${l.cls}">${Utils.escapeHtml(l.label)}</span>`
        },

        /** Nome da clínica pelo id */
        clinicName(clinicId) {
            const c = State.clinicas.find(c => c.id === clinicId)
            return c ? c.name : '—'
        },

        /** Label de especialidade */
        specialtyLabel(key) {
            return SPECIALTY_LABELS[key] || key || '—'
        },
    }

    /* ===========================================================
       TOAST
    =========================================================== */
    const Toast = {
        _timer: null,

        show(msg, type = 'success') {
            const toast = document.getElementById('cfgToast')
            const icon = document.getElementById('cfgToastIcon')
            const msgEl = document.getElementById('cfgToastMsg')
            if (!toast) return

            const icons = {
                success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
                error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
                warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
            }

            toast.className = `cfg-toast cfg-toast--${type}`
            icon.innerHTML = icons[type] || icons.success
            msgEl.textContent = msg
            toast.hidden = false

            clearTimeout(this._timer)
            this._timer = setTimeout(() => {
                toast.classList.add('cfg-toast--out')
                setTimeout(() => { toast.hidden = true; toast.classList.remove('cfg-toast--out') }, 280)
            }, 3200)
        },
    }

    /* ===========================================================
       4. MÓDULO: NAVEGAÇÃO POR PILLS
    =========================================================== */
    const TabNav = {
        init() {
            const tabs = document.querySelectorAll('.fin-tab[data-tab]')
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const target = tab.dataset.tab
                    this.switchTo(target)
                })
            })
        },

        switchTo(tabId) {
            State.activeTab = tabId

            // Atualiza pills
            document.querySelectorAll('.fin-tab[data-tab]').forEach(t => {
                const active = t.dataset.tab === tabId
                t.classList.toggle('is-active', active)
                t.setAttribute('aria-selected', active)
            })

            // Mostra/esconde painéis
            document.querySelectorAll('.cfg-panel[id^="tab-"]').forEach(panel => {
                const isTarget = panel.id === `tab-${tabId}`
                panel.classList.toggle('cfg-panel--hidden', !isTarget)
                if (isTarget) panel.removeAttribute('hidden')
                else panel.setAttribute('hidden', '')
            })
        },
    }

    /* ===========================================================
       5. MÓDULO: ABA GERAL
    =========================================================== */
    const GeralModule = {
        init() {
            this.bindSave()
            this.bindDiscard()
            this.bindLogoUpload()
            this.bindColorPicker()
            this.bindToggleSubs()
        },

        /** [API] POST /configuracoes/geral */
        bindSave() {
            const btn = document.getElementById('btnGeralSave')
            if (!btn) return
            btn.addEventListener('click', () => {
                // Coletar valores dos campos
                const payload = {
                    systemName: document.getElementById('systemName')?.value?.trim(),
                    systemTagline: document.getElementById('systemTagline')?.value?.trim(),
                    companyName: document.getElementById('companyName')?.value?.trim(),
                    companyFantasy: document.getElementById('companyFantasy')?.value?.trim(),
                    companyCNPJ: document.getElementById('companyCNPJ')?.value?.trim(),
                    companyPhone: document.getElementById('companyPhone')?.value?.trim(),
                    companyEmail: document.getElementById('companyEmail')?.value?.trim(),
                    companySite: document.getElementById('companySite')?.value?.trim(),
                    companyAddress: document.getElementById('companyAddress')?.value?.trim(),
                    language: document.getElementById('cfgLanguage')?.value,
                    timezone: document.getElementById('cfgTimezone')?.value,
                    currency: document.getElementById('cfgCurrency')?.value,
                    dateFormat: document.getElementById('cfgDateFormat')?.value,
                    timeFormat: document.getElementById('cfgTimeFormat')?.value,
                }

                console.log('[API] POST /configuracoes/geral', payload)
                // [API] await api.post('/configuracoes/geral', payload)

                Toast.show('Configurações gerais salvas com sucesso.')
            })
        },

        bindDiscard() {
            const btn = document.getElementById('btnGeralDiscard')
            if (!btn) return
            btn.addEventListener('click', () => {
                // [API] Recarregar dados originais
                console.log('[API] GET /configuracoes/geral (discard → reload)')
                Toast.show('Alterações descartadas.', 'warning')
            })
        },

        bindLogoUpload() {
            const btn = document.getElementById('btnUploadLogo')
            const input = document.getElementById('logoInput')
            const preview = document.getElementById('logoPreview')
            const area = document.getElementById('logoUploadArea')
            if (!btn || !input) return

            const doUpload = () => input.click()
            btn.addEventListener('click', doUpload)
            area.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') doUpload() })

            input.addEventListener('change', () => {
                const file = input.files[0]
                if (!file) return
                if (file.size > 2 * 1024 * 1024) {
                    Toast.show('Arquivo muito grande. Máx. 2MB.', 'error')
                    return
                }
                const reader = new FileReader()
                reader.onload = e => {
                    const placeholder = preview.querySelector('.logo-upload-area__placeholder')
                    if (placeholder) placeholder.remove()
                    let img = preview.querySelector('img')
                    if (!img) {
                        img = document.createElement('img')
                        preview.appendChild(img)
                    }
                    img.src = e.target.result
                    // [API] POST /configuracoes/logo (multipart)
                    console.log('[API] POST /configuracoes/logo', file.name)
                    Toast.show('Logo carregado. Salve as configurações para confirmar.')
                }
                reader.readAsDataURL(file)
            })
        },

        bindColorPicker() {
            const picker = document.getElementById('radColor')
            const label = document.getElementById('radColorLabel')
            if (!picker || !label) return
            picker.addEventListener('input', () => { label.textContent = picker.value })
        },

        /** Mostrar/ocultar sub-config das notificações conforme toggle */
        bindToggleSubs() {
            const pairs = [
                { toggleId: 'toggleEmail', subId: 'emailSubConfig' },
                { toggleId: 'toggleWhatsapp', subId: 'whatsappSubConfig' },
            ]
            pairs.forEach(({ toggleId, subId }) => {
                const toggle = document.getElementById(toggleId)
                const sub = document.getElementById(subId)
                if (!toggle || !sub) return

                const update = (animate = false) => {
                    if (toggle.checked) {
                        sub.style.display = ''
                        if (animate) {
                            sub.style.animation = 'none'
                            sub.offsetHeight // reflow
                            sub.style.animation = ''
                        }
                    } else {
                        sub.style.display = 'none'
                    }
                }
                update(false)
                toggle.addEventListener('change', () => update(true))
            })
        },
    }

    /* ===========================================================
       6. MÓDULO: ABA RADIOLOGIAS
    =========================================================== */
    const RadiologiasModule = {
        init() {
            // [API] GET /radiologias
            State.radiologias = JSON.parse(JSON.stringify(MOCK_RADIOLOGIAS))
            this.renderCards()
            this.bindNewButton()
        },

        renderCards() {
            const grid = document.getElementById('radiologyCardsGrid')
            const hint = document.querySelector('.cfg-section-toolbar__hint')
            if (!grid) return

            if (hint) hint.textContent = `${State.radiologias.length} unidade${State.radiologias.length !== 1 ? 's' : ''} cadastrada${State.radiologias.length !== 1 ? 's' : ''}`

            grid.innerHTML = State.radiologias.map(r => this.buildCard(r)).join('')

            // Bind editar / excluir
            grid.querySelectorAll('.icon-btn--edit').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.closest('.rad-card').dataset.radId
                    ModalRadiologia.open('edit', id)
                })
            })
            grid.querySelectorAll('.icon-btn--delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.closest('.rad-card').dataset.radId
                    this.confirmDelete(id)
                })
            })
        },

        buildCard(r) {
            const statusMap = {
                ativo: { label: 'Ativo', cls: 'status-badge--active' },
                inativo: { label: 'Inativo', cls: 'status-badge--inactive' },
                manutencao: { label: 'Manutenção', cls: 'status-badge--maintenance' },
            }
            const s = statusMap[r.status] || statusMap.inativo
            const initials = r.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

            return `
        <div class="rad-card" data-rad-id="${Utils.escapeHtml(r.id)}" style="--card-accent: ${Utils.escapeHtml(r.color)}">
          <div class="rad-card__header">
            <div class="rad-card__title-group">
              <div class="rad-card__avatar" style="background-color:${Utils.escapeHtml(r.color)}">${Utils.escapeHtml(initials)}</div>
              <span class="rad-card__name">${Utils.escapeHtml(r.name)}</span>
            </div>
            <div class="rad-card__actions">
              ${Utils.statusBadge(r.status)}
              <button type="button" class="icon-btn icon-btn--edit" title="Editar radiologia" aria-label="Editar ${Utils.escapeHtml(r.name)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button type="button" class="icon-btn icon-btn--delete" title="Excluir radiologia" aria-label="Excluir ${Utils.escapeHtml(r.name)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </div>

          <div class="rad-card__body">
            <div class="rad-card__info-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
              ${Utils.escapeHtml(r.address)}
            </div>
            <div class="rad-card__info-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              ${Utils.escapeHtml(r.phone)}
            </div>
            <div class="rad-card__info-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              ${Utils.escapeHtml(r.technician)} &middot; ${Utils.escapeHtml(r.cro)}
            </div>
          </div>

          <div class="rad-card__footer">
            <div class="rad-card__hours">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              ${Utils.escapeHtml(r.openTime)} – ${Utils.escapeHtml(r.closeTime)}
            </div>
            <a href="mailto:${Utils.escapeHtml(r.email)}" class="table-name-cell__sub" style="font-size:var(--fs-xs);color:var(--color-primary-light);">${Utils.escapeHtml(r.email)}</a>
          </div>
        </div>
      `
        },

        bindNewButton() {
            const btn = document.getElementById('btnNewRadiology')
            if (!btn) return
            btn.addEventListener('click', () => ModalRadiologia.open('create'))
        },

        /** [API] DELETE /radiologias/:id */
        async confirmDelete(id) {
            const rad = State.radiologias.find(r => r.id === id)
            if (!rad) return
            const confirmed = await new Promise(resolve => {
                const toast = document.getElementById('cfgToast')
                const icon = document.getElementById('cfgToastIcon')
                const msgEl = document.getElementById('cfgToastMsg')
                if (!toast || !icon || !msgEl) { resolve(window.confirm(`Excluir "${rad.name}"?`)); return }

                // Injeta dois botões temporários
                icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
                msgEl.innerHTML = `<span>Excluir <strong>${Utils.escapeHtml(rad.name)}</strong>?</span>
            <span style="display:flex;gap:8px;margin-left:auto;">
            <button id="_toastNo"  style="padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:inherit;cursor:pointer;font-size:12px;">Cancelar</button>
            <button id="_toastYes" style="padding:4px 12px;border-radius:6px;border:none;background:rgba(194,59,50,0.85);color:#fff;cursor:pointer;font-size:12px;font-weight:600;">Excluir</button>
            </span>`
                toast.className = 'cfg-toast cfg-toast--warning'
                toast.hidden = false

                const cleanup = (val) => {
                    toast.hidden = true
                    msgEl.innerHTML = ''
                    resolve(val)
                }
                document.getElementById('_toastYes')?.addEventListener('click', () => cleanup(true))
                document.getElementById('_toastNo')?.addEventListener('click', () => cleanup(false))
            })
            if (!confirmed) return

            State.radiologias = State.radiologias.filter(r => r.id !== id)
            // [API] await api.delete(`/radiologias/${id}`)
            this.renderCards()
            Toast.show('Radiologia excluída com sucesso.')
        },
    }

    /* ===========================================================
       7. MÓDULO: ABA CLÍNICAS E MÉDICOS
    =========================================================== */
    const ClinicasMedicosModule = {
        init() {
            // [API] GET /clinicas + /medicos
            State.clinicas = JSON.parse(JSON.stringify(MOCK_CLINICAS))
            State.medicos = JSON.parse(JSON.stringify(MOCK_MEDICOS))

            this.initSubTabs()
            this.renderClinicsTable()
            this.renderDoctorsTable()
            this.bindSearches()
            this.bindNewButtons()
        },

        /* --- Sub-abas internas Clínicas | Médicos --- */
        initSubTabs() {
            const tabs = document.querySelectorAll('.cfg-sub-tab[data-subtab]')
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const target = tab.dataset.subtab
                    State.activeSubTab = target

                    tabs.forEach(t => {
                        t.classList.toggle('is-active', t.dataset.subtab === target)
                        t.setAttribute('aria-selected', t.dataset.subtab === target)
                    })

                    document.querySelectorAll('.cfg-sub-panel[id^="subtab-"]').forEach(panel => {
                        const isTarget = panel.id === `subtab-${target}`
                        panel.classList.toggle('cfg-sub-panel--hidden', !isTarget)
                    })
                })
            })
        },

        /* ---- CLÍNICAS ---- */
        getFilteredClinics() {
            const q = State.clinicSearch.toLowerCase()
            return State.clinicas.filter(c =>
                !q || c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q)
            )
        },

        renderClinicsTable() {
            const tbody = document.getElementById('clinicsTableBody')
            const footer = document.getElementById('clinicsTableFooter')
            if (!tbody) return

            const list = this.getFilteredClinics()

            if (list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:var(--space-8);color:var(--color-text-subtle);">Nenhuma clínica encontrada.</td></tr>`
            } else {
                tbody.innerHTML = list.map(c => {
                    const linked = State.medicos.filter(m => m.clinicId === c.id && m.status === 'ativo').length
                    const initials = c.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
                    return `
            <tr>
              <td>
                <div class="table-name-cell">
                  <div class="table-avatar table-avatar--clinic">${Utils.escapeHtml(initials)}</div>
                  <div class="table-name-cell__text">
                    <span class="table-name-cell__name">${Utils.escapeHtml(c.name)}</span>
                    <span class="table-name-cell__sub">${Utils.escapeHtml(c.email)}</span>
                  </div>
                </div>
              </td>
              <td>${Utils.escapeHtml(c.city)}/${Utils.escapeHtml(c.state)}</td>
              <td>${Utils.escapeHtml(c.phone)}</td>
              <td class="data-table__num">${linked}</td>
              <td>${Utils.statusBadge(c.status)}</td>
              <td class="data-table__action">
                <div class="table-actions">
                  <button type="button" class="icon-btn icon-btn--edit" data-clinic-id="${Utils.escapeHtml(c.id)}" title="Editar clínica" aria-label="Editar ${Utils.escapeHtml(c.name)}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                  </button>
                  <button type="button" class="icon-btn icon-btn--delete" data-clinic-id="${Utils.escapeHtml(c.id)}" title="Excluir clínica" aria-label="Excluir ${Utils.escapeHtml(c.name)}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          `
                }).join('')
            }

            if (footer) footer.textContent = `${list.length} clínica${list.length !== 1 ? 's' : ''} encontrada${list.length !== 1 ? 's' : ''}`
            const badge = document.getElementById('clinicsCountBadge')
            if (badge) badge.textContent = `${list.length} ${list.length !== 1 ? 'clínicas' : 'clínica'}`

            // Bind ações
            tbody.querySelectorAll('.icon-btn--edit[data-clinic-id]').forEach(btn => {
                btn.addEventListener('click', () => ModalClinica.open('edit', btn.dataset.clinicId))
            })
            tbody.querySelectorAll('.icon-btn--delete[data-clinic-id]').forEach(btn => {
                btn.addEventListener('click', () => this.confirmDeleteClinic(btn.dataset.clinicId))
            })
        },

        /** [API] DELETE /clinicas/:id */
        async confirmDeleteClinic(id) {
            const c = State.clinicas.find(c => c.id === id)
            if (!c) return

            const confirmed = await new Promise(resolve => {
                const toast = document.getElementById('cfgToast')
                const icon = document.getElementById('cfgToastIcon')
                const msgEl = document.getElementById('cfgToastMsg')
                if (!toast || !icon || !msgEl) { resolve(window.confirm(`Excluir "${c.name}"?`)); return }

                icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
                msgEl.innerHTML = `<span>Excluir <strong>${Utils.escapeHtml(c.name)}</strong>?</span>
            <span style="display:flex;gap:8px;margin-left:auto;">
                <button id="_toastNo"  style="padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:inherit;cursor:pointer;font-size:12px;">Cancelar</button>
                <button id="_toastYes" style="padding:4px 12px;border-radius:6px;border:none;background:rgba(194,59,50,0.85);color:#fff;cursor:pointer;font-size:12px;font-weight:600;">Excluir</button>
            </span>`
                toast.className = 'cfg-toast cfg-toast--warning'
                toast.hidden = false

                const cleanup = (val) => { toast.hidden = true; msgEl.innerHTML = ''; resolve(val) }
                document.getElementById('_toastYes')?.addEventListener('click', () => cleanup(true))
                document.getElementById('_toastNo')?.addEventListener('click', () => cleanup(false))
            })

            if (!confirmed) return
            State.clinicas = State.clinicas.filter(c => c.id !== id)
            // [API] await api.delete(`/clinicas/${id}`)
            this.renderClinicsTable()
            Toast.show('Clínica excluída.')
        },

        /* ---- MÉDICOS ---- */
        getFilteredDoctors() {
            const q = State.doctorSearch.toLowerCase()
            const cf = State.doctorClinicFilter
            return State.medicos.filter(m => {
                const matchSearch = !q || m.name.toLowerCase().includes(q) || Utils.specialtyLabel(m.specialty).toLowerCase().includes(q)
                const matchClinic = !cf || m.clinicId === cf
                return matchSearch && matchClinic
            })
        },

        renderDoctorsTable() {
            const tbody = document.getElementById('doctorsTableBody')
            const footer = document.getElementById('doctorsTableFooter')
            const select = document.getElementById('doctorClinicFilter')
            if (!tbody) return

            // Popular filtro de clínicas
            if (select) {
                const currentVal = select.value
                select.innerHTML = `<option value="">Todas as clínicas</option>` +
                    State.clinicas.map(c => `<option value="${Utils.escapeHtml(c.id)}" ${currentVal === c.id ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`).join('')
            }

            const list = this.getFilteredDoctors()

            if (list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:var(--space-8);color:var(--color-text-subtle);">Nenhum médico encontrado.</td></tr>`
            } else {
                tbody.innerHTML = list.map(m => `
          <tr>
            <td>
              <div class="table-name-cell">
                <div class="table-avatar">${Utils.initials(m.name)}</div>
                <div class="table-name-cell__text">
                  <span class="table-name-cell__name">${Utils.escapeHtml(m.name)}</span>
                  <span class="table-name-cell__sub">${Utils.escapeHtml(m.email)}</span>
                </div>
              </div>
            </td>
            <td>${Utils.escapeHtml(Utils.specialtyLabel(m.specialty))}</td>
            <td>${Utils.escapeHtml(Utils.clinicName(m.clinicId))}</td>
            <td>${Utils.escapeHtml(m.phone)}</td>
            <td>${Utils.statusBadge(m.status)}</td>
            <td class="data-table__action">
              <div class="table-actions">
                <button type="button" class="icon-btn icon-btn--edit" data-doctor-id="${Utils.escapeHtml(m.id)}" title="Editar médico" aria-label="Editar ${Utils.escapeHtml(m.name)}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                </button>
                <button type="button" class="icon-btn icon-btn--delete" data-doctor-id="${Utils.escapeHtml(m.id)}" title="Excluir médico" aria-label="Excluir ${Utils.escapeHtml(m.name)}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                </button>
              </div>
            </td>
          </tr>
        `).join('')
            }

            if (footer) footer.textContent = `${list.length} médico${list.length !== 1 ? 's' : ''} encontrado${list.length !== 1 ? 's' : ''}`

            tbody.querySelectorAll('.icon-btn--edit[data-doctor-id]').forEach(btn => {
                btn.addEventListener('click', () => ModalMedico.open('edit', btn.dataset.doctorId))
            })
            tbody.querySelectorAll('.icon-btn--delete[data-doctor-id]').forEach(btn => {
                btn.addEventListener('click', () => this.confirmDeleteDoctor(btn.dataset.doctorId))
            })
        },

        /** [API] DELETE /medicos/:id */
        async confirmDeleteDoctor(id) {
            const m = State.medicos.find(m => m.id === id)
            if (!m) return

            const confirmed = await new Promise(resolve => {
                const toast = document.getElementById('cfgToast')
                const icon = document.getElementById('cfgToastIcon')
                const msgEl = document.getElementById('cfgToastMsg')
                if (!toast || !icon || !msgEl) { resolve(window.confirm(`Excluir "${m.name}"?`)); return }

                icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
                msgEl.innerHTML = `<span>Excluir <strong>${Utils.escapeHtml(m.name)}</strong>?</span>
            <span style="display:flex;gap:8px;margin-left:auto;">
                <button id="_toastNo"  style="padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:inherit;cursor:pointer;font-size:12px;">Cancelar</button>
                <button id="_toastYes" style="padding:4px 12px;border-radius:6px;border:none;background:rgba(194,59,50,0.85);color:#fff;cursor:pointer;font-size:12px;font-weight:600;">Excluir</button>
            </span>`
                toast.className = 'cfg-toast cfg-toast--warning'
                toast.hidden = false

                const cleanup = (val) => { toast.hidden = true; msgEl.innerHTML = ''; resolve(val) }
                document.getElementById('_toastYes')?.addEventListener('click', () => cleanup(true))
                document.getElementById('_toastNo')?.addEventListener('click', () => cleanup(false))
            })

            if (!confirmed) return
            State.medicos = State.medicos.filter(m => m.id !== id)
            // [API] await api.delete(`/medicos/${id}`)
            this.renderDoctorsTable()
            Toast.show('Médico excluído.')
        },

        /* ---- Buscas e filtros ---- */
        bindSearches() {
            const clinicSearch = document.getElementById('clinicSearch')
            if (clinicSearch) {
                clinicSearch.addEventListener('input', () => {
                    State.clinicSearch = clinicSearch.value
                    this.renderClinicsTable()
                })
            }

            const doctorSearch = document.getElementById('doctorSearch')
            if (doctorSearch) {
                doctorSearch.addEventListener('input', () => {
                    State.doctorSearch = doctorSearch.value
                    this.renderDoctorsTable()
                })
            }

            const doctorClinicFilter = document.getElementById('doctorClinicFilter')
            if (doctorClinicFilter) {
                doctorClinicFilter.addEventListener('change', () => {
                    State.doctorClinicFilter = doctorClinicFilter.value
                    this.renderDoctorsTable()
                })
            }
        },

        bindNewButtons() {
            document.getElementById('btnNewClinic')?.addEventListener('click', () => ModalClinica.open('create'))
            document.getElementById('btnNewDoctor')?.addEventListener('click', () => ModalMedico.open('create'))
        },
    }

    /* ===========================================================
       8. MÓDULO: ABA USUÁRIOS E PERMISSÕES
    =========================================================== */
    const UsuariosModule = {
        init() {
            // [API] GET /usuarios
            State.usuarios = JSON.parse(JSON.stringify(MOCK_USUARIOS))
            this.renderKPIs()
            this.renderUsersTable()
            this.renderPermissionMatrix()
            this.bindSearch()
            this.bindNewButton()
        },

        renderKPIs() {
            const row = document.getElementById('usersKpiRow')
            if (!row) return

            const total = State.usuarios.length
            const ativos = State.usuarios.filter(u => u.status === 'ativo').length
            const admins = State.usuarios.filter(u => u.level === 'admin').length
            const pendentes = State.usuarios.filter(u => u.status === 'pendente').length

            const kpis = [
                { label: 'Total de Usuários', value: total, sub: `${ativos} ativos · ${pendentes} pendentes`, icon: 'admin' },
                { label: 'Usuários Ativos', value: ativos, sub: 'no sistema', icon: '' },
                { label: 'Administradores', value: admins, sub: 'com acesso total', icon: '' },
                { label: 'Aguardando 1º Acesso', value: pendentes, sub: 'convites pendentes', icon: '' },
            ]

            row.innerHTML = kpis.map((k, i) => `
        <div class="cfg-kpi-card">
          <div class="cfg-kpi-card__header">
            <span class="cfg-kpi-card__label">${Utils.escapeHtml(k.label)}</span>
            <div class="cfg-kpi-card__icon ${i === 0 ? 'cfg-kpi-card__icon--primary' : ''}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
          <div class="cfg-kpi-card__value">${k.value}</div>
          <div class="cfg-kpi-card__sub">${Utils.escapeHtml(k.sub)}</div>
        </div>
      `).join('')
        },

        getFilteredUsers() {
            const q = State.userSearch.toLowerCase()
            const lf = State.userLevelFilter
            return State.usuarios.filter(u => {
                const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
                const matchLevel = !lf || u.level === lf
                return matchSearch && matchLevel
            })
        },

        renderUsersTable() {
            const tbody = document.getElementById('usersTableBody')
            const footer = document.getElementById('usersTableFooter')
            if (!tbody) return

            const list = this.getFilteredUsers()

            if (list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:var(--space-8);color:var(--color-text-subtle);">Nenhum usuário encontrado.</td></tr>`
            } else {
                tbody.innerHTML = list.map(u => `
          <tr>
            <td>
              <div class="table-name-cell">
                <div class="table-avatar" style="background:${u.level === 'admin' ? 'var(--gradient-brand)' : 'linear-gradient(135deg,#56C596,#2D9E6C)'}">
                  ${Utils.initials(u.name)}
                </div>
                <div class="table-name-cell__text">
                  <span class="table-name-cell__name">${Utils.escapeHtml(u.name)}</span>
                </div>
              </div>
            </td>
            <td style="font-size:var(--fs-xs);color:var(--color-text-muted);">${Utils.escapeHtml(u.email)}</td>
            <td>${Utils.escapeHtml(u.role)}</td>
            <td>${Utils.levelBadge(u.level)}</td>
            <td style="font-size:var(--fs-xs);color:var(--color-text-subtle);">${Utils.formatDateTime(u.lastAccess)}</td>
            <td>${Utils.statusBadge(u.status)}</td>
            <td class="data-table__action">
              <div class="table-actions">
                <button type="button" class="icon-btn icon-btn--edit" data-user-id="${Utils.escapeHtml(u.id)}" title="Editar usuário" aria-label="Editar ${Utils.escapeHtml(u.name)}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                </button>
                <button type="button" class="icon-btn icon-btn--delete" data-user-id="${Utils.escapeHtml(u.id)}" title="Remover usuário" aria-label="Remover ${Utils.escapeHtml(u.name)}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                </button>
              </div>
            </td>
          </tr>
        `).join('')
            }

            if (footer) footer.textContent = `${list.length} usuário${list.length !== 1 ? 's' : ''} encontrado${list.length !== 1 ? 's' : ''}`

            tbody.querySelectorAll('.icon-btn--edit[data-user-id]').forEach(btn => {
                btn.addEventListener('click', () => ModalUsuario.open('edit', btn.dataset.userId))
            })
            tbody.querySelectorAll('.icon-btn--delete[data-user-id]').forEach(btn => {
                btn.addEventListener('click', () => this.confirmDeleteUser(btn.dataset.userId))
            })
        },

        renderPermissionMatrix() {
            const body = document.getElementById('permissionMatrixBody')
            if (!body) return

            const iconYes = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            const iconNo = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`
            const iconPartial = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`

            body.innerHTML = PERMISSION_MATRIX.map(row => `
        <div class="permission-row">
          <span class="permission-row__feature">${Utils.escapeHtml(row.feature)}</span>
          <div class="permission-row__cell" data-role="Administrador">
            <div class="perm-check perm-check--yes">${iconYes}</div>
          </div>
          <div class="permission-row__cell" data-role="Recepcionista">
            <div class="perm-check ${row.recepcao === 'yes' ? 'perm-check--yes' : row.recepcao === 'partial' ? 'perm-check--partial' : 'perm-check--no'}">
              ${row.recepcao === 'yes' ? iconYes : row.recepcao === 'partial' ? iconPartial : iconNo}
            </div>
          </div>
          <div class="permission-row__cell" data-role="Visualizador">
            <div class="perm-check ${row.viewer === 'yes' ? 'perm-check--yes' : row.viewer === 'partial' ? 'perm-check--partial' : 'perm-check--no'}">
              ${row.viewer === 'yes' ? iconYes : row.viewer === 'partial' ? iconPartial : iconNo}
            </div>
          </div>
        </div>
      `).join('')
        },

        /** [API] DELETE /usuarios/:id */
        async confirmDeleteUser(id) {
            const u = State.usuarios.find(u => u.id === id)
            if (!u) return

            if (u.level === 'admin' && State.usuarios.filter(u => u.level === 'admin').length === 1) {
                Toast.show('Não é possível remover o único administrador.', 'error')
                return
            }

            const confirmed = await new Promise(resolve => {
                const toast = document.getElementById('cfgToast')
                const icon = document.getElementById('cfgToastIcon')
                const msgEl = document.getElementById('cfgToastMsg')
                if (!toast || !icon || !msgEl) { resolve(window.confirm(`Remover "${u.name}"?`)); return }

                icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
                msgEl.innerHTML = `<span>Remover <strong>${Utils.escapeHtml(u.name)}</strong>?</span>
            <span style="display:flex;gap:8px;margin-left:auto;">
                <button id="_toastNo"  style="padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:inherit;cursor:pointer;font-size:12px;">Cancelar</button>
                <button id="_toastYes" style="padding:4px 12px;border-radius:6px;border:none;background:rgba(194,59,50,0.85);color:#fff;cursor:pointer;font-size:12px;font-weight:600;">Remover</button>
            </span>`
                toast.className = 'cfg-toast cfg-toast--warning'
                toast.hidden = false

                const cleanup = (val) => { toast.hidden = true; msgEl.innerHTML = ''; resolve(val) }
                document.getElementById('_toastYes')?.addEventListener('click', () => cleanup(true))
                document.getElementById('_toastNo')?.addEventListener('click', () => cleanup(false))
            })

            if (!confirmed) return
            State.usuarios = State.usuarios.filter(u => u.id !== id)
            // [API] await api.delete(`/usuarios/${id}`)
            this.renderKPIs()
            this.renderUsersTable()
            Toast.show('Usuário removido.')
        },

        bindSearch() {
            const search = document.getElementById('userSearch')
            const filter = document.getElementById('userLevelFilter')

            search?.addEventListener('input', () => {
                State.userSearch = search.value
                this.renderUsersTable()
            })
            filter?.addEventListener('change', () => {
                State.userLevelFilter = filter.value
                this.renderUsersTable()
            })
        },

        bindNewButton() {
            document.getElementById('btnNewUser')?.addEventListener('click', () => ModalUsuario.open('create'))
        },
    }

    /* ===========================================================
       9. MÓDULO: ABA PARÂMETROS DO SISTEMA
    =========================================================== */
    const ParametrosModule = {
        data: null,

        init() {
            // [API] GET /parametros
            this.data = JSON.parse(JSON.stringify(MOCK_PARAMETROS))
            this.renderExamDurations()
            this.renderWAMessages()
            this.bindSave()
            this.bindDiscard()
        },

        renderExamDurations() {
            const grid = document.getElementById('examDurationGrid')
            if (!grid) return

            grid.innerHTML = this.data.examDurations.map(e => `
        <div class="exam-duration-item">
          <span class="exam-duration-item__label">${Utils.escapeHtml(e.label)}</span>
          <div class="exam-duration-item__input-wrap">
            <input
                type="number"
                class="exam-duration-item__input"
                data-exam-id="${Utils.escapeHtml(e.id)}"
                value="${e.duration}"
                min="5"
                max="180"
                step="5"
                aria-label="Duração de ${Utils.escapeHtml(e.label)} em minutos"
            >
            <span class="exam-duration-item__unit">min</span>
          </div>
        </div>
      `).join('')
        },

        renderWAMessages() {
            const list = document.getElementById('waMessagesList')
            if (!list) return

            list.innerHTML = this.data.whatsappMessages.map(msg => `
        <div class="wa-message-item" data-msg-id="${Utils.escapeHtml(msg.id)}">
          <div class="wa-message-item__header">
            <div class="wa-message-item__event">
              <span class="wa-message-item__event-dot"></span>
              ${Utils.escapeHtml(msg.event)}
            </div>
            <div class="wa-message-item__active">
              <label class="cfg-toggle" aria-label="Ativar mensagem ${Utils.escapeHtml(msg.event)}">
                <input type="checkbox" class="wa-msg-toggle" data-msg-id="${Utils.escapeHtml(msg.id)}" ${msg.active ? 'checked' : ''}>
                <span class="cfg-toggle__track"></span>
              </label>
              <span>${msg.active ? 'Ativa' : 'Inativa'}</span>
            </div>
          </div>
          <textarea
            class="wa-message-item__textarea"
            data-msg-id="${Utils.escapeHtml(msg.id)}"
            rows="3"
            aria-label="Texto da mensagem ${Utils.escapeHtml(msg.event)}"
          >${Utils.escapeHtml(msg.text)}</textarea>
          <span class="wa-message-item__char-count">${msg.text.length} caracteres</span>
        </div>
      `).join('')

            // Char count ao digitar
            list.querySelectorAll('.wa-message-item__textarea').forEach(ta => {
                ta.addEventListener('input', () => {
                    const charCount = ta.closest('.wa-message-item').querySelector('.wa-message-item__char-count')
                    if (charCount) charCount.textContent = `${ta.value.length} caracteres`
                })
            })

            // Toggle ativo/inativo
            list.querySelectorAll('.wa-msg-toggle').forEach(toggle => {
                toggle.addEventListener('change', () => {
                    const label = toggle.closest('.wa-message-item__active').querySelector('span')
                    if (label) label.textContent = toggle.checked ? 'Ativa' : 'Inativa'
                })
            })
        },

        collectData() {
            const durations = {}
            document.querySelectorAll('.exam-duration-item__input[data-exam-id]').forEach(inp => {
                durations[inp.dataset.examId] = parseInt(inp.value, 10) || 0
            })

            const messages = []
            document.querySelectorAll('.wa-message-item[data-msg-id]').forEach(item => {
                messages.push({
                    id: item.dataset.msgId,
                    active: item.querySelector('.wa-msg-toggle')?.checked ?? false,
                    text: item.querySelector('.wa-message-item__textarea')?.value?.trim() ?? '',
                })
            })

            const scheduling = {
                antecedenciaMin: parseInt(document.getElementById('paramAntecedencia')?.value, 10),
                prazoCancelamento: parseInt(document.getElementById('paramCancelamento')?.value, 10),
                enviarConfirmacao: parseInt(document.getElementById('paramConfirmacao')?.value, 10),
                intervaloMin: parseInt(document.getElementById('paramIntervalo')?.value, 10),
                maxDia: parseInt(document.getElementById('paramMaxDia')?.value, 10),
                exigirConfirmacaoLink: document.getElementById('toggleConfirmLink')?.checked,
                permitirReagendamento: document.getElementById('toggleSelfReschedule')?.checked,
                bloquearAutomatico: document.getElementById('toggleAutoBlock')?.checked,
            }

            const financial = {
                comissaoPadrao: parseFloat(document.getElementById('paramComissao')?.value),
                impostos: parseFloat(document.getElementById('paramImpostos')?.value),
                vencimentoComissoes: parseInt(document.getElementById('paramVencimento')?.value, 10),
            }

            return { durations, messages, scheduling, financial }
        },

        /** [API] POST /parametros */
        bindSave() {
            document.getElementById('btnParamSave')?.addEventListener('click', () => {
                const payload = this.collectData()
                console.log('[API] POST /parametros', payload)
                // [API] await api.post('/parametros', payload)
                Toast.show('Parâmetros salvos com sucesso.')
            })
        },

        bindDiscard() {
            document.getElementById('btnParamDiscard')?.addEventListener('click', () => {
                this.data = JSON.parse(JSON.stringify(MOCK_PARAMETROS))
                this.renderExamDurations()
                this.renderWAMessages()
                // [API] Recarregar do backend
                Toast.show('Alterações descartadas.', 'warning')
            })
        },
    }

    /* ===========================================================
       10. MÓDULOS DE MODAIS
    =========================================================== */

    /* ---- Helper genérico de modal ---- */
    function openModal(backdropId) {
        const backdrop = document.getElementById(backdropId)
        if (!backdrop) return
        backdrop.hidden = false
        backdrop.removeAttribute('aria-hidden')
        document.body.style.overflow = 'hidden'
        // Foco no primeiro input
        setTimeout(() => {
            const firstInput = backdrop.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="color"]), select')
            if (firstInput) firstInput.focus()
        }, 50)
    }

    function closeModal(backdropId) {
        const backdrop = document.getElementById(backdropId)
        if (!backdrop) return
        backdrop.hidden = true
        backdrop.setAttribute('aria-hidden', 'true')
        document.body.style.overflow = ''
    }

    function bindModalClose(backdropId, closeId, cancelId) {
        const backdrop = document.getElementById(backdropId)
        const closeBtn = document.getElementById(closeId)
        const cancelBtn = document.getElementById(cancelId)

        const close = () => closeModal(backdropId)

        closeBtn?.addEventListener('click', close)
        cancelBtn?.addEventListener('click', close)
        backdrop?.addEventListener('click', e => { if (e.target === backdrop) close() })
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !backdrop?.hidden) close()
        })
    }

    /* ---- MODAL: RADIOLOGIA ---- */
    const ModalRadiologia = {
        init() {
            bindModalClose('modalRadiologyBackdrop', 'modalRadiologyClose', 'modalRadiologyCancel')
            document.getElementById('modalRadiologyConfirm')?.addEventListener('click', () => this.save())

            // Color picker label
            const picker = document.getElementById('radColor')
            const label = document.getElementById('radColorLabel')
            picker?.addEventListener('input', () => { if (label) label.textContent = picker.value })
        },

        open(mode, id = null) {
            const titleEl = document.getElementById('modalRadiologyTitle')
            const subtitleEl = document.getElementById('modalRadiologySubtitle')
            const avatarEl = document.getElementById('modalRadiologyAvatar')
            const confirmBtn = document.getElementById('modalRadiologyConfirm')

            State.modal = { type: 'radiologia', mode, editId: id }

            if (mode === 'create') {
                titleEl.textContent = 'Nova Radiologia'
                subtitleEl.textContent = 'Preencha os dados da nova unidade'
                if (confirmBtn) confirmBtn.querySelector('svg + *') || confirmBtn.lastChild // trocar texto
                this.clearForm()
                avatarEl.textContent = 'R'
                avatarEl.style.background = ''
            } else {
                const rad = State.radiologias.find(r => r.id === id)
                if (!rad) return
                titleEl.textContent = `Editar — ${rad.name}`
                subtitleEl.textContent = 'Atualize os dados da unidade'
                this.fillForm(rad)
                avatarEl.textContent = rad.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
                avatarEl.style.background = rad.color
            }

            openModal('modalRadiologyBackdrop')
        },

        clearForm() {
            const fields = ['modalRadiologyId', 'radName', 'radPhone', 'radEmail', 'radAddress', 'radTechnician', 'radCRO']
            fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
            const openTime = document.getElementById('radOpenTime'); if (openTime) openTime.value = '08:00'
            const closeTime = document.getElementById('radCloseTime'); if (closeTime) closeTime.value = '18:00'
            const status = document.getElementById('radStatus'); if (status) status.value = 'ativo'
            const color = document.getElementById('radColor'); if (color) color.value = '#018093'
            const colorLbl = document.getElementById('radColorLabel'); if (colorLbl) colorLbl.textContent = '#018093'
        },

        fillForm(rad) {
            document.getElementById('modalRadiologyId').value = rad.id
            document.getElementById('radName').value = rad.name || ''
            document.getElementById('radPhone').value = rad.phone || ''
            document.getElementById('radEmail').value = rad.email || ''
            document.getElementById('radAddress').value = rad.address || ''
            document.getElementById('radOpenTime').value = rad.openTime || '08:00'
            document.getElementById('radCloseTime').value = rad.closeTime || '18:00'
            document.getElementById('radTechnician').value = rad.technician || ''
            document.getElementById('radCRO').value = rad.cro || ''
            document.getElementById('radStatus').value = rad.status || 'ativo'
            document.getElementById('radColor').value = rad.color || '#018093'
            const colorLbl = document.getElementById('radColorLabel')
            if (colorLbl) colorLbl.textContent = rad.color || '#018093'
        },

        /** [API] POST /radiologias | PUT /radiologias/:id */
        save() {
            const name = document.getElementById('radName')?.value?.trim()
            if (!name) { Toast.show('Informe o nome da unidade.', 'error'); return }

            const payload = {
                id: document.getElementById('modalRadiologyId')?.value || null,
                name,
                phone: document.getElementById('radPhone')?.value?.trim() || '',
                email: document.getElementById('radEmail')?.value?.trim() || '',
                address: document.getElementById('radAddress')?.value?.trim() || '',
                openTime: document.getElementById('radOpenTime')?.value || '08:00',
                closeTime: document.getElementById('radCloseTime')?.value || '18:00',
                technician: document.getElementById('radTechnician')?.value?.trim() || '',
                cro: document.getElementById('radCRO')?.value?.trim() || '',
                status: document.getElementById('radStatus')?.value || 'ativo',
                color: document.getElementById('radColor')?.value || '#018093',
            }

            if (State.modal.mode === 'create') {
                payload.id = Utils.uid('rad')
                State.radiologias.push(payload)
                // [API] await api.post('/radiologias', payload)
                Toast.show('Radiologia cadastrada com sucesso.')
            } else {
                const idx = State.radiologias.findIndex(r => r.id === payload.id)
                if (idx !== -1) State.radiologias[idx] = payload
                // [API] await api.put(`/radiologias/${payload.id}`, payload)
                Toast.show('Radiologia atualizada com sucesso.')
            }

            closeModal('modalRadiologyBackdrop')
            RadiologiasModule.renderCards()
        },
    }

    /* ---- MODAL: CLÍNICA ---- */
    const ModalClinica = {
        init() {
            bindModalClose('modalClinicBackdrop', 'modalClinicClose', 'modalClinicCancel')
            document.getElementById('modalClinicConfirm')?.addEventListener('click', () => this.save())
        },

        open(mode, id = null) {
            const titleEl = document.getElementById('modalClinicTitle')
            const subtitleEl = document.getElementById('modalClinicSubtitle')
            State.modal = { type: 'clinica', mode, editId: id }

            if (mode === 'create') {
                titleEl.textContent = 'Nova Clínica'
                subtitleEl.textContent = 'Preencha os dados da clínica referenciadora'
                this.clearForm()
            } else {
                const c = State.clinicas.find(c => c.id === id)
                if (!c) return
                titleEl.textContent = `Editar — ${c.name}`
                subtitleEl.textContent = 'Atualize os dados da clínica'
                this.fillForm(c)
            }

            this.renderLinkedDoctors(id)
            openModal('modalClinicBackdrop')
        },

        clearForm() {
            ;['modalClinicId', 'clinicName', 'clinicCity', 'clinicPhone', 'clinicEmail', 'clinicAddress'].forEach(id => {
                const el = document.getElementById(id); if (el) el.value = ''
            })
            const state = document.getElementById('clinicState'); if (state) state.value = 'RN'
            const status = document.getElementById('clinicStatus'); if (status) status.value = 'ativo'
        },

        fillForm(c) {
            document.getElementById('modalClinicId').value = c.id
            document.getElementById('clinicName').value = c.name || ''
            document.getElementById('clinicCity').value = c.city || ''
            document.getElementById('clinicState').value = c.state || 'RN'
            document.getElementById('clinicPhone').value = c.phone || ''
            document.getElementById('clinicEmail').value = c.email || ''
            document.getElementById('clinicAddress').value = c.address || ''
            document.getElementById('clinicStatus').value = c.status || 'ativo'
        },

        renderLinkedDoctors(clinicId) {
            const container = document.getElementById('modalClinicDoctorsList')
            if (!container) return

            const doctors = clinicId ? State.medicos.filter(m => m.clinicId === clinicId) : []

            if (doctors.length === 0) {
                container.innerHTML = `<div class="clinic-doctors-empty">Nenhum médico vinculado a esta clínica.</div>`
                return
            }

            container.innerHTML = doctors.map(m => `
        <div class="clinic-doctor-row">
          <div class="clinic-doctor-row__info">
            <div class="table-avatar" style="width:28px;height:28px;font-size:var(--fs-xs);">${Utils.initials(m.name)}</div>
            <div>
              <div class="clinic-doctor-row__name">${Utils.escapeHtml(m.name)}</div>
              <div class="clinic-doctor-row__specialty">${Utils.escapeHtml(Utils.specialtyLabel(m.specialty))}</div>
            </div>
          </div>
          ${Utils.statusBadge(m.status)}
        </div>
      `).join('')
        },

        /** [API] POST /clinicas | PUT /clinicas/:id */
        save() {
            const name = document.getElementById('clinicName')?.value?.trim()
            if (!name) { Toast.show('Informe o nome da clínica.', 'error'); return }

            const payload = {
                id: document.getElementById('modalClinicId')?.value || null,
                name,
                city: document.getElementById('clinicCity')?.value?.trim() || '',
                state: document.getElementById('clinicState')?.value || 'RN',
                phone: document.getElementById('clinicPhone')?.value?.trim() || '',
                email: document.getElementById('clinicEmail')?.value?.trim() || '',
                address: document.getElementById('clinicAddress')?.value?.trim() || '',
                status: document.getElementById('clinicStatus')?.value || 'ativo',
            }

            if (State.modal.mode === 'create') {
                payload.id = Utils.uid('cli')
                State.clinicas.push(payload)
                // [API] await api.post('/clinicas', payload)
                Toast.show('Clínica cadastrada com sucesso.')
            } else {
                const idx = State.clinicas.findIndex(c => c.id === payload.id)
                if (idx !== -1) State.clinicas[idx] = payload
                // [API] await api.put(`/clinicas/${payload.id}`, payload)
                Toast.show('Clínica atualizada com sucesso.')
            }

            closeModal('modalClinicBackdrop')
            ClinicasMedicosModule.renderClinicsTable()
            ClinicasMedicosModule.renderDoctorsTable()
        },
    }

    /* ---- MODAL: MÉDICO ---- */
    const ModalMedico = {
        init() {
            bindModalClose('modalDoctorBackdrop', 'modalDoctorClose', 'modalDoctorCancel')
            document.getElementById('modalDoctorConfirm')?.addEventListener('click', () => this.save())
        },

        populateClinicSelect(selectedId = '') {
            const select = document.getElementById('doctorClinic')
            if (!select) return
            select.innerHTML = `<option value="">Selecione a clínica...</option>` +
                State.clinicas.map(c =>
                    `<option value="${Utils.escapeHtml(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`
                ).join('')
        },

        open(mode, id = null) {
            const titleEl = document.getElementById('modalDoctorTitle')
            const subtitleEl = document.getElementById('modalDoctorSubtitle')
            const avatarEl = document.getElementById('modalDoctorAvatar')
            State.modal = { type: 'medico', mode, editId: id }

            if (mode === 'create') {
                titleEl.textContent = 'Novo Médico'
                subtitleEl.textContent = 'Preencha os dados do médico referenciador'
                avatarEl.textContent = 'DM'
                this.clearForm()
                this.populateClinicSelect()
            } else {
                const m = State.medicos.find(m => m.id === id)
                if (!m) return
                titleEl.textContent = `Editar — ${m.name}`
                subtitleEl.textContent = 'Atualize os dados do médico'
                avatarEl.textContent = Utils.initials(m.name)
                this.fillForm(m)
                this.populateClinicSelect(m.clinicId)
            }

            openModal('modalDoctorBackdrop')
        },

        clearForm() {
            ;['modalDoctorId', 'doctorName', 'doctorCRO', 'doctorPhone', 'doctorEmail'].forEach(id => {
                const el = document.getElementById(id); if (el) el.value = ''
            })
            const spec = document.getElementById('doctorSpecialty'); if (spec) spec.value = ''
            const status = document.getElementById('doctorStatus'); if (status) status.value = 'ativo'
            const comissao = document.getElementById('doctorComissao'); if (comissao) comissao.value = '30'
        },

        fillForm(m) {
            document.getElementById('modalDoctorId').value = m.id
            document.getElementById('doctorName').value = m.name || ''
            document.getElementById('doctorSpecialty').value = m.specialty || ''
            document.getElementById('doctorCRO').value = m.cro || ''
            document.getElementById('doctorPhone').value = m.phone || ''
            document.getElementById('doctorEmail').value = m.email || ''
            document.getElementById('doctorComissao').value = m.comissao ?? 30
            document.getElementById('doctorStatus').value = m.status || 'ativo'
        },

        /** [API] POST /medicos | PUT /medicos/:id */
        save() {
            const name = document.getElementById('doctorName')?.value?.trim()
            if (!name) { Toast.show('Informe o nome do médico.', 'error'); return }

            const payload = {
                id: document.getElementById('modalDoctorId')?.value || null,
                name,
                specialty: document.getElementById('doctorSpecialty')?.value || '',
                cro: document.getElementById('doctorCRO')?.value?.trim() || '',
                phone: document.getElementById('doctorPhone')?.value?.trim() || '',
                email: document.getElementById('doctorEmail')?.value?.trim() || '',
                clinicId: document.getElementById('doctorClinic')?.value || '',
                comissao: parseFloat(document.getElementById('doctorComissao')?.value) || 30,
                status: document.getElementById('doctorStatus')?.value || 'ativo',
            }

            if (State.modal.mode === 'create') {
                payload.id = Utils.uid('med')
                State.medicos.push(payload)
                // [API] await api.post('/medicos', payload)
                Toast.show('Médico cadastrado com sucesso.')
            } else {
                const idx = State.medicos.findIndex(m => m.id === payload.id)
                if (idx !== -1) State.medicos[idx] = payload
                // [API] await api.put(`/medicos/${payload.id}`, payload)
                Toast.show('Médico atualizado com sucesso.')
            }

            closeModal('modalDoctorBackdrop')
            ClinicasMedicosModule.renderDoctorsTable()
            ClinicasMedicosModule.renderClinicsTable()
        },
    }

    /* ---- MODAL: USUÁRIO ---- */
    const ModalUsuario = {
        init() {
            bindModalClose('modalUserBackdrop', 'modalUserClose', 'modalUserCancel')
            document.getElementById('modalUserConfirm')?.addEventListener('click', () => this.save())
            document.getElementById('userLevel')?.addEventListener('change', () => this.updateConfirmLabel())
        },

        populateRadiologySelect(selectedId = 'todas') {
            const select = document.getElementById('userRadiology')
            if (!select) return
            select.innerHTML = `<option value="todas" ${selectedId === 'todas' ? 'selected' : ''}>Todas as Radiologias</option>` +
                State.radiologias.map(r =>
                    `<option value="${Utils.escapeHtml(r.id)}" ${r.id === selectedId ? 'selected' : ''}>${Utils.escapeHtml(r.name)}</option>`
                ).join('')
        },

        updateConfirmLabel() {
            const btn = document.getElementById('modalUserConfirm')
            const label = btn?.querySelector('svg')?.nextSibling
            if (!label) return
            const isCreate = State.modal.mode === 'create'
            btn.childNodes[btn.childNodes.length - 1].textContent = isCreate ? ' Criar Usuário' : ' Salvar Alterações'
        },

        open(mode, id = null) {
            const titleEl = document.getElementById('modalUserTitle')
            const subtitleEl = document.getElementById('modalUserSubtitle')
            const avatarEl = document.getElementById('modalUserAvatar')
            const hintBox = document.getElementById('modalUserPasswordHint')
            State.modal = { type: 'usuario', mode, editId: id }

            if (mode === 'create') {
                titleEl.textContent = 'Novo Usuário'
                subtitleEl.textContent = 'Defina acesso e permissões do usuário'
                avatarEl.textContent = 'US'
                if (hintBox) hintBox.hidden = false
                this.clearForm()
                this.populateRadiologySelect()
                const confirmBtn = document.getElementById('modalUserConfirm')
                if (confirmBtn) {

                    const textNode = Array.from(confirmBtn.childNodes).find(n => n.nodeType === Node.TEXT_NODE)
                    if (textNode) textNode.textContent = ' Criar Usuário'
                    else confirmBtn.appendChild(document.createTextNode(' Criar Usuário'))
                }
            } else {
                const u = State.usuarios.find(u => u.id === id)
                if (!u) return
                titleEl.textContent = `Editar — ${u.name}`
                subtitleEl.textContent = 'Atualize os dados de acesso do usuário'
                avatarEl.textContent = Utils.initials(u.name)
                if (hintBox) hintBox.hidden = true
                this.fillForm(u)
                this.populateRadiologySelect(u.radiologia)
                const confirmBtn = document.getElementById('modalUserConfirm')
                if (confirmBtn) {
                    const textNode = Array.from(confirmBtn.childNodes).find(n => n.nodeType === Node.TEXT_NODE)
                    if (textNode) textNode.textContent = ' Salvar Alterações'
                    else confirmBtn.appendChild(document.createTextNode(' Salvar Alterações'))
                }
            }

            openModal('modalUserBackdrop')
        },

        clearForm() {
            ;['modalUserId', 'userName', 'userEmail', 'userPhone', 'userRole'].forEach(id => {
                const el = document.getElementById(id); if (el) el.value = ''
            })
            const level = document.getElementById('userLevel'); if (level) level.value = 'recepcao'
            const status = document.getElementById('userStatus'); if (status) status.value = 'ativo'
        },

        fillForm(u) {
            document.getElementById('modalUserId').value = u.id
            document.getElementById('userName').value = u.name || ''
            document.getElementById('userEmail').value = u.email || ''
            document.getElementById('userPhone').value = u.phone || ''
            document.getElementById('userRole').value = u.role || ''
            document.getElementById('userLevel').value = u.level || 'recepcao'
            document.getElementById('userStatus').value = u.status || 'ativo'
        },

        /** [API] POST /usuarios | PUT /usuarios/:id */
        save() {
            const name = document.getElementById('userName')?.value?.trim()
            const email = document.getElementById('userEmail')?.value?.trim()
            if (!name) { Toast.show('Informe o nome do usuário.', 'error'); return }
            if (!email) { Toast.show('Informe o e-mail do usuário.', 'error'); return }

            const payload = {
                id: document.getElementById('modalUserId')?.value || null,
                name,
                email,
                phone: document.getElementById('userPhone')?.value?.trim() || '',
                role: document.getElementById('userRole')?.value?.trim() || '',
                level: document.getElementById('userLevel')?.value || 'recepcao',
                radiologia: document.getElementById('userRadiology')?.value || 'todas',
                status: document.getElementById('userStatus')?.value || 'ativo',
                lastAccess: null,
            }

            if (State.modal.mode === 'create') {
                payload.id = Utils.uid('usr')
                State.usuarios.push(payload)
                // [API] await api.post('/usuarios', payload)
                Toast.show('Usuário criado. Um e-mail de boas-vindas foi enviado.')
            } else {
                const idx = State.usuarios.findIndex(u => u.id === payload.id)
                if (idx !== -1) {
                    payload.lastAccess = State.usuarios[idx].lastAccess
                    State.usuarios[idx] = payload
                }
                // [API] await api.put(`/usuarios/${payload.id}`, payload)
                Toast.show('Usuário atualizado com sucesso.')
            }

            closeModal('modalUserBackdrop')
            UsuariosModule.renderKPIs()
            UsuariosModule.renderUsersTable()
        },
    }

    /* ===========================================================
       11. INICIALIZAÇÃO
    =========================================================== */
    function init() {
        // Navegação por pills
        TabNav.init()

        // Módulos de cada aba
        GeralModule.init()
        RadiologiasModule.init()
        ClinicasMedicosModule.init()
        UsuariosModule.init()
        ParametrosModule.init()

        // Modais
        ModalRadiologia.init()
        ModalClinica.init()
        ModalMedico.init()
        ModalUsuario.init()

        // Scroll suave ao entrar na aba
        TabNav.switchTo('geral')

        console.log('[IORD] configuracoes.js inicializado')
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init)
    } else {
        init()
    }

})()