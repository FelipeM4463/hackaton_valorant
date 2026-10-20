import React, { useState } from 'react';
import { Cpu, DollarSign, Shield, Zap } from 'lucide-react';
import { predictRoundWinRate } from '../utils/economyUtils';

export const Simulator: React.FC = () => {
  const [budget, setBudget] = useState<number>(12500);
  const [side, setSide] = useState<'Attack' | 'Defense'>('Attack');

  const prediction = predictRoundWinRate(budget, side);

  return (
    <div className="simulator-card">
      <div className="simulator-header">
        <Cpu className="icon-ai" />
        <div>
          <h3>Simulador Preditivo de IA</h3>
          <p>Preveja a chance de vitória do próximo round com base no investimento do time</p>
        </div>
      </div>

      <div className="simulator-body">
        <div className="simulator-inputs">
          <div className="input-group">
            <label>
              <DollarSign size={16} /> Saldo Total da Equipe ($)
            </label>
            <input
              type="number"
              step={500}
              min={0}
              max={45000}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </div>

          <div className="input-group">
            <label>
              <Shield size={16} /> Lado da Partida
            </label>
            <div className="radio-group">
              <button
                className={`btn-toggle ${side === 'Attack' ? 'active' : ''}`}
                onClick={() => setSide('Attack')}
              >
                Ataque
              </button>
              <button
                className={`btn-toggle ${side === 'Defense' ? 'active' : ''}`}
                onClick={() => setSide('Defense')}
              >
                Defesa
              </button>
            </div>
          </div>
        </div>

        <div className="simulator-output">
          <div className="gauge-box">
            <span className="gauge-label">Chance Estimada de Vitória</span>
            <div className="gauge-value">{prediction.winRate}%</div>
            <span className={`status-badge ${prediction.winRate >= 60 ? 'high' : prediction.winRate >= 40 ? 'med' : 'low'}`}>
              {prediction.status}
            </span>
          </div>

          <div className="recommendation-box">
            <h4>
              <Zap size={18} /> Recomendação Tática
            </h4>
            <p>{prediction.recommendation}</p>
          </div>
        </div>
      </div>
    </div>
  );
};