/**
 * confirmar.js — Página pública de confirmação de agendamento
 * Arquivo vai em: js/confirmar.js
 *
 * Fluxo:
 *  1. Lê o token da URL  (/confirmar.html?t=TOKEN)
 *  2. Etapa CPF: POST /v1/agendamentos/confirmar/validar-cpf  { token, cpf }
 *     → retorna dados do agendamento se CPF bater
 *  3. Etapa Dados: exibe as informações ao paciente
 *  4. Botão "Confirmar presença": POST /v1/agendamentos/confirmar  { token }
 *     → backend atualiza status para 'confirmado'
 *  5. Etapa Sucesso
 */

;(function () {
    'use strict'

    /* --- Configuração --- */
    const API_BASE = '/v1'   // mesmo origin; ajuste se o backend estiver em domínio separado

    /* --- Helpers de DOM --- */
    const $ = id => document.getElementById(id)

    function showStep(id) {
        ['stepCpf', 'stepDados', 'stepSucesso', 'stepErro'].forEach(s => {
            const el = $(s)
            if (!el) return
            if (s === id) {
                el.classList.remove('cfm-card--hidden')
                el.style.animation = 'none'
                // força reflow para reanimar
                void el.offsetWidth
                el.style.animation = ''
            } else {
                el.classList.add('cfm-card--hidden')
            }
        })
    }

    function setLoading(btn, loading) {
        btn.disabled = loading
        if (loading) btn.classList.add('cfm-btn--loading')
        else btn.classList.remove('cfm-btn--loading')
    }

    function showFieldError(inputEl, errorEl, msg) {
        inputEl.classList.add('cfm-field__input--error')
        errorEl.textContent = msg
    }

    function clearFieldError(inputEl, errorEl) {
        inputEl.classList.remove('cfm-field__input--error')
        errorEl.textContent = ''
    }

    /* --- CPF: máscara e validação local --- */
    function maskCpf(value) {
        return value
            .replace(/\D/g, '')
            .slice(0, 11)
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
    }

    function isValidCpf(cpf) {
        cpf = cpf.replace(/\D/g, '')
        if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
        let sum = 0
        for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i)
        let r = (sum * 10) % 11
        if (r === 10 || r === 11) r = 0
        if (r !== parseInt(cpf[9])) return false
        sum = 0
        for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i)
        r = (sum * 10) % 11
        if (r === 10 || r === 11) r = 0
        return r === parseInt(cpf[10])
    }

    /* --- Formatação de data --- */
    function fmtData(iso) {
        if (!iso) return '—'
        const [y, m, d] = iso.split('-')
        return `${d}/${m}/${y}`
    }

    function fmtDataLonga(iso) {
        if (!iso) return '—'
        const [y, m, d] = iso.split('-')
        const date = new Date(+y, +m - 1, +d)
        return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    }

    /* --- Token da URL --- */
    function getToken() {
        const params = new URLSearchParams(window.location.search)
        return params.get('t') || ''
    }

    /* --- Chamadas de API --- */
    async function apiPost(path, body) {
        const res = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) {
            const msg = json?.message || json?.error || 'Erro ao processar solicitação.'
            throw Object.assign(new Error(msg), { status: res.status, body: json })
        }
        // O wrapper do backend pode retornar { success, data, message } ou direto
        return json?.data !== undefined ? json.data : json
    }

    /* --- Renderiza a lista de dados do agendamento --- */
    function renderInfo(ag) {
        const list = $('infoList')
        if (!list) return

        const rows = [
            {
                icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/>
                </svg>`,
                label: 'Paciente',
                value: ag.paciente || '—',
                sub: ag.pacienteNascimento ? `Nascimento: ${fmtData(ag.pacienteNascimento)}` : null,
            },
            {
                icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
                        stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`,
                label: 'Data',
                value: fmtDataLonga(ag.data),
                sub: null,
            },
            {
                icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
                    <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>`,
                label: 'Horário',
                value: ag.horarioInicio
                    ? (ag.horarioFim ? `${ag.horarioInicio} – ${ag.horarioFim}` : ag.horarioInicio)
                    : '—',
                sub: ag.duracaoMin ? `Duração aproximada: ${ag.duracaoMin} min` : null,
            },
            {
                icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M9 12h6M9 16h4M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2"
                        stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M9 4h6v4H9V4z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`,
                label: 'Exame',
                value: ag.tipoExame || '—',
                sub: null,
            },
            {
                icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                        stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M9 22V12h6v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`,
                label: 'Unidade',
                value: ag.radiologiaNome || '—',
                sub: ag.clinica ? `Clínica: ${ag.clinica}` : null,
            },
        ]

        list.innerHTML = rows.map(r => `
            <div class="cfm-info-row">
                <div class="cfm-info-row__icon" aria-hidden="true">${r.icon}</div>
                <div class="cfm-info-row__body">
                    <span class="cfm-info-row__label">${r.label}</span>
                    <span class="cfm-info-row__value">${r.value}</span>
                    ${r.sub ? `<span class="cfm-info-row__sub">${r.sub}</span>` : ''}
                </div>
            </div>
        `).join('')
    }

    /* --- Estado compartilhado entre etapas --- */
    let _agendamentoData = null

    /* --- Init --- */
    function init() {
        const token = getToken()
        if (!token) {
            showStep('stepErro')
            const msgEl = $('msgErro')
            if (msgEl) msgEl.textContent = 'Link inválido. Solicite um novo link à clínica.'
            return
        }

        setupCpfStep(token)
        setupDadosStep(token)
    }

    /* --- Etapa 1: CPF --- */
    function setupCpfStep(token) {
        const input  = $('inputCpf')
        const error  = $('errorCpf')
        const btnVal = $('btnValidarCpf')
        if (!input || !btnVal) return

        // Máscara em tempo real
        input.addEventListener('input', () => {
            input.value = maskCpf(input.value)
            clearFieldError(input, error)
        })

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') btnVal.click()
        })

        btnVal.addEventListener('click', async () => {
            const cpfRaw = input.value.replace(/\D/g, '')

            if (!isValidCpf(cpfRaw)) {
                showFieldError(input, error, 'CPF inválido. Verifique e tente novamente.')
                input.focus()
                return
            }

            setLoading(btnVal, true)
            try {
                const data = await apiPost('/agendamentos/confirmar/validar-cpf', { token, cpf: cpfRaw })
                _agendamentoData = data
                renderInfo(data)
                showStep('stepDados')
            } catch (err) {
                const status = err?.status
                if (status === 400 || status === 404) {
                    showFieldError(input, error, err.message || 'CPF não confere com o agendamento.')
                } else if (status === 410) {
                    // token expirado ou agendamento já confirmado — erro terminal
                    showStep('stepErro')
                    const msgEl = $('msgErro')
                    if (msgEl) msgEl.textContent = err.message || 'Este link expirou ou já foi utilizado.'
                } else {
                    showFieldError(input, error, 'Erro ao validar. Tente novamente.')
                }
            } finally {
                setLoading(btnVal, false)
            }
        })
    }

    /* --- Etapa 2: Dados + Confirmar --- */
    function setupDadosStep(token) {
        const btnConfirmar = $('btnConfirmar')
        const btnVoltar    = $('btnVoltarCpf')
        if (!btnConfirmar || !btnVoltar) return

        btnVoltar.addEventListener('click', () => showStep('stepCpf'))

        btnConfirmar.addEventListener('click', async () => {
            setLoading(btnConfirmar, true)
            try {
                await apiPost('/agendamentos/confirmar', { token })

                // Preenche pill de sucesso com data/hora
                const pill = $('successPill')
                if (pill && _agendamentoData) {
                    const d = _agendamentoData
                    const dataFmt = fmtDataLonga(d.data)
                    const hora = d.horarioInicio || ''
                    pill.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
                                stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        ${dataFmt}${hora ? ` às ${hora}` : ''}
                    `
                }

                showStep('stepSucesso')
            } catch (err) {
                // Se já confirmado, tratar como sucesso
                if (err?.status === 200 || (err?.body?.status === 'confirmado')) {
                    showStep('stepSucesso')
                    return
                }
                // Erro terminal
                showStep('stepErro')
                const msgEl = $('msgErro')
                if (msgEl) msgEl.textContent = err.message || 'Não foi possível confirmar. Tente novamente ou entre em contato com a clínica.'
            } finally {
                setLoading(btnConfirmar, false)
            }
        })
    }

    /* --- Arranca --- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init)
    } else {
        init()
    }

})()