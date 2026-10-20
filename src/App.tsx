import React, { useState } from 'react';
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
import { calculateMetrics, classifyBuyType, generateDetailedRoundSample } from './utils/economyUtils';
import { DollarSign, TrendingUp, ShieldAlert, BarChart2, Layers, Cpu } from 'lucide-react';
import type { RoundData } from './types/match';

const sampleRounds: RoundData[] = Array.from({ length: 20 }, (_, i) => {
  const loadout = Math.floor(Math.random() * 22000) + 4000;
  const won = Math.random() > (loadout < 12000 ? 0.7 : 0.3);
  return {
    roundNum: i + 1,
    winningTeam: won ? 'Time Alpha' : 'Time Beta',
    teamSpent: Math.floor(loadout * 0.9),
    teamLoadoutValue: loadout,
    buyType: classifyBuyType(loadout),
    won,
  };
});

export const App: React.FC = () => {
  const [selectedTeam, setSelectedTeam] = useState<string>('Time Alpha');
  const [activeTab, setActiveTab] = useState<'overview' | 'roundByRound' | 'simulation'>('overview');
  const [selectedRound, setSelectedRound] = useState<number>(1);

  const metrics = calculateMetrics(sampleRounds);
  const currentDetailedRound = generateDetailedRoundSample(selectedRound);

  return (
    <div className="dashboard-container">
      <Header selectedTeam={selectedTeam} onSelectTeam={setSelectedTeam} />

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

          <div className="main-content-grid">
            <EconomyChart data={sampleRounds} />
          </div>
        </>
      )}

      {/* Aba 2: Round a Round */}
      {activeTab === 'roundByRound' && (
        <>
          <RoundSelector
            totalRounds={sampleRounds.length}
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