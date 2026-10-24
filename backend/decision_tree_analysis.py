"""Build an interpretable retrospective VALORANT round analysis from local match JSONs.

Run from any directory with:
    py backend/decision_tree_analysis.py

Only features available before the current round are used. In particular, kills,
round damage, final match scores, winningTeamRole and other post-round fields are
intentionally excluded to avoid target leakage.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import joblib
    import numpy as np
    import pandas as pd
    import sklearn
    from sklearn.compose import ColumnTransformer
    from sklearn.metrics import (
        accuracy_score,
        balanced_accuracy_score,
        brier_score_loss,
        classification_report,
        confusion_matrix,
    )
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.tree import DecisionTreeClassifier, export_text
    from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
except ImportError as exc:  # friendly message for a fresh Windows setup
    print(
        "Dependência ausente. No PowerShell, execute:\n"
        "  py -m pip install pandas scikit-learn joblib\n"
        f"Detalhe: {exc}",
        file=sys.stderr,
    )
    raise SystemExit(2)

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = SCRIPT_DIR / "data"
DEFAULT_OUTPUT_DIR = SCRIPT_DIR / "reports"
DEFAULT_MODEL_DIR = SCRIPT_DIR / "models"

CATEGORICAL_FEATURES = ["map"]
NUMERIC_FEATURES = [
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
FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES


def map_name_from_id(map_id: Any) -> str:
    """Convert '/Game/Maps/Ascent/Ascent' to 'Ascent' without hardcoding maps."""
    value = str(map_id or "").strip().rstrip("/")
    if not value:
        return "Unknown"
    return value.split("/")[-1] or "Unknown"


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            number = int(value)
            if number == value:
                return number
        except (ValueError, OverflowError):
            return None
    return None


def _read_match_files(data_dir: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Read completed match JSONs recursively and deduplicate by matchInfo.matchId."""
    files_seen = 0
    valid_matches: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    duplicate_ids = 0
    invalid_json = 0
    invalid_schema = 0
    incomplete_matches = 0
    no_round_matches = 0
    errors: list[dict[str, str]] = []

    if not data_dir.exists():
        raise FileNotFoundError(f"Pasta de dados não encontrada: {data_dir}")

    for path in sorted(data_dir.rglob("*.json")):
        files_seen += 1
        try:
            with path.open("r", encoding="utf-8-sig") as file:
                data = json.load(file)
        except (OSError, json.JSONDecodeError) as exc:
            invalid_json += 1
            errors.append({"file": str(path), "reason": f"JSON inválido ou ilegível: {exc}"})
            continue

        if not isinstance(data, dict) or not isinstance(data.get("matchInfo"), dict):
            invalid_schema += 1
            errors.append({"file": str(path), "reason": "Não parece ser um JSON de partida (matchInfo ausente)."})
            continue

        match_info = data.get("matchInfo") or {}
        match_id = str(match_info.get("matchId") or "").strip()
        teams = data.get("teams")
        players = data.get("players")
        rounds = data.get("roundResults")
        if not match_id or not isinstance(teams, list) or len(teams) != 2 or not isinstance(players, list) or not isinstance(rounds, list):
            invalid_schema += 1
            errors.append({"file": str(path), "reason": "Campos obrigatórios ausentes ou inválidos."})
            continue
        if match_id in seen_ids:
            duplicate_ids += 1
            continue
        seen_ids.add(match_id)

        if match_info.get("isCompleted") is False:
            incomplete_matches += 1
            continue
        if not rounds:
            no_round_matches += 1
            continue

        team_ids = [str(team.get("teamId") or "").strip() for team in teams]
        if any(not team_id for team_id in team_ids) or team_ids[0] == team_ids[1]:
            invalid_schema += 1
            errors.append({"file": str(path), "reason": "Os dois teamId da partida são inválidos ou iguais."})
            continue

        player_to_team = {
            str(player.get("puuid")): str(player.get("teamId"))
            for player in players
            if player.get("puuid") and player.get("teamId")
        }
        start_ms = _safe_int(match_info.get("gameStartMillis"))
        if start_ms is None:
            # Keep files with missing timestamps, but sort them before timestamped games.
            start_ms = 0

        valid_matches.append({
            "match_id": match_id,
            "path": str(path),
            "start_ms": start_ms,
            "map": map_name_from_id(match_info.get("mapId")),
            "team_ids": team_ids,
            "player_to_team": player_to_team,
            "rounds": rounds,
        })

    return valid_matches, {
        "json_files_found": files_seen,
        "valid_completed_matches": len(valid_matches),
        "duplicate_match_ids_skipped": duplicate_ids,
        "invalid_json_files": invalid_json,
        "invalid_schema_files": invalid_schema,
        "incomplete_matches_skipped": incomplete_matches,
        "matches_without_rounds_skipped": no_round_matches,
        "read_errors_sample": errors[:20],
    }


def _round_loadouts(round_item: dict[str, Any], team_ids: list[str], player_to_team: dict[str, str]) -> dict[str, int] | None:
    """Sum the recorded loadoutValue per team; require five known players per side."""
    totals = {team_id: 0 for team_id in team_ids}
    counts = {team_id: 0 for team_id in team_ids}
    player_stats = round_item.get("playerStats")
    if not isinstance(player_stats, list):
        return None

    for player_stat in player_stats:
        if not isinstance(player_stat, dict):
            continue
        team_id = player_to_team.get(str(player_stat.get("puuid") or ""))
        if team_id not in totals:
            continue
        economy = player_stat.get("economy")
        if not isinstance(economy, dict):
            return None
        loadout = economy.get("loadoutValue")
        if not isinstance(loadout, (int, float)) or isinstance(loadout, bool):
            return None
        totals[team_id] += int(loadout)
        counts[team_id] += 1

    if any(counts[team_id] != 5 for team_id in team_ids):
        return None
    return totals


def prepare_round_dataset(matches: list[dict[str, Any]]) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Create two team-perspective rows per round using only pre-round features."""
    rows: list[dict[str, Any]] = []
    rounds_seen = 0
    rounds_used = 0
    rounds_skipped_missing_loadout = 0
    rounds_skipped_missing_winner = 0
    teams_by_match: dict[str, list[str]] = {}
    maps = Counter()
    match_start: dict[str, int] = {}

    for match in matches:
        match_id = match["match_id"]
        team_a, team_b = match["team_ids"]
        teams_by_match[match_id] = [team_a, team_b]
        match_start[match_id] = match["start_ms"]
        maps[match["map"]] += 1
        score = {team_a: 0, team_b: 0}
        recent_results: dict[str, list[int]] = {team_a: [], team_b: []}

        def round_sort_key(item: dict[str, Any]) -> tuple[int, int]:
            number = _safe_int(item.get("roundNum"))
            return (number if number is not None else 10**9, 0)

        round_items = sorted(
            [item for item in match["rounds"] if isinstance(item, dict)],
            key=round_sort_key,
        )

        for index, round_item in enumerate(round_items):
            rounds_seen += 1
            winner = str(round_item.get("winningTeam") or "").strip()
            if winner not in score:
                rounds_skipped_missing_winner += 1
                continue

            loadouts = _round_loadouts(round_item, match["team_ids"], match["player_to_team"])
            if loadouts is None:
                rounds_skipped_missing_loadout += 1
                # Do not update the score/history for a round that cannot be represented.
                # Normally all 10 loadout records are present in these files.
                continue

            round_num_raw = _safe_int(round_item.get("roundNum"))
            round_number = (round_num_raw + 1) if round_num_raw is not None else (index + 1)
            total_loadout = sum(loadouts.values())

            # Build one example from each team's perspective. The target is whether
            # that team won THIS round; the paired rows are always kept in the same
            # train/test partition because they share match_id.
            for team_id in match["team_ids"]:
                opponent_id = team_b if team_id == team_a else team_a
                team_loadout = loadouts[team_id]
                opponent_loadout = loadouts[opponent_id]
                prior_results = recent_results[team_id][-5:]
                recent_winrate = (
                    float(sum(prior_results) / len(prior_results))
                    if prior_results else 0.5
                )
                rows.append({
                    "match_id": match_id,
                    "match_start_ms": match["start_ms"],
                    "map": match["map"],
                    "round_number": round_number,
                    "team_score_before": score[team_id],
                    "opponent_score_before": score[opponent_id],
                    "score_diff_before": score[team_id] - score[opponent_id],
                    "team_recent_winrate_last5": recent_winrate,
                    "team_loadout_value": team_loadout,
                    "opponent_loadout_value": opponent_loadout,
                    "loadout_diff": team_loadout - opponent_loadout,
                    "loadout_ratio": (team_loadout / total_loadout) if total_loadout else 0.5,
                    "team_loadout_per_player": team_loadout / 5.0,
                    "opponent_loadout_per_player": opponent_loadout / 5.0,
                    "target_win": int(winner == team_id),
                })

            rounds_used += 1
            # Only after feature rows for this round have been created do we update
            # score and streaks with the current round result.
            loser_id = team_b if winner == team_a else team_a
            score[winner] += 1
            recent_results[winner].append(1)
            recent_results[loser_id].append(0)

    dataset = pd.DataFrame(rows)
    if not dataset.empty:
        dataset = dataset.sort_values(["match_start_ms", "match_id", "round_number"]).reset_index(drop=True)

    summary = {
        "matches_used": len(matches),
        "rounds_seen": rounds_seen,
        "rounds_used": rounds_used,
        "team_perspective_examples": len(dataset),
        "rounds_skipped_missing_loadout": rounds_skipped_missing_loadout,
        "rounds_skipped_missing_winner": rounds_skipped_missing_winner,
        "maps_by_match": dict(sorted(maps.items())),
        "match_start_ms": match_start,
    }
    return dataset, summary


def _timestamp_label(value: int | None) -> str | None:
    if not value:
        return None
    try:
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    except (ValueError, OSError, OverflowError):
        return None





def _make_pipeline(classifier: Any) -> Pipeline:
    """Build a fresh preprocessing + classifier pipeline for one candidate model."""
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", "passthrough", NUMERIC_FEATURES),
            ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ],
        verbose_feature_names_out=False,
    )
    return Pipeline([
        ("preprocessor", preprocessor),
        ("model", classifier),
    ])


def _candidate_models(max_depth: int, min_samples_leaf: int) -> dict[str, Any]:
    """Small, reproducible model family; all candidates use only local JSON features."""
    return {
        "Árvore de decisão": DecisionTreeClassifier(
            max_depth=max_depth,
            min_samples_leaf=min_samples_leaf,
            random_state=42,
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=200,
            max_depth=12,
            min_samples_leaf=30,
            max_features="sqrt",
            class_weight="balanced_subsample",
            n_jobs=-1,
            random_state=42,
        ),
        "Extra Trees": ExtraTreesClassifier(
            n_estimators=200,
            max_depth=12,
            min_samples_leaf=30,
            max_features="sqrt",
            class_weight="balanced",
            n_jobs=-1,
            random_state=42,
        ),
    }


def _score_classifier(model: Pipeline, X: pd.DataFrame, y: pd.Series) -> dict[str, Any]:
    predictions = model.predict(X)
    probabilities = model.predict_proba(X)[:, 1]
    return {
        "accuracy": round(float(accuracy_score(y, predictions)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y, predictions)), 4),
        "brier_score": round(float(brier_score_loss(y, probabilities)), 4),
    }



def _tree_leaf_patterns(tree_model: Any, feature_names: list[str], minimum_support: int = 75) -> dict[str, list[dict[str, Any]]]:
    """Turn tree leaves into concise, readable patterns based on training examples."""
    tree = tree_model.tree_
    patterns: list[dict[str, Any]] = []
    feature_labels = {
        "team_loadout_value": "valor do equipamento da equipe",
        "opponent_loadout_value": "valor do equipamento adversário",
        "loadout_diff": "diferença no valor do equipamento",
        "team_score_before": "placar anterior da equipe",
        "opponent_score_before": "placar anterior do adversário",
        "round_number": "número do round",
        "team_loadout_per_player": "equipamento médio por jogador",
        "opponent_loadout_per_player": "equipamento médio adversário",
        "team_recent_winrate_last5": "desempenho nos últimos 5 rounds",
    }

    def display_conditions(raw_conditions: list[tuple[str, str, float]]) -> list[str]:
        bounds: dict[str, dict[str, Any]] = {}
        map_conditions: list[str] = []
        order: list[str] = []
        for feature, operator, threshold in raw_conditions:
            if feature.startswith("map_"):
                map_name = feature[4:]
                map_conditions.append(f"mapa {map_name}" if operator == ">" else f"mapa diferente de {map_name}")
                continue
            if feature not in bounds:
                bounds[feature] = {"lower": None, "upper": None}
                order.append(feature)
            if operator == ">":
                current = bounds[feature]["lower"]
                bounds[feature]["lower"] = threshold if current is None else max(current, threshold)
            else:
                current = bounds[feature]["upper"]
                bounds[feature]["upper"] = threshold if current is None else min(current, threshold)

        result: list[str] = []
        for feature in order:
            lower = bounds[feature]["lower"]
            upper = bounds[feature]["upper"]
            if feature == "loadout_ratio":
                label = "parcela do equipamento da equipe no total combinado"
                fmt = lambda value: f"{value * 100:.0f}%"
                if lower is not None and upper is not None:
                    result.append(f"{fmt(lower)} < {label} ≤ {fmt(upper)}")
                elif lower is not None:
                    result.append(f"{label} > {fmt(lower)}")
                elif upper is not None:
                    result.append(f"{label} ≤ {fmt(upper)}")
                continue

            label = feature_labels.get(feature, feature.replace("_", " "))
            if feature in {"round_number", "team_score_before", "opponent_score_before"}:
                if lower is not None and upper is not None:
                    low_int, high_int = int(lower) + 1, int(upper)
                    result.append(f"{label}: {low_int}–{high_int}")
                elif lower is not None:
                    result.append(f"{label} ≥ {int(lower) + 1}")
                elif upper is not None:
                    result.append(f"{label} ≤ {int(upper)}")
            elif feature == "score_diff_before":
                min_diff = int(lower) + 1 if lower is not None else None
                max_diff = int(upper) if upper is not None else None
                if min_diff is not None and max_diff is not None:
                    if min_diff >= 1:
                        result.append(f"equipe à frente por {min_diff}–{max_diff} rounds")
                    elif max_diff <= -1:
                        result.append(f"equipe atrás por {abs(max_diff)}–{abs(min_diff)} rounds")
                    else:
                        result.append("placar equilibrado (diferença pequena)")
                elif min_diff is not None:
                    if min_diff >= 1:
                        result.append(f"equipe à frente por pelo menos {min_diff} round(s)")
                    elif min_diff == 0:
                        result.append("equipe empatada ou à frente")
                    else:
                        result.append(f"equipe não estava mais de {abs(min_diff)} round(s) à frente")
                elif max_diff is not None:
                    if max_diff <= -1:
                        result.append("equipe atrás no placar")
                    elif max_diff == 0:
                        result.append("equipe empatada ou atrás")
                    else:
                        result.append(f"vantagem no placar de até {max_diff} round(s)")
            else:
                if lower is not None and upper is not None:
                    result.append(f"{label}: > {lower:.0f} e ≤ {upper:.0f}")
                elif lower is not None:
                    result.append(f"{label} > {lower:.0f}")
                elif upper is not None:
                    result.append(f"{label} ≤ {upper:.0f}")
        return map_conditions + result

    def walk(node: int, conditions: list[tuple[str, str, float]]) -> None:
        left = int(tree.children_left[node])
        right = int(tree.children_right[node])
        if left == right:
            values = tree.value[node][0]
            total = float(sum(values))
            if total <= 0:
                return
            win_rate = float(values[1] / total) if len(values) > 1 else 0.0
            support = int(tree.n_node_samples[node])
            if support < minimum_support:
                return
            wins = int(round(support * win_rate))
            losses = support - wins
            readable = display_conditions(conditions)
            patterns.append({
                "kind": "win_pattern" if win_rate >= 0.60 else "loss_pattern" if win_rate <= 0.40 else "mixed",
                "conditions": readable,
                "summary": " · ".join(readable) if readable else "Conjunto geral",
                "support": support,
                "wins": wins,
                "losses": losses,
                "win_rate": round(win_rate, 4),
                "confidence_label": "amostra maior" if support >= 150 else "amostra menor",
            })
            return

        feature_index = int(tree.feature[node])
        feature = feature_names[feature_index]
        threshold = float(tree.threshold[node])
        walk(left, conditions + [(feature, "<=", threshold)])
        walk(right, conditions + [(feature, ">", threshold)])

    walk(0, [])
    win_patterns = [pattern for pattern in patterns if pattern["kind"] == "win_pattern"]
    loss_patterns = [pattern for pattern in patterns if pattern["kind"] == "loss_pattern"]
    win_patterns.sort(key=lambda p: (p["support"] * abs(p["win_rate"] - 0.5), p["support"]), reverse=True)
    loss_patterns.sort(key=lambda p: (p["support"] * abs(p["win_rate"] - 0.5), p["support"]), reverse=True)
    return {"win_patterns": win_patterns[:3], "loss_patterns": loss_patterns[:3]}

def run_analysis(
    data_dir: Path = DEFAULT_DATA_DIR,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    model_dir: Path = DEFAULT_MODEL_DIR,
    max_depth: int = 4,
    min_samples_leaf: int = 75,
) -> dict[str, Any]:
    matches, data_quality = _read_match_files(data_dir)
    if len(matches) < 10:
        raise ValueError(
            f"Foram encontradas apenas {len(matches)} partidas completas. "
            "São necessárias pelo menos 10 para esta análise."
        )

    dataset, prep_summary = prepare_round_dataset(matches)
    if dataset.empty or dataset["target_win"].nunique() < 2:
        raise ValueError("Não há exemplos suficientes de vitórias e derrotas para treinar os modelos.")

    # Outer chronological holdout: keep whole matches isolated between train and final test.
    match_order = sorted(
        ((match["start_ms"], match["match_id"]) for match in matches),
        key=lambda item: (item[0], item[1]),
    )
    split_index = int(len(match_order) * 0.80)
    split_index = min(max(split_index, 1), len(match_order) - 1)
    train_match_order = match_order[:split_index]
    test_match_ids = {match_id for _, match_id in match_order[split_index:]}
    train_match_ids = {match_id for _, match_id in train_match_order}

    # Inner chronological validation selects the model; the newest 20% remains untouched until final scoring.
    inner_split_index = int(len(train_match_order) * 0.80)
    inner_split_index = min(max(inner_split_index, 1), len(train_match_order) - 1)
    fit_match_ids = {match_id for _, match_id in train_match_order[:inner_split_index]}
    validation_match_ids = {match_id for _, match_id in train_match_order[inner_split_index:]}

    fit_data = dataset[dataset["match_id"].isin(fit_match_ids)].copy()
    validation = dataset[dataset["match_id"].isin(validation_match_ids)].copy()
    train = dataset[dataset["match_id"].isin(train_match_ids)].copy()
    test = dataset[dataset["match_id"].isin(test_match_ids)].copy()

    for name, frame in [("treino interno", fit_data), ("validação", validation), ("treino final", train), ("teste final", test)]:
        if frame.empty or frame["target_win"].nunique() < 2:
            raise ValueError(f"A divisão cronológica não produziu vitórias e derrotas suficientes em {name}.")

    X_fit, y_fit = fit_data[FEATURES], fit_data["target_win"].astype(int)
    X_val, y_val = validation[FEATURES], validation["target_win"].astype(int)
    X_train, y_train = train[FEATURES], train["target_win"].astype(int)
    X_test, y_test = test[FEATURES], test["target_win"].astype(int)

    candidates = _candidate_models(max_depth, min_samples_leaf)
    validation_results: list[dict[str, Any]] = []
    for name, classifier in candidates.items():
        candidate = _make_pipeline(classifier)
        candidate.fit(X_fit, y_fit)
        scores = _score_classifier(candidate, X_val, y_val)
        validation_results.append({"name": name, "validation_metrics": scores})
    # Choose using validation only. Balanced accuracy is primary; Brier score breaks ties.
    validation_results.sort(
        key=lambda item: (
            item["validation_metrics"]["balanced_accuracy"],
            item["validation_metrics"]["accuracy"],
            -item["validation_metrics"]["brier_score"],
        ),
        reverse=True,
    )
    selected_name = validation_results[0]["name"]

    # Train the chosen model on the complete outer training period; test it once on later matches.
    selected_classifier = _candidate_models(max_depth, min_samples_leaf)[selected_name]
    champion_pipeline = _make_pipeline(selected_classifier)
    champion_pipeline.fit(X_train, y_train)
    champion_predictions = champion_pipeline.predict(X_test)
    champion_probabilities = champion_pipeline.predict_proba(X_test)[:, 1]
    test_prevalence = float(y_test.mean())
    baseline_accuracy = max(test_prevalence, 1.0 - test_prevalence)
    champion_cm = confusion_matrix(y_test, champion_predictions, labels=[0, 1]).tolist()
    champion_metrics = {
        **_score_classifier(champion_pipeline, X_test, y_test),
        "majority_class_baseline_accuracy": round(float(baseline_accuracy), 4),
        "test_win_rate": round(test_prevalence, 4),
        "confusion_matrix_label_order": {"labels": ["loss", "win"], "rows": "actual", "columns": "predicted"},
        "confusion_matrix": champion_cm,
        "classification_report": classification_report(
            y_test, champion_predictions, labels=[0, 1], target_names=["loss", "win"],
            output_dict=True, zero_division=0,
        ),
    }

    # Always keep a shallow tree as an explanation model, independently of which model wins validation.
    tree_pipeline = _make_pipeline(DecisionTreeClassifier(
        max_depth=max_depth,
        min_samples_leaf=min_samples_leaf,
        random_state=42,
    ))
    tree_pipeline.fit(X_train, y_train)
    tree_predictions = tree_pipeline.predict(X_test)
    tree_probabilities = tree_pipeline.predict_proba(X_test)[:, 1]
    tree_metrics = {
        **_score_classifier(tree_pipeline, X_test, y_test),
        "majority_class_baseline_accuracy": round(float(baseline_accuracy), 4),
        "test_win_rate": round(test_prevalence, 4),
        "confusion_matrix_label_order": {"labels": ["loss", "win"], "rows": "actual", "columns": "predicted"},
        "confusion_matrix": confusion_matrix(y_test, tree_predictions, labels=[0, 1]).tolist(),
        "classification_report": classification_report(
            y_test, tree_predictions, labels=[0, 1], target_names=["loss", "win"],
            output_dict=True, zero_division=0,
        ),
    }

    feature_names = list(tree_pipeline.named_steps["preprocessor"].get_feature_names_out())
    tree_model = tree_pipeline.named_steps["model"]
    tree_rules = export_text(tree_model, feature_names=feature_names, decimals=2, show_weights=True)
    tree_importances = [
        {"feature": name, "importance": round(float(value), 6)}
        for name, value in zip(feature_names, tree_model.feature_importances_)
        if value > 0
    ]
    tree_importances.sort(key=lambda item: item["importance"], reverse=True)

    selected_model_obj = champion_pipeline.named_steps["model"]
    selected_feature_names = list(champion_pipeline.named_steps["preprocessor"].get_feature_names_out())
    if hasattr(selected_model_obj, "feature_importances_"):
        selected_importances = [
            {"feature": name, "importance": round(float(value), 6)}
            for name, value in zip(selected_feature_names, selected_model_obj.feature_importances_)
            if value > 0
        ]
        selected_importances.sort(key=lambda item: item["importance"], reverse=True)
    else:
        selected_importances = tree_importances

    train_start = min((m["start_ms"] for m in matches if m["match_id"] in train_match_ids), default=0)
    train_end = max((m["start_ms"] for m in matches if m["match_id"] in train_match_ids), default=0)
    test_start = min((m["start_ms"] for m in matches if m["match_id"] in test_match_ids), default=0)
    test_end = max((m["start_ms"] for m in matches if m["match_id"] in test_match_ids), default=0)

    # A separate short internal validation split is recorded so the final test stays unseen during selection.
    model_comparison = []
    for item in validation_results:
        model_comparison.append({
            "name": item["name"],
            "validation_metrics": item["validation_metrics"],
            "selected": item["name"] == selected_name,
        })

    leaf_patterns = _tree_leaf_patterns(tree_model, feature_names)
    champion_feature_name = {
        "Árvore de decisão": "Árvore de decisão",
        "Random Forest": "Random Forest",
        "Extra Trees": "Extra Trees",
    }[selected_name]

    report: dict[str, Any] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model": selected_name,
        "purpose": "Análise pós-partida de padrões associados a vitórias e derrotas em rounds históricos.",
        "usage_policy": "Somente análise pós-partida; não usar para previsão ou recomendação durante partidas em andamento.",
        "data_dir": str(data_dir.relative_to(SCRIPT_DIR)) if data_dir.is_relative_to(SCRIPT_DIR) else str(data_dir),
        "data_quality": data_quality,
        "preparation": {key: value for key, value in prep_summary.items() if key not in {"match_start_ms"}},
        "target_definition": "target_win=1 se a equipe da perspectiva da linha venceu o round histórico; 0 caso contrário.",
        "feature_policy": {
            "included": FEATURES,
            "excluded_to_avoid_leakage": [
                "kills e deaths do round atual", "damage e score do round atual",
                "winningTeamRole", "roundResult", "placar final da partida",
                "resultado final da equipe como feature",
            ],
            "note": "A análise usa apenas campos dos JSONs locais. Confirme com a documentação da organização que loadoutValue representa o equipamento disponível antes do início do round.",
        },
        "split": {
            "strategy": "seleção cronológica dentro do treino; teste final separado por partida inteira (partidas mais antigas para treino, partidas mais recentes para teste)",
            "train_matches": len(train_match_ids),
            "test_matches": len(test_match_ids),
            "model_fit_matches": len(fit_match_ids),
            "validation_matches": len(validation_match_ids),
            "train_examples": len(train),
            "test_examples": len(test),
            "train_start_utc": _timestamp_label(train_start),
            "train_end_utc": _timestamp_label(train_end),
            "test_start_utc": _timestamp_label(test_start),
            "test_end_utc": _timestamp_label(test_end),
        },
        "selected_model": {
            "name": champion_feature_name,
            "validation_metrics": validation_results[0]["validation_metrics"],
            "test_metrics": champion_metrics,
            "selection_rule": "Escolhido apenas pela validação cronológica dentro do conjunto de treino; teste final reservado para avaliação.",
        },
        "model_comparison": model_comparison,
        "metrics": champion_metrics,
        "decision_tree_metrics": tree_metrics,
        "feature_importances": selected_importances,
        "tree_feature_importances": tree_importances,
        "rule_patterns": leaf_patterns,
        "tree_rules": tree_rules,
        "model_settings": {
            "decision_tree_max_depth": max_depth,
            "decision_tree_min_samples_leaf": min_samples_leaf,
            "tree_depth_used": int(tree_model.get_depth()),
            "leaf_count": int(tree_model.get_n_leaves()),
            "random_forest_estimators": 200,
            "extra_trees_estimators": 200,
            "selection_metric": "balanced_accuracy; desempate por accuracy e Brier score",
            "sklearn_version": sklearn.__version__,
        },
        "caveats": [
            "Os resultados são retrospectivos e não orientam partidas em andamento.",
            "A acurácia do teste final mede somente as partidas históricas reservadas e não garante desempenho futuro.",
            "A importância de uma variável indica como o modelo a utiliza; não prova causalidade.",
            "A qualidade da análise depende de loadoutValue e dos demais campos estarem corretamente definidos no JSON da organização.",
            "Há poucos exemplos em alguns mapas; as conclusões por mapa podem ser instáveis.",
        ],
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    model_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "decision_tree_report.json"
    rules_path = output_dir / "decision_tree_rules.txt"
    tree_model_path = model_dir / "decision_tree_model.joblib"
    champion_model_path = model_dir / "champion_model.joblib"

    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    rules_text = (
        "ÁRVORE DE DECISÃO — VALORANT (modelo explicável)\n"
        "=================================================\n\n"
        "Objetivo: explicar padrões históricos associados a rounds concluídos.\n"
        "Uso: análise pós-partida; não fornece previsões ou recomendações em tempo real.\n"
        "Divisão: seleção por validação cronológica dentro do treino; teste final em partidas mais recentes.\n"
        "Nenhum kill/dano/resultado final do round é usado como feature.\n\n"
        f"MODELO PRINCIPAL SELECIONADO NA VALIDAÇÃO: {selected_name}\n"
        f"Acurácia no teste final do modelo principal: {champion_metrics['accuracy']:.4f}\n"
        f"Acurácia da árvore explicável no teste final: {tree_metrics['accuracy']:.4f}\n"
        f"Partidas de treino={len(train_match_ids)}; partidas de teste={len(test_match_ids)}.\n\n"
        "REGRAS DA ÁRVORE EXPLICÁVEL\n"
        "---------------------------\n"
        f"{tree_rules}\n\n"
        "IMPORTÂNCIA DAS VARIÁVEIS DA ÁRVORE EXPLICÁVEL\n"
        "----------------------------------------------\n"
        + "\n".join(f"{item['feature']}: {item['importance']:.4f}" for item in tree_importances)
        + "\n\nAVISO: associação estatística não prova causalidade e não garante o resultado.\n"
    )
    rules_path.write_text(rules_text, encoding="utf-8")
    joblib.dump({
        "pipeline": tree_pipeline,
        "features": FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "report_path": str(report_path.relative_to(SCRIPT_DIR)) if report_path.is_relative_to(SCRIPT_DIR) else str(report_path),
        "trained_at": report["created_at"],
        "role": "modelo explicável para análise retrospectiva",
    }, tree_model_path)
    joblib.dump({
        "pipeline": champion_pipeline,
        "features": FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "report_path": str(report_path.relative_to(SCRIPT_DIR)) if report_path.is_relative_to(SCRIPT_DIR) else str(report_path),
        "trained_at": report["created_at"],
        "selected_model": selected_name,
        "selection_method": "validação cronológica dentro do treino; teste final separado",
        "role": "modelo de melhor desempenho na validação para análise retrospectiva",
    }, champion_model_path)

    return {
        "ok": True,
        "report_path": str(report_path.relative_to(SCRIPT_DIR)) if report_path.is_relative_to(SCRIPT_DIR) else str(report_path),
        "rules_path": str(rules_path),
        "model_path": str(tree_model_path),
        "champion_model_path": str(champion_model_path),
        "selected_model": selected_name,
        "matches": data_quality["valid_completed_matches"],
        "rounds_used": prep_summary["rounds_used"],
        "examples": prep_summary["team_perspective_examples"],
        "train_matches": len(train_match_ids),
        "validation_matches": len(validation_match_ids),
        "test_matches": len(test_match_ids),
        "metrics": champion_metrics,
        "decision_tree_metrics": tree_metrics,
        "model_comparison": model_comparison,
        "feature_importances": selected_importances,
        "tree_depth_used": int(tree_model.get_depth()),
        "leaf_count": int(tree_model.get_n_leaves()),
        "rule_patterns": leaf_patterns,
        "data_quality": data_quality,
    }

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="Pasta com os JSONs de partidas (recursiva).")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Pasta de saída dos relatórios.")
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR, help="Pasta para salvar o modelo treinado.")
    parser.add_argument("--max-depth", type=int, default=4, help="Profundidade máxima da árvore (padrão: 4).")
    parser.add_argument("--min-samples-leaf", type=int, default=75, help="Mínimo de exemplos por folha (padrão: 75).")
    args = parser.parse_args()

    try:
        result = run_analysis(
            data_dir=args.data_dir,
            output_dir=args.output_dir,
            model_dir=args.model_dir,
            max_depth=args.max_depth,
            min_samples_leaf=args.min_samples_leaf,
        )
    except Exception as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
