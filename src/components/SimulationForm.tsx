import React from 'react';
import type { SimulationInput } from '../types/match';
import { DollarSign, Shield, Map, Users } from 'lucide-react';

interface SimulationFormProps {
  input: SimulationInput;
  onChangeInput: (newInput: SimulationInput) => void;
}

export const SimulationForm: React.FC<SimulationFormProps> = ({ input, onChangeInput }) => {
  return (
    <div className="sim-form-card">
      <h3>Configuração da Rodada Próxima</h3>
      
      {/* Saldo do Time */}
      <div className="input-field-group">
        <label><DollarSign size={16} /> Saldo Disponível da Equipe ($)</label>
        <input
          type="number"
          step={500}
          min={0}
          max={45000}
          value={input.teamBudget}
          onChange={(e) => onChangeInput({ ...input, teamBudget: Number(e.target.value) })}
        />
        <span className="field-hint">Soma do dinheiro de todos os 5 jogadores</span>
      </div>

      {/* Lado do Mapa */}
      <div className="input-field-group">
        <label><Shield size={16} /> Lado da Partida</label>
        <div className="button-toggle-group">
          <button
            type="button"
            className={`btn-choice ${input.side === 'Attack' ? 'active' : ''}`}
            onClick={() => onChangeInput({ ...input, side: 'Attack' })}
          >
            Ataque
          </button>
          <button
            type="button"
            className={`btn-choice ${input.side === 'Defense' ? 'active' : ''}`}
            onClick={() => onChangeInput({ ...input, side: 'Defense' })}
          >
            Defesa
          </button>
        </div>
      </div>

      {/* Mapa */}
      <div className="input-field-group">

<Map size={16} />
<label> Mapa</label>
        <select
          value={input.mapName}
          onChange={(e) => onChangeInput({ ...input, mapName: e.target.value })}
        >
          <option value="Ascent">Ascent</option>
          <option value="Bind">Bind</option>
          <option value="Haven">Haven</option>
          <option value="Split">Split</option>
        </select>
      </div>

      {/* Compra Prevista do Oponente */}
      <div className="input-field-group">
        <label><Users size={16} /> Compra Estimada do Adversário</label>
        <select
          value={input.opponentBuyEstimate}
          onChange={(e) => onChangeInput({ ...input, opponentBuyEstimate: e.target.value as any })}
        >
          <option value="Full Buy">Full Buy (Armas Fortes)</option>
          <option value="Force Buy">Force Buy (Compra Médica)</option>
          <option value="Eco">Eco (Guardando Dinheiro)</option>
        </select>
      </div>
    </div>
  );
};