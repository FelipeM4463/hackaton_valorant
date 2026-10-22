// src/services/api.ts
import type { DetailedRoundData, RoundData } from '../types/match';

const API_BASE_URL = 'http://127.0.0.1:8000';

export const fetchMatchData = async (team: string = 'Blue'): Promise<RoundData[]> => {
  const url = `${API_BASE_URL}/api/match-data?team=${encodeURIComponent(team)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Erro ao buscar dados da partida no FastAPI');
  }
  return await response.json();
};

export const fetchDetailedMatchData = async (team: string = 'Blue'): Promise<DetailedRoundData[]> => {
  const url = `${API_BASE_URL}/api/match-detailed-data?team=${encodeURIComponent(team)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Erro ao buscar dados detalhados no FastAPI');
  }
  return await response.json();
};