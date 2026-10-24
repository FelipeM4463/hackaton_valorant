import type { RoundData, EconomyMetrics } from '../types/match';

/**
 * Classifica a compra com base no valor total de equipamento registrado no JSON.
 */
export const classifyBuyType = (totalLoadout: number): 'Eco' | 'Force Buy' | 'Full Buy' => {
  if (totalLoadout < 10000) return 'Eco';
  if (totalLoadout < 18000) return 'Force Buy';
  return 'Full Buy';
};

/**
 * Calcula métricas retrospectivas a partir dos rounds reais carregados pela API local.
 * Win rate por categoria = rounds vencidos naquela categoria / total de rounds da categoria.
 */
export const calculateMetrics = (rounds: RoundData[]): EconomyMetrics => {
  const getWinRate = (type: 'Eco' | 'Force Buy' | 'Full Buy') => {
    const filtered = rounds.filter((round) => round.buyType === type);
    if (filtered.length === 0) return 0;
    const wins = filtered.filter((round) => round.won).length;
    return Math.round((wins / filtered.length) * 100);
  };

  const totalLoadout = rounds.reduce((sum, round) => sum + round.totalLoadoutValue, 0);

  return {
    fullBuyWinRate: getWinRate('Full Buy'),
    forceBuyWinRate: getWinRate('Force Buy'),
    ecoWinRate: getWinRate('Eco'),
    avgSpent: rounds.length > 0 ? Math.round(totalLoadout / rounds.length) : 0,
  };
};
