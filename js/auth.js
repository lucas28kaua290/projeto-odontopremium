/* =============================================================
   IORD — Controle de Acesso e Permissões
   auth.js
   -------------------------------------------------------------
   Responsabilidades:
     1. Ler a sessão do storage (iord_auth) de forma síncrona
     2. Expor helpers de permissão (isAdmin, getRadiologiaId…)
     3. applyUI() — oculta o filtro global nas telas onde o
        usuário não tem acesso a todas as radiologias
     4. getRadiologiaFiltro() — retorna o radiologiaId que deve
        ser usado em TODAS as chamadas de API do sistema

   Como usar em cada tela:
     <script src="js/login.js"></script>
     <script src="js/auth.js"></script>
     <script src="js/api.js"></script>
     <script src="js/agendamentos.js"></script>  (ou outra tela)

   No início do JS de cada tela:
     IORDAuth.requireLogin()       // redireciona se sem sessão
     IORDPermissions.applyUI()     // aplica restrições visuais
     // ao chamar a API, use:
     const radId = IORDPermissions.getRadiologiaFiltro(estadoAtual)
============================================================= */

const IORDPermissions = (() => {
    'use strict';

    /* ----------------------------------------------------------
       1. LER SESSÃO
    ---------------------------------------------------------- */

    /**
     * Retorna o objeto de sessão do storage (iord_auth).
     * Mesma lógica do IORDAuth.getSession() do login.js.
     */
    function _getSession() {
        const storages = [localStorage, sessionStorage];
        for (const storage of storages) {
            try {
                const raw = storage.getItem('iord_auth');
                if (!raw) continue;
                const session = JSON.parse(raw);
                if (!session?.token || !session?.expiresAt) continue;
                if (Date.now() > session.expiresAt) {
                    storage.removeItem('iord_auth');
                    continue;
                }
                return session;
            } catch {
                // JSON inválido — ignora
            }
        }
        return null;
    }

    /**
     * Retorna o objeto `user` da sessão, ou um objeto neutro
     * se não houver sessão (nunca quebra).
     */
    function getUser() {
        return _getSession()?.user || {};
    }

    /* ----------------------------------------------------------
       2. HELPERS DE PERMISSÃO
    ---------------------------------------------------------- */

    /** Retorna true se o usuário logado for admin. */
    function isAdmin() {
        return getUser().level === 'admin';
    }

    /**
     * Retorna o radiologia_id do usuário logado.
     * Para admin retorna 'todas' (sem restrição).
     * Para outros retorna o id da radiologia deles (ex: 'rad_centro').
     */
    function getRadiologiaId() {
        return getUser().radiologia || 'todas';
    }

    /**
     * Retorna o radiologiaId que deve ser enviado para a API,
     * respeitando as permissões do usuário.
     *
     * - Admin: respeita o filtro que o usuário selecionou na UI
     *   (pode ser 'all' para ver tudo, ou um id específico)
     * - Não-admin: ignora o que estiver na UI e força a radiologia
     *   do usuário logado (ele nunca vê dados de outra unidade)
     *
     * @param {string|null} filtroSelecionadoNaUI — valor atual do
     *   filtro de radiologia na tela (pill/select). Pode ser null.
     * @returns {string} radiologiaId pronto para enviar na API
     */
    function getRadiologiaFiltro(filtroSelecionadoNaUI = null) {
        if (isAdmin()) {
            // Admin: usa o que a UI tem selecionado, ou 'all'
            return filtroSelecionadoNaUI || 'all';
        }
        // Não-admin: sempre a radiologia dele, sem exceção
        return getRadiologiaId();
    }

    /* ----------------------------------------------------------
       3. CONTROLE DE UI
    ---------------------------------------------------------- */

    /**
     * Aplica as restrições visuais na tela conforme o nível do usuário.
     *
     * O que faz:
     *   - Não-admin: oculta o bloco #radiologyFilters (filtro global
     *     de radiologias presente no topo de todas as telas)
     *   - Admin: não faz nada (vê tudo normalmente)
     *
     * Chame no início do init() de cada tela, depois de requireLogin().
     */
    function applyUI() {
        if (isAdmin()) return;

        // Oculta o container de pills de radiologia
        const filterBar = document.getElementById('radiologyFilters');
        if (filterBar) filterBar.style.display = 'none';

        // Oculta wrapper pai e qualquer label "Radiologias" acima das pills
        const filterWrapper = document.querySelector('.radiology-filter-bar, .filter-pills-wrapper');
        if (filterWrapper) filterWrapper.style.display = 'none';

        // Oculta labels estáticos tipo <label>, <span> ou <h*> imediatamente
        // antes do container de filtros (padrão comum: label + pills no mesmo bloco)
        if (filterBar) {
            const sibling = filterBar.previousElementSibling;
            if (sibling && /^(label|span|h[1-6]|p)$/i.test(sibling.tagName)) {
                sibling.style.display = 'none';
            }
            // Oculta também o pai se ficar vazio/sem conteúdo visível
            const parent = filterBar.parentElement;
            if (parent && parent.id !== 'radiologyFilters') {
                parent.style.display = 'none';
            }
        }

        // Oculta qualquer elemento com classe contendo "filter-label" ou "pills-label"
        document.querySelectorAll('.filter-label, .pills-label, .radiology-label').forEach(el => {
            el.style.display = 'none';
        });
    }

    /**
     * Variante de applyUI para a tela de Pacientes.
     * Não tem filtro global para ocultar, mas pode ser usada
     * para exibir/ocultar elementos específicos desta tela no futuro.
     * Por ora é um no-op — a restrição de pacientes é feita
     * diretamente no getRadiologiaFiltro() passado para a API.
     */
    function applyUIPacientes() {
        // Sem filtro global nesta tela.
        // A restrição já acontece no parâmetro radiologiaId da query.
        // Adicione aqui qualquer ajuste visual futuro para esta tela.
    }

    /* ----------------------------------------------------------
       4. INTERFACE PÚBLICA
    ---------------------------------------------------------- */
    return {
        getUser,
        isAdmin,
        getRadiologiaId,
        getRadiologiaFiltro,
        applyUI,
        applyUIPacientes,
    };
})();

/* Auth guard global — usado pelas páginas protegidas via IORDAuth.requireLogin() */
window.IORDAuth = (() => {
    const STORAGE_KEY = 'iord_auth';

    function getSession() {
        const storages = [localStorage, sessionStorage];
        for (const storage of storages) {
            try {
                const raw = storage.getItem(STORAGE_KEY);
                if (!raw) continue;
                const session = JSON.parse(raw);
                if (!session?.token || !session?.expiresAt) continue;
                if (Date.now() > session.expiresAt) { storage.removeItem(STORAGE_KEY); continue; }
                return session;
            } catch { /* JSON inválido */ }
        }
        return null;
    }

    function requireLogin() {
        const session = getSession();
        if (!session) {
            const current = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.replace(`login.html?redirect=${current}`);
            throw new Error('IORD: redirecionando para login.');
        }
        return session;
    }

    function logout() {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
        window.location.replace('login.html');
    }

    return { getSession, requireLogin, logout };
})();