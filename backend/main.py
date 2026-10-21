from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import json
import os
from typing import List, Optional

app = FastAPI(title="Valorant Hackathon API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JSON_FILE_PATH = "./data/Rush Series Esquenta/RUSHE_002_06-06-26_azure_bears_black_6_x_13_ufmt_turuna_ascent.json"

def load_match_json():
    """Carrega o arquivo JSON local."""
    if not os.path.exists(JSON_FILE_PATH):
        alternative_path = os.path.join(os.path.dirname(__file__), "..", "match.json")
        if os.path.exists(alternative_path):
            with open(alternative_path, "r", encoding="utf-8") as f:
                return json.load(f)
        raise FileNotFoundError(f"Arquivo de dados JSON não encontrado em {JSON_FILE_PATH}")
    
    with open(JSON_FILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def classify_buy_type(total_loadout: int) -> str:
    """Classifica o tipo de compra com base no loadout total do time."""
    if total_loadout < 10000:
        return "Eco"
    elif total_loadout < 18000:
        return "Force Buy"
    return "Full Buy"

@app.get("/api/match-data")
def get_match_data(team: str = Query("Blue", description="Time a ser filtrado (Red ou Blue)")):
    """
    Processa o JSON da partida filtrando pelo time selecionado.
    Calcula o loadoutValue dos jogadores do time especificado por rodada.
    """
    try:
        data = load_match_json()
        
        # Mapeia cada jogador (puuid) para o seu teamId ('Red' ou 'Blue')
        player_teams = {
            player.get("puuid"): player.get("teamId") 
            for player in data.get("players", [])
        }

        rounds_data = []

        for round_item in data.get("roundResults", []):
            round_num = round_item.get("roundNum")
            winning_team = round_item.get("winningTeam")
            player_stats = round_item.get("playerStats", [])
            
            team_loadout = 0

            # Soma o loadoutValue apenas dos jogadores do time filtrado
            for player in player_stats:
                puuid = player.get("puuid")
                if player_teams.get(puuid) == team:
                    economy = player.get("economy", {})
                    team_loadout += economy.get("loadoutValue", 0)

            buy_type = classify_buy_type(team_loadout)
            won = (winning_team == team)

            rounds_data.append({
                "roundNum": round_num + 1,  # Ajustado para exibição baseada em 1
                "winningTeam": winning_team,
                "won": won,
                "totalLoadoutValue": team_loadout,
                "buyType": buy_type
            })

        return rounds_data

    except FileNotFoundError as fnf_error:
        raise HTTPException(status_code=404, detail=str(fnf_error))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar dados da partida: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)