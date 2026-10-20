import React from 'react';
import type { SimulationResult } from '../types/match';
import { Cpu, Zap, TrendingUp, AlertTriangle } from 'lucide-react';

interface SimulationResultCardProps {
  result: SimulationResult;
}

export const SimulationResultCard: React.FC<SimulationResultCardProps> = ({ result }) => {
  return (
    <div className="sim-result-card">
      <div className="sim-header">
        <Cpu size={22} className="ai-icon" />
        <h4>Resultado da Análise Preditiva (IA)</h4>
      </div>

      {/* Display do Medidor */}
      <div className="gauge-display-container">
        <span className="gauge-caption">Probabilidade Média de Vitória</span>
        <div className="gauge-percentage-number">{result.winRatePercent}%</div>
        <span className={`risk-pill ${result.statusRisk.replace(/\s+/g, '-').toLowerCase()}`}>
          {result.statusRisk}
        </span>
      </div>

      {/* Ação Recomendada */}
      <div className="action-recommendation-box">
        <span className="box-sub">Decisão Econômica Sugerida:</span>
        <h3 className="action-title">{result.recommendedAction}</h3>
        <p className="tactical-p"><Zap size={15} /> {result.tacticalTip}</p>
      </div>

      {/* Projeção do Próximo Round */}
      <div className="next-round-projection">
        <TrendingUp size={16} />
        <span>Projeção de Orçamento do Próximo Round: <strong>${result.expectedNextRoundBudget.toLocaleString()}</strong></span>
      </div>
    </div>
  );
};