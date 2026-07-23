# =============================================================================
# IORD — Backend Flask Completo
# app.py — arquivo único contendo todo o backend do sistema de gestão
#          de radiologia odontológica.
#
# Módulos internos (na ordem de declaração):
#   1.  Imports & configuração
#   2.  Helpers de resposta, validação e data
#   3.  Conexão com banco de dados
#   4.  Middleware de autenticação JWT
#   5.  Auth — login, logout, forgot-password, refresh
#   6.  Radiologias
#   7.  Clínicas
#   8.  Médicos
#   9.  Pacientes
#  10.  Exames — KPIs, evolução, comparativo, ranking, destaques
#  11.  Hierarquia — árvore radiologia → clínica → médico
#  12.  Comissões — KPIs, por médico, por radiologia
#  13.  Financeiro — snapshot, KPIs, evolução, por radiologia, tops, insights
#  14.  Metas
#  15.  Relatórios
#  16.  Configurações — geral, logo, parâmetros
#  17.  Usuários
#  18.  Períodos / utilitários
#  19.  Inicialização da app
# =============================================================================

import os
import re
import json
import math
import uuid
import logging
import datetime
from functools import wraps
from decimal import Decimal, ROUND_HALF_UP

import bcrypt
import jwt
import mysql.connector
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from dotenv import load_dotenv

# -----------------------------------------------------------------------------
# 1. CONFIGURAÇÃO
# -----------------------------------------------------------------------------

load_dotenv()

app = Flask(__name__)
CORS(app, origins="*", allow_headers=["Authorization", "Content-Type"])

# Variáveis de ambiente — copie o .env.example e preencha
DB_HOST     = os.getenv("DB_HOST",     "localhost")
DB_PORT     = int(os.getenv("DB_PORT", "3306"))
DB_NAME     = os.getenv("DB_NAME",     "iord")
DB_USER     = os.getenv("DB_USER",     "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
JWT_SECRET  = os.getenv("JWT_SECRET",  "TROQUE-ESTA-CHAVE-EM-PRODUCAO")
JWT_ALGO    = "HS256"
JWT_EXP_H   = int(os.getenv("JWT_EXP_HOURS", "8"))
UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("iord")


# -----------------------------------------------------------------------------
# 2. HELPERS DE RESPOSTA, VALIDAÇÃO E DATA
# -----------------------------------------------------------------------------

def ok(data=None, message="OK", **extra):
    """Resposta de sucesso padronizada."""
    body = {"success": True, "message": message}
    if data is not None:
        body["data"] = data
    body.update(extra)
    return jsonify(body), 200


def created(data=None, message="Criado com sucesso."):
    body = {"success": True, "message": message}
    if data is not None:
        body["data"] = data
    return jsonify(body), 201


def err(message="Erro desconhecido.", status=400, errors=None):
    """Resposta de erro padronizada."""
    body = {"success": False, "message": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status


def not_found(msg="Recurso não encontrado."):
    return err(msg, 404)


def unauthorized(msg="Não autorizado."):
    return err(msg, 401)


def forbidden(msg="Acesso negado."):
    return err(msg, 403)


def server_error(msg="Erro interno do servidor."):
    return err(msg, 500)


# --------------- Validadores ---------------

def validate_required(data: dict, fields: list):
    """Retorna lista de campos obrigatórios ausentes."""
    missing = [f for f in fields if not data.get(f)]
    return missing


def validate_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email.strip()))


def validate_cpf(cpf: str) -> bool:
    """Valida CPF (formato e dígitos verificadores)."""
    cpf = re.sub(r"\D", "", cpf)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for i in range(9, 11):
        s = sum(int(cpf[j]) * (i + 1 - j) for j in range(i))
        if int(cpf[i]) != (s * 10 % 11) % 10:
            return False
    return True


def validate_cnpj(cnpj: str) -> bool:
    """Valida CNPJ (formato e dígitos verificadores)."""
    cnpj = re.sub(r"\D", "", cnpj)
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False
    weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    weights2 = [6] + weights1
    for weights in (weights1, weights2):
        s = sum(int(cnpj[i]) * weights[i] for i in range(len(weights)))
        r = 11 - (s % 11)
        if int(cnpj[len(weights)]) != (r if r < 10 else 0):
            return False
    return True


def validate_phone(phone: str) -> bool:
    digits = re.sub(r"\D", "", phone)
    return 10 <= len(digits) <= 11


def to_decimal(value, default=0.0) -> float:
    """Converte Decimal para float com segurança."""
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def row_to_dict(cursor, row):
    """Converte uma linha do cursor para dicionário."""
    if row is None:
        return None
    columns = [desc[0] for desc in cursor.description]
    d = {}
    for col, val in zip(columns, row):
        if isinstance(val, Decimal):
            d[col] = float(val)
        elif isinstance(val, (datetime.date, datetime.datetime)):
            d[col] = val.isoformat()
        elif isinstance(val, datetime.timedelta):
            total = int(val.total_seconds())
            h, m = divmod(total // 60, 60)
            d[col] = f"{h:02d}:{m:02d}"
        else:
            d[col] = val
    return d


def rows_to_list(cursor, rows):
    return [row_to_dict(cursor, r) for r in rows]


# --------------- Datas / Períodos ---------------

def periodo_para_datas(periodo: str, data_inicio: str = None, data_fim: str = None):
    """
    Converte o string de período em (date_start, date_end).
    Retorna também o período anterior equivalente para cálculo de variação.
    """
    hoje = datetime.date.today()

    if periodo == "custom" and data_inicio and data_fim:
        di = datetime.date.fromisoformat(data_inicio)
        df = datetime.date.fromisoformat(data_fim)
        delta = (df - di).days + 1
        return di, df, di - datetime.timedelta(days=delta), df - datetime.timedelta(days=delta)

    if periodo == "mes_atual":
        di = hoje.replace(day=1)
        df = hoje
    elif periodo == "ultimos_30":
        di = hoje - datetime.timedelta(days=29)
        df = hoje
    elif periodo == "trimestre":
        di = hoje - datetime.timedelta(days=89)
        df = hoje
    elif periodo == "semestre":
        di = hoje - datetime.timedelta(days=179)
        df = hoje
    elif periodo == "ano":
        di = hoje.replace(month=1, day=1)
        df = hoje
    else:
        di = hoje.replace(day=1)
        df = hoje

    delta = (df - di).days + 1
    pi = di - datetime.timedelta(days=delta)
    pf = df - datetime.timedelta(days=delta)
    return di, df, pi, pf


def variacao_percentual(atual: float, anterior: float) -> float:
    if anterior == 0:
        return 100.0 if atual > 0 else 0.0
    return round((atual - anterior) / anterior * 100, 1)


# -----------------------------------------------------------------------------
# 3. CONEXÃO COM BANCO DE DADOS
# -----------------------------------------------------------------------------

def get_db():
    """Retorna conexão do banco para a requisição atual (via flask.g)."""
    if "db" not in g:
        try:
            g.db = mysql.connector.connect(
                host=DB_HOST,
                port=DB_PORT,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                charset="utf8mb4",
                use_pure=True,
                autocommit=False,
            )
        except mysql.connector.Error as e:
            log.error("Falha ao conectar ao banco: %s", e)
            raise
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        try:
            db.close()
        except Exception:
            pass


def query(sql: str, params=None, fetch="all"):
    """
    Executa uma query e retorna resultados como lista de dicts.
    fetch: 'all' | 'one' | 'none'
    """
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute(sql, params or ())
        if fetch == "all":
            rows = cur.fetchall()
            result = rows_to_list(cur, rows)
        elif fetch == "one":
            row = cur.fetchone()
            result = row_to_dict(cur, row)
        else:
            result = None
        db.commit()
        return result
    except mysql.connector.Error as e:
        db.rollback()
        log.error("Erro SQL: %s | Query: %s | Params: %s", e, sql[:200], params)
        raise
    finally:
        cur.close()


def insert(sql: str, params=None) -> int:
    """Executa INSERT e retorna o lastrowid."""
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute(sql, params or ())
        last_id = cur.lastrowid
        db.commit()
        return last_id
    except mysql.connector.Error as e:
        db.rollback()
        log.error("Erro INSERT: %s | Query: %s", e, sql[:200])
        raise
    finally:
        cur.close()


# -----------------------------------------------------------------------------
# 4. MIDDLEWARE DE AUTENTICAÇÃO JWT
# -----------------------------------------------------------------------------

def require_auth(f):
    """Decorator que exige JWT válido na requisição."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return unauthorized("Token de autenticação ausente.")
        token = auth_header[7:]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
            g.user = payload
        except jwt.ExpiredSignatureError:
            return unauthorized("Sessão expirada. Faça login novamente.")
        except jwt.InvalidTokenError:
            return unauthorized("Token inválido.")
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    """Decorator que exige nível admin."""
    @wraps(f)
    @require_auth
    def decorated(*args, **kwargs):
        if g.user.get("nivel") != "admin":
            return forbidden("Apenas administradores podem executar esta ação.")
        return f(*args, **kwargs)
    return decorated


def _gerar_token(usuario: dict, exp_hours: int = JWT_EXP_H) -> str:
    payload = {
        "sub":        str(usuario["id"]),
        "email":      usuario["email"],
        "nome":       usuario["nome"],
        "nivel":      usuario["nivel"],
        "radiologia": usuario.get("radiologia_id", "todas"),
        "exp":        datetime.datetime.utcnow() + datetime.timedelta(hours=exp_hours),
        "iat":        datetime.datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


# -----------------------------------------------------------------------------
# 5. AUTH — Login, Logout, Forgot-Password
# -----------------------------------------------------------------------------

@app.route("/v1/auth/login", methods=["POST"])
def auth_login():
    """
    [API] POST /auth/login
    Body: { email, password }
    Response: { token, user: { id, name, email, role, level, radiologia } }
    """
    data = request.get_json(silent=True) or {}
    email    = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    errors = []
    if not email:
        errors.append("E-mail é obrigatório.")
    elif not validate_email(email):
        errors.append("E-mail inválido.")
    if not password:
        errors.append("Senha é obrigatória.")
    elif len(password) < 6:
        errors.append("Senha deve ter pelo menos 6 caracteres.")
    if errors:
        return err("Dados inválidos.", 400, errors)

    usuario = query(
        "SELECT id, nome, email, senha_hash, cargo, nivel, radiologia_id, status "
        "FROM usuarios WHERE email = %s LIMIT 1",
        (email,), fetch="one"
    )

    if not usuario or usuario["status"] == "inativo":
        return err("E-mail ou senha incorretos.", 401)

    if usuario["status"] == "pendente":
        return err("Conta pendente de ativação.", 403)

    try:
        senha_ok = bcrypt.checkpw(password.encode(), usuario["senha_hash"].encode())
    except Exception:
        senha_ok = False

    if not senha_ok:
        return err("E-mail ou senha incorretos.", 401)

    # Atualiza último acesso
    query(
        "UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = %s",
        (usuario["id"],), fetch="none"
    )

    token = _gerar_token(usuario)

    return ok({
        "token": token,
        "user": {
            "id":         usuario["id"],
            "name":       usuario["nome"],
            "email":      usuario["email"],
            "role":       usuario.get("cargo") or "",
            "level":      usuario["nivel"],
            "radiologia": usuario.get("radiologia_id") or "todas",
        }
    }, "Login realizado com sucesso.")


@app.route("/v1/auth/forgot-password", methods=["POST"])
def auth_forgot_password():
    """
    [API] POST /auth/forgot-password
    Body: { email }
    Gera token de reset e (em produção) envia e-mail.
    """
    data  = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()

    if not email or not validate_email(email):
        return err("E-mail inválido.", 400)

    usuario = query("SELECT id FROM usuarios WHERE email = %s", (email,), fetch="one")

    # Por segurança, sempre retorna sucesso (não revela se o e-mail existe)
    if usuario:
        token_reset = str(uuid.uuid4())
        expira      = datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        query(
            "UPDATE usuarios SET reset_token = %s, reset_expira = %s WHERE id = %s",
            (token_reset, expira, usuario["id"]), fetch="none"
        )
        # TODO: enviar e-mail com link de reset contendo token_reset

    return ok(None, "Se o e-mail existir, você receberá um link de recuperação.")


@app.route("/v1/auth/reset-password", methods=["POST"])
def auth_reset_password():
    """
    [API] POST /auth/reset-password
    Body: { token, new_password }
    """
    data         = request.get_json(silent=True) or {}
    token_reset  = data.get("token", "")
    new_password = data.get("new_password", "")

    if not token_reset or not new_password or len(new_password) < 6:
        return err("Dados inválidos.", 400)

    usuario = query(
        "SELECT id FROM usuarios WHERE reset_token = %s AND reset_expira > NOW()",
        (token_reset,), fetch="one"
    )
    if not usuario:
        return err("Token inválido ou expirado.", 400)

    senha_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    query(
        "UPDATE usuarios SET senha_hash = %s, reset_token = NULL, reset_expira = NULL WHERE id = %s",
        (senha_hash, usuario["id"]), fetch="none"
    )

    return ok(None, "Senha redefinida com sucesso.")


@app.route("/v1/auth/google")
def auth_google():
    """
    [API] GET /auth/google
    Ponto de entrada do fluxo OAuth2 com Google.
    Em produção, redirecione para o provedor OAuth.
    """
    return err("Integração com Google ainda não configurada.", 501)


# -----------------------------------------------------------------------------
# 6. RADIOLOGIAS
# -----------------------------------------------------------------------------

@app.route("/v1/radiologias", methods=["GET"])
@require_auth
def listar_radiologias():
    """[API] GET /radiologias"""
    rows = query(
        "SELECT id, nome, telefone, email, endereco, "
        "       horario_abertura, horario_fechamento, tecnico, cro, status, cor "
        "FROM radiologias ORDER BY nome"
    )
    # Adiciona entrada "Todas" no início
    todas = {"id": "all", "nome": "Todas as Radiologias"}
    return ok([todas] + rows)


@app.route("/v1/radiologias/<radiologia_id>", methods=["GET"])
@require_auth
def detalhe_radiologia(radiologia_id):
    """[API] GET /radiologias/:radiologiaId"""
    row = query(
        "SELECT id, nome, telefone, email, endereco, "
        "       horario_abertura, horario_fechamento, tecnico, cro, status, cor "
        "FROM radiologias WHERE id = %s",
        (radiologia_id,), fetch="one"
    )
    if not row:
        return not_found("Radiologia não encontrada.")
    return ok(row)


@app.route("/v1/radiologias", methods=["POST"])
@require_admin
def criar_radiologia():
    """[API] POST /radiologias"""
    data = request.get_json(silent=True) or {}
    missing = validate_required(data, ["name"])
    if missing:
        return err("Campos obrigatórios ausentes.", 400, missing)

    # Gera ID a partir do nome
    slug = re.sub(r"[^a-z0-9]+", "_", data["name"].lower().strip()).strip("_")
    rad_id = f"rad_{slug}"

    # Verifica duplicidade
    exists = query("SELECT id FROM radiologias WHERE id = %s", (rad_id,), fetch="one")
    if exists:
        rad_id = f"rad_{slug}_{uuid.uuid4().hex[:4]}"

    query(
        "INSERT INTO radiologias (id, nome, telefone, email, endereco, "
        "horario_abertura, horario_fechamento, tecnico, cro, status, cor) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (rad_id, data["name"], data.get("phone"), data.get("email"),
         data.get("address"), data.get("openTime", "07:00"),
         data.get("closeTime", "18:00"), data.get("technician"),
         data.get("cro"), data.get("status", "ativo"),
         data.get("color", "#018093")),
        fetch="none"
    )

    nova = query("SELECT * FROM radiologias WHERE id = %s", (rad_id,), fetch="one")
    return created(nova, "Radiologia criada com sucesso.")


@app.route("/v1/radiologias/<radiologia_id>", methods=["PUT"])
@require_admin
def atualizar_radiologia(radiologia_id):
    """[API] PUT /radiologias/:radiologiaId"""
    data = request.get_json(silent=True) or {}
    exists = query("SELECT id FROM radiologias WHERE id = %s", (radiologia_id,), fetch="one")
    if not exists:
        return not_found("Radiologia não encontrada.")

    query(
        "UPDATE radiologias SET nome=%s, telefone=%s, email=%s, endereco=%s, "
        "horario_abertura=%s, horario_fechamento=%s, tecnico=%s, cro=%s, status=%s, cor=%s "
        "WHERE id = %s",
        (data.get("name"), data.get("phone"), data.get("email"),
         data.get("address"), data.get("openTime"), data.get("closeTime"),
         data.get("technician"), data.get("cro"),
         data.get("status", "ativo"), data.get("color", "#018093"),
         radiologia_id),
        fetch="none"
    )
    updated = query("SELECT * FROM radiologias WHERE id = %s", (radiologia_id,), fetch="one")
    return ok(updated, "Radiologia atualizada com sucesso.")


@app.route("/v1/radiologias/<radiologia_id>", methods=["DELETE"])
@require_admin
def deletar_radiologia(radiologia_id):
    """[API] DELETE /radiologias/:radiologiaId"""
    exists = query("SELECT id FROM radiologias WHERE id = %s", (radiologia_id,), fetch="one")
    if not exists:
        return not_found("Radiologia não encontrada.")

    # Verifica se há dados vinculados
    exames = query(
        "SELECT COUNT(*) as c FROM exames WHERE radiologia_id = %s", (radiologia_id,), fetch="one"
    )
    if exames and exames.get("c", 0) > 0:
        return err("Não é possível excluir uma radiologia com exames registrados.", 409)

    query("DELETE FROM radiologias WHERE id = %s", (radiologia_id,), fetch="none")
    return ok({"sucesso": True}, "Radiologia excluída com sucesso.")


@app.route("/v1/radiologias/<radiologia_id>/clinicas", methods=["GET"])
@require_auth
def clinicas_por_radiologia(radiologia_id):
    """[API] GET /radiologias/:radiologiaId/clinicas"""
    periodo = request.args.get("periodo", "mes_atual")
    data_inicio = request.args.get("dataInicio")
    data_fim = request.args.get("dataFim")
    di, df, _, _ = periodo_para_datas(periodo, data_inicio, data_fim)
    rows = query(
        "SELECT c.id, c.nome, c.cidade, c.estado, c.status, "
        "       COUNT(DISTINCT e.id) AS total_exames, "
        "       COALESCE(SUM(e.valor), 0) AS faturamento "
        "FROM clinicas c "
        "JOIN clinica_radiologia cr ON cr.clinica_id = c.id "
        "       AND cr.radiologia_id = %s "
        "LEFT JOIN exames e ON e.clinica_id = c.id "
        "       AND e.radiologia_id = %s "
        "       AND e.data_exame BETWEEN %s AND %s "
        "       AND e.status = 'realizado' "
        "GROUP BY c.id, c.nome, c.cidade, c.estado, c.status "
        "ORDER BY faturamento DESC",
        (radiologia_id, radiologia_id, di, df)
    )
    return ok(rows)


# -----------------------------------------------------------------------------
# 7. CLÍNICAS
# -----------------------------------------------------------------------------

@app.route("/v1/clinicas", methods=["GET"])
@require_auth
def listar_clinicas():
    """[API] GET /clinicas"""
    busca  = request.args.get("busca", "")
    status = request.args.get("status", "")

    sql    = "SELECT id, nome AS name, cidade AS city, estado AS state, " \
             "       telefone AS phone, email, endereco AS address, status " \
             "FROM clinicas WHERE 1=1"
    params = []

    if busca:
        sql += " AND (nome LIKE %s OR cidade LIKE %s)"
        like = f"%{busca}%"
        params += [like, like]
    if status:
        sql += " AND status = %s"
        params.append(status)

    sql += " ORDER BY nome"
    rows = query(sql, params)
    return ok(rows)


@app.route("/v1/clinicas", methods=["POST"])
@require_admin
def criar_clinica():
    """[API] POST /clinicas"""
    data = request.get_json(silent=True) or {}
    missing = validate_required(data, ["name"])
    if missing:
        return err("Campos obrigatórios ausentes.", 400, missing)

    if data.get("email") and not validate_email(data["email"]):
        return err("E-mail inválido.", 400)

    new_id = insert(
        "INSERT INTO clinicas (nome, cidade, estado, telefone, email, endereco, status) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (data["name"], data.get("city"), data.get("state"),
         data.get("phone"), data.get("email"), data.get("address"),
         data.get("status", "ativo"))
    )
    nova = query(
        "SELECT id, nome AS name, cidade AS city, estado AS state, "
        "telefone AS phone, email, endereco AS address, status FROM clinicas WHERE id = %s",
        (new_id,), fetch="one"
    )
    return created(nova, "Clínica criada com sucesso.")


@app.route("/v1/clinicas/<int:clinica_id>", methods=["PUT"])
@require_admin
def atualizar_clinica(clinica_id):
    """[API] PUT /clinicas/:clinicaId"""
    data = request.get_json(silent=True) or {}
    exists = query("SELECT id FROM clinicas WHERE id = %s", (clinica_id,), fetch="one")
    if not exists:
        return not_found("Clínica não encontrada.")

    if data.get("email") and not validate_email(data["email"]):
        return err("E-mail inválido.", 400)

    query(
        "UPDATE clinicas SET nome=%s, cidade=%s, estado=%s, telefone=%s, "
        "email=%s, endereco=%s, status=%s WHERE id = %s",
        (data.get("name"), data.get("city"), data.get("state"),
         data.get("phone"), data.get("email"), data.get("address"),
         data.get("status", "ativo"), clinica_id),
        fetch="none"
    )
    updated = query(
        "SELECT id, nome AS name, cidade AS city, estado AS state, "
        "telefone AS phone, email, endereco AS address, status FROM clinicas WHERE id = %s",
        (clinica_id,), fetch="one"
    )
    return ok(updated, "Clínica atualizada com sucesso.")


@app.route("/v1/clinicas/<int:clinica_id>", methods=["DELETE"])
@require_admin
def deletar_clinica(clinica_id):
    """[API] DELETE /clinicas/:clinicaId"""
    exists = query("SELECT id FROM clinicas WHERE id = %s", (clinica_id,), fetch="one")
    if not exists:
        return not_found("Clínica não encontrada.")

    count = query(
        "SELECT COUNT(*) AS c FROM medicos WHERE clinica_id = %s", (clinica_id,), fetch="one"
    )
    if count and count.get("c", 0) > 0:
        return err("Não é possível excluir clínica com médicos vinculados.", 409)

    query("DELETE FROM clinicas WHERE id = %s", (clinica_id,), fetch="none")
    return ok({"sucesso": True}, "Clínica excluída com sucesso.")


# -----------------------------------------------------------------------------
# 8. MÉDICOS
# -----------------------------------------------------------------------------

@app.route("/v1/medicos", methods=["GET"])
@require_auth
def listar_medicos():
    """[API] GET /medicos"""
    radiologia_id = request.args.get("radiologiaId", "all")
    clinica_id    = request.args.get("clinicaId")
    busca         = request.args.get("busca", "")
    status        = request.args.get("status", "")

    # Modo simples: só clinicaId (cascata do modal de agendamento)
    if clinica_id and not busca and not status:
        sql = """
            SELECT m.id, m.nome AS name, m.especialidade AS specialty,
                   m.clinica_id AS clinicId, m.telefone AS phone, m.email, m.status,
                   c.nome AS clinicaNome
            FROM medicos m
            JOIN clinicas c ON c.id = m.clinica_id
            WHERE m.clinica_id = %s AND m.status = 'ativo'
        """
        params = [clinica_id]

        if radiologia_id and radiologia_id != "all":
            sql += " AND EXISTS (SELECT 1 FROM medico_radiologia mr WHERE mr.medico_id = m.id AND mr.radiologia_id = %s)"
            params.append(radiologia_id)

        sql += " ORDER BY m.nome"
        rows = query(sql, params)
        return ok(rows)

    # Modo completo: com período e métricas (telas de relatório/dashboard)
    periodo     = request.args.get("periodo", "mes_atual")
    data_inicio = request.args.get("dataInicio")
    data_fim    = request.args.get("dataFim")
    di, df, _, _ = periodo_para_datas(periodo, data_inicio, data_fim)

    sql = """
        SELECT m.id, m.nome AS name, m.especialidade AS specialty,
               m.clinica_id AS clinicId, m.telefone AS phone, m.email, m.status,
               c.nome AS clinicaNome,
               mr.radiologia_id AS radiologiaId, r.nome AS radiologiaNome,
               COALESCE(SUM(CASE WHEN e.status='realizado'
                                  AND e.data_exame BETWEEN %s AND %s
                                  THEN 1 ELSE 0 END), 0) AS exames,
               COALESCE(SUM(CASE WHEN e.status='realizado'
                                  AND e.data_exame BETWEEN %s AND %s
                                  THEN e.valor ELSE 0 END), 0) AS faturamento,
               COALESCE(SUM(CASE WHEN co.status='pendente'
                                  AND e.data_exame BETWEEN %s AND %s
                                  THEN co.valor_comissao ELSE 0 END), 0) AS pendente,
               COALESCE(SUM(CASE WHEN e.data_exame BETWEEN %s AND %s
                                  THEN co.valor_comissao ELSE 0 END), 0) AS comissao
        FROM medicos m
        JOIN clinicas c ON c.id = m.clinica_id
        LEFT JOIN medico_radiologia mr ON mr.medico_id = m.id
        LEFT JOIN radiologias r ON r.id = mr.radiologia_id
        LEFT JOIN exames e ON e.medico_id = m.id
        LEFT JOIN comissoes co ON co.exame_id = e.id
        WHERE 1=1
    """
    params = [di, df, di, df, di, df, di, df]

    if radiologia_id and radiologia_id != "all":
        sql += " AND mr.radiologia_id = %s"
        params.append(radiologia_id)
    if clinica_id:
        sql += " AND m.clinica_id = %s"
        params.append(clinica_id)
    if busca:
        sql += " AND (m.nome LIKE %s OR m.especialidade LIKE %s)"
        like = f"%{busca}%"
        params += [like, like]
    if status:
        sql += " AND m.status = %s"
        params.append(status)

    sql += " GROUP BY m.id, m.nome, m.especialidade, m.clinica_id, m.telefone, m.email, m.status, c.nome, mr.radiologia_id, r.nome"
    sql += " ORDER BY faturamento DESC"

    rows = query(sql, params)
    return ok(rows)


@app.route("/v1/medicos", methods=["POST"])
@require_admin
def criar_medico():
    """[API] POST /medicos"""
    data = request.get_json(silent=True) or {}
    missing = validate_required(data, ["name", "clinicId"])
    if missing:
        return err("Campos obrigatórios ausentes.", 400, missing)

    if data.get("email") and not validate_email(data["email"]):
        return err("E-mail inválido.", 400)

    new_id = insert(
        "INSERT INTO medicos (nome, especialidade, clinica_id, telefone, email, status) "
        "VALUES (%s,%s,%s,%s,%s,%s)",
        (data["name"], data.get("specialty"), data["clinicId"],
         data.get("phone"), data.get("email"), data.get("status", "ativo"))
    )
    medico = query(
        "SELECT m.id, m.nome AS name, m.especialidade AS specialty, "
        "m.clinica_id AS clinicId, m.telefone AS phone, m.email, m.status "
        "FROM medicos m WHERE m.id = %s", (new_id,), fetch="one"
    )
    return created(medico, "Médico criado com sucesso.")


@app.route("/v1/medicos/<int:medico_id>", methods=["PUT"])
@require_admin
def atualizar_medico(medico_id):
    """[API] PUT /medicos/:medicoId"""
    data = request.get_json(silent=True) or {}
    exists = query("SELECT id FROM medicos WHERE id = %s", (medico_id,), fetch="one")
    if not exists:
        return not_found("Médico não encontrado.")

    if data.get("email") and not validate_email(data["email"]):
        return err("E-mail inválido.", 400)

    query(
        "UPDATE medicos SET nome=%s, especialidade=%s, clinica_id=%s, "
        "telefone=%s, email=%s, status=%s WHERE id = %s",
        (data.get("name"), data.get("specialty"), data.get("clinicId"),
         data.get("phone"), data.get("email"), data.get("status", "ativo"), medico_id),
        fetch="none"
    )
    updated = query(
        "SELECT m.id, m.nome AS name, m.especialidade AS specialty, "
        "m.clinica_id AS clinicId, m.telefone AS phone, m.email, m.status "
        "FROM medicos m WHERE m.id = %s", (medico_id,), fetch="one"
    )
    return ok(updated, "Médico atualizado com sucesso.")


@app.route("/v1/medicos/<int:medico_id>", methods=["DELETE"])
@require_admin
def deletar_medico(medico_id):
    """[API] DELETE /medicos/:medicoId"""
    exists = query("SELECT id FROM medicos WHERE id = %s", (medico_id,), fetch="one")
    if not exists:
        return not_found("Médico não encontrado.")
    query("DELETE FROM medicos WHERE id = %s", (medico_id,), fetch="none")
    return ok({"sucesso": True}, "Médico excluído com sucesso.")


@app.route("/v1/medicos/<int:medico_id>/exames", methods=["GET"])
@require_auth
def medico_exames(medico_id):
    """[API] GET /medicos/:medicoId/exames"""
    periodo     = request.args.get("periodo", "mes_atual")
    data_inicio = request.args.get("dataInicio")
    data_fim    = request.args.get("dataFim")
    di, df, _, _ = periodo_para_datas(periodo, data_inicio, data_fim)

    medico = query(
        "SELECT m.id, m.nome AS medicoNome, c.nome AS clinicaNome, r.nome AS radiologiaNome "
        "FROM medicos m "
        "JOIN clinicas c ON c.id = m.clinica_id "
        "LEFT JOIN medico_radiologia mr ON mr.medico_id = m.id "
        "LEFT JOIN radiologias r ON r.id = mr.radiologia_id "
        "WHERE m.id = %s LIMIT 1", (medico_id,), fetch="one"
    )
    if not medico:
        return not_found("Médico não encontrado.")

    totais = query(
        "SELECT COUNT(*) AS totalExames, COALESCE(SUM(valor),0) AS faturamento "
        "FROM exames WHERE medico_id = %s AND status='realizado' "
        "AND data_exame BETWEEN %s AND %s",
        (medico_id, di, df), fetch="one"
    )

    tipos = query(
        "SELECT te.label AS tipo, COUNT(*) AS exames "
        "FROM exames e "
        "JOIN tipos_exame te ON te.id = e.tipo_exame_id "
        "WHERE e.medico_id = %s AND e.status='realizado' "
        "AND e.data_exame BETWEEN %s AND %s "
        "GROUP BY te.label ORDER BY exames DESC",
        (medico_id, di, df)
    )

    return ok({
        "medicoId":       medico_id,
        "medicoNome":     medico.get("medicoNome"),
        "clinicaNome":    medico.get("clinicaNome"),
        "radiologiaNome": medico.get("radiologiaNome"),
        "totalExames":    totais.get("totalExames", 0) if totais else 0,
        "faturamento":    to_decimal(totais.get("faturamento", 0)) if totais else 0,
        "tiposDeExame":   tipos,
    })


@app.route("/v1/medicos/spotlight", methods=["GET"])
@require_auth
def medicos_spotlight():
    """[API] GET /medicos/spotlight"""
    radiologia_id = request.args.get("radiologiaId", "all")
    clinica_id    = request.args.get("clinicaId")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    limite        = int(request.args.get("limite", 5))
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    sql = """
        SELECT m.id AS medicoId, m.nome AS medicoNome,
               c.nome AS clinicaNome, r.nome AS radiologiaNome,
               COUNT(e.id) AS totalExames,
               COALESCE(SUM(e.valor), 0) AS faturamento
        FROM medicos m
        JOIN clinicas c ON c.id = m.clinica_id
        LEFT JOIN medico_radiologia mr ON mr.medico_id = m.id
        LEFT JOIN radiologias r ON r.id = mr.radiologia_id
        LEFT JOIN exames e ON e.medico_id = m.id
               AND e.status='realizado'
               AND e.data_exame BETWEEN %s AND %s
        WHERE 1=1
    """
    params = [di, df]

    if radiologia_id != "all":
        sql += " AND r.id = %s"
        params.append(radiologia_id)
    if clinica_id:
        sql += " AND m.clinica_id = %s"
        params.append(clinica_id)

    sql += " GROUP BY m.id, m.nome, c.nome, r.nome ORDER BY totalExames DESC LIMIT %s"
    params.append(limite)

    medicos_top = query(sql, params)

    # Para cada médico, busca breakdown de tipos
    for med in medicos_top:
        tipos = query(
            "SELECT te.label AS tipo, COUNT(*) AS exames "
            "FROM exames e JOIN tipos_exame te ON te.id = e.tipo_exame_id "
            "WHERE e.medico_id = %s AND e.status='realizado' "
            "AND e.data_exame BETWEEN %s AND %s "
            "GROUP BY te.label ORDER BY exames DESC LIMIT 5",
            (med["medicoId"], di, df)
        )
        med["tiposDeExame"] = tipos

    return ok(medicos_top)


@app.route("/v1/medicos/clinicas-disponiveis", methods=["GET"])
@require_auth
def medicos_clinicas_disponiveis():
    """[API] GET /medicos/clinicas-disponiveis"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    di, df, _, _  = periodo_para_datas(periodo)

    if radiologia_id == "all":
        rows = query(
            "SELECT DISTINCT c.id AS clinicaId, c.nome AS clinicaNome "
            "FROM clinicas c "
            "JOIN medicos m ON m.clinica_id = c.id "
            "JOIN exames e ON e.medico_id = m.id "
            "WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
            "ORDER BY c.nome", (di, df)
        )
    else:
        rows = query(
            "SELECT DISTINCT c.id AS clinicaId, c.nome AS clinicaNome "
            "FROM clinicas c "
            "JOIN medicos m ON m.clinica_id = c.id "
            "JOIN medico_radiologia mr ON mr.medico_id = m.id "
            "JOIN exames e ON e.medico_id = m.id "
            "WHERE mr.radiologia_id = %s AND e.status='realizado' "
            "AND e.data_exame BETWEEN %s AND %s "
            "ORDER BY c.nome", (radiologia_id, di, df)
        )

    todas = {"clinicaId": "all", "clinicaNome": "Todas as Clínicas"}
    return ok([todas] + rows)


# -----------------------------------------------------------------------------
# 9. PACIENTES
# -----------------------------------------------------------------------------

@app.route("/v1/agendamentos", methods=["GET"])
@require_auth
def listar_agendamentos():
    """[API] GET /agendamentos — lista com filtros por radiologia, data e status."""
    radiologia_id = request.args.get("radiologiaId")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    status        = request.args.get("status")
    busca         = request.args.get("busca", "")

    sql = """
        SELECT
            a.id,
            a.paciente_id      AS pacienteId,
            p.nome             AS paciente,
            p.telefone         AS pacienteTelefone,
            p.cpf              AS pacienteCpf,
            DATE_FORMAT(p.nascimento, '%Y-%m-%d') AS pacienteNascimento,
            CASE
                WHEN p.nascimento IS NOT NULL
                THEN TIMESTAMPDIFF(YEAR, p.nascimento, CURDATE())
                ELSE NULL
            END                AS pacienteIdade,
            a.radiologia_id    AS radiologiaId,
            r.nome             AS radiologiaNome,
            a.clinica_id       AS clinicaId,
            c.nome             AS clinica,
            a.medico_id        AS medicoId,
            m.nome             AS medico,
            a.tipo_exame_id    AS tipoExameId,
            te.label           AS tipoExame,
            DATE_FORMAT(a.data_agendamento, '%Y-%m-%d') AS data,
            TIME_FORMAT(a.hora_agendamento, '%H:%i')     AS horarioInicio,
            TIME_FORMAT(
                ADDTIME(a.hora_agendamento, SEC_TO_TIME(te.duracao_min * 60)),
                '%H:%i'
            )                                              AS horarioFim,
            te.duracao_min     AS duracaoMin,
            te.valor_base      AS valor,
            a.status,
            a.observacoes,
            a.criado_em        AS criadoEm
        FROM agendamentos a
        JOIN pacientes   p  ON p.id  = a.paciente_id
        JOIN radiologias r  ON r.id  = a.radiologia_id
        LEFT JOIN clinicas  c  ON c.id  = a.clinica_id
        LEFT JOIN medicos   m  ON m.id  = a.medico_id
        JOIN tipos_exame te  ON te.id = a.tipo_exame_id
        WHERE 1=1
    """
    params = []

    if radiologia_id and radiologia_id != "all":
        sql += " AND a.radiologia_id = %s"
        params.append(radiologia_id)

    if data_inicio:
        sql += " AND a.data_agendamento >= %s"
        params.append(data_inicio)

    if data_fim:
        sql += " AND a.data_agendamento <= %s"
        params.append(data_fim)

    if status and status != "all":
        sql += " AND a.status = %s"
        params.append(status)

    if busca:
        like = f"%{busca}%"
        sql += " AND (p.nome LIKE %s OR te.label LIKE %s OR m.nome LIKE %s)"
        params += [like, like, like]

    sql += " ORDER BY a.data_agendamento, a.hora_agendamento"

    rows = query(sql, params)

    result = []
    for row in rows:
        item = {}
        for k, v in row.items():
            if isinstance(v, Decimal):
                item[k] = float(v)
            elif isinstance(v, (datetime.date, datetime.datetime)):
                item[k] = v.isoformat()
            else:
                item[k] = v
        # Garante que id venha como string para comparação segura no JS
        if "id" in item and item["id"] is not None:
            item["id"] = str(item["id"])
        result.append(item)

    return ok(result)

def _gerar_id_paciente():
    """Gera ID sequencial P-NNNN."""
    row = query("SELECT id FROM pacientes ORDER BY criado_em DESC LIMIT 1", fetch="one")
    if not row:
        return "P-0001"
    last_id = row["id"]  # ex: 'P-0042'
    num = int(last_id.split("-")[1]) + 1
    return f"P-{num:04d}"

@app.route("/v1/agendamentos", methods=["POST"])
@require_auth
def criar_agendamento():
    """[API] POST /agendamentos"""
    data = request.get_json(silent=True) or {}

    # Busca ou cria paciente pelo nome/telefone
    paciente_id = data.get("pacienteId")

    # Se não veio pacienteId, cria um paciente básico
    if not paciente_id:
        nome     = data.get("paciente", "").strip()
        telefone = data.get("pacienteTelefone", "").strip()
        cpf      = data.get("pacienteCpf", "").strip()
        nascimento = data.get("pacienteNascimento") or None   # ← AAAA-MM-DD

        if not nome:
            return err("Nome do paciente é obrigatório.", 400)

        # Verifica se já existe pelo CPF
        if cpf:
            cpf_limpo = re.sub(r"\D", "", cpf)
            cpf_fmt   = f"{cpf_limpo[:3]}.{cpf_limpo[3:6]}.{cpf_limpo[6:9]}-{cpf_limpo[9:]}" if len(cpf_limpo) == 11 else cpf
            existing  = query("SELECT id FROM pacientes WHERE cpf = %s", (cpf_fmt,), fetch="one")
            if existing:
                paciente_id = existing["id"]

        if not paciente_id:
            paciente_id = _gerar_id_paciente()
            query(
                "INSERT INTO pacientes (id, nome, cpf, telefone, nascimento) VALUES (%s,%s,%s,%s,%s)",
                (paciente_id, nome, cpf or None, telefone or None, nascimento),
                fetch="none"
            )

    # Busca tipo de exame pelo label
    tipo_exame_id = data.get("tipoExameId")
    if not tipo_exame_id:
        tipo_label = data.get("tipoExame", "")
        te = query("SELECT id FROM tipos_exame WHERE label = %s", (tipo_label,), fetch="one")
        if not te:
            return err(f"Tipo de exame '{tipo_label}' não encontrado.", 400)
        tipo_exame_id = te["id"]

    # Busca médico pelo nome se veio nome em vez de ID
    medico_id = data.get("medicoId")
    if not medico_id and data.get("medico"):
        med = query("SELECT id FROM medicos WHERE nome = %s", (data["medico"],), fetch="one")
        if med:
            medico_id = med["id"]

    # Busca clínica pelo nome se veio nome em vez de ID
    clinica_id = data.get("clinicaId")
    if not clinica_id and data.get("clinica"):
        cli = query("SELECT id FROM clinicas WHERE nome = %s", (data["clinica"],), fetch="one")
        if cli:
            clinica_id = cli["id"]

    missing = []
    if not data.get("radiologiaId"): missing.append("radiologiaId")
    if not data.get("data"):         missing.append("data")
    if not data.get("horarioInicio"): missing.append("horarioInicio")
    if missing:
        return err("Campos obrigatórios ausentes.", 400, missing)

    new_id = insert(
        "INSERT INTO agendamentos (paciente_id, radiologia_id, clinica_id, medico_id, "
        "tipo_exame_id, data_agendamento, hora_agendamento, status, observacoes) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (paciente_id, data["radiologiaId"], clinica_id, medico_id,
         tipo_exame_id, data["data"], data["horarioInicio"],
         data.get("status", "agendado"), data.get("observacoes"))
    )

    return created({"id": new_id}, "Agendamento criado com sucesso.")


@app.route("/v1/agendamentos/<int:agendamento_id>", methods=["PATCH"])
@require_auth
def atualizar_agendamento(agendamento_id):
    """[API] PATCH /agendamentos/:id"""
    data   = request.get_json(silent=True) or {}
    existe = query("SELECT id FROM agendamentos WHERE id = %s", (agendamento_id,), fetch="one")
    if not existe:
        return not_found("Agendamento não encontrado.")

    sets, params = [], []

    # Campos do agendamento
    campos = {
        "status":        "status",
        "observacoes":   "observacoes",
        "data":          "data_agendamento",
        "horarioInicio": "hora_agendamento",
        "horarioFim":    "hora_fim",
        "radiologiaId":  "radiologia_id",
        "clinicaId":     "clinica_id",
        "medicoId":      "medico_id",
        "tipoExameId":   "tipo_exame_id"
    }

    for chave, coluna in campos.items():
        if chave in data and data[chave] is not None:
            sets.append(f"{coluna} = %s")
            params.append(data[chave])

    # Tipo de exame por label (fallback)
    if "tipoExame" in data and data["tipoExame"] and not any(k == "tipoExameId" for k in data):
        te = query("SELECT id FROM tipos_exame WHERE label = %s", (data["tipoExame"],), fetch="one")
        if te:
            sets.append("tipo_exame_id = %s")
            params.append(te["id"])

    # Atualiza dados do paciente (se vier algum)
    paciente_row = query(
        "SELECT paciente_id FROM agendamentos WHERE id = %s", (agendamento_id,), fetch="one"
    )

    if paciente_row and paciente_row.get("paciente_id"):
        p_id = paciente_row["paciente_id"]
        p_sets, p_params = [], []

        if data.get("paciente"):
            p_sets.append("nome = %s")
            p_params.append(data["paciente"])
        if data.get("pacienteCpf"):
            p_sets.append("cpf = %s")
            p_params.append(data["pacienteCpf"])
        if data.get("pacienteTelefone"):
            p_sets.append("telefone = %s")
            p_params.append(data["pacienteTelefone"])
        if data.get("pacienteNascimento"):
            p_sets.append("nascimento = %s")
            p_params.append(data["pacienteNascimento"])

        if p_sets:
            p_params.append(p_id)
            query(
                f"UPDATE pacientes SET {', '.join(p_sets)} WHERE id = %s",
                p_params, fetch="none"
            )

    if not sets:
        # Só dados do paciente foram atualizados — ainda é sucesso
        return ok({}, "Agendamento atualizado com sucesso.")

    params.append(agendamento_id)
    query(f"UPDATE agendamentos SET {', '.join(sets)} WHERE id = %s", params, fetch="none")

    return ok({}, "Agendamento atualizado com sucesso.")

@app.route("/v1/agendamentos/<int:agendamento_id>", methods=["DELETE"])
@require_auth
def deletar_agendamento(agendamento_id):
    """[API] DELETE /agendamentos/:id — cancela (soft delete via status)"""
    existe = query("SELECT id FROM agendamentos WHERE id = %s", (agendamento_id,), fetch="one")
    if not existe:
        return not_found("Agendamento não encontrado.")
    query(
        "UPDATE agendamentos SET status = 'cancelado' WHERE id = %s",
        (agendamento_id,), fetch="none"
    )
    return ok({}, "Agendamento cancelado com sucesso.")

@app.route("/v1/pacientes", methods=["GET"])
@require_auth
def listar_pacientes():
    """[API] GET /pacientes — lista paginada com busca e filtros."""
    busca       = request.args.get("busca", "")
    busca_scope = request.args.get("buscaScope", "todos")
    filtro      = request.args.get("filtroRapido", "todos")
    pagina      = max(1, int(request.args.get("pagina", 1)))
    por_pagina  = max(1, min(100, int(request.args.get("porPagina", 8))))
    offset      = (pagina - 1) * por_pagina

    sql    = "SELECT SQL_CALC_FOUND_ROWS p.id, p.nome, p.cpf, p.telefone, p.email, " \
             "p.nascimento, p.endereco, p.status, p.criado_em AS cadastro, p.observacoes " \
             "FROM pacientes p WHERE 1=1"
    params = []

    # Busca textual
    if busca:
        like = f"%{busca}%"
        if busca_scope == "nome":
            sql += " AND p.nome LIKE %s"; params.append(like)
        elif busca_scope == "cpf":
            sql += " AND p.cpf LIKE %s"; params.append(like)
        elif busca_scope == "telefone":
            sql += " AND p.telefone LIKE %s"; params.append(like)
        elif busca_scope == "codigo":
            sql += " AND p.id LIKE %s"; params.append(like)
        else:
            sql += " AND (p.nome LIKE %s OR p.cpf LIKE %s OR p.telefone LIKE %s OR p.id LIKE %s)"
            params += [like, like, like, like]

    # Filtros rápidos
    hoje = datetime.date.today()
    if filtro == "ativos":
        sql += " AND p.status = 'ativo'"
    elif filtro == "novos":
        inicio_mes = hoje.replace(day=1)
        sql += " AND p.criado_em >= %s"
        params.append(inicio_mes)
    elif filtro == "agendamentos":
        sql += " AND EXISTS (SELECT 1 FROM agendamentos a WHERE a.paciente_id = p.id " \
               "AND a.data_agendamento >= %s AND a.status IN ('agendado','confirmado'))"
        params.append(hoje)

    sql += " ORDER BY p.nome LIMIT %s OFFSET %s"
    params += [por_pagina, offset]

    db   = get_db()
    cur  = db.cursor()
    cur.execute(sql, params)
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    cur.execute("SELECT FOUND_ROWS()")
    total = cur.fetchone()[0]
    cur.close()

    pacientes_list = []
    for row in rows:
        p = {}
        for col, val in zip(cols, row):
            if isinstance(val, Decimal):
                p[col] = float(val)
            elif isinstance(val, (datetime.date, datetime.datetime)):
                p[col] = val.isoformat()
            else:
                p[col] = val
        pacientes_list.append(p)

    return ok({
        "total":    total,
        "pagina":   pagina,
        "paginas":  math.ceil(total / por_pagina),
        "itens":    pacientes_list,
    })


@app.route("/v1/pacientes/<paciente_id>", methods=["GET"])
@require_auth
def detalhe_paciente(paciente_id):
    """[API] GET /pacientes/:pacienteId"""
    paciente = query(
        "SELECT id, nome, cpf, telefone, email, nascimento, endereco, "
        "status, criado_em AS cadastro, observacoes FROM pacientes WHERE id = %s",
        (paciente_id,), fetch="one"
    )
    if not paciente:
        return not_found("Paciente não encontrado.")

    exames = query(
        "SELECT DATE_FORMAT(e.data_exame,'%%Y-%%m-%%d') AS data, te.label AS tipo, "
        "       r.nome AS unidade, e.valor, e.status "
        "FROM exames e "
        "JOIN tipos_exame te ON te.id = e.tipo_exame_id "
        "JOIN radiologias r ON r.id = e.radiologia_id "
        "WHERE e.paciente_id = %s ORDER BY e.data_exame DESC",
        (paciente_id,)
    )

    agendamentos = query(
        "SELECT DATE_FORMAT(a.data_agendamento,'%%Y-%%m-%%d') AS data, "
        "       TIME_FORMAT(a.hora_agendamento,'%%H:%%i') AS hora, "
        "       r.nome AS unidade, te.label AS tipo, a.status "
        "FROM agendamentos a "
        "JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        "JOIN radiologias r ON r.id = a.radiologia_id "
        "WHERE a.paciente_id = %s ORDER BY a.data_agendamento DESC",
        (paciente_id,)
    )

    notas = query(
        "SELECT texto, DATE_FORMAT(criado_em,'%%Y-%%m-%%dT%%H:%%i:%%s') AS data "
        "FROM paciente_notas WHERE paciente_id = %s ORDER BY criado_em DESC",
        (paciente_id,)
    )

    paciente["exames"]       = exames
    paciente["agendamentos"] = agendamentos
    paciente["notas"]        = notas
    return ok(paciente)


@app.route("/v1/pacientes/<paciente_id>/kpis", methods=["GET"])
@require_auth
def paciente_kpis(paciente_id):
    """[API] GET /pacientes/:pacienteId/kpis"""
    paciente = query(
        "SELECT criado_em AS dataCadastro FROM pacientes WHERE id = %s",
        (paciente_id,), fetch="one"
    )
    if not paciente:
        return not_found("Paciente não encontrado.")

    totais = query(
        "SELECT COUNT(*) AS totalExames, COALESCE(SUM(valor),0) AS totalGasto "
        "FROM exames WHERE paciente_id = %s AND status='realizado'",
        (paciente_id,), fetch="one"
    )

    freq = query(
        "SELECT r.nome AS unidade, COUNT(*) AS visitas "
        "FROM exames e JOIN radiologias r ON r.id = e.radiologia_id "
        "WHERE e.paciente_id = %s AND e.status='realizado' "
        "GROUP BY r.id, r.nome ORDER BY visitas DESC LIMIT 1",
        (paciente_id,), fetch="one"
    )

    return ok({
        "totalExames":          totais.get("totalExames", 0) if totais else 0,
        "totalGasto":           to_decimal(totais.get("totalGasto", 0)) if totais else 0,
        "dataCadastro":         paciente.get("dataCadastro"),
        "unidadeMaisFrequente": freq.get("unidade") if freq else None,
        "visitasUnidadeFreq":   freq.get("visitas", 0) if freq else 0,
    })


@app.route("/v1/pacientes/<paciente_id>/exames", methods=["GET"])
@require_auth
def paciente_exames(paciente_id):
    """[API] GET /pacientes/:pacienteId/exames"""
    tipo        = request.args.get("tipo")
    data_inicio = request.args.get("dataInicio")
    data_fim    = request.args.get("dataFim")

    sql    = ("SELECT DATE_FORMAT(e.data_exame,'%%Y-%%m-%%d') AS data, "
              "te.label AS tipo, r.nome AS unidade, e.valor, e.status "
              "FROM exames e "
              "JOIN tipos_exame te ON te.id = e.tipo_exame_id "
              "JOIN radiologias r ON r.id = e.radiologia_id "
              "WHERE e.paciente_id = %s")
    params = [paciente_id]

    if tipo:
        sql += " AND te.label = %s"; params.append(tipo)
    if data_inicio:
        sql += " AND e.data_exame >= %s"; params.append(data_inicio)
    if data_fim:
        sql += " AND e.data_exame <= %s"; params.append(data_fim)
    sql += " ORDER BY e.data_exame DESC"

    rows = query(sql, params)
    return ok(rows)


@app.route("/v1/pacientes/<paciente_id>/agendamentos", methods=["GET"])
@require_auth
def paciente_agendamentos(paciente_id):
    """[API] GET /pacientes/:pacienteId/agendamentos"""
    status      = request.args.get("status")
    data_inicio = request.args.get("dataInicio")
    data_fim    = request.args.get("dataFim")

    sql = ("SELECT DATE_FORMAT(a.data_agendamento,'%%Y-%%m-%%d') AS data, "
           "TIME_FORMAT(a.hora_agendamento,'%%H:%%i') AS hora, "
           "r.nome AS unidade, te.label AS tipo, a.status "
           "FROM agendamentos a "
           "JOIN tipos_exame te ON te.id = a.tipo_exame_id "
           "JOIN radiologias r ON r.id = a.radiologia_id "
           "WHERE a.paciente_id = %s")
    params = [paciente_id]

    if status:
        sql += " AND a.status = %s"; params.append(status)
    if data_inicio:
        sql += " AND a.data_agendamento >= %s"; params.append(data_inicio)
    if data_fim:
        sql += " AND a.data_agendamento <= %s"; params.append(data_fim)
    sql += " ORDER BY a.data_agendamento DESC"

    rows = query(sql, params)
    return ok(rows)


@app.route("/v1/pacientes/<paciente_id>/notas", methods=["GET"])
@require_auth
def paciente_notas_get(paciente_id):
    """[API] GET /pacientes/:pacienteId/notas"""
    rows = query(
        "SELECT texto, DATE_FORMAT(criado_em,'%%Y-%%m-%%dT%%H:%%i:%%s') AS data "
        "FROM paciente_notas WHERE paciente_id = %s ORDER BY criado_em DESC",
        (paciente_id,)
    )
    return ok(rows)


@app.route("/v1/pacientes/<paciente_id>/notas", methods=["POST"])
@require_auth
def paciente_notas_post(paciente_id):
    """[API] POST /pacientes/:pacienteId/notas"""
    data  = request.get_json(silent=True) or {}
    texto = str(data.get("texto", "")).strip()
    if not texto:
        return err("O campo 'texto' é obrigatório.", 400)

    existe = query("SELECT id FROM pacientes WHERE id = %s", (paciente_id,), fetch="one")
    if not existe:
        return not_found("Paciente não encontrado.")

    insert(
        "INSERT INTO paciente_notas (paciente_id, texto) VALUES (%s, %s)",
        (paciente_id, texto)
    )
    nota = query(
        "SELECT texto, DATE_FORMAT(criado_em,'%%Y-%%m-%%dT%%H:%%i:%%s') AS data "
        "FROM paciente_notas WHERE paciente_id = %s ORDER BY criado_em DESC LIMIT 1",
        (paciente_id,), fetch="one"
    )
    return created(nota, "Nota adicionada com sucesso.")


@app.route("/v1/pacientes", methods=["POST"])
@require_auth
def criar_paciente():
    """[API] POST /pacientes"""
    data = request.get_json(silent=True) or {}
    missing = validate_required(data, ["nome", "cpf", "telefone"])
    if missing:
        return err("Campos obrigatórios ausentes.", 400, missing)

    if not validate_cpf(data["cpf"]):
        return err("CPF inválido.", 400)
    if data.get("email") and not validate_email(data["email"]):
        return err("E-mail inválido.", 400)

    cpf_limpo = re.sub(r"\D", "", data["cpf"])
    cpf_fmt   = f"{cpf_limpo[:3]}.{cpf_limpo[3:6]}.{cpf_limpo[6:9]}-{cpf_limpo[9:]}"

    # Verifica duplicidade de CPF
    dup = query("SELECT id FROM pacientes WHERE cpf = %s", (cpf_fmt,), fetch="one")
    if dup:
        return err("Já existe um paciente com este CPF.", 409)

    pac_id = _gerar_id_paciente()
    query(
        "INSERT INTO pacientes (id, nome, cpf, telefone, email, nascimento, endereco, observacoes) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
        (pac_id, data["nome"], cpf_fmt, data["telefone"],
         data.get("email"), data.get("nascimento"),
         data.get("endereco"), data.get("observacoes")),
        fetch="none"
    )

    paciente = query(
        "SELECT id, nome, cpf, telefone, email, nascimento, endereco, "
        "status, criado_em AS cadastro, observacoes FROM pacientes WHERE id = %s",
        (pac_id,), fetch="one"
    )
    paciente.update({"exames": [], "agendamentos": [], "notas": []})
    return created(paciente, "Paciente criado com sucesso.")


@app.route("/v1/pacientes/<paciente_id>", methods=["PATCH"])
@require_auth
def atualizar_paciente(paciente_id):
    """[API] PATCH /pacientes/:pacienteId"""
    data    = request.get_json(silent=True) or {}
    existe  = query("SELECT id FROM pacientes WHERE id = %s", (paciente_id,), fetch="one")
    if not existe:
        return not_found("Paciente não encontrado.")

    if "cpf" in data and not validate_cpf(data["cpf"]):
        return err("CPF inválido.", 400)
    if "email" in data and data["email"] and not validate_email(data["email"]):
        return err("E-mail inválido.", 400)

    # Monta UPDATE dinâmico apenas com os campos recebidos
    campos_permitidos = ["nome", "cpf", "telefone", "email", "nascimento", "endereco", "observacoes"]
    sets   = []
    params = []
    for campo in campos_permitidos:
        if campo in data:
            val = data[campo]
            if campo == "cpf":
                cpf_limpo = re.sub(r"\D", "", val)
                val = f"{cpf_limpo[:3]}.{cpf_limpo[3:6]}.{cpf_limpo[6:9]}-{cpf_limpo[9:]}"
            sets.append(f"{campo} = %s")
            params.append(val)

    if not sets:
        return err("Nenhum campo para atualizar.", 400)

    params.append(paciente_id)
    query(f"UPDATE pacientes SET {', '.join(sets)} WHERE id = %s", params, fetch="none")

    paciente = query(
        "SELECT id, nome, cpf, telefone, email, nascimento, endereco, "
        "status, criado_em AS cadastro, observacoes FROM pacientes WHERE id = %s",
        (paciente_id,), fetch="one"
    )
    return ok(paciente, "Paciente atualizado com sucesso.")


# -----------------------------------------------------------------------------
# 10. EXAMES — KPIs, Evolução, Comparativo, Ranking, Destaques
# -----------------------------------------------------------------------------

def _filtro_radiologia_sql(radiologia_id, alias="e"):
    """Retorna trecho SQL e params para filtrar por radiologia."""
    if radiologia_id and radiologia_id != "all":
        return f" AND {alias}.radiologia_id = %s", [radiologia_id]
    return "", []


@app.route("/v1/exames/kpis", methods=["GET"])
@require_auth
def exames_kpis():
    """[API] GET /exames/kpis"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    atual = query(
        f"SELECT COUNT(*) AS total FROM exames e "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [di, df] + rad_params, fetch="one"
    )
    anterior = query(
        f"SELECT COUNT(*) AS total FROM exames e "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [pi, pf] + rad_params, fetch="one"
    )

    total_atual    = atual.get("total", 0) if atual else 0
    total_anterior = anterior.get("total", 0) if anterior else 0

    # Dias úteis no período (aprox.: exclui domingos)
    dias = max(1, (df - di).days + 1)
    media_dia = round(total_atual / dias, 1)

    # Tipo mais realizado
    tipo_top = query(
        f"SELECT te.label AS tipo, COUNT(*) AS qtd FROM exames e "
        f"JOIN tipos_exame te ON te.id = e.tipo_exame_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY te.label ORDER BY qtd DESC LIMIT 1",
        [di, df] + rad_params, fetch="one"
    )

    # % referenciados (que possuem medico_id)
    ref = query(
        f"SELECT COUNT(*) AS total FROM exames e "
        f"WHERE e.status='realizado' AND e.medico_id IS NOT NULL "
        f"AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [di, df] + rad_params, fetch="one"
    )
    perc_ref = round((ref.get("total", 0) / total_atual * 100), 1) if total_atual else 0

    return ok({
        "totalExames":              total_atual,
        "variacaoExames":           variacao_percentual(total_atual, total_anterior),
        "mediaPorDiaUtil":          media_dia,
        "tipoMaisRealizado":        tipo_top.get("tipo") if tipo_top else None,
        "tipoMaisRealizadoQtd":     tipo_top.get("qtd", 0) if tipo_top else 0,
        "percentualReferenciados":  perc_ref,
    })


@app.route("/v1/exames/evolucao/quantidade", methods=["GET"])
@require_auth
def exames_evolucao():
    """[API] GET /exames/evolucao/quantidade"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    # Agrega por mês
    rows = query(
        f"SELECT DATE_FORMAT(e.data_exame, '%%b/%%y') AS label, "
        f"       r.id AS radiologiaId, r.nome AS nome, COUNT(*) AS dados "
        f"FROM exames e JOIN radiologias r ON r.id = e.radiologia_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY YEAR(e.data_exame), MONTH(e.data_exame), r.id, r.nome "
        f"ORDER BY YEAR(e.data_exame), MONTH(e.data_exame)",
        [di, df] + rad_params
    )

    return ok(_format_series(rows))


@app.route("/v1/exames/comparativo/quantidade", methods=["GET"])
@require_auth
def exames_comparativo():
    """[API] GET /exames/comparativo/quantidade"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    if radiologia_id == "all":
        agrupamento = "radiologia"
        rows = query(
            "SELECT r.id, r.nome, COUNT(e.id) AS exames, COALESCE(SUM(e.valor),0) AS faturamento "
            "FROM radiologias r "
            "LEFT JOIN exames e ON e.radiologia_id = r.id "
            "       AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
            "GROUP BY r.id, r.nome ORDER BY exames DESC",
            (di, df)
        )
    else:
        agrupamento = "clinica"
        rows = query(
            "SELECT c.id, c.nome, COUNT(e.id) AS exames, COALESCE(SUM(e.valor),0) AS faturamento "
            "FROM clinicas c "
            "LEFT JOIN exames e ON e.clinica_id = c.id "
            "       AND e.radiologia_id = %s "
            "       AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
            "GROUP BY c.id, c.nome ORDER BY exames DESC",
            (radiologia_id, di, df)
        )

    return ok({"agrupamento": agrupamento, "itens": rows})


@app.route("/v1/exames/distribuicao-por-tipo", methods=["GET"])
@require_auth
def exames_distribuicao_por_tipo():
    """[API] GET /exames/distribuicao-por-tipo"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    rows = query(
        f"SELECT te.label AS tipo, COUNT(*) AS quantidade "
        f"FROM exames e JOIN tipos_exame te ON te.id = e.tipo_exame_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY te.label ORDER BY quantidade DESC",
        [di, df] + rad_params
    )
    return ok({"tipos": rows})


@app.route("/v1/exames/ranking/clinicas", methods=["GET"])
@require_auth
def exames_ranking_clinicas():
    """[API] GET /exames/ranking/clinicas"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    limite        = int(request.args.get("limite", 6))
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    rows = query(
        f"SELECT c.id AS clinicaId, c.nome AS clinicaNome, r.nome AS radiologiaNome, "
        f"       COUNT(e.id) AS totalExames "
        f"FROM clinicas c "
        f"JOIN exames e ON e.clinica_id = c.id "
        f"JOIN radiologias r ON r.id = e.radiologia_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY c.id, c.nome, r.nome ORDER BY totalExames DESC LIMIT %s",
        [di, df] + rad_params + [limite]
    )
    return ok(rows)


@app.route("/v1/exames/ranking/medicos", methods=["GET"])
@require_auth
def exames_ranking_medicos():
    """[API] GET /exames/ranking/medicos"""
    radiologia_id = request.args.get("radiologiaId", "all")
    clinica_id    = request.args.get("clinicaId")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    limite        = int(request.args.get("limite", 10))
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)
    cli_sql, cli_params = "", []
    if clinica_id:
        cli_sql = " AND m.clinica_id = %s"
        cli_params = [clinica_id]

    rows = query(
        f"SELECT m.id AS medicoId, m.nome AS medicoNome, c.nome AS clinicaNome, "
        f"       r.nome AS radiologiaNome, COUNT(e.id) AS totalExames, "
        f"       COALESCE(SUM(e.valor),0) AS faturamento "
        f"FROM medicos m "
        f"JOIN clinicas c ON c.id = m.clinica_id "
        f"JOIN exames e ON e.medico_id = m.id "
        f"JOIN radiologias r ON r.id = e.radiologia_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}{cli_sql} "
        f"GROUP BY m.id, m.nome, c.nome, r.nome ORDER BY totalExames DESC LIMIT %s",
        [di, df] + rad_params + cli_params + [limite]
    )
    return ok(rows)


@app.route("/v1/exames/destaques", methods=["GET"])
@require_auth
def exames_destaques():
    """[API] GET /exames/destaques"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    med_dest = query(
        f"SELECT m.nome AS nome, COUNT(e.id) AS totalExames, c.nome AS clinicaNome "
        f"FROM exames e JOIN medicos m ON m.id = e.medico_id JOIN clinicas c ON c.id = m.clinica_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY m.id, m.nome, c.nome ORDER BY totalExames DESC LIMIT 1",
        [di, df] + rad_params, fetch="one"
    )

    cli_lider = query(
        f"SELECT c.nome AS nome, COUNT(e.id) AS totalExames "
        f"FROM exames e JOIN clinicas c ON c.id = e.clinica_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY c.id, c.nome ORDER BY totalExames DESC LIMIT 1",
        [di, df] + rad_params, fetch="one"
    )

    tipo_top = query(
        f"SELECT te.label AS tipo, COUNT(*) AS quantidade "
        f"FROM exames e JOIN tipos_exame te ON te.id = e.tipo_exame_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY te.label ORDER BY quantidade DESC LIMIT 1",
        [di, df] + rad_params, fetch="one"
    )

    total_atual    = query(f"SELECT COUNT(*) AS t FROM exames e WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}", [di, df] + rad_params, fetch="one")
    total_anterior = query(f"SELECT COUNT(*) AS t FROM exames e WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}", [pi, pf] + rad_params, fetch="one")

    perc_lider = 0
    if tipo_top and cli_lider:
        perc_lider = round(tipo_top.get("quantidade", 0) / max(1, cli_lider.get("totalExames", 1)) * 100, 1)

    return ok({
        "medicoDestaque":  med_dest,
        "clinicaLider":    cli_lider,
        "tipoEmDestaque":  {
            "tipo":               tipo_top.get("tipo") if tipo_top else None,
            "quantidade":         tipo_top.get("quantidade", 0) if tipo_top else 0,
            "percentualDoLider":  perc_lider,
        },
        "variacaoGeral": variacao_percentual(
            total_atual.get("t", 0) if total_atual else 0,
            total_anterior.get("t", 0) if total_anterior else 0
        ),
    })


# -----------------------------------------------------------------------------
# 11. HIERARQUIA — Radiologia → Clínica → Médico
# -----------------------------------------------------------------------------

@app.route("/v1/hierarquia/arvore", methods=["GET"])
@require_auth
def hierarquia_arvore():
    """[API] GET /hierarquia/arvore"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_where = ""
    rad_params = []
    if radiologia_id != "all":
        rad_where = "WHERE r.id = %s"
        rad_params = [radiologia_id]

    radiologias = query(f"SELECT id, nome FROM radiologias {rad_where} ORDER BY nome", rad_params)

    resultado = []
    for rad in radiologias:
        clinicas = query(
            "SELECT c.id, c.nome, "
            "       COALESCE(SUM(e.valor),0) AS faturamento, "
            "       COUNT(e.id) AS exames "
            "FROM clinicas c "
            "LEFT JOIN exames e ON e.clinica_id = c.id "
            "       AND e.radiologia_id = %s "
            "       AND e.status='realizado' "
            "       AND e.data_exame BETWEEN %s AND %s "
            "GROUP BY c.id, c.nome ORDER BY faturamento DESC",
            (rad["id"], di, df)
        )

        total_rad = {"exames": 0, "faturamento": 0.0, "comissao": 0.0, "pendente": 0.0}
        clinicas_out = []

        for cli in clinicas:
            medicos = query(
                "SELECT m.id, m.nome, COUNT(e.id) AS exames, "
                "       COALESCE(SUM(e.valor),0) AS faturamento, "
                "       COALESCE(SUM(co.valor_comissao),0) AS comissao, "
                "       COALESCE(SUM(CASE WHEN co.status='pendente' THEN co.valor_comissao ELSE 0 END),0) AS pendente "
                "FROM medicos m "
                "LEFT JOIN exames e ON e.medico_id = m.id "
                "       AND e.clinica_id = %s AND e.radiologia_id = %s "
                "       AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
                "LEFT JOIN comissoes co ON co.exame_id = e.id "
                "WHERE m.clinica_id = %s "
                "GROUP BY m.id, m.nome ORDER BY faturamento DESC",
                (cli["id"], rad["id"], di, df, cli["id"])
            )

            com_cli = query(
                "SELECT COALESCE(SUM(co.valor_comissao),0) AS comissao, "
                "       COALESCE(SUM(CASE WHEN co.status='pendente' THEN co.valor_comissao ELSE 0 END),0) AS pendente "
                "FROM exames e LEFT JOIN comissoes co ON co.exame_id = e.id "
                "WHERE e.clinica_id = %s AND e.radiologia_id = %s "
                "AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s",
                (cli["id"], rad["id"], di, df), fetch="one"
            )

            cli_totais = {
                "exames":      cli.get("exames", 0),
                "faturamento": to_decimal(cli.get("faturamento", 0)),
                "comissao":    to_decimal(com_cli.get("comissao", 0)) if com_cli else 0,
                "pendente":    to_decimal(com_cli.get("pendente", 0)) if com_cli else 0,
            }

            for k in total_rad:
                total_rad[k] += cli_totais.get(k, 0)

            clinicas_out.append({
                "id": cli["id"], "nome": cli["nome"],
                "totais": cli_totais, "medicos": medicos
            })

        resultado.append({
            "id":      rad["id"],
            "nome":    rad["nome"],
            "totais":  total_rad,
            "clinicas": clinicas_out,
        })

    return ok(resultado)


# -----------------------------------------------------------------------------
# 12. COMISSÕES
# -----------------------------------------------------------------------------

@app.route("/v1/comissoes/kpis", methods=["GET"])
@require_auth
def comissoes_kpis():
    """[API] GET /comissoes/kpis"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id, alias="co")

    totais = query(
        f"SELECT COALESCE(SUM(co.valor_comissao),0) AS comissoesTotais, "
        f"       COALESCE(SUM(CASE WHEN co.status='paga' THEN co.valor_comissao ELSE 0 END),0) AS comissoesPagas, "
        f"       COALESCE(SUM(CASE WHEN co.status='pendente' THEN co.valor_comissao ELSE 0 END),0) AS comissoesPendentes "
        f"FROM comissoes co "
        f"JOIN exames e ON e.id = co.exame_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [di, df] + rad_params, fetch="one"
    )

    ant = query(
        f"SELECT COALESCE(SUM(co.valor_comissao),0) AS comissoesTotais "
        f"FROM comissoes co JOIN exames e ON e.id = co.exame_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [pi, pf] + rad_params, fetch="one"
    )

    fat = query(
        f"SELECT COALESCE(SUM(e.valor),0) AS total "
        f"FROM exames e WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s"
        + (" AND e.radiologia_id = %s" if radiologia_id != "all" else ""),
        [di, df] + (rad_params if radiologia_id != "all" else []), fetch="one"
    )

    total    = to_decimal(totais.get("comissoesTotais", 0)) if totais else 0
    pagas    = to_decimal(totais.get("comissoesPagas", 0)) if totais else 0
    pendente = to_decimal(totais.get("comissoesPendentes", 0)) if totais else 0
    faturamento = to_decimal(fat.get("total", 0)) if fat else 0
    ant_total   = to_decimal(ant.get("comissoesTotais", 0)) if ant else 0

    return ok({
        "comissoesTotais":               total,
        "comissoesPagas":                pagas,
        "comissoesPendentes":            pendente,
        "comissoesVariacao":             variacao_percentual(total, ant_total),
        "comissoesPercentualFaturamento": round(total / faturamento * 100, 1) if faturamento else 0,
    })


@app.route("/v1/comissoes/por-medico", methods=["GET"])
@require_auth
def comissoes_por_medico():
    """[API] GET /comissoes/por-medico"""
    radiologia_id = request.args.get("radiologiaId", "all")
    clinica_id    = request.args.get("clinicaId")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id, alias="e")
    cli_sql, cli_params = "", []
    if clinica_id:
        cli_sql = " AND m.clinica_id = %s"; cli_params = [clinica_id]

    rows = query(
        f"SELECT m.id AS medicoId, m.nome AS medicoNome, c.nome AS clinicaNome, "
        f"       r.nome AS radiologiaNome, COALESCE(SUM(e.valor),0) AS faturamento, "
        f"       COALESCE(SUM(co.valor_comissao),0) AS comissaoDevida, "
        f"       COALESCE(SUM(CASE WHEN co.status='paga' THEN co.valor_comissao ELSE 0 END),0) AS comissaoPaga, "
        f"       COALESCE(SUM(CASE WHEN co.status='pendente' THEN co.valor_comissao ELSE 0 END),0) AS comissaoPendente "
        f"FROM medicos m "
        f"JOIN clinicas c ON c.id = m.clinica_id "
        f"JOIN exames e ON e.medico_id = m.id "
        f"JOIN radiologias r ON r.id = e.radiologia_id "
        f"LEFT JOIN comissoes co ON co.exame_id = e.id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}{cli_sql} "
        f"GROUP BY m.id, m.nome, c.nome, r.nome ORDER BY comissaoDevida DESC",
        [di, df] + rad_params + cli_params
    )

    for r in rows:
        devida = r.get("comissaoDevida", 0)
        pendente = r.get("comissaoPendente", 0)
        r["pendentePercent"] = round(pendente / devida * 100, 1) if devida else 0

    return ok(rows)


@app.route("/v1/comissoes/por-radiologia", methods=["GET"])
@require_auth
def comissoes_por_radiologia():
    """[API] GET /comissoes/por-radiologia"""
    periodo     = request.args.get("periodo", "mes_atual")
    data_inicio = request.args.get("dataInicio")
    data_fim    = request.args.get("dataFim")
    di, df, _, _ = periodo_para_datas(periodo, data_inicio, data_fim)

    rows = query(
        "SELECT r.id AS radiologiaId, r.nome AS radiologiaNome, "
        "       COALESCE(SUM(co.valor_comissao),0) AS comissaoDevida, "
        "       COALESCE(SUM(CASE WHEN co.status='pendente' THEN co.valor_comissao ELSE 0 END),0) AS comissaoPendente "
        "FROM radiologias r "
        "LEFT JOIN exames e ON e.radiologia_id = r.id "
        "       AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
        "LEFT JOIN comissoes co ON co.exame_id = e.id "
        "GROUP BY r.id, r.nome ORDER BY comissaoDevida DESC",
        (di, df)
    )
    return ok(rows)


# -----------------------------------------------------------------------------
# 13. FINANCEIRO
# -----------------------------------------------------------------------------

def _format_series(rows):
    """
    Agrupa dados (label, radiologiaId, nome, dados) em formato de gráfico de linhas.
    """
    labels_set  = {}
    series_dict = {}

    for r in rows:
        lbl = r.get("label", "")
        rid = r.get("radiologiaId", "")
        nom = r.get("nome", "")
        val = to_decimal(r.get("dados", 0))

        if lbl not in labels_set:
            labels_set[lbl] = len(labels_set)
        if rid not in series_dict:
            series_dict[rid] = {"radiologiaId": rid, "nome": nom, "dados": []}

    # Preenche os dados em ordem
    labels = sorted(labels_set.keys(), key=lambda x: labels_set[x])
    for rid in series_dict:
        series_dict[rid]["dados"] = [0.0] * len(labels)

    for r in rows:
        lbl = r.get("label", "")
        rid = r.get("radiologiaId", "")
        val = to_decimal(r.get("dados", 0))
        idx = labels_set.get(lbl, 0)
        if rid in series_dict and idx < len(series_dict[rid]["dados"]):
            series_dict[rid]["dados"][idx] = val

    return {"labels": labels, "series": list(series_dict.values())}


@app.route("/v1/financeiro/kpis", methods=["GET"])
@require_auth
def financeiro_kpis():
    """[API] GET /financeiro/kpis"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    def _fat(d_ini, d_fim):
        r = query(
            f"SELECT COALESCE(SUM(e.valor),0) AS t, COUNT(e.id) AS c "
            f"FROM exames e WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
            [d_ini, d_fim] + rad_params, fetch="one"
        )
        return r or {"t": 0, "c": 0}

    atual    = _fat(di, df)
    anterior = _fat(pi, pf)

    fat_atual = to_decimal(atual.get("t", 0))
    fat_ant   = to_decimal(anterior.get("t", 0))
    exm_atual = atual.get("c", 0)
    exm_ant   = anterior.get("c", 0)

    # Clínicas ativas no período
    cli_ativas = query(
        f"SELECT COUNT(DISTINCT e.clinica_id) AS c FROM exames e "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [di, df] + rad_params, fetch="one"
    )

    # Comissões
    com = query(
        f"SELECT COALESCE(SUM(co.valor_comissao),0) AS total, "
        f"       COALESCE(SUM(CASE WHEN co.status='pendente' THEN co.valor_comissao ELSE 0 END),0) AS pendente "
        f"FROM comissoes co JOIN exames e ON e.id = co.exame_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [di, df] + rad_params, fetch="one"
    )

    # Exames agendados futuros
    agend = query(
        f"SELECT COUNT(*) AS c FROM agendamentos a "
        f"WHERE a.status IN ('agendado','confirmado') AND a.data_agendamento >= CURDATE()"
        + (f" AND a.radiologia_id = %s" if radiologia_id != "all" else ""),
        rad_params if radiologia_id != "all" else [], fetch="one"
    )

    # Ticket médio
    fat_med_cli = query(
        f"SELECT COALESCE(AVG(sub.fat),0) AS avg_fat "
        f"FROM (SELECT e.clinica_id, SUM(e.valor) AS fat FROM exames e "
        f"      WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"      GROUP BY e.clinica_id) sub",
        [di, df] + rad_params, fetch="one"
    )

    # Previsibilidade de caixa (agendados * ticket médio)
    ticket = fat_atual / max(1, exm_atual)
    previsao = to_decimal(agend.get("c", 0)) * ticket if agend else 0

    com_total   = to_decimal(com.get("total", 0)) if com else 0
    com_pend    = to_decimal(com.get("pendente", 0)) if com else 0
    com_ant     = query(
        f"SELECT COALESCE(SUM(co.valor_comissao),0) AS t "
        f"FROM comissoes co JOIN exames e ON e.id = co.exame_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [pi, pf] + rad_params, fetch="one"
    )

    return ok({
        "faturamentoTotal":               fat_atual,
        "faturamentoVariacao":            variacao_percentual(fat_atual, fat_ant),
        "totalExames":                    exm_atual,
        "examesVariacao":                 variacao_percentual(exm_atual, exm_ant),
        "faturamentoMedioPorClinica":     to_decimal(fat_med_cli.get("avg_fat", 0)) if fat_med_cli else 0,
        "ticketMedioExame":               round(ticket, 2),
        "clinicasAtivas":                 cli_ativas.get("c", 0) if cli_ativas else 0,
        "previsibilidadeCaixa":           round(previsao, 2),
        "examesAgendados":                agend.get("c", 0) if agend else 0,
        "comissoesTotais":                com_total,
        "comissoesPendentes":             com_pend,
        "comissoesPercentualFaturamento": round(com_total / fat_atual * 100, 1) if fat_atual else 0,
        "comissoesVariacao":              variacao_percentual(com_total, to_decimal(com_ant.get("t", 0)) if com_ant else 0),
        # Formato alternativo esperado pela tela Financeiro
        "faturamentoLiquido": {"value": round(fat_atual * 0.92, 2), "context": "Após impostos estimados"},
        "margemLucro":        {"value": round((fat_atual * 0.92 - com_total) / fat_atual * 100, 1) if fat_atual else 0, "changeMonth": 0},
        "previsao30d":        {"value": round(previsao, 2), "forecast60d": round(previsao * 1.05, 2)},
    })


@app.route("/v1/financeiro/snapshot", methods=["GET"])
@require_auth
def financeiro_snapshot():
    """[API] GET /financeiro/snapshot — snapshot consolidado."""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    def _fat(d1, d2):
        r = query(
            f"SELECT COALESCE(SUM(e.valor),0) AS t, COUNT(*) AS c "
            f"FROM exames e WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
            [d1, d2] + rad_params, fetch="one"
        )
        return r or {"t": 0, "c": 0}

    fat_atual    = _fat(di, df)
    fat_anterior = _fat(pi, pf)

    fat = to_decimal(fat_atual.get("t", 0))
    fat_ant = to_decimal(fat_anterior.get("t", 0))
    exm = fat_atual.get("c", 0)
    exm_ant = fat_anterior.get("c", 0)

    ticket = fat / max(1, exm)
    previsao = ticket * exm * 1.05

    top_cli = query(
        f"SELECT c.nome, COALESCE(SUM(e.valor),0) AS faturamento, "
        f"       ROUND(COALESCE(SUM(e.valor),0) / %s * 100, 1) AS participacao "
        f"FROM clinicas c JOIN exames e ON e.clinica_id = c.id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY c.id, c.nome ORDER BY faturamento DESC LIMIT 5",
        [max(fat, 1), di, df] + rad_params
    )

    top_med = query(
        f"SELECT m.nome, c.nome AS clinica, COUNT(e.id) AS exames, COALESCE(SUM(e.valor),0) AS faturamento "
        f"FROM medicos m JOIN clinicas c ON c.id = m.clinica_id "
        f"JOIN exames e ON e.medico_id = m.id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY m.id, m.nome, c.nome ORDER BY faturamento DESC LIMIT 5",
        [di, df] + rad_params
    )

    # Insights automáticos simples
    insights = []
    var = variacao_percentual(fat, fat_ant)
    if var > 10:
        insights.append({"type": "positive", "text": f"Faturamento cresceu {var:.1f}% em relação ao período anterior."})
    elif var < -10:
        insights.append({"type": "warning", "text": f"Faturamento caiu {abs(var):.1f}% em relação ao período anterior."})
    else:
        insights.append({"type": "info", "text": f"Faturamento estável com variação de {var:.1f}%."})

    return ok({
        "kpis": {
            "faturamentoTotal":   {"value": fat,   "changeMonth": var, "changeYoY": var},
            "faturamentoLiquido": {"value": round(fat * 0.92, 2), "context": "Após impostos estimados"},
            "margemLucro":        {"value": round((fat * 0.92) / max(fat, 1) * 100, 1), "changeMonth": 0},
            "totalExames":        {"value": exm,   "changeMonth": variacao_percentual(exm, exm_ant)},
            "previsao30d":        {"value": round(previsao, 2), "forecast60d": round(previsao * 1.05, 2)},
        },
        "topClinicas": top_cli,
        "topMedicos":  top_med,
        "insights":    insights,
    })


@app.route("/v1/financeiro/evolucao/faturamento", methods=["GET"])
@require_auth
def financeiro_evolucao_faturamento():
    """[API] GET /financeiro/evolucao/faturamento"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    rows = query(
        f"SELECT DATE_FORMAT(e.data_exame,'%%b/%%y') AS label, "
        f"       r.id AS radiologiaId, r.nome AS nome, "
        f"       COALESCE(SUM(e.valor),0) AS dados "
        f"FROM exames e JOIN radiologias r ON r.id = e.radiologia_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY YEAR(e.data_exame), MONTH(e.data_exame), r.id, r.nome "
        f"ORDER BY YEAR(e.data_exame), MONTH(e.data_exame)",
        [di, df] + rad_params
    )
    return ok(_format_series(rows))


@app.route("/v1/financeiro/evolucao", methods=["GET"])
@require_auth
def financeiro_evolucao():
    """[API] GET /financeiro/evolucao — faturamento + exames + ano anterior."""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    # Mesmo período do ano anterior
    di_ano = di.replace(year=di.year - 1)
    df_ano = df.replace(year=df.year - 1)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    rows = query(
        f"SELECT DATE_FORMAT(e.data_exame,'%%b/%%y') AS label, "
        f"       COALESCE(SUM(e.valor),0) AS fat, COUNT(*) AS exm "
        f"FROM exames e "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY YEAR(e.data_exame), MONTH(e.data_exame) "
        f"ORDER BY YEAR(e.data_exame), MONTH(e.data_exame)",
        [di, df] + rad_params
    )

    rows_ano = query(
        f"SELECT DATE_FORMAT(e.data_exame,'%%b/%%y') AS label, "
        f"       COALESCE(SUM(e.valor),0) AS fat "
        f"FROM exames e "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY YEAR(e.data_exame), MONTH(e.data_exame) "
        f"ORDER BY YEAR(e.data_exame), MONTH(e.data_exame)",
        [di_ano, df_ano] + rad_params
    )

    labels         = [r["label"] for r in rows]
    faturamento    = [to_decimal(r["fat"]) for r in rows]
    exames         = [r["exm"] for r in rows]
    fat_ano_dict   = {r["label"]: to_decimal(r["fat"]) for r in rows_ano}
    faturamento_ano = [fat_ano_dict.get(l, 0) for l in labels]

    return ok({
        "labels":         labels,
        "faturamento":    faturamento,
        "exames":         exames,
        "faturamentoAno": faturamento_ano,
    })


@app.route("/v1/financeiro/comparativo/faturamento", methods=["GET"])
@require_auth
def financeiro_comparativo_faturamento():
    """[API] GET /financeiro/comparativo/faturamento"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    if radiologia_id == "all":
        agrupamento = "radiologia"
        rows = query(
            "SELECT r.id, r.nome, COALESCE(SUM(e.valor),0) AS faturamento, COUNT(e.id) AS exames "
            "FROM radiologias r "
            "LEFT JOIN exames e ON e.radiologia_id = r.id "
            "       AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
            "GROUP BY r.id, r.nome ORDER BY faturamento DESC",
            (di, df)
        )
        # breakdown por clínica para cada radiologia
        for row in rows:
            row["breakdown"] = query(
                "SELECT c.id, c.nome, COALESCE(SUM(e.valor),0) AS faturamento, COUNT(e.id) AS exames "
                "FROM clinicas c JOIN exames e ON e.clinica_id = c.id "
                "WHERE e.radiologia_id = %s AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
                "GROUP BY c.id, c.nome ORDER BY faturamento DESC LIMIT 5",
                (row["id"], di, df)
            )
    else:
        agrupamento = "clinica"
        rows = query(
            "SELECT c.id, c.nome, COALESCE(SUM(e.valor),0) AS faturamento, COUNT(e.id) AS exames "
            "FROM clinicas c "
            "LEFT JOIN exames e ON e.clinica_id = c.id "
            "       AND e.radiologia_id = %s "
            "       AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
            "GROUP BY c.id, c.nome ORDER BY faturamento DESC",
            (radiologia_id, di, df)
        )
        for row in rows:
            row["breakdown"] = query(
                "SELECT m.id, m.nome, COALESCE(SUM(e.valor),0) AS faturamento, COUNT(e.id) AS exames "
                "FROM medicos m JOIN exames e ON e.medico_id = m.id "
                "WHERE e.clinica_id = %s AND e.radiologia_id = %s "
                "AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
                "GROUP BY m.id, m.nome ORDER BY faturamento DESC LIMIT 5",
                (row["id"], radiologia_id, di, df)
            )

    return ok({"agrupamento": agrupamento, "itens": rows})


@app.route("/v1/financeiro/por-radiologia", methods=["GET"])
@require_auth
def financeiro_por_radiologia():
    """[API] GET /financeiro/por-radiologia"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    if radiologia_id == "all":
        rows = query(
            "SELECT r.id, r.nome AS label, "
            "       COALESCE(SUM(e.valor),0) AS faturamento, COUNT(e.id) AS exames "
            "FROM radiologias r "
            "LEFT JOIN exames e ON e.radiologia_id = r.id "
            "       AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
            "GROUP BY r.id, r.nome ORDER BY faturamento DESC",
            (di, df)
        )
    else:
        rows = query(
            "SELECT c.id, c.nome AS label, "
            "       COALESCE(SUM(e.valor),0) AS faturamento, COUNT(e.id) AS exames "
            "FROM clinicas c "
            "LEFT JOIN exames e ON e.clinica_id = c.id "
            "       AND e.radiologia_id = %s "
            "       AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
            "GROUP BY c.id, c.nome ORDER BY faturamento DESC",
            (radiologia_id, di, df)
        )

    total_fat = sum(to_decimal(r.get("faturamento", 0)) for r in rows)
    ant_dict  = {}
    if radiologia_id == "all":
        ant_rows = query(
            "SELECT r.id, COALESCE(SUM(e.valor),0) AS faturamento "
            "FROM radiologias r LEFT JOIN exames e ON e.radiologia_id = r.id "
            "       AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
            "GROUP BY r.id", (pi, pf)
        )
        ant_dict = {r["id"]: to_decimal(r["faturamento"]) for r in ant_rows}

    for row in rows:
        fat = to_decimal(row.get("faturamento", 0))
        ant = ant_dict.get(row.get("id", ""), 0)
        row["variacao"]     = variacao_percentual(fat, ant)
        row["participacao"] = round(fat / total_fat * 100, 1) if total_fat else 0

    return ok(rows)


@app.route("/v1/financeiro/top-clinicas", methods=["GET"])
@require_auth
def financeiro_top_clinicas():
    """[API] GET /financeiro/top-clinicas"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    limite        = int(request.args.get("limite", 10))
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    total_r = query(
        f"SELECT COALESCE(SUM(e.valor),0) AS total FROM exames e "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [di, df] + rad_params, fetch="one"
    )
    total = to_decimal(total_r.get("total", 0)) if total_r else 1

    rows = query(
        f"SELECT c.nome, COALESCE(SUM(e.valor),0) AS faturamento "
        f"FROM clinicas c JOIN exames e ON e.clinica_id = c.id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY c.id, c.nome ORDER BY faturamento DESC LIMIT %s",
        [di, df] + rad_params + [limite]
    )
    for r in rows:
        fat = to_decimal(r.get("faturamento", 0))
        r["participacao"] = round(fat / total * 100, 1) if total else 0
    return ok(rows)


@app.route("/v1/financeiro/top-medicos", methods=["GET"])
@require_auth
def financeiro_top_medicos():
    """[API] GET /financeiro/top-medicos"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    limite        = int(request.args.get("limite", 15))
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    rows = query(
        f"SELECT m.nome, c.nome AS clinica, COUNT(e.id) AS exames, "
        f"       COALESCE(SUM(e.valor),0) AS faturamento "
        f"FROM medicos m JOIN clinicas c ON c.id = m.clinica_id "
        f"JOIN exames e ON e.medico_id = m.id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY m.id, m.nome, c.nome ORDER BY faturamento DESC LIMIT %s",
        [di, df] + rad_params + [limite]
    )
    return ok(rows)


@app.route("/v1/financeiro/tipos-exame", methods=["GET"])
@require_auth
def financeiro_tipos_exame():
    """[API] GET /financeiro/tipos-exame"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    total_r = query(
        f"SELECT COUNT(*) AS t FROM exames e "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [di, df] + rad_params, fetch="one"
    )
    total = total_r.get("t", 0) if total_r else 1

    rows = query(
        f"SELECT te.label AS tipo, COUNT(*) AS quantidade "
        f"FROM exames e JOIN tipos_exame te ON te.id = e.tipo_exame_id "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql} "
        f"GROUP BY te.label ORDER BY quantidade DESC",
        [di, df] + rad_params
    )
    for r in rows:
        r["participacao"] = round(r.get("quantidade", 0) / max(total, 1) * 100, 1)
    return ok(rows)


@app.route("/v1/financeiro/ticket-medio-por-radiologia", methods=["GET"])
@require_auth
def financeiro_ticket_medio():
    """[API] GET /financeiro/ticket-medio-por-radiologia"""
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    def _ticket(d1, d2):
        rows = query(
            "SELECT r.nome AS label, "
            "       COALESCE(SUM(e.valor)/NULLIF(COUNT(e.id),0),0) AS ticket "
            "FROM radiologias r "
            "LEFT JOIN exames e ON e.radiologia_id = r.id "
            "       AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
            "GROUP BY r.id, r.nome ORDER BY r.nome",
            (d1, d2)
        )
        return rows

    atual    = _ticket(di, df)
    anterior = _ticket(pi, pf)
    ant_dict = {r["label"]: to_decimal(r["ticket"]) for r in anterior}

    labels  = [r["label"] for r in atual]
    at_vals = [to_decimal(r.get("ticket", 0)) for r in atual]
    an_vals = [ant_dict.get(l, 0) for l in labels]

    return ok({"labels": labels, "atual": at_vals, "anterior": an_vals})


@app.route("/v1/financeiro/insights", methods=["GET"])
@require_auth
def financeiro_insights():
    """[API] GET /financeiro/insights"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    fat_atual = query(
        f"SELECT COALESCE(SUM(e.valor),0) AS t, COUNT(*) AS c "
        f"FROM exames e WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [di, df] + rad_params, fetch="one"
    )
    fat_ant = query(
        f"SELECT COALESCE(SUM(e.valor),0) AS t FROM exames e "
        f"WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
        [pi, pf] + rad_params, fetch="one"
    )

    fat = to_decimal(fat_atual.get("t", 0)) if fat_atual else 0
    fat_a = to_decimal(fat_ant.get("t", 0)) if fat_ant else 0
    exm = fat_atual.get("c", 0) if fat_atual else 0
    var = variacao_percentual(fat, fat_a)

    insights = []
    if var > 15:
        insights.append({"type": "positive", "text": f"Crescimento expressivo de {var:.1f}% no faturamento."})
    elif var > 0:
        insights.append({"type": "positive", "text": f"Faturamento cresceu {var:.1f}% vs período anterior."})
    elif var < -15:
        insights.append({"type": "warning", "text": f"Atenção: queda de {abs(var):.1f}% no faturamento."})
    else:
        insights.append({"type": "info", "text": f"Faturamento estável com variação de {var:.1f}%."})

    if exm > 0:
        insights.append({"type": "info", "text": f"{exm} exames realizados no período."})

    return ok(insights)


@app.route("/v1/financeiro/hierarquia", methods=["GET"])
@require_auth
def financeiro_hierarquia():
    """[API] GET /financeiro/hierarquia — árvore para a tela Financeiro."""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_where = ""
    rad_params = []
    if radiologia_id != "all":
        rad_where = "WHERE r.id = %s"; rad_params = [radiologia_id]

    radiologias = query(f"SELECT id, nome FROM radiologias {rad_where} ORDER BY nome", rad_params)
    resultado = []

    for rad in radiologias:
        fat_rad = query(
            "SELECT COALESCE(SUM(e.valor),0) AS fat, COUNT(*) AS exm "
            "FROM exames e WHERE e.status='realizado' AND e.radiologia_id = %s "
            "AND e.data_exame BETWEEN %s AND %s",
            (rad["id"], di, df), fetch="one"
        )
        fat_rad_ant = query(
            "SELECT COALESCE(SUM(e.valor),0) AS fat FROM exames e "
            "WHERE e.status='realizado' AND e.radiologia_id = %s "
            "AND e.data_exame BETWEEN %s AND %s",
            (rad["id"], pi, pf), fetch="one"
        )
        fat = to_decimal(fat_rad.get("fat", 0)) if fat_rad else 0
        fat_a = to_decimal(fat_rad_ant.get("fat", 0)) if fat_rad_ant else 0

        clinicas = query(
            "SELECT c.id, c.nome, COALESCE(SUM(e.valor),0) AS faturamento, COUNT(e.id) AS exames "
            "FROM clinicas c JOIN exames e ON e.clinica_id = c.id "
            "WHERE e.radiologia_id = %s AND e.status='realizado' "
            "AND e.data_exame BETWEEN %s AND %s "
            "GROUP BY c.id, c.nome ORDER BY faturamento DESC",
            (rad["id"], di, df)
        )

        clinicas_out = []
        for cli in clinicas:
            medicos = query(
                "SELECT m.id, m.nome, COUNT(e.id) AS exames, COALESCE(SUM(e.valor),0) AS faturamento "
                "FROM medicos m JOIN exames e ON e.medico_id = m.id "
                "WHERE e.clinica_id = %s AND e.radiologia_id = %s "
                "AND e.status='realizado' AND e.data_exame BETWEEN %s AND %s "
                "GROUP BY m.id, m.nome ORDER BY faturamento DESC",
                (cli["id"], rad["id"], di, df)
            )
            clinicas_out.append({
                "id": cli["id"], "nome": cli["nome"],
                "exames": cli.get("exames", 0),
                "faturamento": to_decimal(cli.get("faturamento", 0)),
                "medicos": medicos,
            })

        resultado.append({
            "id":        rad["id"],
            "nome":      rad["nome"],
            "exames":    fat_rad.get("exm", 0) if fat_rad else 0,
            "faturamento": fat,
            "variacao":  variacao_percentual(fat, fat_a),
            "clinicas":  clinicas_out,
        })

    return ok(resultado)


# -----------------------------------------------------------------------------
# 14. METAS
# -----------------------------------------------------------------------------

@app.route("/v1/metas", methods=["GET"])
@require_auth
def metas_get():
    """[API] GET /metas"""
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    di, df, _, _  = periodo_para_datas(periodo)

    ano = di.year
    mes = di.month

    if radiologia_id == "all":
        # KPIs gerais mensais e anuais
        meta_mensal = query(
            "SELECT COALESCE(SUM(valor_meta),0) AS meta FROM metas WHERE ano = %s AND mes = %s",
            (ano, mes), fetch="one"
        )
        meta_anual = query(
            "SELECT COALESCE(SUM(valor_meta),0) AS meta FROM metas WHERE ano = %s AND mes IS NULL",
            (ano,), fetch="one"
        )
        real_mensal = query(
            "SELECT COALESCE(SUM(e.valor),0) AS total FROM exames e "
            "WHERE e.status='realizado' AND YEAR(e.data_exame)=%s AND MONTH(e.data_exame)=%s",
            (ano, mes), fetch="one"
        )
        real_anual = query(
            "SELECT COALESCE(SUM(e.valor),0) AS total FROM exames e "
            "WHERE e.status='realizado' AND YEAR(e.data_exame)=%s",
            (ano,), fetch="one"
        )

        por_radiologia = query(
            "SELECT r.id, r.nome, "
            "       COALESCE((SELECT valor_meta FROM metas WHERE radiologia_id=r.id AND ano=%s AND mes=%s LIMIT 1),0) AS meta, "
            "       COALESCE((SELECT valor_meta FROM metas WHERE radiologia_id=r.id AND ano=%s AND mes IS NULL LIMIT 1),0) AS anual, "
            "       COALESCE((SELECT SUM(e2.valor) FROM exames e2 WHERE e2.radiologia_id=r.id AND e2.status='realizado' AND YEAR(e2.data_exame)=%s AND MONTH(e2.data_exame)=%s),0) AS realizado, "
            "       COALESCE((SELECT SUM(e3.valor) FROM exames e3 WHERE e3.radiologia_id=r.id AND e3.status='realizado' AND YEAR(e3.data_exame)=%s),0) AS anoRealizado "
            "FROM radiologias r ORDER BY r.nome",
            (ano, mes, ano, ano, mes, ano)
        )

        return ok({
            "mensal":        {"meta": to_decimal(meta_mensal.get("meta", 0)) if meta_mensal else 0,
                              "realizado": to_decimal(real_mensal.get("total", 0)) if real_mensal else 0},
            "anual":         {"meta": to_decimal(meta_anual.get("meta", 0)) if meta_anual else 0,
                              "realizado": to_decimal(real_anual.get("total", 0)) if real_anual else 0},
            "porRadiologia": por_radiologia,
        })
    else:
        meta_m = query(
            "SELECT valor_meta AS meta FROM metas WHERE radiologia_id=%s AND ano=%s AND mes=%s LIMIT 1",
            (radiologia_id, ano, mes), fetch="one"
        )
        meta_a = query(
            "SELECT valor_meta AS meta FROM metas WHERE radiologia_id=%s AND ano=%s AND mes IS NULL LIMIT 1",
            (radiologia_id, ano), fetch="one"
        )
        real_m = query(
            "SELECT COALESCE(SUM(valor),0) AS t FROM exames WHERE radiologia_id=%s "
            "AND status='realizado' AND YEAR(data_exame)=%s AND MONTH(data_exame)=%s",
            (radiologia_id, ano, mes), fetch="one"
        )
        real_a = query(
            "SELECT COALESCE(SUM(valor),0) AS t FROM exames WHERE radiologia_id=%s "
            "AND status='realizado' AND YEAR(data_exame)=%s",
            (radiologia_id, ano), fetch="one"
        )
        return ok({
            "mensal": {"meta": to_decimal(meta_m.get("meta", 0)) if meta_m else 0,
                       "realizado": to_decimal(real_m.get("t", 0)) if real_m else 0},
            "anual":  {"meta": to_decimal(meta_a.get("meta", 0)) if meta_a else 0,
                       "realizado": to_decimal(real_a.get("t", 0)) if real_a else 0},
            "porRadiologia": [],
        })


@app.route("/v1/metas/historico", methods=["GET"])
@require_auth
def metas_historico():
    """[API] GET /metas/historico"""
    rows = query(
        "SELECT mh.criado_em AS data, mh.tipo, mh.descricao, "
        "       mh.valor_anterior AS anterior, mh.valor_novo AS novo, "
        "       u.nome AS responsavel "
        "FROM metas_historico mh "
        "LEFT JOIN usuarios u ON u.id = mh.responsavel_id "
        "ORDER BY mh.criado_em DESC LIMIT 50"
    )
    return ok(rows)


@app.route("/v1/metas", methods=["POST"])
@require_auth
def metas_salvar():
    """[API] POST /metas — salva lote de edições."""
    data  = request.get_json(silent=True) or {}
    metas = data.get("metas", {})

    if not metas:
        return err("Nenhuma meta para salvar.", 400)

    hoje = datetime.date.today()
    ano  = hoje.year
    mes  = hoje.month
    atualizadas = 0
    user_id = g.user.get("sub")

    for radio_id, valores in metas.items():
        meta_val  = valores.get("meta")
        anual_val = valores.get("anual")

        if meta_val is not None:
            ant = query(
                "SELECT valor_meta FROM metas WHERE radiologia_id=%s AND ano=%s AND mes=%s",
                (radio_id, ano, mes), fetch="one"
            )
            query(
                "INSERT INTO metas (radiologia_id, ano, mes, valor_meta) VALUES (%s,%s,%s,%s) "
                "ON DUPLICATE KEY UPDATE valor_meta=%s",
                (radio_id, ano, mes, meta_val, meta_val), fetch="none"
            )
            insert(
                "INSERT INTO metas_historico (radiologia_id, tipo, descricao, valor_anterior, valor_novo, responsavel_id) "
                "VALUES (%s,'mensal','Atualização via tabela de metas',%s,%s,%s)",
                (radio_id, to_decimal(ant.get("valor_meta", 0)) if ant else None, meta_val, user_id)
            )
            atualizadas += 1

        if anual_val is not None:
            query(
                "INSERT INTO metas (radiologia_id, ano, mes, valor_meta) VALUES (%s,%s,NULL,%s) "
                "ON DUPLICATE KEY UPDATE valor_meta=%s",
                (radio_id, ano, anual_val, anual_val), fetch="none"
            )
            atualizadas += 1

    return ok({"sucesso": True, "atualizadas": atualizadas}, "Metas salvas com sucesso.")


@app.route("/v1/metas/<radio_id>", methods=["PUT"])
@require_auth
def metas_atualizar(radio_id):
    """[API] PUT /metas/:radioId"""
    data      = request.get_json(silent=True) or {}
    meta_val  = data.get("meta")
    anual_val = data.get("anual")

    hoje = datetime.date.today()
    ano  = hoje.year
    mes  = hoje.month
    user_id = g.user.get("sub")

    if meta_val is not None:
        query(
            "INSERT INTO metas (radiologia_id, ano, mes, valor_meta) VALUES (%s,%s,%s,%s) "
            "ON DUPLICATE KEY UPDATE valor_meta=%s",
            (radio_id, ano, mes, meta_val, meta_val), fetch="none"
        )
        insert(
            "INSERT INTO metas_historico (radiologia_id, tipo, descricao, valor_novo, responsavel_id) "
            "VALUES (%s,'mensal','Atualização via modal',%s,%s)",
            (radio_id, meta_val, user_id)
        )

    if anual_val is not None:
        query(
            "INSERT INTO metas (radiologia_id, ano, mes, valor_meta) VALUES (%s,%s,NULL,%s) "
            "ON DUPLICATE KEY UPDATE valor_meta=%s",
            (radio_id, ano, anual_val, anual_val), fetch="none"
        )

    rad = query(
        "SELECT r.id, r.nome, "
        "       COALESCE((SELECT valor_meta FROM metas WHERE radiologia_id=r.id AND ano=%s AND mes=%s LIMIT 1),0) AS meta, "
        "       COALESCE((SELECT valor_meta FROM metas WHERE radiologia_id=r.id AND ano=%s AND mes IS NULL LIMIT 1),0) AS anual "
        "FROM radiologias r WHERE r.id=%s",
        (ano, mes, ano, radio_id), fetch="one"
    )
    return ok(rad, "Meta atualizada com sucesso.")


# -----------------------------------------------------------------------------
# 15. RELATÓRIOS
# -----------------------------------------------------------------------------

@app.route("/v1/relatorios/historico", methods=["GET"])
@require_auth
def relatorios_historico():
    """[API] GET /relatorios/historico"""
    rows = query(
        "SELECT rh.nome, rh.periodo, "
        "       COALESCE(r.nome, 'Todas') AS radiologia, "
        "       DATE_FORMAT(rh.criado_em,'%%Y-%%m-%%dT%%H:%%i:%%s') AS geradoEm, "
        "       rh.formato "
        "FROM relatorios_historico rh "
        "LEFT JOIN radiologias r ON r.id = rh.radiologia_id "
        "ORDER BY rh.criado_em DESC LIMIT 50"
    )
    return ok(rows)


@app.route("/v1/relatorios/exportar", methods=["GET"])
@require_auth
def relatorios_exportar():
    """
    [API] GET /relatorios/exportar
    Em produção: gere o arquivo e retorne a URL assinada para download.
    Aqui retornamos uma URL fictícia de exemplo.
    """
    tipo         = request.args.get("tipo", "faturamento")
    formato      = request.args.get("formato", "PDF")
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")

    # Registra no histórico
    nome_relatorio = f"Relatório de {tipo.capitalize()} — {periodo}"
    insert(
        "INSERT INTO relatorios_historico (nome, periodo, radiologia_id, formato, gerado_por) "
        "VALUES (%s, %s, %s, %s, %s)",
        (nome_relatorio, periodo,
         None if radiologia_id == "all" else radiologia_id,
         formato, g.user.get("sub"))
    )

    # TODO: gerar arquivo real (PDF/Excel/CSV) e retornar URL assinada
    url_exemplo = f"/v1/relatorios/download/{uuid.uuid4().hex}.{formato.lower()}"
    return ok({"url": url_exemplo}, "Relatório gerado. Faça o download pelo link.")


@app.route("/v1/relatorios/customizado", methods=["POST"])
@require_auth
def relatorios_customizado():
    """[API] POST /relatorios/customizado"""
    data        = request.get_json(silent=True) or {}
    periodo     = data.get("periodo", "mes_atual")
    radiologias = data.get("radiologias", [])
    colunas     = data.get("colunas", [])
    formato     = data.get("formato", "PDF")
    data_inicio = data.get("dataInicio")
    data_fim    = data.get("dataFim")

    if not colunas:
        return err("Selecione pelo menos uma coluna.", 400)

    nome_relatorio = f"Relatório Customizado — {periodo}"
    insert(
        "INSERT INTO relatorios_historico (nome, periodo, formato, gerado_por) VALUES (%s,%s,%s,%s)",
        (nome_relatorio, periodo, formato, g.user.get("sub"))
    )

    url_exemplo = f"/v1/relatorios/download/{uuid.uuid4().hex}.{formato.lower()}"
    return created({"url": url_exemplo}, "Relatório customizado gerado.")


# -----------------------------------------------------------------------------
# 16. CONFIGURAÇÕES
# -----------------------------------------------------------------------------

@app.route("/v1/configuracoes/geral", methods=["GET"])
@require_auth
def configuracoes_geral_get():
    """[API] GET /configuracoes/geral"""
    row = query("SELECT valor FROM configuracoes WHERE chave = 'geral'", fetch="one")
    if not row:
        return not_found("Configurações não encontradas.")
    try:
        dados = json.loads(row["valor"])
    except Exception:
        dados = {}
    return ok(dados)


@app.route("/v1/configuracoes/geral", methods=["POST"])
@require_admin
def configuracoes_geral_post():
    """[API] POST /configuracoes/geral"""
    data = request.get_json(silent=True) or {}

    if data.get("companyEmail") and not validate_email(data["companyEmail"]):
        return err("E-mail da empresa inválido.", 400)

    if data.get("companyCNPJ") and not validate_cnpj(data["companyCNPJ"]):
        return err("CNPJ inválido.", 400)

    # Busca configuração atual e mescla com os novos dados
    row = query("SELECT valor FROM configuracoes WHERE chave = 'geral'", fetch="one")
    atual = {}
    if row:
        try:
            atual = json.loads(row["valor"])
        except Exception:
            pass

    atual.update({
        "systemName":     data.get("systemName",     atual.get("systemName", "IORD")),
        "systemTagline":  data.get("systemTagline",  atual.get("systemTagline", "")),
        "companyName":    data.get("companyName",    atual.get("companyName", "")),
        "companyFantasy": data.get("companyFantasy", atual.get("companyFantasy", "")),
        "companyCNPJ":    data.get("companyCNPJ",    atual.get("companyCNPJ", "")),
        "companyPhone":   data.get("companyPhone",   atual.get("companyPhone", "")),
        "companyEmail":   data.get("companyEmail",   atual.get("companyEmail", "")),
        "companySite":    data.get("companySite",    atual.get("companySite", "")),
        "companyAddress": data.get("companyAddress", atual.get("companyAddress", "")),
    })

    # Regionalização
    reg = atual.get("regionalization", {})
    for campo in ["language", "timezone", "currency", "dateFormat", "timeFormat"]:
        if campo in data:
            reg[campo] = data[campo]
    atual["regionalization"] = reg

    query(
        "INSERT INTO configuracoes (chave, valor) VALUES ('geral', %s) "
        "ON DUPLICATE KEY UPDATE valor=%s",
        (json.dumps(atual, ensure_ascii=False),
         json.dumps(atual, ensure_ascii=False)),
        fetch="none"
    )
    return ok({"sucesso": True}, "Configurações salvas com sucesso.")


@app.route("/v1/configuracoes/logo", methods=["POST"])
@require_admin
def configuracoes_logo():
    """[API] POST /configuracoes/logo — upload de logo (multipart/form-data)."""
    if "logo" not in request.files:
        return err("Arquivo de logo não enviado.", 400)

    arquivo = request.files["logo"]
    if arquivo.filename == "":
        return err("Nenhum arquivo selecionado.", 400)

    # Valida tipo e tamanho
    extensoes_permitidas = {"png", "jpg", "jpeg", "gif", "webp", "svg"}
    ext = arquivo.filename.rsplit(".", 1)[-1].lower() if "." in arquivo.filename else ""
    if ext not in extensoes_permitidas:
        return err(f"Tipo de arquivo não permitido. Use: {', '.join(extensoes_permitidas)}.", 400)

    arquivo.seek(0, 2)
    tamanho = arquivo.tell()
    arquivo.seek(0)
    if tamanho > 2 * 1024 * 1024:  # 2MB
        return err("Arquivo muito grande. Máximo permitido: 2MB.", 400)

    nome_arquivo = f"logo_{uuid.uuid4().hex}.{ext}"
    caminho      = os.path.join(UPLOAD_FOLDER, nome_arquivo)
    arquivo.save(caminho)

    url_logo = f"/uploads/{nome_arquivo}"

    # Salva URL na configuração
    row = query("SELECT valor FROM configuracoes WHERE chave = 'geral'", fetch="one")
    atual = {}
    if row:
        try:
            atual = json.loads(row["valor"])
        except Exception:
            pass
    atual["logoUrl"] = url_logo
    query(
        "INSERT INTO configuracoes (chave, valor) VALUES ('geral', %s) "
        "ON DUPLICATE KEY UPDATE valor=%s",
        (json.dumps(atual, ensure_ascii=False),
         json.dumps(atual, ensure_ascii=False)),
        fetch="none"
    )

    return ok({"url": url_logo}, "Logo enviada com sucesso.")


# -----------------------------------------------------------------------------
# 17. USUÁRIOS
# -----------------------------------------------------------------------------

@app.route("/v1/usuarios", methods=["GET"])
@require_admin
def listar_usuarios():
    """[API] GET /usuarios"""
    busca  = request.args.get("busca", "")
    level  = request.args.get("level", "")
    status = request.args.get("status", "")

    sql = ("SELECT u.id, u.nome AS name, u.email, u.telefone AS phone, "
           "       u.cargo AS role, u.nivel AS level, "
           "       COALESCE(r.nome, 'Todas') AS radiologia, "
           "       DATE_FORMAT(u.ultimo_acesso,'%%Y-%%m-%%dT%%H:%%i:%%s') AS lastAccess, "
           "       u.status "
           "FROM usuarios u "
           "LEFT JOIN radiologias r ON r.id = u.radiologia_id "
           "WHERE 1=1")
    params = []

    if busca:
        sql += " AND (u.nome LIKE %s OR u.email LIKE %s)"
        like = f"%{busca}%"
        params += [like, like]
    if level:
        sql += " AND u.nivel = %s"; params.append(level)
    if status:
        sql += " AND u.status = %s"; params.append(status)

    sql += " ORDER BY u.nome"
    rows = query(sql, params)
    return ok(rows)


@app.route("/v1/usuarios", methods=["POST"])
@require_admin
def criar_usuario():
    """[API] POST /usuarios"""
    data = request.get_json(silent=True) or {}
    missing = validate_required(data, ["name", "email", "level"])
    if missing:
        return err("Campos obrigatórios ausentes.", 400, missing)

    if not validate_email(data["email"]):
        return err("E-mail inválido.", 400)

    nivel_valido = ("admin", "recepcao", "viewer")
    if data["level"] not in nivel_valido:
        return err(f"Nível inválido. Use: {', '.join(nivel_valido)}.", 400)

    dup = query("SELECT id FROM usuarios WHERE email = %s", (data["email"].lower(),), fetch="one")
    if dup:
        return err("Já existe um usuário com este e-mail.", 409)

    # Senha temporária aleatória
    senha_temp = uuid.uuid4().hex[:10]
    senha_hash = bcrypt.hashpw(senha_temp.encode(), bcrypt.gensalt()).decode()

    rad_id = data.get("radiologia") if data.get("radiologia") not in (None, "todas", "all") else None

    new_id = insert(
        "INSERT INTO usuarios (nome, email, senha_hash, telefone, cargo, nivel, radiologia_id, status) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
        (data["name"], data["email"].lower(), senha_hash,
         data.get("phone"), data.get("role"), data["level"],
         rad_id, data.get("status", "ativo"))
    )

    # TODO: enviar e-mail de boas-vindas com senha_temp
    log.info("Usuário criado: %s | Senha temporária: %s", data["email"], senha_temp)

    usuario = query(
        "SELECT u.id, u.nome AS name, u.email, u.telefone AS phone, u.cargo AS role, "
        "       u.nivel AS level, COALESCE(r.nome,'Todas') AS radiologia, u.status "
        "FROM usuarios u LEFT JOIN radiologias r ON r.id = u.radiologia_id WHERE u.id = %s",
        (new_id,), fetch="one"
    )
    return created(usuario, "Usuário criado com sucesso.")


@app.route("/v1/usuarios/<int:usuario_id>", methods=["PUT"])
@require_admin
def atualizar_usuario(usuario_id):
    """[API] PUT /usuarios/:usuarioId"""
    data = request.get_json(silent=True) or {}
    existe = query("SELECT id FROM usuarios WHERE id = %s", (usuario_id,), fetch="one")
    if not existe:
        return not_found("Usuário não encontrado.")

    if data.get("email") and not validate_email(data["email"]):
        return err("E-mail inválido.", 400)

    rad_id = data.get("radiologia") if data.get("radiologia") not in (None, "todas", "all") else None

    query(
        "UPDATE usuarios SET nome=%s, email=%s, telefone=%s, cargo=%s, "
        "nivel=%s, radiologia_id=%s, status=%s WHERE id=%s",
        (data.get("name"), data.get("email", "").lower() or None,
         data.get("phone"), data.get("role"),
         data.get("level"), rad_id,
         data.get("status", "ativo"), usuario_id),
        fetch="none"
    )
    updated = query(
        "SELECT u.id, u.nome AS name, u.email, u.telefone AS phone, u.cargo AS role, "
        "       u.nivel AS level, COALESCE(r.nome,'Todas') AS radiologia, u.status "
        "FROM usuarios u LEFT JOIN radiologias r ON r.id = u.radiologia_id WHERE u.id=%s",
        (usuario_id,), fetch="one"
    )
    return ok(updated, "Usuário atualizado com sucesso.")


@app.route("/v1/usuarios/<int:usuario_id>", methods=["DELETE"])
@require_admin
def deletar_usuario(usuario_id):
    """[API] DELETE /usuarios/:usuarioId"""
    existe = query("SELECT id, nivel FROM usuarios WHERE id = %s", (usuario_id,), fetch="one")
    if not existe:
        return not_found("Usuário não encontrado.")

    # Impede remoção do único admin
    if existe.get("nivel") == "admin":
        admin_count = query(
            "SELECT COUNT(*) AS c FROM usuarios WHERE nivel='admin' AND status='ativo'",
            fetch="one"
        )
        if admin_count and admin_count.get("c", 0) <= 1:
            return err("Não é possível excluir o único administrador ativo.", 409)

    query("DELETE FROM usuarios WHERE id = %s", (usuario_id,), fetch="none")
    return ok({"sucesso": True}, "Usuário excluído com sucesso.")


# -----------------------------------------------------------------------------
# PARÂMETROS DO SISTEMA
# -----------------------------------------------------------------------------

@app.route("/v1/parametros", methods=["GET"])
@require_auth
def parametros_get():
    """[API] GET /parametros"""
    chaves = ["exam_durations", "whatsapp_messages", "scheduling", "financial"]
    resultado = {}
    for chave in chaves:
        row = query("SELECT valor FROM parametros_sistema WHERE chave = %s", (chave,), fetch="one")
        if row:
            try:
                resultado[chave] = json.loads(row["valor"])
            except Exception:
                resultado[chave] = {}

    # Mapeia para o formato esperado pelo frontend
    tipos = query("SELECT id, label, duracao_min AS duration, valor_base FROM tipos_exame ORDER BY label")
    exam_durations = [{"id": t["id"], "label": t["label"], "duration": t["duration"], "valor_base": float(t["valor_base"] or 0)} for t in tipos]

    return ok({
        "examDurations":    exam_durations,
        "whatsappMessages": resultado.get("whatsapp_messages", []),
        "scheduling":       resultado.get("scheduling", {}),
        "financial":        resultado.get("financial", {}),
    })


@app.route("/v1/parametros", methods=["POST"])
@require_admin
def parametros_post():
    """[API] POST /parametros"""
    data = request.get_json(silent=True) or {}

    durations  = data.get("durations", {})
    messages   = data.get("messages", [])
    scheduling = data.get("scheduling", {})
    financial  = data.get("financial", {})

    # Atualiza duração dos tipos de exame
    for exam_id, duracao in durations.items():
        query(
            "UPDATE tipos_exame SET duracao_min = %s WHERE id = %s",
            (int(duracao), exam_id), fetch="none"
        )

    def _salvar_param(chave, valor):
        v = json.dumps(valor, ensure_ascii=False)
        query(
            "INSERT INTO parametros_sistema (chave, valor) VALUES (%s,%s) "
            "ON DUPLICATE KEY UPDATE valor=%s",
            (chave, v, v), fetch="none"
        )

    if messages:
        _salvar_param("whatsapp_messages", messages)
    if scheduling:
        _salvar_param("scheduling", scheduling)
    if financial:
        _salvar_param("financial", financial)

    return ok({"sucesso": True}, "Parâmetros salvos com sucesso.")


# -----------------------------------------------------------------------------
# 18. PERÍODOS / UTILITÁRIOS
# -----------------------------------------------------------------------------

@app.route("/v1/periodos/opcoes", methods=["GET"])
@require_auth
def periodos_opcoes():
    """[API] GET /periodos/opcoes"""
    opcoes = [
        {"id": "mes_atual",  "label": "Mês atual"},
        {"id": "ultimos_30", "label": "Últimos 30 dias"},
        {"id": "trimestre",  "label": "Trimestre"},
        {"id": "semestre",   "label": "Semestre"},
        {"id": "ano",        "label": "Ano"},
        {"id": "custom",     "label": "Personalizado"},
    ]
    return ok(opcoes)


# -----------------------------------------------------------------------------
# TRATAMENTO GLOBAL DE ERROS
# -----------------------------------------------------------------------------

@app.errorhandler(404)
def handle_404(e):
    return err("Rota não encontrada.", 404)


@app.errorhandler(405)
def handle_405(e):
    return err("Método HTTP não permitido nesta rota.", 405)


@app.errorhandler(Exception)
def handle_exception(e):
    log.exception("Erro não tratado: %s", e)
    return server_error(str(e) if app.debug else "Erro interno do servidor.")


# -----------------------------------------------------------------------------
# 19. INICIALIZAÇÃO
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"

    log.info("IORD Backend iniciando em %s:%s (debug=%s)", host, port, debug)
    app.run(host=host, port=port, debug=debug)