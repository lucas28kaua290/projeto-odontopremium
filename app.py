# =============================================================================
# IORD — Backend Flask Completo  (VERSÃO CORRIGIDA)
# =============================================================================
# CORREÇÕES APLICADAS
# ───────────────────────────────────────────────────────────────────────────────
#
# [FIX-1] financeiro_kpis — NameError: com_ant não definido (linha ~2236)
#   ANTIGO: "comissoesVariacao": variacao_percentual(com_total,
#               to_decimal(com_ant.get("t", 0)) if com_ant else 0)
#   NOVO:   "comissoesVariacao": 0.0
#   MOTIVO: com_ant nunca é declarado no bloco (só com_total, com_pend,
#           com_ant_v). A tentativa de referenciar com_ant causaria NameError
#           silenciado pelo handler global, devolvendo 500 em vez de 200 no
#           endpoint /v1/financeiro/kpis — responsável pelos 401 no console
#           (token válido, mas servidor gerava 500 internamente em alguns casos).
#
# [FIX-2] financeiro_kpis — previsibilidade de caixa sem filtro de período
#   ANTIGO: WHERE a.status='confirmado' {rad_sql_a}   (sem datas)
#   NOVO:   WHERE a.status='confirmado'
#              AND a.data_agendamento >= CURDATE() {rad_sql_a}
#   MOTIVO: Sem restrição de data, a query soma TODOS os agendados confirmados
#           de todos os tempos. A regra de negócio é: agendados com status
#           'confirmado' a partir de hoje = previsão de caixa futura.
#
# [FIX-3] medicos_clinicas_disponiveis — ignora período passado pelo frontend
#   ANTIGO: di, df, _, _ = periodo_para_datas(periodo)  ← ignora data_inicio/fim
#   NOVO:   data_inicio = request.args.get("dataInicio")
#           data_fim    = request.args.get("dataFim")
#           di, df, _, _ = periodo_para_datas(periodo, data_inicio, data_fim)
#   MOTIVO: O frontend envia dataInicio/dataFim, mas o endpoint jogava fora,
#           causando inconsistência entre o filtro de clínica e os demais.
#
# [FIX-4] exames_kpis — lê da tabela agendamentos mas retorna nome da chave
#          incorreto no campo "dados" para o format_series
#   (sem alteração de SQL; a inconsistência é resolvida no FIX-JS-2)
#
# [FIX-5] hierarquia_arvore — usa tabela 'exames' (pode estar vazia);
#          o endpoint já existe e funciona. Não há bug aqui, só nota de
#          que a tela de Dashboard consome /hierarquia/arvore via HierarchyTable
#          que não existe no app.js atual. Corrigido no app.js.
#
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


def validate_required(data: dict, fields: list):
    missing = [f for f in fields if not data.get(f)]
    return missing


def validate_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email.strip()))


def validate_cpf(cpf: str) -> bool:
    cpf = re.sub(r"\D", "", cpf)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for i in range(9, 11):
        s = sum(int(cpf[j]) * (i + 1 - j) for j in range(i))
        if int(cpf[i]) != (s * 10 % 11) % 10:
            return False
    return True


def validate_cnpj(cnpj: str) -> bool:
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
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def row_to_dict(cursor, row):
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


def periodo_para_datas(periodo: str, data_inicio: str = None, data_fim: str = None):
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
# 5. AUTH
# -----------------------------------------------------------------------------

@app.route("/v1/auth/login", methods=["POST"])
def auth_login():
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
    data  = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()

    if not email or not validate_email(email):
        return err("E-mail inválido.", 400)

    usuario = query("SELECT id FROM usuarios WHERE email = %s", (email,), fetch="one")

    if usuario:
        token_reset = str(uuid.uuid4())
        expira      = datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        query(
            "UPDATE usuarios SET reset_token = %s, reset_expira = %s WHERE id = %s",
            (token_reset, expira, usuario["id"]), fetch="none"
        )

    return ok(None, "Se o e-mail existir, você receberá um link de recuperação.")


@app.route("/v1/auth/reset-password", methods=["POST"])
def auth_reset_password():
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
    return err("Integração com Google ainda não configurada.", 501)


# -----------------------------------------------------------------------------
# 6. RADIOLOGIAS
# -----------------------------------------------------------------------------

@app.route("/v1/radiologias", methods=["GET"])
@require_auth
def listar_radiologias():
    rows = query(
        "SELECT id, nome, telefone, email, endereco, "
        "       horario_abertura, horario_fechamento, tecnico, cro, status, cor "
        "FROM radiologias ORDER BY nome"
    )
    todas = {"id": "all", "nome": "Todas as Radiologias"}
    return ok([todas] + rows)


@app.route("/v1/radiologias/<radiologia_id>", methods=["GET"])
@require_auth
def detalhe_radiologia(radiologia_id):
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
    data = request.get_json(silent=True) or {}
    missing = validate_required(data, ["name"])
    if missing:
        return err("Campos obrigatórios ausentes.", 400, missing)

    slug = re.sub(r"[^a-z0-9]+", "_", data["name"].lower().strip()).strip("_")
    rad_id = f"rad_{slug}"

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
    exists = query("SELECT id FROM radiologias WHERE id = %s", (radiologia_id,), fetch="one")
    if not exists:
        return not_found("Radiologia não encontrada.")

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
    radiologia_id = request.args.get("radiologiaId", "all")
    clinica_id    = request.args.get("clinicaId")
    busca         = request.args.get("busca", "")
    status        = request.args.get("status", "")

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
    exists = query("SELECT id FROM medicos WHERE id = %s", (medico_id,), fetch="one")
    if not exists:
        return not_found("Médico não encontrado.")
    query("DELETE FROM medicos WHERE id = %s", (medico_id,), fetch="none")
    return ok({"sucesso": True}, "Médico excluído com sucesso.")


@app.route("/v1/medicos/<int:medico_id>/exames", methods=["GET"])
@require_auth
def medico_exames(medico_id):
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
    radiologia_id = request.args.get("radiologiaId", "all")
    clinica_id    = request.args.get("clinicaId")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    limite        = int(request.args.get("limite", 5))
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    sql = """
        SELECT m.id AS medicoId, m.nome AS medicoNome,
               c.nome AS clinicaNome,
               (SELECT r2.nome FROM radiologias r2
                JOIN agendamentos a2 ON a2.radiologia_id = r2.id
                WHERE a2.medico_id = m.id AND a2.status='realizado'
                ORDER BY a2.data_agendamento DESC LIMIT 1
               ) AS radiologiaNome,
               COUNT(a.id) AS totalExames,
               COALESCE(SUM(te.valor_base), 0) AS faturamento
        FROM medicos m
        JOIN clinicas c ON c.id = m.clinica_id
        LEFT JOIN agendamentos a ON a.medico_id = m.id
               AND a.status='realizado'
               AND a.data_agendamento BETWEEN %s AND %s
        LEFT JOIN tipos_exame te ON te.id = a.tipo_exame_id
        WHERE 1=1
    """
    params = [di, df]

    if radiologia_id != "all":
        sql += " AND a.radiologia_id = %s"
        params.append(radiologia_id)
    if clinica_id and clinica_id != "all":
        sql += " AND m.clinica_id = %s"
        params.append(clinica_id)

    sql += " GROUP BY m.id, m.nome, c.nome ORDER BY totalExames DESC LIMIT %s"
    params.append(limite)

    medicos_top = query(sql, params)

    for med in medicos_top:
        tipos = query(
            "SELECT te.label AS tipo, COUNT(*) AS exames "
            "FROM agendamentos a JOIN tipos_exame te ON te.id = a.tipo_exame_id "
            "WHERE a.medico_id = %s AND a.status='realizado' "
            "AND a.data_agendamento BETWEEN %s AND %s "
            "GROUP BY te.label ORDER BY exames DESC LIMIT 5",
            (med["medicoId"], di, df)
        )
        med["tiposDeExame"] = tipos

    return ok(medicos_top)


# [FIX-3] medicos_clinicas_disponiveis — agora usa período corretamente
@app.route("/v1/medicos/clinicas-disponiveis", methods=["GET"])
@require_auth
def medicos_clinicas_disponiveis():
    """
    [API] GET /medicos/clinicas-disponiveis

    CORREÇÃO (FIX-3): a versão original ignorava data_inicio e data_fim
    recebidos pelo frontend, chamando periodo_para_datas sem esses parâmetros.
    Isso fazia o filtro de clínica divergir dos demais módulos quando o
    usuário usava "personalizado".

    ANTIGO:
        di, df, _, _ = periodo_para_datas(periodo)

    NOVO:
        data_inicio = request.args.get("dataInicio")
        data_fim    = request.args.get("dataFim")
        di, df, _, _ = periodo_para_datas(periodo, data_inicio, data_fim)
    """
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")   # <-- ADICIONADO
    data_fim      = request.args.get("dataFim")       # <-- ADICIONADO
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)  # <-- CORRIGIDO

    if radiologia_id == "all":
        rows = query(
            "SELECT DISTINCT c.id AS clinicaId, c.nome AS clinicaNome "
            "FROM clinicas c "
            "JOIN agendamentos a ON a.clinica_id = c.id "
            "WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s "
            "ORDER BY c.nome", (di, df)
        )
    else:
        rows = query(
            "SELECT DISTINCT c.id AS clinicaId, c.nome AS clinicaNome "
            "FROM clinicas c "
            "JOIN agendamentos a ON a.clinica_id = c.id "
            "WHERE a.radiologia_id = %s AND a.status='realizado' "
            "AND a.data_agendamento BETWEEN %s AND %s "
            "ORDER BY c.nome", (radiologia_id, di, df)
        )

    todas = {"clinicaId": "all", "clinicaNome": "Todas as Clínicas"}
    return ok([todas] + rows)


# -----------------------------------------------------------------------------
# 9. PACIENTES E AGENDAMENTOS
# -----------------------------------------------------------------------------

@app.route("/v1/agendamentos", methods=["GET"])
@require_auth
def listar_agendamentos():
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
    return ok(rows)


@app.route("/v1/agendamentos", methods=["POST"])
@require_auth
def criar_agendamento():
    data = request.get_json(silent=True) or {}
    missing = validate_required(data, ["pacienteId", "radiologiaId", "tipoExameId", "data", "horarioInicio"])
    if missing:
        return err("Campos obrigatórios ausentes.", 400, missing)

    new_id = insert(
        "INSERT INTO agendamentos (paciente_id, radiologia_id, clinica_id, medico_id, "
        "tipo_exame_id, data_agendamento, hora_agendamento, status, observacoes) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (data["pacienteId"], data["radiologiaId"],
         data.get("clinicaId"), data.get("medicoId"),
         data["tipoExameId"], data["data"], data["horarioInicio"],
         data.get("status", "agendado"), data.get("observacoes"))
    )
    return created({"id": new_id}, "Agendamento criado com sucesso.")


@app.route("/v1/agendamentos/<int:agendamento_id>", methods=["PUT", "PATCH"])
@require_auth
def atualizar_agendamento(agendamento_id):
    data = request.get_json(silent=True) or {}
    exists = query("SELECT id FROM agendamentos WHERE id = %s", (agendamento_id,), fetch="one")
    if not exists:
        return not_found("Agendamento não encontrado.")

    campos = []
    params = []

    mapa = {
        "pacienteId":     "paciente_id",
        "radiologiaId":   "radiologia_id",
        "clinicaId":      "clinica_id",
        "medicoId":       "medico_id",
        "tipoExameId":    "tipo_exame_id",
        "data":           "data_agendamento",
        "horarioInicio":  "hora_agendamento",
        "status":         "status",
        "observacoes":    "observacoes",
    }

    for js_key, db_col in mapa.items():
        if js_key in data:
            campos.append(f"{db_col} = %s")
            params.append(data[js_key])

    if not campos:
        return err("Nenhum campo para atualizar.", 400)

    params.append(agendamento_id)
    query(f"UPDATE agendamentos SET {', '.join(campos)} WHERE id = %s", params, fetch="none")

    return ok({"id": agendamento_id}, "Agendamento atualizado com sucesso.")


@app.route("/v1/agendamentos/<int:agendamento_id>", methods=["DELETE"])
@require_auth
def deletar_agendamento(agendamento_id):
    exists = query("SELECT id FROM agendamentos WHERE id = %s", (agendamento_id,), fetch="one")
    if not exists:
        return not_found("Agendamento não encontrado.")
    query("DELETE FROM agendamentos WHERE id = %s", (agendamento_id,), fetch="none")
    return ok({"sucesso": True}, "Agendamento excluído com sucesso.")


@app.route("/v1/pacientes", methods=["GET"])
@require_auth
def listar_pacientes():
    busca  = request.args.get("busca", "")
    status = request.args.get("status", "")
    limite = int(request.args.get("limite", 50))
    offset = int(request.args.get("offset", 0))

    sql    = "SELECT id, nome, cpf, telefone, email, nascimento, status, criado_em AS cadastro FROM pacientes WHERE 1=1"
    params = []

    if busca:
        sql += " AND (nome LIKE %s OR cpf LIKE %s OR telefone LIKE %s)"
        like = f"%{busca}%"
        params += [like, like, like]
    if status:
        sql += " AND status = %s"
        params.append(status)

    sql += f" ORDER BY nome LIMIT {limite} OFFSET {offset}"
    rows = query(sql, params)
    return ok(rows)


@app.route("/v1/pacientes", methods=["POST"])
@require_auth
def criar_paciente():
    data = request.get_json(silent=True) or {}
    missing = validate_required(data, ["nome"])
    if missing:
        return err("Campos obrigatórios ausentes.", 400, missing)

    pac_id = f"PAC{uuid.uuid4().hex[:8].upper()}"

    cpf_val = None
    if data.get("cpf"):
        cpf_limpo = re.sub(r"\D", "", data["cpf"])
        cpf_val = f"{cpf_limpo[:3]}.{cpf_limpo[3:6]}.{cpf_limpo[6:9]}-{cpf_limpo[9:]}"

    if cpf_val:
        existente = query(
            "SELECT id FROM pacientes WHERE cpf = %s",
            (cpf_val,), fetch="one"
        )
        if existente:
            return err("CPF já cadastrado.", 409, {"pacienteId": existente["id"]})

    insert(
        "INSERT INTO pacientes (id, nome, cpf, telefone, email, nascimento, endereco, status, observacoes) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (pac_id, data["nome"], cpf_val,
         data.get("telefone"), data.get("email"),
         data.get("nascimento"), data.get("endereco"),
         data.get("status", "ativo"), data.get("observacoes"))
    )

    paciente = query(
        "SELECT id, nome, cpf, telefone, email, nascimento, endereco, status, "
        "criado_em AS cadastro, observacoes FROM pacientes WHERE id = %s",
        (pac_id,), fetch="one"
    )
    return created(paciente, "Paciente criado com sucesso.")


@app.route("/v1/pacientes/<paciente_id>", methods=["GET"])
@require_auth
def detalhe_paciente(paciente_id):
    row = query(
        "SELECT id, nome, cpf, telefone, email, nascimento, endereco, "
        "status, criado_em AS cadastro, observacoes FROM pacientes WHERE id = %s",
        (paciente_id,), fetch="one"
    )
    if not row:
        return not_found("Paciente não encontrado.")
    return ok(row)


@app.route("/v1/pacientes/<paciente_id>", methods=["PUT", "PATCH"])
@require_auth
def atualizar_paciente(paciente_id):
    data = request.get_json(silent=True) or {}
    exists = query("SELECT id FROM pacientes WHERE id = %s", (paciente_id,), fetch="one")
    if not exists:
        return not_found("Paciente não encontrado.")

    campos_permitidos = ["nome", "cpf", "telefone", "email", "nascimento", "endereco", "status", "observacoes"]
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


@app.route("/v1/pacientes/<paciente_id>/kpis", methods=["GET"])
@require_auth
def paciente_kpis(paciente_id):
    exists = query("SELECT id FROM pacientes WHERE id = %s", (paciente_id,), fetch="one")
    if not exists:
        return not_found("Paciente não encontrado.")

    totais = query(
        "SELECT COUNT(*) AS totalExames, COALESCE(SUM(te.valor_base),0) AS totalGasto "
        "FROM agendamentos a JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        "WHERE a.paciente_id = %s AND a.status='realizado'",
        (paciente_id,), fetch="one"
    )
    ultimo = query(
        "SELECT MAX(a.data_agendamento) AS ultimoExame FROM agendamentos a "
        "WHERE a.paciente_id = %s AND a.status='realizado'",
        (paciente_id,), fetch="one"
    )
    return ok({
        "totalExames": totais.get("totalExames", 0) if totais else 0,
        "totalGasto":  to_decimal(totais.get("totalGasto", 0)) if totais else 0,
        "ultimoExame": ultimo.get("ultimoExame") if ultimo else None,
    })


@app.route("/v1/pacientes/<paciente_id>/exames", methods=["GET"])
@require_auth
def paciente_exames(paciente_id):
    rows = query(
        "SELECT a.id, te.label AS tipoExame, r.nome AS radiologia, "
        "DATE_FORMAT(a.data_agendamento,'%Y-%m-%d') AS data, a.status, "
        "te.valor_base AS valor "
        "FROM agendamentos a "
        "JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        "JOIN radiologias r ON r.id = a.radiologia_id "
        "WHERE a.paciente_id = %s ORDER BY a.data_agendamento DESC",
        (paciente_id,)
    )
    return ok(rows)


@app.route("/v1/pacientes/<paciente_id>/agendamentos", methods=["GET"])
@require_auth
def paciente_agendamentos(paciente_id):
    rows = query(
        "SELECT a.id, te.label AS tipoExame, r.nome AS radiologia, "
        "DATE_FORMAT(a.data_agendamento,'%Y-%m-%d') AS data, "
        "TIME_FORMAT(a.hora_agendamento,'%H:%i') AS hora, a.status "
        "FROM agendamentos a "
        "JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        "JOIN radiologias r ON r.id = a.radiologia_id "
        "WHERE a.paciente_id = %s ORDER BY a.data_agendamento DESC",
        (paciente_id,)
    )
    return ok(rows)


@app.route("/v1/pacientes/<paciente_id>/notas", methods=["GET"])
@require_auth
def paciente_notas(paciente_id):
    rows = query(
        "SELECT id, texto, criado_em FROM paciente_notas WHERE paciente_id = %s ORDER BY criado_em DESC",
        (paciente_id,)
    )
    return ok(rows)


@app.route("/v1/pacientes/<paciente_id>/notas", methods=["POST"])
@require_auth
def criar_nota(paciente_id):
    data = request.get_json(silent=True) or {}
    texto = data.get("texto", "").strip()
    if not texto:
        return err("Texto da nota é obrigatório.", 400)
    new_id = insert(
        "INSERT INTO paciente_notas (paciente_id, texto) VALUES (%s,%s)",
        (paciente_id, texto)
    )
    nota = query("SELECT id, texto, criado_em FROM paciente_notas WHERE id = %s", (new_id,), fetch="one")
    return created(nota, "Nota criada com sucesso.")


# -----------------------------------------------------------------------------
# 10. EXAMES — KPIs, Evolução, Comparativo, Ranking, Destaques
# -----------------------------------------------------------------------------

def _filtro_radiologia_sql(radiologia_id, alias="e"):
    if radiologia_id and radiologia_id != "all":
        return f" AND {alias}.radiologia_id = %s", [radiologia_id]
    return "", []


@app.route("/v1/exames/kpis", methods=["GET"])
@require_auth
def exames_kpis():
    """
    [API] GET /exames/kpis

    Regra de negócio:
      - status='realizado' em agendamentos → conta na produção real
      - Usa tabela agendamentos (não exames) para manter consistência
        com o endpoint /financeiro/kpis.
    """
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql_a, rad_params_a = _filtro_radiologia_sql(radiologia_id, alias="a")

    atual = query(
        f"SELECT COUNT(*) AS total FROM agendamentos a "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a}",
        [di, df] + rad_params_a, fetch="one"
    )
    anterior = query(
        f"SELECT COUNT(*) AS total FROM agendamentos a "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a}",
        [pi, pf] + rad_params_a, fetch="one"
    )

    total_atual    = atual.get("total", 0) if atual else 0
    total_anterior = anterior.get("total", 0) if anterior else 0

    dias = max(1, (df - di).days + 1)
    media_dia = round(total_atual / dias, 1)

    tipo_top = query(
        f"SELECT te.label AS tipo, COUNT(*) AS qtd FROM agendamentos a "
        f"JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a} "
        f"GROUP BY te.label ORDER BY qtd DESC LIMIT 1",
        [di, df] + rad_params_a, fetch="one"
    )

    ref = query(
        f"SELECT COUNT(*) AS total FROM agendamentos a "
        f"WHERE a.status='realizado' AND a.medico_id IS NOT NULL "
        f"AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a}",
        [di, df] + rad_params_a, fetch="one"
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
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql_a, rad_params_a = _filtro_radiologia_sql(radiologia_id, alias="a")

    rows = query(
        f"SELECT DATE_FORMAT(a.data_agendamento, '%%b/%%y') AS label, "
        f"       r.id AS radiologiaId, r.nome AS nome, COUNT(*) AS dados "
        f"FROM agendamentos a "
        f"JOIN radiologias r ON r.id = a.radiologia_id "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a} "
        f"GROUP BY YEAR(a.data_agendamento), MONTH(a.data_agendamento), r.id, r.nome "
        f"ORDER BY YEAR(a.data_agendamento), MONTH(a.data_agendamento)",
        [di, df] + rad_params_a
    )

    return ok(_format_series(rows))


@app.route("/v1/exames/comparativo/quantidade", methods=["GET"])
@require_auth
def exames_comparativo():
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    if radiologia_id == "all":
        agrupamento = "radiologia"
        rows = query(
            "SELECT r.id, r.nome, COUNT(a.id) AS exames, COALESCE(SUM(te.valor_base),0) AS faturamento "
            "FROM radiologias r "
            "LEFT JOIN agendamentos a ON a.radiologia_id = r.id "
            "       AND a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s "
            "LEFT JOIN tipos_exame te ON te.id = a.tipo_exame_id "
            "GROUP BY r.id, r.nome ORDER BY exames DESC",
            (di, df)
        )
    else:
        agrupamento = "clinica"
        rows = query(
            "SELECT c.id, c.nome, COUNT(a.id) AS exames, COALESCE(SUM(te.valor_base),0) AS faturamento "
            "FROM clinicas c "
            "LEFT JOIN agendamentos a ON a.clinica_id = c.id "
            "       AND a.radiologia_id = %s "
            "       AND a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s "
            "LEFT JOIN tipos_exame te ON te.id = a.tipo_exame_id "
            "GROUP BY c.id, c.nome ORDER BY exames DESC",
            (radiologia_id, di, df)
        )

    return ok({"agrupamento": agrupamento, "itens": rows})


@app.route("/v1/exames/distribuicao-por-tipo", methods=["GET"])
@require_auth
def exames_distribuicao_por_tipo():
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql_a, rad_params_a = _filtro_radiologia_sql(radiologia_id, alias="a")

    rows = query(
        f"SELECT te.label AS tipo, COUNT(*) AS quantidade "
        f"FROM agendamentos a JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a} "
        f"GROUP BY te.label ORDER BY quantidade DESC",
        [di, df] + rad_params_a
    )
    return ok({"tipos": rows})


@app.route("/v1/exames/ranking/clinicas", methods=["GET"])
@require_auth
def exames_ranking_clinicas():
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    limite        = int(request.args.get("limite", 6))
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql_a, rad_params_a = _filtro_radiologia_sql(radiologia_id, alias="a")

    rows = query(
        f"SELECT c.id AS clinicaId, c.nome AS clinicaNome, r.nome AS radiologiaNome, "
        f"       COUNT(a.id) AS totalExames "
        f"FROM clinicas c "
        f"JOIN agendamentos a ON a.clinica_id = c.id "
        f"JOIN radiologias r ON r.id = a.radiologia_id "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a} "
        f"GROUP BY c.id, c.nome, r.nome ORDER BY totalExames DESC LIMIT %s",
        [di, df] + rad_params_a + [limite]
    )
    return ok(rows)


@app.route("/v1/exames/ranking/medicos", methods=["GET"])
@require_auth
def exames_ranking_medicos():
    radiologia_id = request.args.get("radiologiaId", "all")
    clinica_id    = request.args.get("clinicaId")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    limite        = int(request.args.get("limite", 10))
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    cli_sql, cli_params = "", []
    if clinica_id and clinica_id != "all":
        cli_sql = " AND m.clinica_id = %s"
        cli_params = [clinica_id]

    rad_sql_a, rad_params_a = _filtro_radiologia_sql(radiologia_id, alias="a")

    rows = query(
        f"SELECT m.id AS medicoId, m.nome AS medicoNome, c.nome AS clinicaNome, "
        f"       r.nome AS radiologiaNome, COUNT(a.id) AS totalExames, "
        f"       COALESCE(SUM(te.valor_base),0) AS faturamento "
        f"FROM medicos m "
        f"JOIN clinicas c ON c.id = m.clinica_id "
        f"JOIN agendamentos a ON a.medico_id = m.id "
        f"JOIN radiologias r ON r.id = a.radiologia_id "
        f"JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a}{cli_sql} "
        f"GROUP BY m.id, m.nome, c.nome, r.nome ORDER BY totalExames DESC LIMIT %s",
        [di, df] + rad_params_a + cli_params + [limite]
    )
    return ok(rows)


@app.route("/v1/exames/destaques", methods=["GET"])
@require_auth
def exames_destaques():
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql_a, rad_params_a = _filtro_radiologia_sql(radiologia_id, alias="a")

    med_dest = query(
        f"SELECT m.nome AS nome, COUNT(a.id) AS totalExames, c.nome AS clinicaNome "
        f"FROM agendamentos a "
        f"JOIN medicos m ON m.id = a.medico_id "
        f"JOIN clinicas c ON c.id = m.clinica_id "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a} "
        f"GROUP BY m.id, m.nome, c.nome ORDER BY totalExames DESC LIMIT 1",
        [di, df] + rad_params_a, fetch="one"
    )

    cli_lider = query(
        f"SELECT c.nome AS nome, COUNT(a.id) AS totalExames "
        f"FROM agendamentos a JOIN clinicas c ON c.id = a.clinica_id "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a} "
        f"GROUP BY c.id, c.nome ORDER BY totalExames DESC LIMIT 1",
        [di, df] + rad_params_a, fetch="one"
    )

    tipo_top = query(
        f"SELECT te.label AS tipo, COUNT(*) AS quantidade "
        f"FROM agendamentos a JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a} "
        f"GROUP BY te.label ORDER BY quantidade DESC LIMIT 1",
        [di, df] + rad_params_a, fetch="one"
    )

    total_atual    = query(f"SELECT COUNT(*) AS t FROM agendamentos a WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a}", [di, df] + rad_params_a, fetch="one")
    total_anterior = query(f"SELECT COUNT(*) AS t FROM agendamentos a WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a}", [pi, pf] + rad_params_a, fetch="one")

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
# 11. HIERARQUIA
# -----------------------------------------------------------------------------

@app.route("/v1/hierarquia/arvore", methods=["GET"])
@require_auth
def hierarquia_arvore():
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
    labels_set  = {}
    series_dict = {}

    for r in rows:
        lbl = r.get("label", "")
        rid = r.get("radiologiaId", "")
        nom = r.get("nome", "")

        if lbl not in labels_set:
            labels_set[lbl] = len(labels_set)
        if rid not in series_dict:
            series_dict[rid] = {"radiologiaId": rid, "nome": nom, "dados": []}

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
    """
    [API] GET /financeiro/kpis

    Regra de negócio (confirmada pelo desenvolvedor):
      - status='realizado' → produção real (faturamento, exames)
      - status='confirmado' → previsão de caixa (exames ainda não realizados)

    CORREÇÃO [FIX-1]: removida referência a variável `com_ant` que não existia,
    causando NameError silenciado (HTTP 500) no endpoint.

    ANTIGO (linha ~2236):
        "comissoesVariacao": variacao_percentual(com_total,
            to_decimal(com_ant.get("t", 0)) if com_ant else 0),

    NOVO:
        "comissoesVariacao": 0.0,

    CORREÇÃO [FIX-2]: previsão de caixa agora filtra apenas agendamentos futuros
    (data >= hoje), não todos os confirmados de todos os tempos.

    ANTIGO:
        WHERE a.status='confirmado' {rad_sql_a}   -- sem filtro de data

    NOVO:
        WHERE a.status='confirmado'
          AND a.data_agendamento >= CURDATE() {rad_sql_a}
    """
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql_a, rad_params_a = _filtro_radiologia_sql(radiologia_id, alias="a")

    def _fat(d_ini, d_fim):
        r = query(
            f"SELECT COALESCE(SUM(te.valor_base),0) AS t, COUNT(a.id) AS c "
            f"FROM agendamentos a "
            f"JOIN tipos_exame te ON te.id = a.tipo_exame_id "
            f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a}",
            [d_ini, d_fim] + rad_params_a, fetch="one"
        )
        return r or {"t": 0, "c": 0}

    atual    = _fat(di, df)
    anterior = _fat(pi, pf)

    fat_atual = to_decimal(atual.get("t", 0))
    fat_ant   = to_decimal(anterior.get("t", 0))
    exm_atual = atual.get("c", 0)
    exm_ant   = anterior.get("c", 0)

    cli_ativas = query(
        f"SELECT COUNT(DISTINCT a.clinica_id) AS c FROM agendamentos a "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a}",
        [di, df] + rad_params_a, fetch="one"
    )

    # [FIX-2] Previsão de caixa: apenas agendamentos confirmados a partir de hoje
    agend = query(
        f"SELECT COUNT(a.id) AS c, COALESCE(SUM(te.valor_base),0) AS valor "
        f"FROM agendamentos a "
        f"JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        f"WHERE a.status='confirmado' "
        f"AND a.data_agendamento >= CURDATE() {rad_sql_a}",  # <-- CORRIGIDO
        rad_params_a, fetch="one"
    )

    fat_med_cli = query(
        f"SELECT COALESCE(AVG(sub.fat),0) AS avg_fat "
        f"FROM (SELECT a.clinica_id, SUM(te.valor_base) AS fat "
        f"      FROM agendamentos a "
        f"      JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        f"      WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a} "
        f"      GROUP BY a.clinica_id) sub",
        [di, df] + rad_params_a, fetch="one"
    )

    ticket   = fat_atual / max(1, exm_atual)
    previsao = to_decimal(agend.get("valor", 0)) if agend else 0

    com_total = 0.0
    com_pend  = 0.0

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
        "comissoesVariacao":              0.0,  # [FIX-1] era com_ant (NameError)
        # Formato alternativo esperado pela tela Financeiro
        "faturamentoLiquido": {"value": round(fat_atual * 0.92, 2), "context": "Após impostos estimados"},
        "margemLucro":        {"value": round((fat_atual * 0.92 - com_total) / fat_atual * 100, 1) if fat_atual else 0, "changeMonth": 0},
        "previsao30d":        {"value": round(previsao, 2), "forecast60d": round(previsao * 1.05, 2)},
    })


@app.route("/v1/financeiro/snapshot", methods=["GET"])
@require_auth
def financeiro_snapshot():
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
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql_a, rad_params_a = _filtro_radiologia_sql(radiologia_id, alias="a")

    rows = query(
        f"SELECT DATE_FORMAT(a.data_agendamento,'%%b/%%y') AS label, "
        f"       r.id AS radiologiaId, r.nome AS nome, "
        f"       COALESCE(SUM(te.valor_base),0) AS dados "
        f"FROM agendamentos a "
        f"JOIN radiologias r ON r.id = a.radiologia_id "
        f"JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        f"WHERE a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s {rad_sql_a} "
        f"GROUP BY YEAR(a.data_agendamento), MONTH(a.data_agendamento), r.id, r.nome "
        f"ORDER BY YEAR(a.data_agendamento), MONTH(a.data_agendamento)",
        [di, df] + rad_params_a
    )
    return ok(_format_series(rows))


@app.route("/v1/financeiro/evolucao", methods=["GET"])
@require_auth
def financeiro_evolucao():
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

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

    labels     = [r["label"] for r in rows]
    fat_vals   = [to_decimal(r.get("fat", 0)) for r in rows]
    exm_vals   = [r.get("exm", 0) for r in rows]
    ano_dict   = {r["label"]: to_decimal(r.get("fat", 0)) for r in rows_ano}
    fat_ano    = [ano_dict.get(l, 0) for l in labels]

    return ok({
        "labels":       labels,
        "faturamento":  fat_vals,
        "exames":       exm_vals,
        "faturamentoAnoAnterior": fat_ano,
    })


@app.route("/v1/financeiro/comparativo/faturamento", methods=["GET"])
@require_auth
def financeiro_comparativo():
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql_a, rad_params_a = _filtro_radiologia_sql(radiologia_id, alias="a")

    if radiologia_id == "all":
        agrupamento = "radiologia"
        rows = query(
            f"SELECT r.id, r.nome, COUNT(a.id) AS exames, "
            f"       COALESCE(SUM(te.valor_base),0) AS faturamento "
            f"FROM radiologias r "
            f"LEFT JOIN agendamentos a ON a.radiologia_id = r.id "
            f"       AND a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s "
            f"LEFT JOIN tipos_exame te ON te.id = a.tipo_exame_id "
            f"GROUP BY r.id, r.nome ORDER BY faturamento DESC",
            (di, df)
        )
    else:
        agrupamento = "clinica"
        rows = query(
            f"SELECT c.id, c.nome, COUNT(a.id) AS exames, "
            f"       COALESCE(SUM(te.valor_base),0) AS faturamento "
            f"FROM clinicas c "
            f"LEFT JOIN agendamentos a ON a.clinica_id = c.id "
            f"       AND a.radiologia_id = %s "
            f"       AND a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s "
            f"LEFT JOIN tipos_exame te ON te.id = a.tipo_exame_id "
            f"GROUP BY c.id, c.nome ORDER BY faturamento DESC",
            (radiologia_id, di, df)
        )

    # Enriquece com breakdown de médicos por clínica/radiologia
    result = []
    for item in rows:
        if agrupamento == "radiologia":
            medicos = query(
                "SELECT m.id, m.nome, COUNT(a.id) AS exames, "
                "       COALESCE(SUM(te.valor_base),0) AS faturamento "
                "FROM medicos m "
                "JOIN agendamentos a ON a.medico_id = m.id "
                "JOIN tipos_exame te ON te.id = a.tipo_exame_id "
                "WHERE a.radiologia_id = %s AND a.status='realizado' "
                "AND a.data_agendamento BETWEEN %s AND %s "
                "GROUP BY m.id, m.nome ORDER BY faturamento DESC LIMIT 5",
                (item["id"], di, df)
            )
        else:
            medicos = query(
                "SELECT m.id, m.nome, COUNT(a.id) AS exames, "
                "       COALESCE(SUM(te.valor_base),0) AS faturamento "
                "FROM medicos m "
                "JOIN agendamentos a ON a.medico_id = m.id "
                "JOIN tipos_exame te ON te.id = a.tipo_exame_id "
                "WHERE a.clinica_id = %s AND a.radiologia_id = %s "
                "AND a.status='realizado' AND a.data_agendamento BETWEEN %s AND %s "
                "GROUP BY m.id, m.nome ORDER BY faturamento DESC LIMIT 5",
                (item["id"], radiologia_id, di, df)
            )
        result.append({**item, "medicos": medicos})

    return ok({"agrupamento": agrupamento, "itens": result})


@app.route("/v1/financeiro/por-radiologia", methods=["GET"])
@require_auth
def financeiro_por_radiologia():
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    di, df, pi, pf = periodo_para_datas(periodo, data_inicio, data_fim)

    rows = query(
        "SELECT r.id AS radiologiaId, r.nome AS radiologiaNome, "
        "       COALESCE(SUM(CASE WHEN a.data_agendamento BETWEEN %s AND %s THEN te.valor_base ELSE 0 END),0) AS faturamentoAtual, "
        "       COALESCE(SUM(CASE WHEN a.data_agendamento BETWEEN %s AND %s THEN te.valor_base ELSE 0 END),0) AS faturamentoAnterior, "
        "       COUNT(CASE WHEN a.data_agendamento BETWEEN %s AND %s THEN 1 END) AS examesAtual "
        "FROM radiologias r "
        "LEFT JOIN agendamentos a ON a.radiologia_id = r.id AND a.status='realizado' "
        "LEFT JOIN tipos_exame te ON te.id = a.tipo_exame_id "
        "GROUP BY r.id, r.nome ORDER BY faturamentoAtual DESC",
        (di, df, pi, pf, di, df)
    )

    for r in rows:
        fat_at = to_decimal(r.get("faturamentoAtual", 0))
        fat_an = to_decimal(r.get("faturamentoAnterior", 0))
        r["variacao"] = variacao_percentual(fat_at, fat_an)

    return ok(rows)


@app.route("/v1/financeiro/top-clinicas", methods=["GET"])
@require_auth
def financeiro_top_clinicas():
    radiologia_id = request.args.get("radiologiaId", "all")
    periodo       = request.args.get("periodo", "mes_atual")
    data_inicio   = request.args.get("dataInicio")
    data_fim      = request.args.get("dataFim")
    limite        = int(request.args.get("limite", 10))
    di, df, _, _  = periodo_para_datas(periodo, data_inicio, data_fim)

    rad_sql, rad_params = _filtro_radiologia_sql(radiologia_id)

    total_r = query(
        f"SELECT COALESCE(SUM(e.valor),0) AS total "
        f"FROM exames e WHERE e.status='realizado' AND e.data_exame BETWEEN %s AND %s {rad_sql}",
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

        fat_v = to_decimal(fat_rad.get("fat", 0)) if fat_rad else 0
        fat_a_v = to_decimal(fat_rad_ant.get("fat", 0)) if fat_rad_ant else 0

        resultado.append({
            "radiologiaId":   rad["id"],
            "radiologiaNome": rad["nome"],
            "faturamento":    fat_v,
            "exames":         fat_rad.get("exm", 0) if fat_rad else 0,
            "variacao":       variacao_percentual(fat_v, fat_a_v),
        })

    return ok(resultado)


# -----------------------------------------------------------------------------
# 14. METAS
# -----------------------------------------------------------------------------

@app.route("/v1/metas", methods=["GET"])
@require_auth
def metas_get():
    radiologia_id = request.args.get("radiologiaId", "all")
    ano           = request.args.get("ano", str(datetime.date.today().year))
    mes           = request.args.get("mes")

    sql    = "SELECT id, radiologia_id, ano, mes, valor_meta, criado_em FROM metas WHERE 1=1"
    params = []

    if radiologia_id != "all":
        sql += " AND radiologia_id = %s"; params.append(radiologia_id)
    if ano:
        sql += " AND ano = %s"; params.append(int(ano))
    if mes:
        sql += " AND mes = %s"; params.append(int(mes))

    sql += " ORDER BY ano DESC, mes"
    rows = query(sql, params)
    return ok(rows)


@app.route("/v1/metas/historico", methods=["GET"])
@require_auth
def metas_historico():
    radiologia_id = request.args.get("radiologiaId", "all")
    sql    = "SELECT * FROM metas_historico WHERE 1=1"
    params = []
    if radiologia_id != "all":
        sql += " AND radiologia_id = %s"; params.append(radiologia_id)
    sql += " ORDER BY criado_em DESC LIMIT 50"
    rows = query(sql, params)
    return ok(rows)


@app.route("/v1/metas/salvar", methods=["POST"])
@require_auth
def metas_salvar():
    data = request.get_json(silent=True) or {}
    items = data.get("metas", [])
    for item in items:
        rad_id = item.get("radiologiaId")
        ano    = item.get("ano")
        mes    = item.get("mes")
        valor  = item.get("valorMeta", 0)
        if not rad_id or not ano:
            continue
        existing = query(
            "SELECT id FROM metas WHERE radiologia_id=%s AND ano=%s AND (mes=%s OR (mes IS NULL AND %s IS NULL))",
            (rad_id, ano, mes, mes), fetch="one"
        )
        if existing:
            query(
                "UPDATE metas SET valor_meta=%s WHERE id=%s",
                (valor, existing["id"]), fetch="none"
            )
        else:
            insert(
                "INSERT INTO metas (radiologia_id, ano, mes, valor_meta) VALUES (%s,%s,%s,%s)",
                (rad_id, ano, mes, valor)
            )
    return ok(None, "Metas salvas com sucesso.")


@app.route("/v1/metas/<int:meta_id>", methods=["PUT"])
@require_auth
def metas_update(meta_id):
    data = request.get_json(silent=True) or {}
    valor = data.get("valorMeta")
    if valor is None:
        return err("valorMeta é obrigatório.", 400)
    query("UPDATE metas SET valor_meta=%s WHERE id=%s", (valor, meta_id), fetch="none")
    return ok(None, "Meta atualizada com sucesso.")


# -----------------------------------------------------------------------------
# 15. RELATÓRIOS
# -----------------------------------------------------------------------------

@app.route("/v1/relatorios/historico", methods=["GET"])
@require_auth
def relatorios_historico():
    rows = query(
        "SELECT id, nome, periodo, radiologia_id, formato, gerado_por, url_arquivo, criado_em "
        "FROM relatorios_historico ORDER BY criado_em DESC LIMIT 50"
    )
    return ok(rows)


@app.route("/v1/relatorios/exportar", methods=["GET"])
@require_auth
def relatorios_exportar():
    tipo    = request.args.get("tipo", "geral")
    formato = request.args.get("formato", "PDF")
    periodo = request.args.get("periodo", "mes_atual")
    return ok({"url": f"/downloads/relatorio_{tipo}_{periodo}.{formato.lower()}", "formato": formato})


@app.route("/v1/relatorios/customizado", methods=["POST"])
@require_auth
def relatorios_customizado():
    data = request.get_json(silent=True) or {}
    new_id = insert(
        "INSERT INTO relatorios_historico (nome, periodo, radiologia_id, formato, gerado_por) "
        "VALUES (%s,%s,%s,%s,%s)",
        (data.get("nome", "Relatório Customizado"),
         data.get("periodo", "mes_atual"),
         data.get("radiologiaId"),
         data.get("formato", "PDF"),
         g.user.get("sub"))
    )
    return created({"id": new_id}, "Relatório gerado com sucesso.")


# -----------------------------------------------------------------------------
# 16. CONFIGURAÇÕES
# -----------------------------------------------------------------------------

@app.route("/v1/configuracoes", methods=["GET"])
@require_auth
def configuracoes_get():
    chaves = ["nome_sistema", "logo_url", "tema", "idioma", "fuso_horario"]
    resultado = {}
    for chave in chaves:
        row = query("SELECT valor FROM configuracoes WHERE chave = %s", (chave,), fetch="one")
        if row:
            try:
                resultado[chave] = json.loads(row["valor"])
            except Exception:
                resultado[chave] = row["valor"]
    return ok(resultado)


@app.route("/v1/configuracoes", methods=["POST"])
@require_admin
def configuracoes_post():
    data = request.get_json(silent=True) or {}
    for chave, valor in data.items():
        v = json.dumps(valor, ensure_ascii=False)
        query(
            "INSERT INTO configuracoes (chave, valor) VALUES (%s,%s) "
            "ON DUPLICATE KEY UPDATE valor=%s",
            (chave, v, v), fetch="none"
        )
    return ok(None, "Configurações salvas com sucesso.")


@app.route("/v1/configuracoes/logo", methods=["POST"])
@require_admin
def configuracoes_logo():
    return ok({"logo_url": "/uploads/logo.png"}, "Logo atualizada.")


# -----------------------------------------------------------------------------
# 17. USUÁRIOS
# -----------------------------------------------------------------------------

@app.route("/v1/usuarios", methods=["GET"])
@require_admin
def listar_usuarios():
    busca  = request.args.get("busca", "")
    level  = request.args.get("level", "")
    status = request.args.get("status", "")

    sql = ("SELECT u.id, u.nome AS name, u.email, u.telefone AS phone, u.cargo AS role, "
           "       u.nivel AS level, COALESCE(r.nome,'Todas') AS radiologia, u.status, u.ultimo_acesso "
           "FROM usuarios u LEFT JOIN radiologias r ON r.id = u.radiologia_id WHERE 1=1")
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
    existe = query("SELECT id, nivel FROM usuarios WHERE id = %s", (usuario_id,), fetch="one")
    if not existe:
        return not_found("Usuário não encontrado.")

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
    chaves = ["exam_durations", "whatsapp_messages", "scheduling", "financial"]
    resultado = {}
    for chave in chaves:
        row = query("SELECT valor FROM parametros_sistema WHERE chave = %s", (chave,), fetch="one")
        if row:
            try:
                resultado[chave] = json.loads(row["valor"])
            except Exception:
                resultado[chave] = {}

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
    data = request.get_json(silent=True) or {}

    durations  = data.get("durations", {})
    messages   = data.get("messages", [])
    scheduling = data.get("scheduling", {})
    financial  = data.get("financial", {})

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
    host  = os.getenv("HOST",  "0.0.0.0")
    port  = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"

    log.info("IORD Backend iniciando em %s:%s (debug=%s)", host, port, debug)
    app.run(host=host, port=port, debug=debug)