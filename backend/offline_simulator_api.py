"""Offline hypothetical scenario simulator for the local VALORANT challenge data.

This router accepts only manually entered hypothetical scenarios. It does not
connect to the game, read live match state, or provide live-round recommendations.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/api/offline-simulator", tags=["Simulador offline"])
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "champion_model.joblib"
REPORT_PATH = BASE_DIR / "reports" / "decision_tree_report.json"

FEATURES = [
    "map",
    "round_number",
    "team_score_before",
    "opponent_score_before",
    "score_diff_before",
    "team_recent_winrate_last5",
    "team_loadout_value",
    "opponent_loadout_value",
    "loadout_diff",
    "loadout_ratio",
    "team_loadout_per_player",
    "opponent_loadout_per_player",
]


class EconomyScenario(BaseModel):
    label: str = Field(min_length=1, max_length=60, description="Nome do cenário hipotético")
    team_loadout_value: int = Field(ge=0, le=100000, description="Valor total de equipamento da equipe no cenário")


class OfflineSimulationRequest(BaseModel):
    map: str = Field(min_length=1, max_length=80)
    round_number: int = Field(ge=1, le=50)
    team_score_before: int = Field(ge=0, le=50)
    opponent_score_before: int = Field(ge=0, le=50)
    team_recent_winrate_last5: float = Field(ge=0, le=1, description="Fração de vitórias nos últimos cinco rounds; por exemplo, 0.6 = 60%")
    opponent_loadout_value: int = Field(ge=0, le=100000, description="Valor total de equipamento do adversário; mantido igual nos cenários comparados")
    scenarios: list[EconomyScenario] = Field(min_length=1, max_length=5)

    @field_validator("map")
    @classmethod
    def clean_map(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Informe um mapa.")
        return value

    @field_validator("scenarios")
    @classmethod
    def unique_scenario_labels(cls, value: list[EconomyScenario]) -> list[EconomyScenario]:
        labels = [scenario.label.strip().casefold() for scenario in value]
        if len(labels) != len(set(labels)):
            raise ValueError("Os nomes dos cenários precisam ser diferentes.")
        return value


@lru_cache(maxsize=1)
def _load_model_bundle() -> dict[str, Any]:
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            "Modelo não encontrado. Execute py decision_tree_analysis.py na pasta backend."
        )
    bundle = joblib.load(MODEL_PATH)
    if not isinstance(bundle, dict) or "pipeline" not in bundle:
        raise ValueError("O arquivo do modelo não contém o pipeline esperado.")
    return bundle


def _read_report() -> dict[str, Any]:
    if not REPORT_PATH.is_file():
        return {}
    try:
        return json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _known_maps(report: dict[str, Any]) -> list[str]:
    maps = ((report.get("preparation") or {}).get("maps_by_match") or {})
    return sorted(str(name) for name in maps if name and str(name).lower() != "unknown")


@router.get("/options")
def offline_simulator_options() -> dict[str, Any]:
    """Return maps and model information for the offline simulator form."""
    report = _read_report()
    selected = report.get("selected_model") or {}
    try:
        model_ready = MODEL_PATH.is_file() and "pipeline" in _load_model_bundle()
    except Exception:
        model_ready = False
    return {
        "model_ready": model_ready,
        "model_name": selected.get("name", "Modelo histórico"),
        "maps": _known_maps(report),
        "target": "probabilidade estimada de vencer um round hipotético, não a partida inteira",
        "metrics": selected.get("test_metrics") or report.get("metrics") or {},
        "data_source": "somente arquivos JSON locais fornecidos para o desafio",
        "mode": "offline_hypothetical_scenarios",
    }


@router.post("/simulate")
def simulate_offline_scenarios(request: OfflineSimulationRequest) -> dict[str, Any]:
    """Compare manually entered economic scenarios for a hypothetical round."""
    try:
        bundle = _load_model_bundle()
    except (FileNotFoundError, ValueError, OSError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Não foi possível carregar o modelo: {exc}") from exc

    pipeline = bundle["pipeline"]
    report = _read_report()
    known_maps = _known_maps(report)
    map_warnings: list[str] = []
    if known_maps and request.map not in known_maps:
        map_warnings.append(
            "Este mapa não aparece nos JSONs de treino; a estimativa pode ser menos confiável."
        )

    results: list[dict[str, Any]] = []
    for scenario in request.scenarios:
        team_value = int(scenario.team_loadout_value)
        opponent_value = int(request.opponent_loadout_value)
        total_value = team_value + opponent_value
        features = {
            "map": request.map,
            "round_number": request.round_number,
            "team_score_before": request.team_score_before,
            "opponent_score_before": request.opponent_score_before,
            "score_diff_before": request.team_score_before - request.opponent_score_before,
            "team_recent_winrate_last5": float(request.team_recent_winrate_last5),
            "team_loadout_value": team_value,
            "opponent_loadout_value": opponent_value,
            "loadout_diff": team_value - opponent_value,
            "loadout_ratio": team_value / total_value if total_value else 0.5,
            "team_loadout_per_player": team_value / 5.0,
            "opponent_loadout_per_player": opponent_value / 5.0,
        }
        row = pd.DataFrame([{name: features[name] for name in FEATURES}], columns=FEATURES)
        try:
            probabilities = pipeline.predict_proba(row)[0]
            model = pipeline.named_steps.get("model")
            classes = list(getattr(model, "classes_", [0, 1]))
            win_index = classes.index(1) if 1 in classes else len(probabilities) - 1
            win_probability = float(probabilities[win_index])
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Falha ao calcular o cenário '{scenario.label}': {exc}") from exc

        results.append({
            "label": scenario.label.strip(),
            "team_loadout_value": team_value,
            "opponent_loadout_value": opponent_value,
            "estimated_round_win_probability": round(win_probability, 4),
            "estimated_round_loss_probability": round(1.0 - win_probability, 4),
            "features_used": features,
        })

    baseline_probability = results[0]["estimated_round_win_probability"]
    for result in results:
        result["difference_vs_first_scenario_percentage_points"] = round(
            (result["estimated_round_win_probability"] - baseline_probability) * 100, 2
        )

    highest = max(results, key=lambda item: item["estimated_round_win_probability"])
    return {
        "ok": True,
        "mode": "offline_hypothetical_scenarios",
        "model_name": (report.get("selected_model") or {}).get("name", "Modelo histórico"),
        "target": "round_win_probability",
        "target_explanation": "O modelo estima a probabilidade de vencer este round hipotético, não a partida inteira.",
        "context": {
            "map": request.map,
            "round_number": request.round_number,
            "score_before": f"{request.team_score_before}–{request.opponent_score_before}",
            "team_recent_winrate_last5_percent": round(request.team_recent_winrate_last5 * 100, 1),
        },
        "scenarios": results,
        "highest_estimated_probability_scenario": highest["label"],
        "warnings": map_warnings + [
            "Cenários hipotéticos: nenhum dado é lido de uma partida em andamento.",
            "O valor de equipamento é o loadoutValue registrado nos JSONs, não saldo de créditos disponível.",
            "Diferenças entre cenários são estimativas do modelo e não provam que uma compra causaria o resultado.",
            "A probabilidade refere-se ao round, pois esse é o resultado usado no treinamento atual.",
        ],
    }
