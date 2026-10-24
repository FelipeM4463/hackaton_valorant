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
