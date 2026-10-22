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

# Mapeamentos de UUIDs conhecidos do Valorant para nomes legíveis
WEAPON_MAP = {
    "29a0cfab-485b-7525-779a-b59f85e204ab": "Classic",
    "63e073d8-4570-8760-7707-3ea23c8989a6": "Frenzy",
    "55d8904f-4374-4725-ab41-751222cc56ea": "Ghost",
    "e3367d15-4217-a61d-84e0-79be158e9206": "Sheriff",
    "42177070-41db-e578-1738-a69f7024e3ef": "Spectre",
    "462223d4-4256-3016-1740-3b82a715d2b6": "Bucky",
    "1baa85b4-4c70-1284-6455-008746c3b463": "Ghost", # Exemplo de ID visto no JSON
    "ee893330-4363-517a-011f-5f5d546fc413": "Judge",
    "9c462d6a-4944-c77b-6d35-2086ffd20d5f": "Bulldog",
    "4ade6120-4702-8a01-0814-a864d151dba1": "Guardian",
    "ee893330-4363-517a-011f-5f5d546fc413": "Phantom",
    "9c462d6a-4944-c77b-6d35-2086ffd20d5f": "Vandal",
    "c4883e50-4494-202c-3ec3-6b8a9284f00b": "Marshal",
    "a037266d-4a1b-9da1-417f-1196f3b01054": "Operator",
    "57d405cc-4836-a581-611a-1e9603058866": "Ares",
    "61e05e6b-46bf-32ca-c95e-119e917d21c3": "Odin"
}

ARMOR_MAP = {
    "44d40305-492f-4103-b06d-317d0752a781": "Leve",
    "4118a7ec-4e41-5810-6695-1f92e707e780": "Pesado",
    "4d715a3a-44d4-42b4-82a1-a0836932454f": "Escudo de Regeneração"
}


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
    """Resumo por round para gráfico e navegação geral."""
    try:
        data = load_match_json()
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
            for player in player_stats:
                puuid = player.get("puuid")
                if player_teams.get(puuid) == team:
                    economy = player.get("economy", {})
                    team_loadout += economy.get("loadoutValue", 0)

            buy_type = classify_buy_type(team_loadout)
            won = (winning_team == team)

            rounds_data.append({
                "roundNum": round_num + 1,
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


@app.get("/api/match-detailed-data")
def get_match_detailed_data(team: str = Query("Blue", description="Time a ser filtrado (Red ou Blue)")):
    """Retorna dados detalhados de cada round para a tela de Análise Round a Round."""
    try:
        data = load_match_json()

        # Mapeia puuid para informações do jogador (Time, Agente, GameName)
        player_info = {}
        for p in data.get("players", []):
            puuid = p.get("puuid")
            player_info[puuid] = {
                "teamId": p.get("teamId"),
                "agent": p.get("characterId", "Agente"),
                "gameName": p.get("gameName", f"Jogador {len(player_info)+1}")
            }

        detailed_rounds = []

        for round_item in data.get("roundResults", []):
            round_num = round_item.get("roundNum")
            winning_team = round_item.get("winningTeam")
            bomb_planter = round_item.get("bombPlanter")
            player_stats = round_item.get("playerStats", [])

            investimento_total = 0
            desperdicio_mortes = 0
            jogadores_detalhes = []

            for player in player_stats:
                puuid = player.get("puuid")
                info = player_info.get(puuid, {})

                if info.get("teamId") == team:
                    economy = player.get("economy", {})
                    loadout_val = economy.get("loadoutValue", 0)
                    spent_val = economy.get("spent", 0)
                    
                    weapon_id = str(economy.get("weapon", "")).lower()
                    armor_id = str(economy.get("armor", "")).lower()

                    arma_nome = WEAPON_MAP.get(weapon_id, "Vandal" if loadout_val > 2500 else "Ghost")
                    escudo_nome = ARMOR_MAP.get(armor_id, "Nenhum" if loadout_val < 1000 else "Leve")

                    kills_count = len(player.get("kills", []))
                    
                    # Identifica se o jogador morreu no round
                    # Um jogador morre se estiver na lista de vítimas dentro de 'kills' de alguém
                    foi_morto = False
                    for p_other in player_stats:
                        for k in p_other.get("kills", []):
                            if k.get("victim") == puuid:
                                foi_morto = True
                                break

                    status = "Morto" if foi_morto else "Vivo"

                    investimento_total += spent_val if spent_val > 0 else loadout_val
                    
                    if foi_morto:
                        desperdicio_mortes += loadout_val

                    jogadores_detalhes.append({
                        "agente": info.get("agent", "Agente"),
                        "jogador": info.get("gameName", "Jogador"),
                        "arma": arma_nome,
                        "escudo": escudo_nome,
                        "gastos": spent_val if spent_val > 0 else loadout_val,
                        "abates": kills_count,
                        "status": status,
                        "perdaEstimada": loadout_val if foi_morto else 0
                    })

            buy_type = classify_buy_type(investimento_total)

            detailed_rounds.append({
                "roundNum": round_num + 1,
                "winningTeam": winning_team,
                "won": (winning_team == team),
                "buyType": buy_type,
                "investimentoTotal": investimento_total,
                "desperdicioMortes": desperdicio_mortes,
                "spikePlantada": bomb_planter is not None,
                "jogadores": jogadores_detalhes
            })

        return detailed_rounds

    except FileNotFoundError as fnf_error:
        raise HTTPException(status_code=404, detail=str(fnf_error))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar dados da partida: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)