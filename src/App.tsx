import React, { useState, useEffect } from 'react';
import './styles/Dashboard.css';
import './styles/R2R.css';
import './styles/Simulator.css';
import './styles/Global.css';
import { Header } from './components/Header';
import { KpiCard } from './components/KpiCard';
import { EconomyChart } from './components/EconomyChart';
import { RoundSelector } from './components/RoundSelector';
import { RoundDetailView } from './components/RoundDetailView';
import { SimulationView } from './components/SimulationView';
import { calculateMetrics, generateDetailedRoundSample } from './utils/economyUtils';
import { DollarSign, TrendingUp, ShieldAlert, BarChart2, Layers, Cpu } from 'lucide-react';
import { fetchMatchData } from './services/api';
import type { RoundData } from './types/match';

export const App: React.FC = () => {
  // Ajustado para padronizar com os times presentes no JSON: Red e Blue
  const [selectedTeam, setSelectedTeam] = useState<string>('Red');
  const [activeTab, setActiveTab] = useState<'overview' | 'roundByRound' | 'simulation'>('overview');
  const [selectedRound, setSelectedRound] = useState<number>(1);

  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const metrics = calculateMetrics(rounds);
  const currentDetailedRound = generateDetailedRoundSample(selectedRound);

  useEffect(() => {
    setLoading(true);
    fetchMatchData(selectedTeam)
      .then((data) => {
        setRounds(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro na comunicação com a API:", err);
        setLoading(false);
      });
  }, [selectedTeam]);

  return (
    <div className="dashboard-container">
      {/* Seletor de time limitado aos dois times reais do dataset: Red e Blue */}
      <Header selectedTeam={selectedTeam} onSelectTeam={setSelectedTeam} teams={['Red', 'Blue']} />

      {/* Navegação entre as 3 Abas */}
      <div className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <BarChart2 size={16} /> Visão Geral
        </button>
        <button
          className={`tab-btn ${activeTab === 'roundByRound' ? 'active' : ''}`}
          onClick={() => setActiveTab('roundByRound')}
        >
          <Layers size={16} /> Análise Round a Round
        </button>
        <button
          className={`tab-btn ${activeTab === 'simulation' ? 'active' : ''}`}
          onClick={() => setActiveTab('simulation')}
        >
          <Cpu size={16} /> Simulador IA
        </button>
      </div>

      {/* Aba 1: Visão Geral */}
      {activeTab === 'overview' && (
        <>
          <div className="kpis-grid">
            <KpiCard title="Win Rate (Full Buy)" value={`${metrics.fullBuyWinRate}%`} icon={<TrendingUp />} />
            <KpiCard title="Win Rate (Force Buy)" value={`${metrics.forceBuyWinRate}%`} icon={<ShieldAlert />} />
            <KpiCard title="Win Rate (Eco)" value={`${metrics.ecoWinRate}%`} icon={<DollarSign />} />
            <KpiCard title="Gasto Médio / Round" value={`$${metrics.avgSpent.toLocaleString()}`} icon={<DollarSign />} />
          </div>

          <div className="dashboard-container">
            {loading ? (
              <div style={{ color: 'white', padding: '20px' }}>Carregando dados financeiros do time {selectedTeam}...</div>
            ) : (
              <EconomyChart data={rounds} />
            )}
          </div>
        </>
      )}

      {/* Aba 2: Round a Round */}
      {activeTab === 'roundByRound' && (
        <>
          <RoundSelector
            totalRounds={rounds.length || 19}
            currentRound={selectedRound}
            onSelectRound={setSelectedRound}
          />
          <RoundDetailView round={currentDetailedRound} />
        </>
      )}

      {/* Aba 3: Simulador IA */}
      {activeTab === 'simulation' && <SimulationView />}
    </div>
  );
};

export default App;