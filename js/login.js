/* =============================================================
   IORD — Tela de Login
   login.js
   -------------------------------------------------------------
   Módulos:
     1.  Configuração & Constantes
     2.  Estado Global (State)
     3.  Utilitários (helpers, validação)
     4.  Auth Guard (proteção de rotas)
     5.  Módulo: Toast de Feedback
     6.  Módulo: Formulário de Login
     7.  Módulo: Login com Google
     8.  Módulo: Esqueci Minha Senha (Modal)
     9.  Módulo: Toggle de Senha
    10.  Módulo: Lembrar-me
    11.  Inicialização
============================================================= */

; (function () {
    'use strict'

    /* ===========================================================
       1. CONFIGURAÇÃO & CONSTANTES
    =========================================================== */
    const CONFIG = {
        // [API] Trocar pela URL real do backend
        apiBase: 'https://unsanguineously-uninductive-kamdyn.ngrok-free.dev/v1',

        // Rota padrão após login
        defaultRedirect: 'dashboard.html',

        // Tempo de sessão (ms) — usado quando "Lembrar-me" NÃO está marcado
        sessionTimeout: 8 * 60 * 60 * 1000, // 8 horas

        // Tempo de sessão com "Lembrar-me" marcado
        rememberTimeout: 30 * 24 * 60 * 60 * 1000, // 30 dias

        // Chave usada no storage
        storageKey: 'iord_auth',

        // Storage a usar quando "Lembrar-me" está marcado (localStorage = persiste)
        // e quando não está (sessionStorage = dura só a aba)
        rememberStorage: localStorage,
        sessionStorage: sessionStorage,
    }

    /* ===========================================================
       2. ESTADO GLOBAL
    =========================================================== */
    const State = {
        isLoading: false,
        forgotEmailSent: false,
    }

    /* ===========================================================
       3. UTILITÁRIOS
    =========================================================== */
    const Utils = {
        /** Valida formato de e-mail */
        isValidEmail(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        },

        /** Valida força mínima de senha (≥6 chars) */
        isValidPassword(password) {
            return password.length >= 6
        },

        /** Sanitiza string para exibição segura */
        escapeHtml(str) {
            if (!str) return ''
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
        },

        /** Lê parâmetro da query string */
        getQueryParam(name) {
            return new URLSearchParams(window.location.search).get(name)
        },

        /** Retorna o storage ativo baseado em "Lembrar-me" */
        getStorage(remember) {
            return remember ? CONFIG.rememberStorage : CONFIG.sessionStorage
        },
    }

    /* ===========================================================
       4. AUTH GUARD (proteção de rotas)
       ----------------------------------------------------------
       Inclua este script em TODAS as páginas protegidas.
       Se não houver sessão válida, redireciona para login.
    =========================================================== */
    const Auth = {
        /**
         * Verifica se existe sessão válida em qualquer dos storages.
         * Retorna o objeto de sessão ou null.
         */
        getSession() {
            const storages = [localStorage, sessionStorage]
            for (const storage of storages) {
                try {
                    const raw = storage.getItem(CONFIG.storageKey)
                    if (!raw) continue
                    const session = JSON.parse(raw)
                    if (!session?.token || !session?.expiresAt) continue
                    if (Date.now() > session.expiresAt) {
                        storage.removeItem(CONFIG.storageKey)
                        continue
                    }
                    return session
                } catch {
                    // JSON inválido — ignora
                }
            }
            return null
        },

        /**
         * Salva sessão no storage adequado.
         * @param {object} sessionData — dados retornados pelo backend
         * @param {boolean} remember — "Lembrar-me" marcado?
         */
        saveSession(sessionData, remember) {
            const timeout = remember ? CONFIG.rememberTimeout : CONFIG.sessionTimeout
            const payload = {
                ...sessionData,
                expiresAt: Date.now() + timeout,
                remember,
            }
            Utils.getStorage(remember).setItem(CONFIG.storageKey, JSON.stringify(payload))
        },

        /** Remove sessão de todos os storages (logout) */
        clearSession() {
            localStorage.removeItem(CONFIG.storageKey)
            sessionStorage.removeItem(CONFIG.storageKey)
        },

        /**
         * Guard de rota — chame no início de cada página protegida:
         *   Auth.requireLogin()
         * Se não houver sessão, redireciona para login e para a execução.
         */
        requireLogin() {
            const session = this.getSession()
            if (!session) {
                const current = encodeURIComponent(window.location.pathname + window.location.search)
                window.location.replace(`login.html?redirect=${current}`)
                // Lança para interromper qualquer código que venha depois
                throw new Error('IORD: redirecionando para login (sem sessão válida).')
            }
            return session
        },

        /** Redireciona para a página correta após login bem-sucedido */
        redirectAfterLogin() {
            const redirectTo = Utils.getQueryParam('redirect')
            const target = redirectTo ? decodeURIComponent(redirectTo) : CONFIG.defaultRedirect
            window.location.replace(target)
        },

        /**
         * Logout — pode ser chamado de qualquer página:
         *   Auth.logout()
         */
        logout() {
            this.clearSession()
            window.location.replace('login.html')
        },
    }

    // Expõe Auth globalmente para que outras páginas possam usar
    window.IORDAuth = Auth

    /* ===========================================================
       5. MÓDULO: TOAST DE FEEDBACK
    =========================================================== */
    const Toast = {
        _timer: null,

        show(msg, type = 'success') {
            const toast = document.getElementById('loginToast')
            const icon = document.getElementById('loginToastIcon')
            const msgEl = document.getElementById('loginToastMsg')
            if (!toast || !icon || !msgEl) return

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
                setTimeout(() => {
                    toast.hidden = true
                    toast.classList.remove('cfg-toast--out')
                }, 280)
            }, 3500)
        },
    }

    /* ===========================================================
       6. MÓDULO: FORMULÁRIO DE LOGIN
    =========================================================== */
    const LoginForm = {
        elements: {},

        init() {
            this.elements = {
                form: document.getElementById('loginForm'),
                emailInput: document.getElementById('loginEmail'),
                passwordInput: document.getElementById('loginPassword'),
                rememberCheck: document.getElementById('loginRemember'),
                submitBtn: document.getElementById('btnLogin'),
                spinner: document.getElementById('loginSpinner'),
                btnText: document.querySelector('#btnLogin .btn-login__text'),
                alert: document.getElementById('loginAlert'),
                alertMsg: document.getElementById('loginAlertMsg'),
                emailError: document.getElementById('emailError'),
                passwordError: document.getElementById('passwordError'),
                fieldEmail: document.getElementById('fieldEmail'),
                fieldPassword: document.getElementById('fieldPassword'),
            }

            this.bindEvents()
            this.prefillEmailIfReturning()
        },

        bindEvents() {
            const { submitBtn, emailInput, passwordInput } = this.elements

            // Submissão ao clicar em "Entrar"
            submitBtn?.addEventListener('click', (e) => {
                e.preventDefault()
                this.submit()
            })

                // Submissão ao pressionar Enter em qualquer campo
                ;[emailInput, passwordInput].forEach(input => {
                    input?.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            this.submit()
                        }
                    })
                })

            // Limpa erro ao digitar
            emailInput?.addEventListener('input', () => this.clearFieldError('email'))
            passwordInput?.addEventListener('input', () => this.clearFieldError('password'))
        },

        /** Preenche e-mail se o usuário já fez login antes com "Lembrar-me" */
        prefillEmailIfReturning() {
            try {
                const saved = localStorage.getItem('iord_last_email')
                if (saved && this.elements.emailInput) {
                    this.elements.emailInput.value = saved
                    if (this.elements.rememberCheck) this.elements.rememberCheck.checked = true
                }
            } catch { /* ignore */ }
        },

        /** Valida os campos e retorna true se tudo estiver ok */
        validate() {
            const { emailInput, passwordInput } = this.elements
            let valid = true

            const email = emailInput?.value?.trim() ?? ''
            const password = passwordInput?.value ?? ''

            if (!email) {
                this.setFieldError('email', 'Informe seu e-mail.')
                valid = false
            } else if (!Utils.isValidEmail(email)) {
                this.setFieldError('email', 'E-mail inválido.')
                valid = false
            }

            if (!password) {
                this.setFieldError('password', 'Informe sua senha.')
                valid = false
            } else if (!Utils.isValidPassword(password)) {
                this.setFieldError('password', 'A senha deve ter pelo menos 6 caracteres.')
                valid = false
            }

            return valid
        },

        setFieldError(field, msg) {
            if (field === 'email') {
                if (this.elements.emailInput) this.elements.emailInput.setAttribute('aria-invalid', 'true')
                if (this.elements.emailError) this.elements.emailError.textContent = msg
            } else {
                if (this.elements.passwordInput) this.elements.passwordInput.setAttribute('aria-invalid', 'true')
                if (this.elements.passwordError) this.elements.passwordError.textContent = msg
            }
        },

        clearFieldError(field) {
            if (field === 'email') {
                if (this.elements.emailInput) this.elements.emailInput.setAttribute('aria-invalid', 'false')
                if (this.elements.emailError) this.elements.emailError.textContent = ''
            } else {
                if (this.elements.passwordInput) this.elements.passwordInput.setAttribute('aria-invalid', 'false')
                if (this.elements.passwordError) this.elements.passwordError.textContent = ''
            }
            // Também esconde o alerta geral
            if (this.elements.alert) this.elements.alert.hidden = true
        },

        setLoading(loading) {
            State.isLoading = loading
            const { submitBtn, spinner, btnText } = this.elements
            if (loading) {
                submitBtn?.classList.add('is-loading')
                submitBtn?.setAttribute('disabled', '')
                if (spinner) spinner.hidden = false
                if (btnText) btnText.textContent = 'Entrando…'
            } else {
                submitBtn?.classList.remove('is-loading')
                submitBtn?.removeAttribute('disabled')
                if (spinner) spinner.hidden = true
                if (btnText) btnText.textContent = 'Entrar'
            }
        },

        showGeneralError(msg) {
            const { alert, alertMsg } = this.elements
            if (alertMsg) alertMsg.textContent = msg || 'E-mail ou senha incorretos. Tente novamente.'
            if (alert) alert.hidden = false
        },

        async submit() {
            if (State.isLoading) return

            // Esconde alerta anterior
            if (this.elements.alert) this.elements.alert.hidden = true

            if (!this.validate()) return

            const email = this.elements.emailInput.value.trim()
            const password = this.elements.passwordInput.value
            const remember = this.elements.rememberCheck?.checked ?? false

            this.setLoading(true)

            try {
                const response = await fetch(`${CONFIG.apiBase}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                })
                const data = await response.json()
                if (!response.ok) throw new Error(data.message || 'Credenciais inválidas.')

                // Salva e-mail para prefill futuro
                if (remember) {
                    try { localStorage.setItem('iord_last_email', email) } catch { /* ignore */ }
                } else {
                    try { localStorage.removeItem('iord_last_email') } catch { /* ignore */ }
                }

                Auth.saveSession(data.data, remember)
                Auth.redirectAfterLogin()

            } catch (err) {
                this.setLoading(false)
                this.showGeneralError(err.message || 'Erro ao tentar entrar. Tente novamente.')

                // Balança o campo de senha (micro-feedback visual)
                this.elements.passwordInput?.classList.add('shake')
                setTimeout(() => this.elements.passwordInput?.classList.remove('shake'), 500)
            }
        },

    }

    /* ===========================================================
       7. MÓDULO: LOGIN COM GOOGLE
    =========================================================== */
    const GoogleLogin = {
        init() {
            const btn = document.getElementById('btnLoginGoogle')
            btn?.addEventListener('click', () => this.startFlow())
        },

        async startFlow() {
            // [API] Substituir pela integração OAuth2 real.
            // Opções comuns:
            //   • Firebase Auth: firebase.auth().signInWithPopup(provider)
            //   • Google Identity Services: google.accounts.id.initialize(...)
            //   • Supabase: supabase.auth.signInWithOAuth({ provider: 'google' })

            Toast.show('Login com Google em breve.', 'warning')

            // Exemplo de redirecionamento para o fluxo OAuth do backend:
            // window.location.href = `${CONFIG.apiBase}/auth/google`
        },

        /**
         * [API] Após o callback OAuth, chame este método com os dados da sessão.
         * Ex: GoogleLogin.handleCallback(sessionData)
         */
        handleCallback(sessionData) {
            Auth.saveSession(sessionData, true)
            Auth.redirectAfterLogin()
        },
    }

    /* ===========================================================
       8. MÓDULO: ESQUECI MINHA SENHA (Modal)
    =========================================================== */
    const ForgotPassword = {
        elements: {},

        init() {
            this.elements = {
                backdrop: document.getElementById('modalForgotBackdrop'),
                modal: document.getElementById('modalForgot'),
                openBtn: document.getElementById('btnForgot'),
                closeBtn: document.getElementById('modalForgotClose'),
                cancelBtn: document.getElementById('modalForgotCancel'),
                sendBtn: document.getElementById('btnForgotSend'),
                emailInput: document.getElementById('forgotEmail'),
                emailError: document.getElementById('forgotEmailError'),
                formState: document.getElementById('forgotFormState'),
                successState: document.getElementById('forgotSuccessState'),
                sentTo: document.getElementById('forgotSentTo'),
                footer: document.getElementById('forgotModalFooter'),
            }

            this.bindEvents()
        },

        bindEvents() {
            const { openBtn, closeBtn, cancelBtn, sendBtn, backdrop } = this.elements

            openBtn?.addEventListener('click', () => this.open())
            closeBtn?.addEventListener('click', () => this.close())
            cancelBtn?.addEventListener('click', () => this.close())

            // Fechar ao clicar no backdrop
            backdrop?.addEventListener('click', (e) => {
                if (e.target === backdrop) this.close()
            })

            // Fechar com Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !backdrop?.hidden) this.close()
            })

            sendBtn?.addEventListener('click', () => this.send())

            // Enter no campo de email
            this.elements.emailInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.send() }
            })

            // Limpa erro ao digitar
            this.elements.emailInput?.addEventListener('input', () => {
                if (this.elements.emailError) this.elements.emailError.textContent = ''
            })
        },

        open() {
            const { backdrop, formState, successState, emailInput, emailError, sendBtn, footer } = this.elements

            // Reset para estado inicial
            State.forgotEmailSent = false
            if (formState) formState.hidden = false
            if (successState) successState.hidden = true
            if (emailInput) { emailInput.value = ''; emailInput.setAttribute('aria-invalid', 'false') }
            if (emailError) emailError.textContent = ''
            if (sendBtn) { sendBtn.textContent = ''; sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Enviar link de recuperação` }
            if (footer) footer.hidden = false

            if (backdrop) {
                backdrop.hidden = false
                backdrop.removeAttribute('aria-hidden')
                document.body.style.overflow = 'hidden'
            }

            setTimeout(() => emailInput?.focus(), 80)
        },

        close() {
            const { backdrop } = this.elements
            if (backdrop) {
                backdrop.hidden = true
                backdrop.setAttribute('aria-hidden', 'true')
                document.body.style.overflow = ''
            }
        },

        async send() {
            const { emailInput, emailError, formState, successState, sentTo, sendBtn, footer } = this.elements

            const email = emailInput?.value?.trim() ?? ''

            if (!email) {
                if (emailError) emailError.textContent = 'Informe seu e-mail.'
                if (emailInput) emailInput.setAttribute('aria-invalid', 'true')
                emailInput?.focus()
                return
            }

            if (!Utils.isValidEmail(email)) {
                if (emailError) emailError.textContent = 'E-mail inválido.'
                if (emailInput) emailInput.setAttribute('aria-invalid', 'true')
                emailInput?.focus()
                return
            }

            // Loading no botão
            if (sendBtn) {
                sendBtn.disabled = true
                sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="animation:spin .75s linear infinite"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-dasharray="31.4 31.4"/></svg> Enviando…`
            }

            try {
                const response = await fetch(`${CONFIG.apiBase}/auth/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                })
                const data = await response.json()
                if (!response.ok) throw new Error(data.message || 'Erro ao enviar o link.')

                // Mostra estado de sucesso
                State.forgotEmailSent = true
                if (sentTo) sentTo.textContent = email
                if (formState) formState.hidden = true
                if (successState) successState.hidden = false
                if (footer) footer.hidden = true

            } catch {
                if (sendBtn) {
                    sendBtn.disabled = false
                    sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg> Enviar link de recuperação`
                }
                Toast.show('Erro ao enviar o link. Tente novamente.', 'error')
            }
        },
    }

    /* ===========================================================
       9. MÓDULO: TOGGLE DE SENHA (mostrar/ocultar)
    =========================================================== */
    const PasswordToggle = {
        init() {
            const btn = document.getElementById('btnTogglePw');
            const input = document.getElementById('loginPassword');
            const iconShow = btn?.querySelector('.pw-icon--show');
            const iconHide = btn?.querySelector('.pw-icon--hide');

            if (!btn || !input) return;

            // Garante o estado inicial correto ao carregar a página
            if (iconShow) iconShow.classList.remove('is-hidden');
            if (iconHide) iconHide.classList.add('is-hidden');

            btn.addEventListener('click', () => {
                const isPassword = input.type === 'password';

                // Troca o tipo do input
                input.type = isPassword ? 'text' : 'password';

                // Troca a visibilidade usando classe CSS
                if (iconShow) iconShow.classList.toggle('is-hidden', isPassword);
                if (iconHide) iconHide.classList.toggle('is-hidden', !isPassword);

                // Acessibilidade
                btn.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');

                // Foca no input para o usuário continuar digitando
                input.focus();
            });
        }
    }

    /* ===========================================================
       10. MÓDULO: LEMBRAR-ME & ANO DO COPYRIGHT
    =========================================================== */
    const Misc = {
        init() {
            // Atualiza o ano do copyright dinamicamente
            const yearEl = document.getElementById('loginYear')
            if (yearEl) yearEl.textContent = new Date().getFullYear()

            // Se já existe sessão ativa, vai direto para o dashboard
            const session = Auth.getSession()
            if (session) Auth.redirectAfterLogin()
        },
    }

    /* ===========================================================
       11. INICIALIZAÇÃO
    =========================================================== */
    function init() {
        Misc.init()          // Verifica sessão existente antes de tudo
        LoginForm.init()
        GoogleLogin.init()
        ForgotPassword.init()
        PasswordToggle.init()

        console.log('[IORD] login.js inicializado')
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init)
    } else {
        init()
    }

})()

/* =============================================================
   AUTH GUARD — cole este trecho no início de CADA página protegida
   (dashboard.html, agendamentos.html, financeiro.html, etc.)
   -------------------------------------------------------------

   <script src="js/login.js"></script>
   <script>
     // Bloqueia acesso sem sessão válida
     try { window.IORDAuth.requireLogin() } catch (e) { /* silencia o throw de redirect *\/ }
   </script>

   Ou, se preferir em um arquivo JS separado de cada página:
     const session = window.IORDAuth.requireLogin()
     console.log('Usuário logado:', session.user.name)

   Para fazer logout em qualquer página:
     window.IORDAuth.logout()

============================================================= */