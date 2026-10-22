import React from 'react';

interface RoundSelectorProps {
  totalRounds: number;
  currentRound: number;
  onSelectRound: (roundNum: number) => void;
}

export const RoundSelector: React.FC<RoundSelectorProps> = ({
  totalRounds,
  currentRound,
  onSelectRound,
}) => {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i);

  return (
    <div className="round-selector-container">
      <span className="selector-title">Selecione o Round:</span>
      <div className="round-buttons-grid">
        {rounds.map((r) => (
          <button
            key={r}
            className={`btn-round ${currentRound === r ? 'active' : ''}`}
            onClick={() => onSelectRound(r)}
          >
            R{r}
          </button>
        ))}
      </div>
    </div>
  );
};