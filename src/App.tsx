
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
import { SimulatorChat } from './components/SimulatorChat';

import { calculateMetrics } from './utils/economyUtils';

import {
  DollarSign,
  TrendingUp,
  ShieldAlert,
  BarChart2,
  Layers,
  FileText,
  FlaskConical,
} from 'lucide-react';

import { fetchMatchData } from './services/api';
import type { RoundData } from './types/match';

type ActiveTab =
  | 'overview'
  | 'roundByRound'
  | 'simulation'
  | 'offlineSimulator';

export const App: React.FC = () => {
  const [selectedTeam, setSelectedTeam] = useState<string>('Red');

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  const [selectedRound, setSelectedRound] = useState<number>(1);

  const [rounds, setRounds] = useState<RoundData[]>([]);

  const [loading, setLoading] = useState<boolean>(true);

  const metrics = calculateMetrics(rounds);

  const currentRound = rounds.find(
    (round) => round.roundNum === selectedRound
  );

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    fetchMatchData(selectedTeam)
      .then((data) => {
        if (cancelled) return;

        setRounds(data);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;

        console.error('Erro na comunicação com a API:', error);
        setRounds([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTeam]);

  return (
    <div className="dashboard-container">
      <Header
        selectedTeam={selectedTeam}
        onSelectTeam={setSelectedTeam}
        teams={['Red', 'Blue']}
      />

      <div className="tab-navigation">
        <button
          type="button"
          className={`tab-btn ${
            activeTab === 'overview' ? 'active' : ''
          }`}
          onClick={() => setActiveTab('overview')}
        >
          <BarChart2 size={16} />
          Visão Geral
        </button>

        <button
          type="button"
          className={`tab-btn ${
            activeTab === 'roundByRound' ? 'active' : ''
          }`}
          onClick={() => setActiveTab('roundByRound')}
        >
          <Layers size={16} />
          Análise Round a Round
        </button>

        <button
          type="button"
          className={`tab-btn ${
            activeTab === 'simulation' ? 'active' : ''
          }`}
          onClick={() => setActiveTab('simulation')}
        >
          <FileText size={16} />
          Análise Pós-Partida
        </button>

        <button
          type="button"
          className={`tab-btn ${
            activeTab === 'offlineSimulator' ? 'active' : ''
          }`}
          onClick={() => setActiveTab('offlineSimulator')}
        >
          <FlaskConical size={16} />
          Simulador Offline
        </button>
      </div>

      {/* ABA 1: VISÃO GERAL */}
      {activeTab === 'overview' && (
        <>
          <div className="kpis-grid">
            <KpiCard
              title="Win Rate (Full Buy)"
              value={`${metrics.fullBuyWinRate}%`}
              icon={<TrendingUp />}
            />

            <KpiCard
              title="Win Rate (Force Buy)"
              value={`${metrics.forceBuyWinRate}%`}
              icon={<ShieldAlert />}
            />

            <KpiCard
              title="Win Rate (Eco)"
              value={`${metrics.ecoWinRate}%`}
              icon={<DollarSign />}
            />

            <KpiCard
              title="Gasto Médio / Round"
              value={`$${metrics.avgSpent.toLocaleString()}`}
              icon={<DollarSign />}
            />
          </div>

          <div className="dashboard-container">
            {loading ? (
              <div style={{ color: 'white', padding: '20px' }}>
                Carregando dados financeiros do time {selectedTeam}...
              </div>
            ) : rounds.length === 0 ? (
              <div style={{ color: 'white', padding: '20px' }}>
                Não foi possível carregar os dados. Verifique se o
                backend está em execução.
              </div>
            ) : (
              <EconomyChart data={rounds} />
            )}
          </div>
        </>
      )}

      {/* ABA 2: ANÁLISE ROUND A ROUND */}
      {activeTab === 'roundByRound' && (
        <>
          {loading ? (
            <div style={{ color: 'white', padding: '20px' }}>
              Carregando rounds reais do JSON...
            </div>
          ) : rounds.length === 0 ? (
            <div style={{ color: 'white', padding: '20px' }}>
              Nenhum round foi carregado. Verifique se o backend está
              em execução.
            </div>
          ) : (
            <>
              <RoundSelector
                totalRounds={rounds.length}
                currentRound={selectedRound}
                onSelectRound={setSelectedRound}
              />

              {currentRound ? (
                <RoundDetailView
                  round={currentRound}
                  selectedTeam={selectedTeam}
                />
              ) : (
                <div style={{ color: 'white', padding: '20px' }}>
                  Não há dados para o round selecionado.
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ABA 3: ANÁLISE PÓS-PARTIDA */}
      {activeTab === 'simulation' && <SimulationView />}

      {/* ABA 4: SOMENTE O CHAT DA IA */}
      {activeTab === 'offlineSimulator' && <SimulatorChat />}
    </div>
  );
};

export default App;
