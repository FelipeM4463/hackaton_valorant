export interface PlayerEconomy {
    spent: number;
    loadoutValue: number;
}

export interface EconomyMetrics {
  fullBuyWinRate: number;
  forceBuyWinRate: number;
  ecoWinRate: number;
  avgSpent: number;
}

export interface PlayerRoundDetail {
  agente: string;
  jogador: string;
  arma: string;
  escudo: string;
  gastos: number;
  abates: number;
  status: 'Vivo' | 'Morto';
  perdaEstimada: number;
}

export interface DetailedRoundData {
  roundNum: number;
  winningTeam: string;
  won: boolean;
  buyType: string;
  investimentoTotal: number;
  desperdicioMortes: number;
  spikePlantada: boolean;
  jogadores: PlayerRoundDetail[];
}

export interface RoundData {
  roundNum: number;
  winningTeam: string;
  won: boolean;
  totalLoadoutValue: number;
  buyType: 'Eco' | 'Force Buy' | 'Full Buy';
}

export interface SimulationInput {
  teamBudget: number;
  side: 'Attack' | 'Defense';
  mapName: string;
  opponentBuyEstimate: 'Eco' | 'Force Buy' | 'Full Buy';
}

export interface SimulationResult {
  winRatePercent: number;
  statusRisk: 'Baixo Risco' | 'Risco Moderado' | 'Alto Risco';
  recommendedAction: string;
  expectedNextRoundBudget: number;
  tacticalTip: string;
}