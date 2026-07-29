/* =============================================================
   IORD — Dropdown de Perfil & Logout
   -------------------------------------------------------------
   Gera dinamicamente um dropdown no header ao clicar no 
   avatar/nome do usuário. Integra-se com o IORDAuth para logout.
============================================================= */
(function () {
    'use strict';

    function initProfileDropdown() {
        const userInfo = document.querySelector('.user-info');
        const userAvatar = document.querySelector('.user-avatar');
        const headerUser = document.querySelector('.app-header__user');

        // Se os elementos não existirem na página, sai silenciosamente
        if (!userInfo || !userAvatar || !headerUser) return;

        // --- Dados do usuário vindos da sessão (não do DOM estático) ---
        function getSessionUser() {
            // 1. Tenta IORDPermissions se disponível
            if (window.IORDPermissions && typeof IORDPermissions.getUser === 'function') {
                const u = IORDPermissions.getUser();
                if (u && u.name) return u;
            }
            // 2. Lê direto do storage (mesma lógica do api.js)
            for (const storage of [sessionStorage, localStorage]) {
                try {
                    const raw = storage.getItem('iord_auth');
                    if (!raw) continue;
                    const session = JSON.parse(raw);
                    if (session?.user?.name) return session.user;
                } catch (_) { }
            }
            return {};
        }

        const sessionUser = getSessionUser();

        // Nível → label legível
        const levelLabels = {
            admin: 'Administrador Geral',
            recepcao: 'Recepcionista',
            viewer: 'Visualizador',
        };

        const userName = sessionUser.name || userInfo.querySelector('.user-info__name')?.textContent || 'Usuário';
        const userRole = sessionUser.role || levelLabels[sessionUser.level] || userInfo.querySelector('.user-info__role')?.textContent || '';
        const userInitials = userName.replace(/^(Dr\.|Dra\.)\s*/i, '').trim().split(' ')
            .filter(Boolean)
            .reduce((acc, p, i, arr) => i === 0 || i === arr.length - 1 ? acc + p[0] : acc, '')
            .toUpperCase().slice(0, 2) || 'U';

        // Atualiza também o DOM do header para consistência visual
        const headerNameEl = userInfo.querySelector('.user-info__name');
        const headerRoleEl = userInfo.querySelector('.user-info__role');
        if (headerNameEl && sessionUser.name) headerNameEl.textContent = sessionUser.name;
        if (headerRoleEl) {
            // role (cargo) tem prioridade; se vazio, usa o nível traduzido
            headerRoleEl.textContent = sessionUser.role || levelLabels[sessionUser.level] || '';
        }
        const avatarEl = document.querySelector('.user-avatar');
        if (avatarEl && userInitials) avatarEl.textContent = userInitials;

        const dropdown = document.createElement('div');
        dropdown.id = 'profile-dropdown-menu';

        Object.assign(dropdown.style, {
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: '0',
            minWidth: '220px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: '12px',
            zIndex: '9999',
            opacity: '0',
            transform: 'translateY(-10px)',
            pointerEvents: 'none',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
        });

        dropdown.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--color-border); margin-bottom: 8px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--gradient-brand); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: var(--fw-bold); font-size: var(--fs-sm);">
                    ${userInitials}
                </div>
                <div style="display: flex; flex-direction: column; line-height: 1.3; overflow: hidden;">
                    <span style="font-weight: var(--fw-semibold); color: var(--color-text); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${userName}</span>
                    <span style="font-size: var(--fs-xs); color: var(--color-text-subtle);">${userRole}</span>
                </div>
            </div>
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px;">
                <li>
                    <button id="btn-my-profile" style="width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius-sm); color: var(--color-text-muted); font-weight: var(--fw-medium); font-size: var(--fs-sm); transition: background 0.2s, color 0.2s; cursor: pointer; border: none; background: none; text-align: left; font-family: var(--font-base);">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        Meu Perfil
                    </button>
                </li>
                <li>
                    <button id="btn-logout" style="width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius-sm); color: var(--color-negative); font-weight: var(--fw-medium); font-size: var(--fs-sm); transition: background 0.2s; cursor: pointer; border: none; background: none; text-align: left; font-family: var(--font-base);">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Sair do Sistema
                    </button>
                </li>
            </ul>
        `;

        Object.assign(headerUser.style, {
            position: 'relative',
            zIndex: '100',
        });
        headerUser.appendChild(dropdown);

        // 2. Lógica de Abrir/Fechar
        const toggleDropdown = (show) => {
            if (show) {
                dropdown.style.opacity = '1';
                dropdown.style.transform = 'translateY(0)';
                dropdown.style.pointerEvents = 'auto';
            } else {
                dropdown.style.opacity = '0';
                dropdown.style.transform = 'translateY(-10px)';
                dropdown.style.pointerEvents = 'none';
            }
        };

        const handleTriggerClick = (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.opacity === '1';
            toggleDropdown(!isVisible);
        };

        // Abre ao clicar no nome ou avatar
        userInfo.addEventListener('click', handleTriggerClick);
        userAvatar.addEventListener('click', handleTriggerClick);

        // Torna o nome e avatar "clicáveis" visualmente
        userInfo.style.cursor = 'pointer';
        userAvatar.style.cursor = 'pointer';

        // Fecha ao clicar fora
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== userInfo && e.target !== userAvatar) {
                toggleDropdown(false);
            }
        });

        // Fecha com a tecla Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') toggleDropdown(false);
        });

        // 3. Ações dos botões
        const btnProfile = document.getElementById('btn-my-profile');
        const btnLogout = document.getElementById('btn-logout');

        // Hover effect via JS para manter tudo isolado no JS
        [btnProfile, btnLogout].forEach(btn => {
            const originalColor = btn.style.color;
            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = 'var(--color-surface-muted)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.backgroundColor = 'transparent';
            });
        });

        btnProfile.addEventListener('click', () => {
            window.location.href = 'configuracoes.html'; // ou perfil.html, ajuste conforme seu sistema
            toggleDropdown(false);
        });

        btnLogout.addEventListener('click', () => {
            // Verifica se o Auth guard do login.js está disponível
            if (window.IORDAuth && typeof window.IORDAuth.logout === 'function') {
                window.IORDAuth.logout();
            } else {
                // Fallback: limpa storages e redireciona manualmente
                localStorage.clear();
                sessionStorage.clear();
                window.location.replace('login.html');
            }
        });
    }

    // Inicializa quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfileDropdown);
    } else {
        initProfileDropdown();
    }
})();