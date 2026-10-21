import type { RoundData, EconomyMetrics } from '../types/match';

/**
 * Classifica a compra da equipe com base no valor total do loadout
 */
export const classifyBuyType = (totalLoadout: number): 'Eco' | 'Force Buy' | 'Full Buy' => {
  if (totalLoadout < 10000) return 'Eco';
  if (totalLoadout < 18000) return 'Force Buy';
  return 'Full Buy';
};

/**
 * Processa a lista de rounds e retorna as métricas consolidadas
 */
export const calculateMetrics = (rounds: RoundData[]): EconomyMetrics => {
  const getWinRate = (type: 'Eco' | 'Force Buy' | 'Full Buy') => {
    const filtered = rounds.filter((r) => r.buyType === type);
    if (filtered.length === 0) return 0;
    
    return Math.round((filtered.length / rounds.length) * 100);
  };

  let totalSpent = 0;

  rounds.forEach((round)=> totalSpent+=round.totalLoadoutValue)

  return {
    fullBuyWinRate: getWinRate('Full Buy'),
    forceBuyWinRate: getWinRate('Force Buy'),
    ecoWinRate: getWinRate('Eco'),
    avgSpent: rounds.length > 0 ? Math.round(totalSpent / rounds.length) : 0,
  };
};

/**
 * Função de inferência/predição do Simulador de IA (Simula o modelo de Machine Learning)
 */
export const predictRoundWinRate = (teamBudget: number, side: 'Attack' | 'Defense'): { winRate: number; status: string; recommendation: string } => {
  let winRate = 20;
  if (teamBudget >= 18000) winRate = 78;
  else if (teamBudget >= 10000) winRate = 42;
  else winRate = 18;

  if (side === 'Defense') winRate += 4; // Ajuste leve por lado do mapa

  let status = 'Baixa Probabilidade';
  let recommendation = 'Recomendado fazer ECO total para garantir Full Buy no próximo round.';

  if (winRate >= 70) {
    status = 'Excelente';
    recommendation = 'Investimento ideal! Vantagem bélica para vencer o round.';
  } else if (winRate >= 40) {
    status = 'Risco Moderado';
    recommendation = 'Compra forçada. Requer alto aproveitamento de eliminações para converter.';
  }

  return { winRate, status, recommendation };
};

// Adicione estas funções ao final de src/utils/economyUtils.ts
import type { DetailedRoundData, PlayerRoundDetail } from '../types/match';

/**
 * Calcula o custo estimado do equipamento retido/perdido em caso de morte
 */
export const calculatePlayerCreditWaste = (player: PlayerRoundDetail): number => {
  if (!player.died) return 0;
  
  // Se morreu sem troca de eliminações, todo o investimento do loadout foi "desperdiçado"
  let waste = player.spentInRound;
  if (player.shieldPurchased === 'Leve') waste += 400;
  if (player.shieldPurchased === 'Pesado') waste += 1000;

  return waste;
};

export const generateDetailedRoundSample = (roundNum: number): DetailedRoundData => {
  const agents = ['Jett', 'Reyna', 'Sova', 'Omen', 'Killjoy'];
  const weapons = ['Vandal', 'Phantom', 'Spectre', 'Ghost', 'Sheriff', 'Operator'];

  const players: PlayerRoundDetail[] = agents.map((agent, index) => {
    const died = Math.random() > 0.5;
    const kills = Math.floor(Math.random() * 3);
    const spentInRound = Math.floor(Math.random() * 3500) + 800;
    
    return {
      playerId: `p${index + 1}`,
      playerName: `Jogador ${index + 1}`,
      agent,
      weaponPurchased: weapons[Math.floor(Math.random() * weapons.length)],
      shieldPurchased: spentInRound > 2000 ? 'Pesado' : spentInRound > 1000 ? 'Leve' : 'Nenhum',
      spentInRound,
      abilitiesUsed: Math.floor(Math.random() * 4),
      kills,
      died,
      unTradedDeath: died && kills === 0,
    };
  });

  const creditWasteTotal = players.reduce((sum, p) => sum + calculatePlayerCreditWaste(p), 0);

  return {
    roundNum,
    winningTeam: roundNum % 2 === 0 ? 'Time Alpha' : 'Time Beta',
    teamSpent: players.reduce((sum, p) => sum + p.spentInRound, 0),
    teamLoadoutValue: players.reduce((sum, p) => sum + p.spentInRound, 0) + 2000,
    buyType: roundNum % 3 === 0 ? 'Eco' : roundNum % 2 === 0 ? 'Force Buy' : 'Full Buy',
    won: roundNum % 2 === 0,
    players,
    spikePlanted: true,
    spikeDefused: roundNum % 4 === 0,
    creditWasteTotal,
  };
};

// Adicione esta função ao final de src/utils/economyUtils.ts
import type { SimulationInput, SimulationResult } from '../types/match';

/**
 * Modelo preditivo de simulação de vitórias e impacto financeiro
 */
export const runEconomySimulation = (input: SimulationInput): SimulationResult => {
  const { teamBudget, side, opponentBuyEstimate } = input;

  // Lógica de cálculo da probabilidade baseada no investimento
  let baseWinRate = 20;

  if (teamBudget >= 18000) {
    baseWinRate = 75;
  } else if (teamBudget >= 10000) {
    baseWinRate = 42;
  } else {
    baseWinRate = 18;
  }

  // Ajuste de lado (Defesa costuma ter vantagem leve em rounds econômicos)
  if (side === 'Defense') baseWinRate += 5;

  // Ajuste com base na compra estimada do oponente
  if (opponentBuyEstimate === 'Eco') baseWinRate += 15;
  if (opponentBuyEstimate === 'Full Buy' && teamBudget < 10000) baseWinRate -= 8;

  // Garantir limites entre 5% e 95%
  const winRatePercent = Math.min(Math.max(baseWinRate, 5), 95);

  // Determinar Risco e Recomendações
  let statusRisk: 'Baixo Risco' | 'Risco Moderado' | 'Alto Risco' = 'Alto Risco';
  let recommendedAction = 'ECO TOTAL';
  let tacticalTip = 'Guarde créditos neste round. A probabilidade de conversão é baixa, mas garante Full Buy no próximo.';

  if (winRatePercent >= 65) {
    statusRisk = 'Baixo Risco';
    recommendedAction = 'FULL BUY (Compra Cheia)';
    tacticalTip = 'Sua equipe tem vantagem bélica. Priorize dominar áreas neutras do mapa no início do round.';
  } else if (winRatePercent >= 38) {
    statusRisk = 'Risco Moderado';
    recommendedAction = 'FORCE BUY (Compra Forçada)';
    tacticalTip = 'Risco calculado. Compre pistolas pesadas/SMGs e utilitários para buscar eliminações de surpresa.';
  }

  // Projeção de orçamento para o próximo round
  const expectedNextRoundBudget = teamBudget < 10000 
    ? teamBudget + 19000  // Ganho acumulado de Eco
    : Math.max(teamBudget - 15000, 3000);

  return {
    winRatePercent,
    statusRisk,
    recommendedAction,
    expectedNextRoundBudget,
    tacticalTip,
  };
};