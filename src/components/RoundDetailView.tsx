import React from 'react';
import type { DetailedRoundData, RoundData } from '../types/match';
import { DollarSign, Skull, Shield, Crosshair, AlertOctagon } from 'lucide-react';

interface RoundDetailViewProps {
  general: RoundData[];
  round: DetailedRoundData;
  number: number;
}

export const RoundDetailView: React.FC<RoundDetailViewProps> = ({number, general, round }) => {
  return (
    <div className="round-detail-container">
      {/* Resumo Superior do Round */}
      <div className="round-summary-card">
        <div className="summary-badge-group">
          <span className={`result-tag ${general[number].won ? 'victory' : 'defeat'}`}>
            {general[number].won ? 'VITÓRIA DO ROUND' : 'DERROTA DO ROUND'}
          </span>
          <span className="buy-tag">{general[number].buyType}</span>
        </div>

        <div className="summary-metrics-row">
          <div className="summary-item">
            <span className="label">Investimento Total:</span>
            <span className="value">${general[number].totalLoadoutValue.toLocaleString()}</span>
          </div>
          <div className="summary-item">
            <span className="label">Desperdício em Mortes:</span>
            <span className="value waste">${round.creditWasteTotal.toLocaleString()}</span>
          </div>
          <div className="summary-item">
            <span className="label">Spike Plantada:</span>
            <span className="value">{round.spikePlanted ? 'Sim' : 'Não'}</span>
          </div>
        </div>
      </div>

      {/* Tabela de Jogadores do Round */}
      <div className="players-table-card">
        <h3><Crosshair size={18} /> Equipamentos e Desempenho no Round</h3>
        <div className="table-wrapper">
          <table className="round-table">
            <thead>
              <tr>
                <th>Agente / Jogador</th>
                <th>Arma Comprada</th>
                <th>Escudo</th>
                <th>Gastos ($)</th>
                <th>Abates</th>
                <th>Status</th>
                <th>Perda Est. ($)</th>
              </tr>
            </thead>
            <tbody>
              {round.players.map((p) => (
                <tr key={p.playerId} className={p.died ? 'row-dead' : 'row-alive'}>
                  <td>
                    <div className="player-cell">
                      <span className="agent-name">{p.agent}</span>
                      <span className="player-sub">{p.playerName}</span>
                    </div>
                  </td>
                  <td>{p.weaponPurchased}</td>
                  <td>
                    <span className="shield-tag">
                      <Shield size={14} /> {p.shieldPurchased}
                    </span>
                  </td>
                  <td>${p.spentInRound.toLocaleString()}</td>
                  <td>{p.kills}</td>
                  <td>
                    {p.died ? (
                      <span className="status-dead"><Skull size={14} /> Morto</span>
                    ) : (
                      <span className="status-alive">Vivo</span>
                    )}
                  </td>
                  <td className={p.unTradedDeath ? 'highlight-waste' : ''}>
                    {p.unTradedDeath ? `$${p.spentInRound.toLocaleString()} ⚠️` : '$0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};