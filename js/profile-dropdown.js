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

        // 1. Cria a estrutura do Dropdown
        const dropdown = document.createElement('div');
        dropdown.id = 'profile-dropdown-menu';
        
        // Estilos inline baseados nos design tokens do styles.css
        dropdown.style.cssText = `
            position: absolute;
            top: calc(100% + 12px);
            right: 0;
            width: 240px;
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-lg);
            padding: var(--space-4);
            z-index: 200;
            opacity: 0;
            transform: translateY(-10px);
            pointer-events: none;
            transition: opacity var(--transition-fast), transform var(--transition-fast);
        `;

        // Pega dados do usuário diretamente do header atual
        const userName = userInfo.querySelector('.user-info__name')?.textContent || 'Usuário';
        const userRole = userInfo.querySelector('.user-info__role')?.textContent || '';
        const userInitials = userAvatar.textContent || 'U';

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

        // O header precisa de position relative para o absolute funcionar
        headerUser.style.position = 'relative';
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