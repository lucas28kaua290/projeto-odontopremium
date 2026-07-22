/**
 * =============================================================================
 * IORD — Painel de Gestão | api.js
 * -----------------------------------------------------------------------------
 * Arquivo central de requisições HTTP do sistema.
 * Todas as chamadas à API passam por este módulo.
 *
 * Padrão adotado:
 *   • Nomenclatura:  getXxx() para leituras, postXxx() / updateXxx() para escrita
 *   • Comentários:   // [API] METHOD /rota  indicam o endpoint esperado no backend
 *   • Autenticação:  Authorization: Bearer <token> em todas as requisições
 *   • Erros:         toda função lança um Error com mensagem legível em pt-BR
 *
 * Módulos (ordem de dependência):
 *   1. Config           — base URL e helpers internos
 *   2. Radiologias      — lista de unidades + nomes
 *   3. KPIs Financeiros — cards do topo do dashboard
 *   4. Gráfico de Linha — série temporal de faturamento / exames
 *   5. Gráfico de Barras — comparativo por radiologia / clínica
 *   6. Hierarquia       — árvore radiologia → clínica → médico
 *   7. Análise de Exames— KPIs, distribuição por tipo, ranking
 *   8. Médicos          — spotlight, tipos de exame por médico
 *   9. Comissões        — totais, pendentes, breakdown por médico
 *  10. Período / Filtros— utilitários de período para query params
 *  11. Pacientes        — listagem, perfil, exames, agendamentos, notas, CRUD
 *  12. Financeiro       — KPIs, evolução, por radiologia, tipos de exame, ticket médio,
 *                         top clínicas, top médicos, insights, hierarquia (faturamento)
 *  13. Metas            — KPIs mensal/anual, tabela por radiologia, histórico, salvar/ editar
 *  14. Relatórios       — histórico, exportar predefinido, gerar customizado
 *  15. Configurações    — geral, logo, radiologias, clínicas, médicos,
 *                         usuários, parâmetros (agendamento + WA + exames)
 * =============================================================================
 */

const Api = (() => {

    /* ===========================================================================
       1. CONFIG
       =========================================================================== */

    /** URL base da API. Trocar pela URL real de produção / staging conforme o ambiente. */
    const BASE_URL = 'https://iordfinanceiro.com.br/v1';

    /**
     * Retorna o token de autenticação armazenado na sessão.
     * Adapte a origem do token conforme a estratégia de auth do projeto
     * (localStorage, cookie HttpOnly via servidor, etc.).
     */
    function getToken() {
        const storages = [sessionStorage, localStorage];

        for (const storage of storages) {
            try {
                const raw = storage.getItem("iord_auth");
                if (!raw) continue;

                const session = JSON.parse(raw);

                if (session?.token) {
                    return session.token;
                }
            } catch (e) {
                // ignora
            }
        }

        return "";
    }

    /**
     * Helper interno: executa o fetch com os headers padrão e trata erros HTTP.
     *
     * @param {string} path        - Caminho relativo ao BASE_URL (ex: '/financeiro/kpis')
     * @param {RequestInit} [opts] - Opções extras do fetch (method, body, etc.)
     * @returns {Promise<any>}     - JSON parseado da resposta
     */
    async function request(path, opts = {}) {
        const url = `${BASE_URL}${path}`;

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`,
            ...(opts.headers || {}),
        };

        let response;
        try {
            response = await fetch(url, { ...opts, headers });
        } catch (networkError) {
            throw new Error(`[IORD API] Falha de rede ao acessar "${path}": ${networkError.message}`);
        }

        if (!response.ok) {
            let detail = '';
            try {
                const errBody = await response.json();
                detail = errBody.message || errBody.error || '';
            } catch (_) { /* ignora JSON inválido na resposta de erro */ }

            throw new Error(
                `[IORD API] ${response.status} ${response.statusText} em "${path}"${detail ? ` — ${detail}` : ''}`
            );
        }

        return response.json();
    }

    /**
     * Serializa um objeto de filtros em query string.
     * Ignora chaves com valor null / undefined / string vazia.
     *
     * Exemplo:
     *   buildQuery({ radiologiaId: 'rad_centro', periodo: 'mes_atual' })
     *   → '?radiologiaId=rad_centro&periodo=mes_atual'
     */
    function buildQuery(params = {}) {
        const qs = Object.entries(params)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        return qs ? `?${qs}` : '';
    }


    /* ===========================================================================
       2. RADIOLOGIAS
       =========================================================================== */

    /**
     * Retorna a lista de radiologias disponíveis para o usuário autenticado.
     * Usada para popular as pills de filtro global (id="radiologyFilters").
     *
     * [API] GET /radiologias
     *
     * Resposta esperada:
     * [
     *   { id: 'all',        nome: 'Todas as Radiologias' },
     *   { id: 'rad_centro', nome: 'Radiologia Centro' },
     *   ...
     * ]
     */
    async function getRadiologias() {
        return request('/radiologias');
    }

    /**
     * Retorna os dados resumidos de uma única radiologia (nome, localização, status).
     *
     * [API] GET /radiologias/:radiologiaId
     *
     * @param {string} radiologiaId - ex: 'rad_centro'
     */
    async function getRadiologia(radiologiaId) {
        return request(`/radiologias/${radiologiaId}`);
    }


    /* ===========================================================================
       3. KPIs FINANCEIROS
       =========================================================================== */

    /**
     * Retorna todos os KPIs financeiros do dashboard para o filtro selecionado.
     * Alimenta os cards: #kpiRevenue, #kpiExams, #kpiAvgPerClinic,
     * #kpiCashForecast e #kpiTicketMedio.
     *
     * [API] GET /financeiro/kpis
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId  - 'all' | 'rad_centro' | ...
     * @param {string} filtros.periodo       - 'mes_atual' | 'ultimos_30' | 'trimestre' | 'ano' | 'custom'
     * @param {string} [filtros.dataInicio]  - ISO date (apenas quando periodo === 'custom')
     * @param {string} [filtros.dataFim]     - ISO date (apenas quando periodo === 'custom')
     *
     * Resposta esperada:
     * {
     *   faturamentoTotal:             number,
     *   faturamentoVariacao:          number,   // percentual vs. período anterior
     *   totalExames:                  number,
     *   examesVariacao:               number,
     *   faturamentoMedioPorClinica:   number,
     *   ticketMedioExame:             number,
     *   clinicasAtivas:               number,
     *   previsibilidadeCaixa:         number,
     *   examesAgendados:              number,
     *   comissoesTotais:              number,
     *   comissoesPendentes:           number,
     *   comissoesPercentualFaturamento: number,
     *   comissoesVariacao:            number,
     * }
     */
    async function getKPIs(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/financeiro/kpis${qs}`);
    }


    /* ===========================================================================
       4. GRÁFICO DE LINHA — Evolução Temporal
       =========================================================================== */

    /**
     * Retorna a série temporal de faturamento por radiologia (gráfico de linha,
     * id="evolutionChart"). Quando radiologiaId = 'all', retorna uma série por
     * radiologia para o comparativo.
     *
     * [API] GET /financeiro/evolucao/faturamento
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * {
     *   labels: ['Ago', 'Set', ..., 'Jul'],   // 12 pontos
     *   series: [
     *     { radiologiaId: 'rad_centro', nome: 'Radiologia Centro', dados: [58000, ...] },
     *     ...
     *   ]
     * }
     */
    async function getFaturamentoEvolucao(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/financeiro/evolucao/faturamento${qs}`);
    }

    /**
     * Retorna a série temporal de quantidade de exames por radiologia.
     * Usado quando o toggle do gráfico está em "Quantidade de Exames".
     *
     * [API] GET /exames/evolucao/quantidade
     *
     * @param {object} filtros - mesmos campos de getFaturamentoEvolucao
     *
     * Resposta esperada: mesmo formato de getFaturamentoEvolucao
     */
    async function getExamesEvolucao(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/exames/evolucao/quantidade${qs}`);
    }


    /* ===========================================================================
       5. GRÁFICO DE BARRAS — Comparativo por Entidade
       =========================================================================== */

    /**
     * Retorna faturamento agregado por radiologia (quando radiologiaId = 'all')
     * ou por clínica referenciadora (quando uma radiologia específica é selecionada).
     * Alimenta o gráfico de barras id="entityChart".
     *
     * [API] GET /financeiro/comparativo/faturamento
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * {
     *   agrupamento: 'radiologia' | 'clinica',
     *   itens: [
     *     {
     *       id:          string,
     *       nome:        string,
     *       faturamento: number,
     *       exames:      number,
     *       breakdown: [      // clínicas (quando agrupamento = 'radiologia')
     *                         // ou médicos (quando agrupamento = 'clinica')
     *         { id, nome, faturamento, exames }
     *       ]
     *     }
     *   ]
     * }
     */
    async function getFaturamentoPorEntidade(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/financeiro/comparativo/faturamento${qs}`);
    }

    /**
     * Retorna quantidade de exames agregada por radiologia ou clínica.
     * Mesmo comportamento de getFaturamentoPorEntidade, mas para o eixo de exames.
     *
     * [API] GET /exames/comparativo/quantidade
     *
     * @param {object} filtros - mesmos campos de getFaturamentoPorEntidade
     */
    async function getExamesPorEntidade(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/exames/comparativo/quantidade${qs}`);
    }


    /* ===========================================================================
       6. HIERARQUIA — Árvore Radiologia → Clínica → Médico
       =========================================================================== */

    /**
     * Retorna a árvore hierárquica completa com totais calculados por nível.
     * Alimenta a tabela hierárquica com accordion de 3 níveis (HierarchyTable).
     *
     * [API] GET /hierarquia/arvore
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId - 'all' filtra todos os níveis
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * [
     *   {
     *     id: 'rad_centro', nome: 'Radiologia Centro',
     *     totais: { exames, faturamento, comissao, pendente },
     *     clinicas: [
     *       {
     *         id: 'cl_1', nome: 'Clínica OdontoVida',
     *         totais: { exames, faturamento, comissao, pendente },
     *         medicos: [
     *           { id: 'md_1', nome: 'Dra. Beatriz Nunes', exames, faturamento, comissao, pendente }
     *         ]
     *       }
     *     ]
     *   }
     * ]
     */
    async function getHierarquiaArvore(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/hierarquia/arvore${qs}`);
    }

    /**
     * Retorna a lista de clínicas de uma radiologia específica.
     * Usado para popular o gráfico de barras e tooltips de clínicas.
     *
     * [API] GET /radiologias/:radiologiaId/clinicas
     *
     * @param {string} radiologiaId
     * @param {object} [filtros]
     */
    async function getClinicasPorRadiologia(radiologiaId, filtros = {}) {
        const qs = buildQuery({
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/radiologias/${radiologiaId}/clinicas${qs}`);
    }

    /**
     * Retorna todos os médicos referenciadores "achatados" (flat),
     * com contexto de clínica e radiologia.
     * Usado na seção de Comissões e no spotlight de médicos.
     *
     * [API] GET /medicos
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} [filtros.clinicaId]  - filtra por clínica específica
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * [
     *   {
     *     id, nome, exames, faturamento, comissao, pendente,
     *     clinicaId, clinicaNome, radiologiaId, radiologiaNome
     *   }
     * ]
     */
    async function getMedicos(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            clinicaId: filtros.clinicaId,
            busca: filtros.busca,
            status: filtros.status,
            ...(filtros.semPeriodo ? {} : {
                periodo: filtros.periodo || 'mes_atual',
                dataInicio: filtros.dataInicio,
                dataFim: filtros.dataFim,
            }),
        });
        return request(`/medicos${qs}`);
    }


    /* ===========================================================================
       7. ANÁLISE DE EXAMES
       =========================================================================== */

    /**
     * Retorna os KPIs rápidos da seção "Análise de Exames".
     * Alimenta os cards: #examKpiTotal, #examKpiAvgDay, #examKpiTopType, #examKpiReferenced.
     *
     * [API] GET /exames/kpis
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * {
     *   totalExames:         number,
     *   variacaoExames:      number,   // percentual vs. período anterior
     *   mediaPorDiaUtil:     number,
     *   tipoMaisRealizado:   string,   // ex: 'Panorâmica'
     *   tipoMaisRealizadoQtd: number,
     *   percentualReferenciados: number,
     * }
     */
    async function getExamesKPIs(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/exames/kpis${qs}`);
    }

    /**
     * Retorna a distribuição de exames por tipo (alimenta o gráfico doughnut
     * id="examTypeChart").
     *
     * [API] GET /exames/distribuicao-por-tipo
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * {
     *   tipos: [
     *     { tipo: 'Panorâmica',  quantidade: 822 },
     *     { tipo: 'Tomografia',  quantidade: 500 },
     *     ...
     *   ]
     * }
     */
    async function getExamesDistribuicaoPorTipo(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/exames/distribuicao-por-tipo${qs}`);
    }

    /**
     * Retorna o ranking de clínicas por volume de exames (alimenta
     * #examsClinicsRankList — top 6 clínicas).
     *
     * [API] GET /exames/ranking/clinicas
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     * @param {number} [filtros.limite]     - padrão: 6
     *
     * Resposta esperada:
     * [
     *   { clinicaId, clinicaNome, radiologiaNome, totalExames }
     * ]
     */
    async function getRankingClinicasPorExames(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
            limite: filtros.limite || 6,
        });
        return request(`/exames/ranking/clinicas${qs}`);
    }

    /**
     * Retorna o ranking de médicos por volume de exames (alimenta
     * #examsDoctorsRankList).
     *
     * [API] GET /exames/ranking/medicos
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} [filtros.clinicaId]  - filtro opcional pelo select #doctorClinicFilter
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     * @param {number} [filtros.limite]     - padrão: 10
     *
     * Resposta esperada:
     * [
     *   { medicoId, medicoNome, clinicaNome, radiologiaNome, totalExames, faturamento }
     * ]
     */
    async function getRankingMedicosPorExames(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            clinicaId: filtros.clinicaId,
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
            limite: filtros.limite || 10,
        });
        return request(`/exames/ranking/medicos${qs}`);
    }

    /**
     * Retorna os destaques do período (alimenta #examsHighlightsGrid):
     * médico destaque, clínica líder, tipo em destaque e variação geral.
     *
     * [API] GET /exames/destaques
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * {
     *   medicoDestaque:   { nome, totalExames, clinicaNome },
     *   clinicaLider:     { nome, totalExames },
     *   tipoEmDestaque:   { tipo, quantidade, percentualDoLider },
     *   variacaoGeral:    number,  // percentual vs. período anterior
     * }
     */
    async function getExamesDestaques(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/exames/destaques${qs}`);
    }


    /* ===========================================================================
       8. MÉDICOS — Spotlight e Perfil de Exames
       =========================================================================== */

    /**
     * Retorna o perfil de exames de um médico específico (tipos solicitados,
     * quantidades e faturamento). Alimenta os cards do #examsDoctorsGrid.
     *
     * [API] GET /medicos/:medicoId/exames
     *
     * @param {string} medicoId   - ex: 'md_1'
     * @param {object} [filtros]
     * @param {string} [filtros.periodo]
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * {
     *   medicoId, medicoNome, clinicaNome, radiologiaNome,
     *   totalExames, faturamento,
     *   tiposDeExame: [
     *     { tipo: 'Panorâmica', exames: 248 },
     *     { tipo: 'Periapical', exames: 184 },
     *     ...
     *   ]
     * }
     */
    async function getMedicoExames(medicoId, filtros = {}) {
        const qs = buildQuery({
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/medicos/${medicoId}/exames${qs}`);
    }

    /**
     * Retorna o spotlight (top médicos com breakdown de exames) para um filtro.
     * Retorna no máximo 5 médicos quando radiologiaId = 'all' e clinicaId = 'all'.
     *
     * [API] GET /medicos/spotlight
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} [filtros.clinicaId]   - vem do select #doctorClinicFilter
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     * @param {number} [filtros.limite]      - padrão: 5
     *
     * Resposta esperada:
     * [
     *   {
     *     medicoId, medicoNome, clinicaNome, radiologiaNome,
     *     totalExames, faturamento,
     *     tiposDeExame: [ { tipo, exames } ]
     *   }
     * ]
     */
    async function getMedicosSpotlight(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            clinicaId: filtros.clinicaId,
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
            limite: filtros.limite || 5,
        });
        return request(`/medicos/spotlight${qs}`);
    }

    /**
     * Retorna a lista de clínicas disponíveis para um filtro de radiologia.
     * Popula o <select id="doctorClinicFilter">.
     *
     * [API] GET /medicos/clinicas-disponiveis
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     *
     * Resposta esperada:
     * [ { clinicaId, clinicaNome } ]
     */
    async function getClinicasDisponiveisPorMedico(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
        });
        return request(`/medicos/clinicas-disponiveis${qs}`);
    }


    /* ===========================================================================
       9. COMISSÕES
       =========================================================================== */

    /**
     * Retorna os KPIs consolidados de comissões (total devida, pendente, paga,
     * percentual sobre faturamento). Alimenta os cards da seção de Comissões.
     *
     * [API] GET /comissoes/kpis
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * {
     *   comissoesTotais:              number,
     *   comissoesPagas:               number,
     *   comissoesPendentes:           number,
     *   comissoesVariacao:            number,
     *   comissoesPercentualFaturamento: number,
     * }
     */
    async function getComissoesKPIs(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/comissoes/kpis${qs}`);
    }

    /**
     * Retorna o breakdown de comissões por médico (devida, paga, pendente).
     * Alimenta a tabela de comissões.
     *
     * [API] GET /comissoes/por-medico
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} [filtros.clinicaId]
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * [
     *   {
     *     medicoId, medicoNome, clinicaNome, radiologiaNome,
     *     faturamento, comissaoDevida, comissaoPaga, comissaoPendente,
     *     pendentePercent
     *   }
     * ]
     */
    async function getComissoesPorMedico(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            clinicaId: filtros.clinicaId,
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/comissoes/por-medico${qs}`);
    }

    /**
     * Retorna o breakdown de comissões por radiologia (para gráfico comparativo).
     *
     * [API] GET /comissoes/por-radiologia
     *
     * @param {object} filtros
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * [
     *   { radiologiaId, radiologiaNome, comissaoDevida, comissaoPendente }
     * ]
     */
    async function getComissoesPorRadiologia(filtros = {}) {
        const qs = buildQuery({
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/comissoes/por-radiologia${qs}`);
    }

    /* ===========================================================================
       11. PACIENTES
       =========================================================================== */

    /**
     * Retorna a lista paginada de pacientes com suporte a busca textual e filtros
     * rápidos. Alimenta a tabela principal da tela de Pacientes (#tabela-pacientes-body).
     *
     * [API] GET /pacientes
     *
     * @param {object} filtros
     * @param {string} [filtros.busca]        - texto livre (nome, CPF, telefone ou código)
     * @param {string} [filtros.buscaScope]   - 'todos' | 'nome' | 'cpf' | 'telefone' | 'codigo'
     * @param {string} [filtros.filtroRapido] - 'todos' | 'ativos' | 'novos' | 'agendamentos'
     * @param {number} [filtros.pagina]       - página atual (base 1); padrão: 1
     * @param {number} [filtros.porPagina]    - itens por página; padrão: 8
     *
     * Resposta esperada:
     * {
     *   total:    number,
     *   pagina:   number,
     *   paginas:  number,
     *   itens: [
     *     {
     *       id, nome, cpf, telefone, email, nascimento,
     *       endereco, status, cadastro, observacoes,
     *       exames:       [ { data, tipo, unidade, valor, status } ],
     *       agendamentos: [ { data, hora, unidade, tipo, status } ],
     *       notas:        [ { texto, data } ]
     *     }
     *   ]
     * }
     */
    async function getPacientes(filtros = {}) {
        const qs = buildQuery({
            busca: filtros.busca,
            buscaScope: filtros.buscaScope || 'todos',
            filtroRapido: filtros.filtroRapido || 'todos',
            pagina: filtros.pagina || 1,
            porPagina: filtros.porPagina || 8,
        });
        return request(`/pacientes${qs}`);
    }

    /**
     * Retorna o perfil completo de um paciente pelo ID.
     * Alimenta a view de perfil (#view-perfil) com todos os dados:
     * informações cadastrais, KPIs, contato rápido, histórico e notas.
     *
     * [API] GET /pacientes/:pacienteId
     *
     * @param {string} pacienteId - ex: 'P-0001'
     *
     * Resposta esperada:
     * {
     *   id, nome, cpf, telefone, email, nascimento,
     *   endereco, status, cadastro, observacoes,
     *   exames:       [ { data, tipo, unidade, valor, status } ],
     *   agendamentos: [ { data, hora, unidade, tipo, status } ],
     *   notas:        [ { texto, data } ]
     * }
     */
    async function getPaciente(pacienteId) {
        return request(`/pacientes/${pacienteId}`);
    }

    /**
     * Retorna os KPIs calculados do perfil de um paciente.
     * Alimenta os cards #kpi-visitas, #kpi-total-gasto,
     * #kpi-paciente-desde e #kpi-radiologia-frequente.
     *
     * [API] GET /pacientes/:pacienteId/kpis
     *
     * @param {string} pacienteId
     *
     * Resposta esperada:
     * {
     *   totalExames:           number,
     *   totalGasto:            number,
     *   dataCadastro:          string,   // ISO date
     *   unidadeMaisFrequente:  string,
     *   visitasUnidadeFreq:    number,
     * }
     */
    async function getPacienteKPIs(pacienteId) {
        return request(`/pacientes/${pacienteId}/kpis`);
    }

    /**
     * Retorna o histórico de exames de um paciente ordenado por data desc.
     * Alimenta a timeline #timeline-exames.
     *
     * [API] GET /pacientes/:pacienteId/exames
     *
     * @param {string} pacienteId
     * @param {object} [filtros]
     * @param {string} [filtros.tipo]       - filtra por tipo de exame (ex: 'Panorâmica Digital')
     * @param {string} [filtros.dataInicio] - ISO date
     * @param {string} [filtros.dataFim]    - ISO date
     *
     * Resposta esperada:
     * [
     *   { data, tipo, unidade, valor, status }
     * ]
     */
    async function getPacienteExames(pacienteId, filtros = {}) {
        const qs = buildQuery({
            tipo: filtros.tipo,
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/pacientes/${pacienteId}/exames${qs}`);
    }

    /**
     * Retorna o histórico de agendamentos de um paciente ordenado por data desc.
     * Alimenta a tabela #tabela-agendamentos-body.
     *
     * [API] GET /pacientes/:pacienteId/agendamentos
     *
     * @param {string} pacienteId
     * @param {object} [filtros]
     * @param {string} [filtros.status]     - 'confirmado' | 'pendente' | 'realizado' | 'cancelado'
     * @param {string} [filtros.dataInicio] - ISO date
     * @param {string} [filtros.dataFim]    - ISO date
     *
     * Resposta esperada:
     * [
     *   { data, hora, unidade, tipo, status }
     * ]
     */
    async function getPacienteAgendamentos(pacienteId, filtros = {}) {
        const qs = buildQuery({
            status: filtros.status,
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/pacientes/${pacienteId}/agendamentos${qs}`);
    }

    // [API] GET /agendamentos
    async function getAgendamentos(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
            status: filtros.status,
        });
        return request(`/agendamentos${qs}`);
    }

    // [API] POST /agendamentos
    async function postAgendamento(dados) {
        return request('/agendamentos', {
            method: 'POST',
            body: JSON.stringify(dados),
        });
    }

    // [API] PATCH /agendamentos/:id
    async function updateAgendamento(id, dados) {
        return request(`/agendamentos/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(dados),
        });
    }
    /**
     * Retorna as notas/observações de um paciente ordenadas por data desc.
     * Alimenta a lista #perfil-notas.
     *
     * [API] GET /pacientes/:pacienteId/notas
     *
     * @param {string} pacienteId
     *
     * Resposta esperada:
     * [
     *   { texto, data }
     * ]
     */
    async function getPacienteNotas(pacienteId) {
        return request(`/pacientes/${pacienteId}/notas`);
    }

    /**
     * Cria um novo paciente no sistema.
     * Chamado ao submeter o #form-paciente sem editandoId.
     *
     * [API] POST /pacientes
     *
     * @param {object} dados
     * @param {string} dados.nome
     * @param {string} dados.cpf
     * @param {string} dados.telefone
     * @param {string} [dados.nascimento]  - ISO date
     * @param {string} [dados.email]
     * @param {string} [dados.endereco]
     * @param {string} [dados.observacoes]
     *
     * Resposta esperada:
     * {
     *   id, nome, cpf, telefone, email, nascimento,
     *   endereco, status, cadastro, observacoes,
     *   exames: [], agendamentos: [], notas: []
     * }
     */
    async function postPaciente(dados) {
        return request('/pacientes', {
            method: 'POST',
            body: JSON.stringify(dados),
        });
    }

    /**
     * Atualiza os dados cadastrais de um paciente existente.
     * Chamado ao submeter o #form-paciente com editandoId preenchido.
     *
     * [API] PATCH /pacientes/:pacienteId
     *
     * @param {string} pacienteId
     * @param {object} dados  - apenas os campos alterados (parcial)
     * @param {string} [dados.nome]
     * @param {string} [dados.cpf]
     * @param {string} [dados.telefone]
     * @param {string} [dados.nascimento]
     * @param {string} [dados.email]
     * @param {string} [dados.endereco]
     * @param {string} [dados.observacoes]
     *
     * Resposta esperada: objeto paciente atualizado (mesmo formato de getPaciente)
     */
    async function updatePaciente(pacienteId, dados) {
        return request(`/pacientes/${pacienteId}`, {
            method: 'PATCH',
            body: JSON.stringify(dados),
        });
    }

    /**
     * Adiciona uma nova nota/observação ao paciente.
     * Chamado pelo botão #btn-add-nota na view de perfil.
     *
     * [API] POST /pacientes/:pacienteId/notas
     *
     * @param {string} pacienteId
     * @param {string} texto - conteúdo da nota
     *
     * Resposta esperada:
     * { texto, data }
     */
    async function postPacienteNota(pacienteId, texto) {
        return request(`/pacientes/${pacienteId}/notas`, {
            method: 'POST',
            body: JSON.stringify({ texto }),
        });
    }

    /* ===========================================================================
     12. FINANCEIRO — Visão Geral
     =========================================================================== */

    /**
     * Retorna o snapshot consolidado da aba Visão Geral filtrado por radiologia.
     * Substitui o MOCK_DATA_BY_RADIO — uma única chamada retorna KPIs, top clínicas,
     * top médicos e insights prontos para renderização.
     * Usar quando o filtro de radiologia mudar para evitar múltiplos fetches paralelos.
     *
     * [API] GET /financeiro/snapshot
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId  - 'all' | 'centro' | 'norte' | 'sul' | 'leste'
     * @param {string} filtros.periodo       - 'mes_atual' | 'ultimos_30' | 'trimestre' | 'semestre' | 'ano' | 'custom'
     * @param {string} [filtros.dataInicio]  - ISO date (apenas quando periodo === 'custom')
     * @param {string} [filtros.dataFim]     - ISO date (apenas quando periodo === 'custom')
     *
     * Resposta esperada:
     * {
     *   kpis: {
     *     faturamentoTotal:   { value, changeMonth, changeYoY },
     *     faturamentoLiquido: { value, context },
     *     margemLucro:        { value, changeMonth },
     *     totalExames:        { value, changeMonth },
     *     previsao30d:        { value, forecast60d },
     *   },
     *   topClinicas: [ { nome, faturamento, participacao } ],
     *   topMedicos:  [ { nome, clinica, exames, faturamento } ],
     *   insights:    [ { type: 'positive'|'warning'|'info', text } ],
     * }
     */
    async function getFinanceiroSnapshot(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/financeiro/snapshot${qs}`);
    }

    /**
     * Retorna os KPIs financeiros isolados da aba Visão Geral.
     * Alimenta os cards: #kpiTotalRevenue, #kpiNetRevenue, #kpiMargin,
     * #kpiTotalExams e #kpiForecast.
     *
     * [API] GET /financeiro/kpis
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * {
     *   faturamentoTotal:   { value, changeMonth, changeYoY },
     *   faturamentoLiquido: { value, context },
     *   margemLucro:        { value, changeMonth },
     *   totalExames:        { value, changeMonth },
     *   previsao30d:        { value, forecast60d },
     * }
     */
    async function getFinanceiroKPIs(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/financeiro/kpis${qs}`);
    }

    /**
     * Retorna a série temporal de faturamento e exames (12 meses por padrão).
     * Alimenta o gráfico de linha #evolutionChart com os toggles
     * "Faturamento / Exames" e a linha comparativa do ano anterior.
     *
     * [API] GET /financeiro/evolucao
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * {
     *   labels:         string[],   // ex: ['Ago/24', 'Set/24', ...]
     *   faturamento:    number[],
     *   exames:         number[],
     *   faturamentoAno: number[],   // mesmo período do ano anterior
     * }
     */
    async function getFinanceiroEvolucao(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/financeiro/evolucao${qs}`);
    }

    /**
     * Retorna faturamento e exames agregados por radiologia (quando radiologiaId = 'all')
     * ou por clínica (quando uma radiologia específica está selecionada).
     * Alimenta os gráficos #byRadiologyChart e #distribuicaoChart.
     *
     * [API] GET /financeiro/por-radiologia
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * [
     *   { id, label, faturamento, exames, variacao, participacao }
     * ]
     */
    async function getFinanceiroPorRadiologia(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/financeiro/por-radiologia${qs}`);
    }

    /**
     * Retorna o ranking de top clínicas por faturamento.
     * Alimenta o painel #highlightsPanel (top 5) e a tabela de resumo.
     *
     * [API] GET /financeiro/top-clinicas
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     * @param {number} [filtros.limite]      - padrão: 10
     *
     * Resposta esperada:
     * [
     *   { nome, faturamento, participacao }
     * ]
     */
    async function getFinanceiroTopClinicas(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
            limite: filtros.limite || 10,
        });
        return request(`/financeiro/top-clinicas${qs}`);
    }

    /**
     * Retorna o ranking de top médicos por faturamento gerado.
     * Alimenta o painel #highlightsPanel (top 5) e a tabela de resumo.
     *
     * [API] GET /financeiro/top-medicos
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     * @param {number} [filtros.limite]      - padrão: 15
     *
     * Resposta esperada:
     * [
     *   { nome, clinica, exames, faturamento }
     * ]
     */
    async function getFinanceiroTopMedicos(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
            limite: filtros.limite || 15,
        });
        return request(`/financeiro/top-medicos${qs}`);
    }

    /**
     * Retorna a distribuição de exames por tipo.
     * Alimenta o gráfico doughnut #examTypesChart.
     *
     * [API] GET /financeiro/tipos-exame
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * [
     *   { tipo, quantidade, participacao }
     * ]
     */
    async function getFinanceiroTiposExame(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/financeiro/tipos-exame${qs}`);
    }

    /**
     * Retorna o ticket médio atual e do período anterior por radiologia.
     * Alimenta o gráfico de barras duplas #avgTicketChart.
     *
     * [API] GET /financeiro/ticket-medio-por-radiologia
     *
     * @param {object} filtros
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * {
     *   labels:   string[],   // ex: ['Centro', 'Zona Norte', 'Zona Sul', 'Zona Leste']
     *   atual:    number[],
     *   anterior: number[],
     * }
     */
    async function getFinanceiroTicketMedioPorRadiologia(filtros = {}) {
        const qs = buildQuery({
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/financeiro/ticket-medio-por-radiologia${qs}`);
    }

    /**
     * Retorna os insights automáticos do período para o banner #insightsBar.
     *
     * [API] GET /financeiro/insights
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * [
     *   { type: 'positive' | 'warning' | 'info', text }
     * ]
     */
    async function getFinanceiroInsights(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/financeiro/insights${qs}`);
    }

    /**
     * Retorna a hierarquia completa radiologia → clínica → médico com dados
     * de faturamento, exames, variação, participação e ticket médio.
     * Alimenta a tree table #hierTableBody na aba Visão Geral.
     *
     * [API] GET /financeiro/hierarquia
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId
     * @param {string} filtros.periodo
     * @param {string} [filtros.dataInicio]
     * @param {string} [filtros.dataFim]
     *
     * Resposta esperada:
     * [
     *   {
     *     id, nome, exames, faturamento, variacao,
     *     clinicas: [
     *       {
     *         id, nome, exames, faturamento,
     *         medicos: [
     *           { id, nome, exames, faturamento }
     *         ]
     *       }
     *     ]
     *   }
     * ]
     */
    async function getFinanceiroHierarquia(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
        });
        return request(`/financeiro/hierarquia${qs}`);
    }


    /* ===========================================================================
       13. METAS
       =========================================================================== */

    /**
     * Retorna os dados de metas mensal e anual (geral e por radiologia).
     * Alimenta os cards #kpiGoalMonthly, #kpiGoalYearly, #metaUnitsList
     * e a tabela editável da aba Metas.
     *
     * [API] GET /metas
     *
     * @param {object} filtros
     * @param {string} filtros.radiologiaId  - 'all' retorna mensal+anual geral; id específico
     *                                         retorna apenas os dados daquela radiologia
     * @param {string} filtros.periodo
     *
     * Resposta esperada:
     * {
     *   mensal:    { meta, realizado },
     *   anual:     { meta, realizado },
     *   porRadiologia: [
     *     { id, nome, meta, anual, realizado, anoRealizado }
     *   ]
     * }
     */
    async function getMetas(filtros = {}) {
        const qs = buildQuery({
            radiologiaId: filtros.radiologiaId || 'all',
            periodo: filtros.periodo || 'mes_atual',
        });
        return request(`/metas${qs}`);
    }

    /**
     * Retorna o histórico de ajustes de metas (tabela #adjustmentHistoryBody).
     *
     * [API] GET /metas/historico
     *
     * Resposta esperada:
     * [
     *   { data, tipo, descricao, anterior, novo, responsavel }
     * ]
     */
    async function getMetasHistorico() {
        return request('/metas/historico');
    }

    /**
     * Salva o lote de edições de metas feitas na tabela (botão #btnSaveMetas).
     * Envia todas as radiologias editadas de uma vez.
     *
     * [API] POST /metas
     *
     * @param {object} edicoes - mapa radioId → { meta, anual }
     *   ex: { centro: { meta: 110000, anual: 1200000 }, norte: { meta: 90000, anual: 950000 } }
     *
     * Resposta esperada:
     * { sucesso: true, atualizadas: number }
     */
    async function postMetasSalvar(edicoes) {
        return request('/metas', {
            method: 'POST',
            body: JSON.stringify({ metas: edicoes }),
        });
    }

    /**
     * Atualiza a meta de uma radiologia específica via modal (#modalGoalBackdrop).
     * Chamado pelo botão #modalGoalConfirm.
     *
     * [API] PUT /metas/:radioId
     *
     * @param {string} radioId  - ex: 'centro'
     * @param {object} dados
     * @param {number} dados.meta   - nova meta mensal
     * @param {number} dados.anual  - nova meta anual
     *
     * Resposta esperada: objeto de meta atualizado
     * { id, nome, meta, anual, realizado, anoRealizado }
     */
    async function updateMeta(radioId, dados) {
        return request(`/metas/${radioId}`, {
            method: 'PUT',
            body: JSON.stringify(dados),
        });
    }


    /* ===========================================================================
       14. RELATÓRIOS
       =========================================================================== */

    /**
     * Retorna o histórico de relatórios gerados anteriormente.
     * Alimenta a tabela #reportHistoryBody.
     *
     * [API] GET /relatorios/historico
     *
     * Resposta esperada:
     * [
     *   { nome, periodo, radiologia, geradoEm, formato: 'PDF'|'Excel'|'CSV' }
     * ]
     */
    async function getRelatoriosHistorico() {
        return request('/relatorios/historico');
    }

    /**
     * Dispara a exportação de um relatório predefinido (botões [data-export]).
     * O backend gera o arquivo e retorna uma URL de download ou o binário direto.
     *
     * [API] GET /relatorios/exportar
     *
     * @param {object} params
     * @param {string} params.tipo         - ex: 'faturamento' | 'exames' | 'medicos'
     * @param {string} params.formato      - 'PDF' | 'Excel' | 'CSV'
     * @param {string} params.radiologiaId - 'all' | id específico
     * @param {string} params.periodo
     * @param {string} [params.dataInicio]
     * @param {string} [params.dataFim]
     *
     * Resposta esperada:
     * { url: string }   // URL assinada para download do arquivo gerado
     */
    async function getRelatorioExportar(params = {}) {
        const qs = buildQuery({
            tipo: params.tipo,
            formato: params.formato,
            radiologiaId: params.radiologiaId || 'all',
            periodo: params.periodo || 'mes_atual',
            dataInicio: params.dataInicio,
            dataFim: params.dataFim,
        });
        return request(`/relatorios/exportar${qs}`);
    }

    /**
     * Gera um relatório customizado com seleção de radiologias e colunas
     * (botão #btnGenerateCustom).
     *
     * [API] POST /relatorios/customizado
     *
     * @param {object} dados
     * @param {string}   dados.periodo
     * @param {string[]} dados.radiologias  - lista de IDs selecionados nos checkboxes
     * @param {string[]} dados.colunas      - lista de colunas selecionadas
     * @param {string}   [dados.formato]    - 'PDF' | 'Excel' | 'CSV'; padrão: 'PDF'
     * @param {string}   [dados.dataInicio]
     * @param {string}   [dados.dataFim]
     *
     * Resposta esperada:
     * { url: string }   // URL assinada para download do relatório gerado
     */
    async function postRelatorioCustomizado(dados) {
        return request('/relatorios/customizado', {
            method: 'POST',
            body: JSON.stringify(dados),
        });
    }

    /* ===========================================================================
     15. CONFIGURAÇÕES
     =========================================================================== */

    /**
     * Retorna as configurações gerais do sistema (dados da empresa, notificações
     * e regionalização). Alimenta toda a aba "Geral" de Configurações.
     *
     * [API] GET /configuracoes/geral
     *
     * Resposta esperada:
     * {
     *   systemName, systemTagline,
     *   companyName, companyFantasy, companyCNPJ,
     *   companyPhone, companyEmail, companySite, companyAddress,
     *   notifications: {
     *     email:    { enabled, from, admin, events: string[] },
     *     whatsapp: { enabled, number, token, events: string[] },
     *   },
     *   regionalization: { language, timezone, currency, dateFormat, timeFormat },
     * }
     */
    async function getConfiguracoesGeral() {
        return request('/configuracoes/geral');
    }

    /**
     * Salva as configurações gerais (botão #btnGeralSave).
     *
     * [API] POST /configuracoes/geral
     *
     * @param {object} dados
     * @param {string} dados.systemName
     * @param {string} dados.systemTagline
     * @param {string} dados.companyName
     * @param {string} dados.companyFantasy
     * @param {string} dados.companyCNPJ
     * @param {string} dados.companyPhone
     * @param {string} dados.companyEmail
     * @param {string} dados.companySite
     * @param {string} dados.companyAddress
     * @param {string} dados.language
     * @param {string} dados.timezone
     * @param {string} dados.currency
     * @param {string} dados.dateFormat
     * @param {string} dados.timeFormat
     *
     * Resposta esperada: { sucesso: true }
     */
    async function postConfiguracoesGeral(dados) {
        return request('/configuracoes/geral', {
            method: 'POST',
            body: JSON.stringify(dados),
        });
    }

    /**
     * Faz upload da logo do sistema (input #logoInput, max 2MB).
     * Envia multipart/form-data — não usa o helper request() padrão pois
     * o Content-Type precisa ser definido automaticamente pelo browser.
     *
     * [API] POST /configuracoes/logo
     *
     * @param {File} arquivo - objeto File do input type="file"
     *
     * Resposta esperada: { url: string }   // URL pública da nova logo
     */
    async function postConfiguracoesLogo(arquivo) {
        const formData = new FormData();
        formData.append('logo', arquivo);

        let response;
        try {
            response = await fetch(`${BASE_URL}/configuracoes/logo`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
                body: formData,
            });
        } catch (networkError) {
            throw new Error(`[IORD API] Falha de rede ao fazer upload da logo: ${networkError.message}`);
        }

        if (!response.ok) {
            throw new Error(`[IORD API] ${response.status} ${response.statusText} em "/configuracoes/logo"`);
        }

        return response.json();
    }

    /**
     * Retorna a lista de radiologias cadastradas no sistema.
     * Já existe como getRadiologias() (módulo 2) — reutilizar.
     * Esta entrada documenta o uso específico na aba Configurações.
     *
     * [API] GET /radiologias   → já coberto por getRadiologias()
     */

    /**
     * Cria uma nova radiologia (modal #modalRadiologyBackdrop, mode='create').
     *
     * [API] POST /radiologias
     *
     * @param {object} dados
     * @param {string} dados.name
     * @param {string} dados.phone
     * @param {string} dados.email
     * @param {string} dados.address
     * @param {string} dados.openTime    - 'HH:MM'
     * @param {string} dados.closeTime   - 'HH:MM'
     * @param {string} dados.technician
     * @param {string} dados.cro
     * @param {string} dados.status      - 'ativo' | 'inativo' | 'manutencao'
     * @param {string} dados.color       - hex, ex: '#018093'
     *
     * Resposta esperada: objeto radiologia criado (com id gerado pelo backend)
     */
    async function postRadiologia(dados) {
        return request('/radiologias', {
            method: 'POST',
            body: JSON.stringify(dados),
        });
    }

    /**
     * Atualiza os dados de uma radiologia existente (modal mode='edit').
     *
     * [API] PUT /radiologias/:radiologiaId
     *
     * @param {string} radiologiaId
     * @param {object} dados - mesmos campos de postRadiologia
     *
     * Resposta esperada: objeto radiologia atualizado
     */
    async function updateRadiologia(radiologiaId, dados) {
        return request(`/radiologias/${radiologiaId}`, {
            method: 'PUT',
            body: JSON.stringify(dados),
        });
    }

    /**
     * Exclui uma radiologia pelo ID (botão lixeira nos cards).
     *
     * [API] DELETE /radiologias/:radiologiaId
     *
     * @param {string} radiologiaId
     *
     * Resposta esperada: { sucesso: true }
     */
    async function deleteRadiologia(radiologiaId) {
        return request(`/radiologias/${radiologiaId}`, {
            method: 'DELETE',
        });
    }

    /**
     * Retorna a lista de clínicas cadastradas.
     * Alimenta a tabela #clinicsTableBody e o select de filtro de médicos.
     *
     * [API] GET /clinicas
     *
     * @param {object} [filtros]
     * @param {string} [filtros.busca]    - texto livre (nome, cidade)
     * @param {string} [filtros.status]   - 'ativo' | 'inativo'
     *
     * Resposta esperada:
     * [
     *   { id, name, city, state, phone, email, address, status }
     * ]
     */
    async function getClinicas(filtros = {}) {
        const qs = buildQuery({
            busca: filtros.busca,
            status: filtros.status,
        });
        return request(`/clinicas${qs}`);
    }

    /**
     * Cria uma nova clínica (modal #modalClinicBackdrop, mode='create').
     *
     * [API] POST /clinicas
     *
     * @param {object} dados
     * @param {string} dados.name
     * @param {string} dados.city
     * @param {string} dados.state
     * @param {string} dados.phone
     * @param {string} dados.email
     * @param {string} dados.address
     * @param {string} dados.status      - 'ativo' | 'inativo'
     *
     * Resposta esperada: objeto clínica criado (com id gerado pelo backend)
     */
    async function postClinica(dados) {
        return request('/clinicas', {
            method: 'POST',
            body: JSON.stringify(dados),
        });
    }

    /**
     * Atualiza os dados de uma clínica existente (modal mode='edit').
     *
     * [API] PUT /clinicas/:clinicaId
     *
     * @param {string} clinicaId
     * @param {object} dados - mesmos campos de postClinica
     *
     * Resposta esperada: objeto clínica atualizado
     */
    async function updateClinica(clinicaId, dados) {
        return request(`/clinicas/${clinicaId}`, {
            method: 'PUT',
            body: JSON.stringify(dados),
        });
    }

    /**
     * Exclui uma clínica pelo ID (botão lixeira na tabela).
     *
     * [API] DELETE /clinicas/:clinicaId
     *
     * @param {string} clinicaId
     *
     * Resposta esperada: { sucesso: true }
     */
    async function deleteClinica(clinicaId) {
        return request(`/clinicas/${clinicaId}`, {
            method: 'DELETE',
        });
    }

    /**
     * Retorna a lista de médicos cadastrados.
     * Já existe como getMedicos() (módulo 6) — reutilizar com filtros adicionais.
     * Aqui documenta o uso na aba Configurações (sem filtro de período).
     *
     * [API] GET /medicos
     *
     * @param {object} [filtros]
     * @param {string} [filtros.busca]      - texto livre (nome, especialidade)
     * @param {string} [filtros.clinicaId]  - filtra por clínica
     * @param {string} [filtros.status]     - 'ativo' | 'inativo'
     *
     * Resposta esperada:
     * [
     *   { id, name, specialty, clinicId, phone, email, status }
     * ]
     *
     * Nota: reutilizar getMedicos() passando os filtros acima.
     */

    /**
     * Cria um novo médico (modal #modalDoctorBackdrop, mode='create').
     *
     * [API] POST /medicos
     *
     * @param {object} dados
     * @param {string} dados.name
     * @param {string} dados.specialty    - 'ortodontia' | 'implantodontia' | 'endodontia' | ...
     * @param {string} dados.clinicId
     * @param {string} dados.phone
     * @param {string} dados.email
     * @param {string} dados.status       - 'ativo' | 'inativo'
     *
     * Resposta esperada: objeto médico criado (com id gerado pelo backend)
     */
    async function postMedico(dados) {
        return request('/medicos', {
            method: 'POST',
            body: JSON.stringify(dados),
        });
    }

    /**
     * Atualiza os dados de um médico existente (modal mode='edit').
     *
     * [API] PUT /medicos/:medicoId
     *
     * @param {string} medicoId
     * @param {object} dados - mesmos campos de postMedico
     *
     * Resposta esperada: objeto médico atualizado
     */
    async function updateMedico(medicoId, dados) {
        return request(`/medicos/${medicoId}`, {
            method: 'PUT',
            body: JSON.stringify(dados),
        });
    }

    /**
     * Exclui um médico pelo ID (botão lixeira na tabela).
     *
     * [API] DELETE /medicos/:medicoId
     *
     * @param {string} medicoId
     *
     * Resposta esperada: { sucesso: true }
     */
    async function deleteMedico(medicoId) {
        return request(`/medicos/${medicoId}`, {
            method: 'DELETE',
        });
    }

    /**
     * Retorna a lista de usuários do sistema.
     * Alimenta a tabela #usersTableBody e os KPIs da aba Usuários.
     *
     * [API] GET /usuarios
     *
     * @param {object} [filtros]
     * @param {string} [filtros.busca]    - texto livre (nome, e-mail)
     * @param {string} [filtros.level]    - 'admin' | 'recepcao' | 'viewer'
     * @param {string} [filtros.status]   - 'ativo' | 'pendente' | 'inativo'
     *
     * Resposta esperada:
     * [
     *   { id, name, email, phone, role, level, radiologia, lastAccess, status }
     * ]
     */
    async function getUsuarios(filtros = {}) {
        const qs = buildQuery({
            busca: filtros.busca,
            level: filtros.level,
            status: filtros.status,
        });
        return request(`/usuarios${qs}`);
    }

    /**
     * Cria um novo usuário (modal #modalUserBackdrop, mode='create').
     * O backend deve disparar e-mail de boas-vindas com senha temporária.
     *
     * [API] POST /usuarios
     *
     * @param {object} dados
     * @param {string} dados.name
     * @param {string} dados.email
     * @param {string} [dados.phone]
     * @param {string} [dados.role]       - cargo livre (ex: 'Recepcionista')
     * @param {string} dados.level        - 'admin' | 'recepcao' | 'viewer'
     * @param {string} dados.radiologia   - 'todas' | id da radiologia
     * @param {string} dados.status       - 'ativo' | 'pendente'
     *
     * Resposta esperada: objeto usuário criado (com id gerado pelo backend)
     */
    async function postUsuario(dados) {
        return request('/usuarios', {
            method: 'POST',
            body: JSON.stringify(dados),
        });
    }

    /**
     * Atualiza os dados de um usuário existente (modal mode='edit').
     *
     * [API] PUT /usuarios/:usuarioId
     *
     * @param {string} usuarioId
     * @param {object} dados - mesmos campos de postUsuario (sem lastAccess)
     *
     * Resposta esperada: objeto usuário atualizado
     */
    async function updateUsuario(usuarioId, dados) {
        return request(`/usuarios/${usuarioId}`, {
            method: 'PUT',
            body: JSON.stringify(dados),
        });
    }

    /**
     * Remove um usuário do sistema (botão lixeira na tabela).
     * O backend deve impedir a remoção do único administrador.
     *
     * [API] DELETE /usuarios/:usuarioId
     *
     * @param {string} usuarioId
     *
     * Resposta esperada: { sucesso: true }
     */
    async function deleteUsuario(usuarioId) {
        return request(`/usuarios/${usuarioId}`, {
            method: 'DELETE',
        });
    }

    /**
     * Retorna os parâmetros do sistema: durações de exame, mensagens de WhatsApp,
     * regras de agendamento e configurações financeiras.
     * Alimenta toda a aba "Parâmetros" de Configurações.
     *
     * [API] GET /parametros
     *
     * Resposta esperada:
     * {
     *   examDurations: [ { id, label, duration } ],
     *   whatsappMessages: [
     *     { id, event, active, text }
     *   ],
     *   scheduling: {
     *     antecedenciaMin, prazoCancelamento, enviarConfirmacao,
     *     intervaloMin, maxDia,
     *     exigirConfirmacaoLink, permitirReagendamento, bloquearAutomatico,
     *   },
     *   financial: {
     *     comissaoPadrao, impostos, vencimentoComissoes, formasPagamento,
     *   },
     * }
     */
    async function getParametros() {
        return request('/parametros');
    }

    /**
     * Salva os parâmetros do sistema (botão #btnParamSave).
     * Envia o objeto completo coletado pelo ParametrosModule.collectData().
     *
     * [API] POST /parametros
     *
     * @param {object} dados
     * @param {object} dados.durations        - { [examId]: number } duração em minutos
     * @param {Array}  dados.messages         - [ { id, active, text } ]
     * @param {object} dados.scheduling       - campos de agendamento
     * @param {object} dados.financial        - campos financeiros
     *
     * Resposta esperada: { sucesso: true }
     */
    async function postParametros(dados) {
        return request('/parametros', {
            method: 'POST',
            body: JSON.stringify(dados),
        });
    }
    /* ===========================================================================
       10. PERÍODO / FILTROS — Utilitários
       =========================================================================== */

    /**
     * Retorna os rótulos de período disponíveis para o <select id="periodFilter">.
     * Útil caso o backend gerencie os períodos disponíveis (ex: anos disponíveis
     * variam conforme dados no banco).
     *
     * [API] GET /periodos/opcoes
     *
     * Resposta esperada:
     * [
     *   { id: 'mes_atual',  label: 'Mês atual' },
     *   { id: 'ultimos_30', label: 'Últimos 30 dias' },
     *   { id: 'trimestre',  label: 'Trimestre' },
     *   { id: 'ano',        label: 'Ano' },
     *   { id: 'custom',     label: 'Personalizado' },
     * ]
     */
    async function getPeriodosOpcoes() {
        return request('/periodos/opcoes');
    }

    /**
     * Converte um objeto de filtros do AppState para os parâmetros de query
     * aceitos por todas as funções de requisição acima.
     * Útil para centralizar a construção dos filtros antes de qualquer chamada.
     *
     * @param {object} appState - objeto do AppState.getState()
     * @returns {object} filtros prontos para repassar às funções da API
     */
    function filtrosDoState(appState) {
        return {
            radiologiaId: appState.radiologiaSelecionada || 'all',
            periodo: appState.periodo || 'mes_atual',
            dataInicio: appState.customDateStart || undefined,
            dataFim: appState.customDateEnd || undefined,
        };
    }


    /* ===========================================================================
       INTERFACE PÚBLICA
       =========================================================================== */
    return {
        // 2. Radiologias
        getRadiologias,
        getRadiologia,

        // 3. KPIs financeiros
        getKPIs,

        // 4. Gráfico de linha
        getFaturamentoEvolucao,
        getExamesEvolucao,

        // 5. Gráfico de barras
        getFaturamentoPorEntidade,
        getExamesPorEntidade,

        // 6. Hierarquia
        getHierarquiaArvore,
        getClinicasPorRadiologia,
        getMedicos,

        // 7. Análise de exames
        getExamesKPIs,
        getExamesDistribuicaoPorTipo,
        getRankingClinicasPorExames,
        getRankingMedicosPorExames,
        getExamesDestaques,

        // 8. Médicos
        getMedicoExames,
        getMedicosSpotlight,
        getClinicasDisponiveisPorMedico,

        // 9. Comissões
        getComissoesKPIs,
        getComissoesPorMedico,
        getComissoesPorRadiologia,

        // 10. Utilitários
        getPeriodosOpcoes,
        filtrosDoState,

        // 11. Pacientes
        getPacientes,
        getPaciente,
        getPacienteKPIs,
        getPacienteExames,
        getPacienteAgendamentos,
        getPacienteNotas,
        postPaciente,
        updatePaciente,
        postPacienteNota,
        getAgendamentos,
        postAgendamento,
        updateAgendamento,

        // 12. Financeiro
        getFinanceiroSnapshot,
        getFinanceiroKPIs,
        getFinanceiroEvolucao,
        getFinanceiroPorRadiologia,
        getFinanceiroTopClinicas,
        getFinanceiroTopMedicos,
        getFinanceiroTiposExame,
        getFinanceiroTicketMedioPorRadiologia,
        getFinanceiroInsights,
        getFinanceiroHierarquia,

        // 13. Metas
        getMetas,
        getMetasHistorico,
        postMetasSalvar,
        updateMeta,

        // 14. Relatórios
        getRelatoriosHistorico,
        getRelatorioExportar,
        postRelatorioCustomizado,

        // 15. Configurações — Geral
        getConfiguracoesGeral,
        postConfiguracoesGeral,
        postConfiguracoesLogo,

        // 15. Configurações — Radiologias
        // getRadiologias / getRadiologia já exportados no módulo 2
        postRadiologia,
        updateRadiologia,
        deleteRadiologia,

        // 15. Configurações — Clínicas
        // getClinicas já coberto por getClinicasPorRadiologia no módulo 6
        getClinicas,
        postClinica,
        updateClinica,
        deleteClinica,

        // 15. Configurações — Médicos
        // getMedicos já exportado no módulo 6
        postMedico,
        updateMedico,
        deleteMedico,

        // 15. Configurações — Usuários
        getUsuarios,
        postUsuario,
        updateUsuario,
        deleteUsuario,

        // 15. Configurações — Parâmetros
        getParametros,
        postParametros,
    };

})();