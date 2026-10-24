"""Endpoints for retrospective inspection of the VALORANT decision tree.

This API serves only historical metrics and readable rules generated from the
local JSON files provided for the challenge. It intentionally exposes no
endpoint for predicting a live or upcoming round.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/decision-tree", tags=["Análise pós-partida — árvore de decisão"])

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "decision_tree_model.joblib"
CHAMPION_MODEL_PATH = BASE_DIR / "models" / "champion_model.joblib"
REPORT_PATH = BASE_DIR / "reports" / "decision_tree_report.json"
RULES_PATH = BASE_DIR / "reports" / "decision_tree_rules.txt"


def _read_report() -> dict[str, Any] | None:
    if not REPORT_PATH.exists():
        return None
    try:
        return json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


@router.get("/status")
def decision_tree_status():
    """Check whether the retrospective model artifacts exist."""
    report = _read_report()
    metrics = report.get("metrics", {}) if report else {}
    return {
        "model_ready": MODEL_PATH.is_file() and CHAMPION_MODEL_PATH.is_file(),
        "explanation_tree_ready": MODEL_PATH.is_file(),
        "champion_model_ready": CHAMPION_MODEL_PATH.is_file(),
        "report_ready": REPORT_PATH.is_file(),
        "rules_ready": RULES_PATH.is_file(),
        "model_type": (report.get("selected_model") or {}).get("name", "DecisionTreeClassifier") if report else "DecisionTreeClassifier",
        "target": "análise retrospectiva de padrões associados a vitórias e derrotas em rounds históricos",
        "metrics": {
            "accuracy": metrics.get("accuracy"),
            "balanced_accuracy": metrics.get("balanced_accuracy"),
            "brier_score": metrics.get("brier_score"),
            "test_matches": (report.get("split") or {}).get("test_matches") if report else None,
        },
        "note": (
            "Esta API disponibiliza somente relatório, métricas e regras históricas. "
            "Não há previsão de rounds em andamento, recomendações táticas ou integração com serviços externos."
        ),
    }


@router.get("/report")
def decision_tree_report():
    """Return the report and evaluation metrics from the historical JSON dataset."""
    report = _read_report()
    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Relatório não encontrado. Execute py decision_tree_analysis.py dentro da pasta backend.",
        )
    return report


@router.get("/rules")
def decision_tree_rules():
    """Return human-readable decision-tree rules for retrospective study."""
    if not RULES_PATH.is_file():
        raise HTTPException(
            status_code=404,
            detail="Regras não encontradas. Execute py decision_tree_analysis.py dentro da pasta backend.",
        )
    try:
        return {"rules": RULES_PATH.read_text(encoding="utf-8")}
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Não foi possível ler as regras: {exc}")
