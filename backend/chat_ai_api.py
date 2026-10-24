import json
import os
import re
import socket
import urllib.error
import urllib.request
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any, List, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/ai-chat", tags=["IA Conversacional"])
BACKEND_DIR = Path(__file__).resolve().parent
DATA_DIR = BACKEND_DIR / "data"
OLLAMA_URL = os.getenv("OLLAMA_CHAT_URL", "http://127.0.0.1:11434/api/chat")
MODEL_NAME = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_TAGS_URL = os.getenv(
    "OLLAMA_TAGS_URL",
    OLLAMA_URL.rsplit("/api/chat", 1)[0] + "/api/tags",
)


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=3000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: List[HistoryMessage] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)


def as_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def classify_loadout(value: int) -> str:
    # Faixas aproximadas internas do projeto; não são regras oficiais.
    if value < 10000:
        return "Eco"
    if value < 18000:
        return "Force Buy"
    return "Full Buy"


@lru_cache(maxsize=1)
def load_local_dataset():
    # Lê os JSONs locais uma vez por execução do backend.
    if not DATA_DIR.is_dir():
        raise RuntimeError(f"Pasta de dados não encontrada: {DATA_DIR}")

    files = sorted(DATA_DIR.rglob("*.json"))
    matches = []
    invalid_files = 0
    total_rounds = 0
    map_stats = defaultdict(lambda: {"matches": 0, "rounds": 0})

    for file_path in files:
        try:
            with file_path.open("r", encoding="utf-8-sig") as file:
                data = json.load(file)

            if not isinstance(data, dict):
                invalid_files += 1
                continue

            info = data.get("matchInfo") or {}
            players = data.get("players") or []
            teams_raw = data.get("teams") or []
            rounds_raw = data.get("roundResults") or []

            if not teams_raw or not rounds_raw or info.get("isCompleted") is False:
                invalid_files += 1
                continue

            team_ids = [
                str(team["teamId"])
                for team in teams_raw
                if team.get("teamId") is not None
            ]
            if len(team_ids) < 2:
                invalid_files += 1
                continue

            player_teams = {}
            rosters = defaultdict(list)
            for player in players:
                puuid = player.get("puuid")
                team_id = player.get("teamId")
                name = player.get("gameName")
                if puuid and team_id is not None:
                    player_teams[puuid] = str(team_id)
                if name and team_id is not None:
                    team_id = str(team_id)
                    if name not in rosters[team_id]:
                        rosters[team_id].append(name)

            map_id = str(info.get("mapId") or "Não informado")
            map_name = map_id.rstrip("/").split("/")[-1] or "Não informado"
            score = {team_id: 0 for team_id in team_ids}
            match_rounds = []

            for index, round_item in enumerate(rounds_raw):
                loadouts = {team_id: 0 for team_id in team_ids}
                credits_remaining = {team_id: 0 for team_id in team_ids}
                credits_spent = {team_id: 0 for team_id in team_ids}
                for player_stat in round_item.get("playerStats") or []:
                    team_id = player_teams.get(player_stat.get("puuid"))
                    if team_id not in loadouts:
                        continue
                    economy = player_stat.get("economy") or {}
                    loadouts[team_id] += as_int(economy.get("loadoutValue"))
                    credits_remaining[team_id] += as_int(economy.get("remaining"))
                    credits_spent[team_id] += as_int(economy.get("spent"))

                raw_winner = round_item.get("winningTeam")
                winner = str(raw_winner) if raw_winner is not None else None
                result_valid = winner in team_ids
                round_number = as_int(round_item.get("roundNum"), index) + 1
                team_observations = []

                for team_id in team_ids:
                    own_loadout = loadouts[team_id]
                    opponent_loadout = sum(
                        value for other_id, value in loadouts.items()
                        if other_id != team_id
                    )
                    team_observations.append({
                        "team": team_id,
                        "won": bool(result_valid and winner == team_id),
                        "result_valid": result_valid,
                        "loadout": own_loadout,
                        "opponent_loadout": opponent_loadout,
                        "credits_remaining": credits_remaining[team_id],
                        "credits_spent": credits_spent[team_id],
                        "buy_type": classify_loadout(own_loadout),
                        "score_before": score[team_id],
                        "opponent_score_before": sum(
                            score[other_id] for other_id in team_ids
                            if other_id != team_id
                        ),
                    })

                match_rounds.append({
                    "round": round_number,
                    "winner": winner if result_valid else None,
                    "result_valid": result_valid,
                    "teams": team_observations,
                })
                if result_valid:
                    score[winner] += 1

            team_summaries = []
            for team in teams_raw:
                team_id = str(team.get("teamId"))
                team_summaries.append({
                    "team_id": team_id,
                    "players": rosters.get(team_id, []),
                    "won": bool(team.get("won")),
                    "rounds_won": as_int(team.get("roundsWon")),
                })

            matches.append({
                "file": file_path.name,
                "match_id": info.get("matchId"),
                "map": map_name,
                "teams": team_summaries,
                "round_count": len(match_rounds),
                "rounds": match_rounds,
            })
            map_stats[map_name]["matches"] += 1
            map_stats[map_name]["rounds"] += len(match_rounds)
            total_rounds += len(match_rounds)

        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            invalid_files += 1

    maps_summary = [
        {"map": name, "matches": values["matches"], "rounds": values["rounds"]}
        for name, values in sorted(
            map_stats.items(), key=lambda item: item[1]["matches"], reverse=True
        )
    ]
    return {
        "files_found": len(files),
        "valid_matches": len(matches),
        "invalid_files": invalid_files,
        "total_rounds": total_rounds,
        "maps": maps_summary,
        "matches": matches,
    }


def build_historical_analysis(dataset):
    def new_group():
        return {
            "observations": 0,
            "wins": 0,
            "loadout_sum": 0,
            "remaining_sum": 0,
            "spent_sum": 0,
        }

    by_buy_type = defaultdict(new_group)
    by_loadout_share = defaultdict(new_group)
    by_score_state = defaultdict(new_group)
    rounds_with_result = 0
    rounds_without_result = 0

    for match in dataset["matches"]:
        for round_data in match.get("rounds", []):
            teams = round_data.get("teams", [])
            winner = round_data.get("winner")
            team_ids = {
                str(team.get("team")) for team in teams
                if team.get("team") is not None
            }
            if winner is None or str(winner) not in team_ids:
                rounds_without_result += 1
                continue

            rounds_with_result += 1
            for observation in teams:
                team_id = str(observation.get("team", ""))
                if team_id not in team_ids:
                    continue

                won = str(winner) == team_id
                loadout = as_int(observation.get("loadout"))
                opponent_loadout = as_int(observation.get("opponent_loadout"))
                buy_type = observation.get("buy_type") or classify_loadout(loadout)

                remaining = as_int(observation.get("credits_remaining"))
                spent = as_int(observation.get("credits_spent"))
                group = by_buy_type[str(buy_type)]
                group["observations"] += 1
                group["wins"] += int(won)
                group["loadout_sum"] += loadout
                group["remaining_sum"] += remaining
                group["spent_sum"] += spent

                combined = loadout + opponent_loadout
                if combined > 0:
                    share = loadout / combined
                    if share <= 0.42:
                        label = "Desvantagem de equipamento (até 42%)"
                    elif share <= 0.58:
                        label = "Equipamento equilibrado (acima de 42% até 58%)"
                    else:
                        label = "Vantagem de equipamento (acima de 58%)"
                    group = by_loadout_share[label]
                    group["observations"] += 1
                    group["wins"] += int(won)
                    group["loadout_sum"] += loadout

                difference = (
                    as_int(observation.get("score_before"))
                    - as_int(observation.get("opponent_score_before"))
                )
                if difference > 0:
                    score_label = "Equipe à frente"
                elif difference < 0:
                    score_label = "Equipe atrás"
                else:
                    score_label = "Placar empatado"
                group = by_score_state[score_label]
                group["observations"] += 1
                group["wins"] += int(won)
                group["loadout_sum"] += loadout

    def finalize(groups, include_average=False):
        result = {}
        for label, values in groups.items():
            count = values["observations"]
            wins = values["wins"]
            result[label] = {
                "observations": count,
                "wins": wins,
                "losses": count - wins,
                "win_rate_pct": round(wins * 100 / count, 2) if count else None,
            }
            if include_average:
                result[label]["average_loadout"] = (
                    round(values["loadout_sum"] / count) if count else 0
                )
                result[label]["average_remaining_credits"] = (
                    round(values["remaining_sum"] / count) if count else 0
                )
                result[label]["average_spent"] = (
                    round(values["spent_sum"] / count) if count else 0
                )
        return result

    return {
        "source": "JSONs locais fornecidos para o desafio",
        "files_found": dataset["files_found"],
        "valid_matches": dataset["valid_matches"],
        "invalid_files": dataset["invalid_files"],
        "rounds_listed": dataset["total_rounds"],
        "rounds_with_valid_winner": rounds_with_result,
        "rounds_without_valid_winner": rounds_without_result,
        "team_round_observations": sum(
            group["observations"] for group in by_buy_type.values()
        ),
        "by_buy_type": finalize(by_buy_type, include_average=True),
        "by_loadout_share": finalize(by_loadout_share),
        "by_score_state": finalize(by_score_state),
        "maps": dataset["maps"],
        "classification_note": (
            "Eco, Force Buy e Full Buy são faixas aproximadas do projeto. "
            "A taxa é por equipe-round, não por partida inteira. "
            "Associação estatística não comprova causalidade."
        ),
    }


def is_historical_stats_question(message):
    """Detecta pedidos sobre a base histórica, não perguntas do simulador atual."""
    text = message.casefold()
    keywords = (
        "históric", "histor", "json", "arquivos", "base de dados",
        "conjunto de dados", "todas as partidas", "partidas analisadas",
        "estatísticas históricas", "estatisticas historicas", "historicamente",
        "padrões encontrados nos dados", "padroes encontrados nos dados",
    )
    return any(word in text for word in keywords)


def is_scenario_question(message, simulator_context):
    """Identifica perguntas sobre os cenários atuais do simulador offline."""
    if not isinstance(simulator_context, dict) or simulator_context.get("mode") != "simulador_offline":
        return False
    text = message.casefold()
    keywords = (
        "cenário", "cenario", "compar", "investimento", "econômic",
        "economico", "probabilidade", "risco", "compra", "simulação", "simulacao",
    )
    return any(word in text for word in keywords)


def build_scenario_reference(simulator_context):
    """Produz uma referência numérica explícita para evitar misturar taxas históricas."""
    if not isinstance(simulator_context, dict):
        return None
    latest = simulator_context.get("latest_simulation")
    if not isinstance(latest, dict) or not isinstance(latest.get("scenarios"), list):
        return None

    scenarios = []
    for item in latest["scenarios"]:
        if not isinstance(item, dict):
            continue
        try:
            win = float(item["estimated_round_win_probability"])
            loss = float(item["estimated_round_loss_probability"])
            loadout = int(item["team_loadout_value"])
        except (KeyError, TypeError, ValueError):
            continue
        try:
            difference = float(item.get("difference_vs_first_scenario_percentage_points") or 0)
        except (TypeError, ValueError):
            difference = 0.0
        scenarios.append({
            "name": str(item.get("label") or "Cenário sem nome"),
            "team_loadout_value": loadout,
            "estimated_round_win_probability_percent": round(win * 100, 1),
            "estimated_round_loss_probability_percent": round(loss * 100, 1),
            "difference_vs_first_scenario_percentage_points": round(difference, 2),
        })

    if not scenarios:
        return None
    return {
        "source": "resultado calculado da simulação atual",
        "model_name": latest.get("model_name"),
        "highest_estimated_probability_scenario": latest.get("highest_estimated_probability_scenario"),
        "scenarios": scenarios,
        "important": (
            "Use estes percentuais para falar dos cenários atuais. Não substitua estes valores "
            "pelas taxas históricas por tipo de compra. A probabilidade é de vencer o round hipotético, "
            "não a partida inteira."
        ),
    }


def clean_model_answer(answer):
    """Normaliza Markdown escapado e remove blocos duplicados idênticos."""
    answer = re.sub(r"\\([*_`#~\-\[\]()])", r"\1", answer).strip()
    blocks = re.split(r"\n\s*\n", answer)
    kept = []
    seen = set()
    for block in blocks:
        normalized = re.sub(r"\s+", " ", block).strip().casefold()
        if normalized and normalized in seen:
            continue
        if normalized:
            seen.add(normalized)
        kept.append(block.strip())
    return "\n\n".join(block for block in kept if block)


def build_statistics_report(analysis):
    # Este bloco numérico é gerado pelo Python, não pelo modelo de linguagem.
    lines = [
        "DADOS CALCULADOS PELO PYTHON — FONTE NUMÉRICA DE REFERÊNCIA",
        f"Arquivos JSON encontrados: {analysis['files_found']}",
        f"Partidas válidas: {analysis['valid_matches']}",
        f"Arquivos inválidos ou incompletos: {analysis['invalid_files']}",
        f"Rounds listados: {analysis['rounds_listed']}",
        f"Rounds com vencedor válido: {analysis['rounds_with_valid_winner']}",
        f"Observações equipe-round com resultado válido: {analysis['team_round_observations']}",
        "",
        "Taxa histórica por tipo de compra (vitórias de rounds / observações equipe-round):",
    ]
    groups = analysis["by_buy_type"]
    for label in ("Eco", "Force Buy", "Full Buy"):
        values = groups.get(label)
        if not values:
            lines.append(f"- {label}: sem observações válidas.")
            continue
        rate = values["win_rate_pct"]
        rate_text = f"{rate:.2f}%" if rate is not None else "não calculada"
        lines.append(
            f"- {label}: {values['wins']} vitórias, {values['losses']} derrotas, "
            f"{values['observations']} observações, taxa {rate_text}; "
            f"valor médio do equipamento {values['average_loadout']}; "
            f"créditos restantes registrados em média {values['average_remaining_credits']}; "
            f"gasto registrado em média {values['average_spent']}."
        )

    lines.extend(["", "Taxa por participação no valor combinado do equipamento:"])
    for label, values in sorted(
        analysis["by_loadout_share"].items(),
        key=lambda item: item[1]["observations"],
        reverse=True,
    ):
        rate = values["win_rate_pct"]
        rate_text = f"{rate:.2f}%" if rate is not None else "não calculada"
        lines.append(
            f"- {label}: {values['wins']} vitórias, {values['losses']} derrotas, "
            f"{values['observations']} observações, taxa {rate_text}."
        )

    lines.extend(["", "Taxa por situação do placar antes do round:"])
    for label, values in sorted(
        analysis["by_score_state"].items(),
        key=lambda item: item[1]["observations"],
        reverse=True,
    ):
        rate = values["win_rate_pct"]
        rate_text = f"{rate:.2f}%" if rate is not None else "não calculada"
        lines.append(
            f"- {label}: {values['wins']} vitórias, {values['losses']} derrotas, "
            f"{values['observations']} observações, taxa {rate_text}."
        )

    lines.append(
        "Importante: essas taxas descrevem rounds históricos por equipe, não "
        "a probabilidade de vencer uma partida inteira. As faixas de compra "
        "são aproximações internas do projeto."
    )
    return "\n".join(lines)


def select_relevant_matches(message, matches):
    text = message.casefold()
    tokens = set(re.findall(r"\w+", text))
    selected = []
    for match in matches:
        stem = Path(str(match.get("file", ""))).stem.casefold()
        if stem and stem in text:
            selected.append(match)
            continue
        map_tokens = set(re.findall(r"\w+", str(match.get("map", "")).casefold()))
        map_found = bool(map_tokens) and map_tokens.issubset(tokens)
        player_found = any(
            str(name).casefold() in text
            for team in match.get("teams", [])
            for name in team.get("players", [])
            if name
        )
        if map_found or player_found:
            selected.append(match)
    return selected[:3]


def build_match_context(message, matches):
    selected = select_relevant_matches(message, matches)
    text = message.casefold()
    asks_round_detail = any(
        term in text for term in (
            "cada round", "cada rodada", "round a round",
            "rodada por rodada", "partida por partida",
        )
    ) or bool(re.search(r"\b(?:round|rodada)\s*(?:n[ºo.]?\s*)?\d+\b", text))
    round_match = re.search(
        r"\b(?:round|rodada)\s*(?:n[ºo.]?\s*)?(\d+)\b", text
    )
    requested_round = int(round_match.group(1)) if round_match else None
    # Limita o contexto enviado ao modelo.
    selected = selected[:1] if asks_round_detail else selected[:3]
    compact = []

    for match in selected:
        item = {
            "arquivo": match["file"],
            "mapa": match["map"],
            "quantidade_de_rounds": match["round_count"],
            "equipes": match["teams"],
        }
        if asks_round_detail:
            rounds = match.get("rounds", [])
            if requested_round is not None:
                rounds = [row for row in rounds if row["round"] == requested_round]
            item["rounds"] = [
                {
                    "round": row["round"],
                    "vencedor": row["winner"],
                    "resultado_valido": row["result_valid"],
                    "equipes": [
                        {
                            "equipe": team["team"],
                            "venceu": team["won"],
                            "tipo_compra_aproximado": team["buy_type"],
                            "valor_equipamento": team["loadout"],
                            "valor_equipamento_adversario": team["opponent_loadout"],
                            "creditos_restantes_registrados": team.get("credits_remaining", 0),
                            "gasto_registrado": team.get("credits_spent", 0),
                            "placar_proprio_antes": team["score_before"],
                            "placar_adversario_antes": team["opponent_score_before"],
                        }
                        for team in row["teams"]
                    ],
                }
                for row in rounds
            ]
        compact.append(item)
    return compact


SYSTEM_PROMPT = "\n".join([
    "Você é o VALO ECONOMIX AI, analista de dados especializado em VALORANT.",
    "Responda em português claro, natural, objetivo e bem organizado, normalmente em 100 a 180 palavras.",
    "Responda somente à pergunta atual. Não copie nem repita respostas anteriores como se fossem novas.",
    "Finalize todas as frases e não termine no meio de uma palavra ou parágrafo.",
    "Use Markdown normal, sem barras invertidas antes de asteriscos, títulos ou marcadores.",
    "Use as estatísticas numéricas calculadas pelo Python e os detalhes dos JSONs que estiverem no contexto.",
    "Nunca invente números, percentuais, partidas, jogadores, mapas, créditos, placares ou resultados.",
    "A base contém partidas históricas locais; o aplicativo NÃO está conectado a uma partida ao vivo.",
    "Se perguntarem o placar, créditos atuais, round atual ou por que a equipe está perdendo agora sem fornecer esses dados, explique que não consegue ler o jogo ao vivo e peça placar, número do round, créditos disponíveis, valor do equipamento da equipe e do adversário.",
    "Se o usuário informar dados atuais na própria mensagem, analise-os como informações fornecidas pelo usuário e deixe claro que não foram verificados automaticamente.",
    "Diferencie créditos restantes registrados no JSON, gasto registrado e loadoutValue: loadoutValue é o valor do equipamento, não o saldo de créditos disponíveis.",
    "Quando falar de créditos históricos, informe que são somas por equipe-round calculadas dos campos economy.remaining e economy.spent presentes nos JSONs, quando esses campos existem.",
    "Taxas históricas de vitória são por equipe-round, não probabilidade de vencer a partida inteira.",
    "Eco, Force Buy e Full Buy são faixas aproximadas internas do projeto, não regras oficiais.",
    "Diferencie associação estatística de causalidade: mais equipamento não garante vitória.",
    "Se os dados não sustentarem uma conclusão, diga isso claramente e peça a informação necessária.",
    "Não recomende ao usuário que clique em um simulador ou compare cenários: esta interface é um chat de análise.",
])


@router.get("/health")
def chat_health():
    files_count = sum(1 for _ in DATA_DIR.rglob("*.json")) if DATA_DIR.is_dir() else 0
    try:
        with urllib.request.urlopen(OLLAMA_TAGS_URL, timeout=3) as response:
            tags = json.loads(response.read().decode("utf-8"))
        names = [item.get("name", "") for item in tags.get("models", [])]
        model_available = any(
            name == MODEL_NAME or name.startswith(MODEL_NAME + ":") for name in names
        )
        ollama_reachable = True
    except Exception:
        model_available = False
        ollama_reachable = False

    return {
        "ollama_reachable": ollama_reachable,
        "model": MODEL_NAME,
        "model_available": model_available,
        "json_files": files_count,
        "data_directory": str(DATA_DIR),
    }


@router.post("")
def chat_with_ai(request: ChatRequest):
    try:
        dataset = load_local_dataset()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Não foi possível ler os JSONs locais: {exc}",
        )

    if not dataset["valid_matches"]:
        raise HTTPException(status_code=422, detail="Nenhuma partida válida foi encontrada nos JSONs.")

    analysis = build_historical_analysis(dataset)
    relevant_matches = build_match_context(request.message, dataset["matches"])
    stats_question = is_historical_stats_question(request.message)

    context = {
        "fonte": "JSONs locais fornecidos para o desafio",
        "resumo_base": {
            "arquivos_encontrados": dataset["files_found"],
            "partidas_validas": dataset["valid_matches"],
            "arquivos_invalidos_ou_incompletos": dataset["invalid_files"],
            "rounds_listados": dataset["total_rounds"],
        },
        "estatisticas_historicas_calculadas_pelo_python": analysis if stats_question else {},
        "partidas_relevantes_para_a_pergunta": relevant_matches,
        "observacao": "Base histórica local; não representa uma partida ao vivo.",
    }

    messages = [{
        "role": "system",
        "content": (
            SYSTEM_PROMPT + "\n\nCONTEXTO DOS DADOS HISTÓRICOS:\n"
            + json.dumps(context, ensure_ascii=False, separators=(",", ":"))
        ),
    }]
    # Se a pergunta atual repete a última pergunta do usuário, não envie o
    # histórico anterior: isso reduz a chance de o modelo reciclar a resposta.
    normalized_question = re.sub(r"\s+", " ", request.message).strip().casefold()
    previous_user_questions = [
        re.sub(r"\s+", " ", item.content).strip().casefold()
        for item in request.history if item.role == "user"
    ]
    repeated_question = bool(
        previous_user_questions and previous_user_questions[-1] == normalized_question
    )
    if not stats_question and not repeated_question:
        for item in request.history[-4:]:
            messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": request.message})

    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 180, "num_ctx": 4096},
    }
    http_request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(http_request, timeout=300) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, socket.timeout) as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "O Ollama não respondeu dentro do tempo limite. Confirme se está "
                "aberto e se qwen2.5:3b responde normalmente. Detalhe: " + str(exc)
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar o modelo de IA: {exc}")

    answer = clean_model_answer(result.get("message", {}).get("content", ""))
    if not answer:
        raise HTTPException(status_code=502, detail="O modelo não retornou uma resposta.")

    if stats_question:
        answer = build_statistics_report(analysis) + "\n\nINTERPRETAÇÃO DA IA\n" + answer

    return {
        "answer": answer,
        "model": MODEL_NAME,
        "source": "JSONs locais do desafio",
        "matches_in_context": len(relevant_matches),
        "dataset_matches": dataset["valid_matches"],
        "calculated_statistics": analysis if stats_question else None,
    }
