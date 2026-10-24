import React from 'react';
import type { RoundData } from '../types/match';
import { BarChart3, DollarSign, FileText } from 'lucide-react';

interface RoundDetailViewProps {
  round: RoundData;
  selectedTeam: string;
}

export const RoundDetailView: React.FC<RoundDetailViewProps> = ({ round, selectedTeam }) => {
  return (
    <div className="round-detail-container">
      <section className="round-summary-card">
        <div className="summary-badge-group">
          <span className={`result-tag ${round.won ? 'victory' : 'defeat'}`}>
            {round.won ? 'VITÓRIA DO ROUND' : 'DERROTA DO ROUND'}
          </span>
          <span className="buy-tag">{round.buyType}</span>
        </div>

        <h3 style={{ marginBottom: 16 }}>Resumo real do round {round.roundNum}</h3>

        <div className="summary-metrics-row">
          <div className="summary-item">
            <span className="label">Equipe analisada</span>
            <span className="value">{selectedTeam}</span>
          </div>
          <div className="summary-item">
            <span className="label">Equipe vencedora</span>
            <span className="value">{round.winningTeam}</span>
          </div>
          <div className="summary-item">
            <span className="label"><DollarSign size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Valor do equipamento</span>
            <span className="value">${round.totalLoadoutValue.toLocaleString()}</span>
          </div>
        </div>
      </section>

      <section className="players-table-card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <BarChart3 size={18} /> Leitura do resultado
        </h3>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {round.won
            ? `O ${selectedTeam} venceu este round com o tipo de compra classificado como ${round.buyType}.`
            : `O ${selectedTeam} perdeu este round; o adversário (${round.winningTeam}) venceu com o estado de equipamento registrado no JSON.`}
        </p>
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', marginTop: 12, fontSize: '0.85rem' }}>
          <FileText size={16} /> Dados lidos do arquivo JSON local do desafio. Nenhuma estatística fictícia é gerada nesta visualização.
        </p>
      </section>
    </div>
  );
};
