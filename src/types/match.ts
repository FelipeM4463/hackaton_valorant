export interface PlayerEconomy {
    spent: number;
    loadoutValue: number;
  }
  
export interface RoundData {
  roundNum: number;
  winningTeam: string;
  won: boolean;
  totalLoadoutValue: number;
  buyType: 'Eco' | 'Force Buy' | 'Full Buy';
}

export interface EconomyMetrics {
  fullBuyWinRate: number;
  forceBuyWinRate: number;
  ecoWinRate: number;
  avgSpent: number;
}

export interface PlayerRoundDetail {
  playerId: string;
  playerName: string;
  agent: string;
  weaponPurchased: string;
  shieldPurchased: 'Nenhum' | 'Leve' | 'Pesado';
  spentInRound: number;
  abilitiesUsed: number;
  kills: number;
  died: boolean;
  unTradedDeath: boolean; // Morte sem troca (gera desperdício financeiro)
}

export interface DetailedRoundData extends RoundData {
  players: PlayerRoundDetail[];
  spikePlanted: boolean;
  spikeDefused: boolean;
  creditWasteTotal: number;
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