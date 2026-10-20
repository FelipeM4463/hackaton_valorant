import React, { useState } from 'react';
import type { SimulationInput } from '../types/match';
import { runEconomySimulation } from '../utils/economyUtils';
import { SimulationForm } from './SimulationForm';
import { SimulationResultCard } from './SimulationResultCard';

export const SimulationView: React.FC = () => {
  const [input, setInput] = useState<SimulationInput>({
    teamBudget: 12500,
    side: 'Attack',
    mapName: 'Ascent',
    opponentBuyEstimate: 'Full Buy',
  });

  const result = runEconomySimulation(input);

  return (
    <div className="simulation-page-wrapper">
      <div className="simulation-intro">
        <h2>🤖 Simulador Tático de Decisão Econômica</h2>
        <p>Ajuste as condições financeiras da sua equipe para prever a taxa de vitória e receber a melhor recomendação tática.</p>
      </div>

      <div className="simulation-content-grid">
        <SimulationForm input={input} onChangeInput={setInput} />
        <SimulationResultCard result={result} />
      </div>
    </div>
  );
};