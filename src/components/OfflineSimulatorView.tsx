import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Coins,
  Info,
  LoaderCircle,
  MapPinned,
  Play,
  RotateCcw,
  ShieldAlert,
  Target,
  Trophy,
} from 'lucide-react';
import '../styles/OfflineSimulator.css';
import { SimulatorChat } from './SimulatorChat';

const API_BASE_URL = 'http://127.0.0.1:8000';

interface MetricSet {
  accuracy?: number;
  balanced_accuracy?: number;
  brier_score?: number;
}

interface SimulatorOptions {
  model_ready: boolean;
  model_name: string;
  maps: string[];
  target: string;
  metrics: MetricSet;
  data_source: string;
  mode: string;
}

interface ScenarioInput {
  label: string;
  team_loadout_value: number;
}

interface SimulationScenarioResult {
  label: string;
  team_loadout_value: number;
  opponent_loadout_value: number;
  estimated_round_win_probability: number;
  estimated_round_loss_probability: number;
  difference_vs_first_scenario_percentage_points: number;
}

interface SimulationResponse {
  ok: boolean;
  model_name: string;
  target_explanation: string;
  context: {
    map: string;
    round_number: number;
    score_before: string;
    team_recent_winrate_last5_percent: number;
  };
  scenarios: SimulationScenarioResult[];
  highest_estimated_probability_scenario: string;
  warnings: string[];
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body === 'object' && body !== null && 'detail' in body
      ? String((body as { detail: unknown }).detail)
      : `Erro HTTP ${response.status}`;
    throw new Error(detail);
  }
  return body as T;
}

const initialScenarios: ScenarioInput[] = [
  { label: 'Cenário econômico', team_loadout_value: 12000 },
  { label: 'Cenário intermediário', team_loadout_value: 18000 },
  { label: 'Cenário de maior investimento', team_loadout_value: 23000 },
];

const formatCredits = (value: number): string =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;

export const OfflineSimulatorView: React.FC = () => {
  const [options, setOptions] = useState<SimulatorOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [mapName, setMapName] = useState('');
  const [roundNumber, setRoundNumber] = useState(1);
  const [teamScore, setTeamScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [recentWins, setRecentWins] = useState(2);
  const [opponentLoadoutValue, setOpponentLoadoutValue] = useState(21000);
  const [scenarios, setScenarios] = useState<ScenarioInput[]>(initialScenarios);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let active = true;
    setOptionsLoading(true);
    fetch(`${API_BASE_URL}/api/offline-simulator/options`)
      .then((response) => readJson<SimulatorOptions>(response))
      .then((data) => {
        if (!active) return;
        setOptions(data);
        setMapName((current) => current || data.maps[0] || 'Ascent');
        setOptionsError('');
      })
      .catch((error: unknown) => {
        if (active) {
          setOptionsError(error instanceof Error ? error.message : 'Não foi possível carregar o modelo.');
        }
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const updateScenario = (index: number, patch: Partial<ScenarioInput>) => {
    setScenarios((current) => current.map((scenario, currentIndex) =>
      currentIndex === index ? { ...scenario, ...patch } : scenario,
    ));
  };

  const resetForm = () => {
    setRoundNumber(1);
    setTeamScore(0);
    setOpponentScore(0);
    setRecentWins(2);
    setOpponentLoadoutValue(21000);
    setScenarios(initialScenarios.map((scenario) => ({ ...scenario })));
    setResult(null);
    setSubmitError('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError('');
    setResult(null);

    if (!mapName) {
      setSubmitError('Selecione um mapa disponível nos dados históricos.');
      return;
    }
    if (scenarios.length < 1 || scenarios.some((scenario) => !scenario.label.trim())) {
      setSubmitError('Preencha o nome de todos os cenários.');
      return;
    }
    if (new Set(scenarios.map((scenario) => scenario.label.trim().toLocaleLowerCase())).size !== scenarios.length) {
      setSubmitError('Use um nome diferente para cada cenário.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/offline-simulator/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map: mapName,
          round_number: roundNumber,
          team_score_before: teamScore,
          opponent_score_before: opponentScore,
          team_recent_winrate_last5: recentWins / 5,
          opponent_loadout_value: opponentLoadoutValue,
          scenarios,
        }),
      });
      const data = await readJson<SimulationResponse>(response);
      setResult(data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível simular os cenários.');
    } finally {
      setSubmitting(false);
    }
  };

  const bestScenario = result?.scenarios.reduce<SimulationScenarioResult | null>((best, scenario) =>
    !best || scenario.estimated_round_win_probability > best.estimated_round_win_probability ? scenario : best,
  null);

  const chatSimulationResult = result &&
    result.context.map === mapName &&
    result.context.round_number === roundNumber &&
    result.context.score_before === `${teamScore}–${opponentScore}` &&
    result.context.team_recent_winrate_last5_percent === recentWins * 20 &&
    result.scenarios.length === scenarios.length &&
    result.scenarios.every((scenario, index) =>
      scenario.label === scenarios[index]?.label &&
      scenario.team_loadout_value === scenarios[index]?.team_loadout_value &&
      scenario.opponent_loadout_value === opponentLoadoutValue
    )
      ? {
          model_name: result.model_name,
          scenarios: result.scenarios,
          highest_estimated_probability_scenario: result.highest_estimated_probability_scenario,
        }
      : null;

  return (
    <main className="offline-simulator-page">
      <header className="offline-simulator-header">
        <div>
          <div className="offline-eyebrow"><BrainCircuit size={15} /> LABORATÓRIO DE CENÁRIOS · OFFLINE</div>
          <h2>Simulador econômico de VALORANT</h2>
          <p>Altere as condições hipotéticas e compare as estimativas do modelo treinado com os JSONs históricos.</p>
        </div>
        <div className="offline-mode-pill"><CheckCircle2 size={14} /> Sem conexão com o jogo</div>
      </header>

      {optionsLoading && (
        <section className="offline-message"><LoaderCircle size={18} className="offline-spin" /> Carregando modelo e mapas históricos...</section>
      )}
      {optionsError && (
        <section className="offline-message offline-message-error" role="alert">
          <AlertCircle size={18} />
          <div><strong>Não foi possível carregar o simulador.</strong><p>{optionsError}</p><small>Confirme se o backend está rodando em http://127.0.0.1:8000.</small></div>
        </section>
      )}

      {!optionsLoading && !optionsError && options && (
        <>
          <section className="offline-model-status">
            <div className="offline-status-icon"><BrainCircuit size={20} /></div>
            <div className="offline-status-copy">
              <strong>{options.model_ready ? `Modelo disponível: ${options.model_name}` : 'Modelo não encontrado'}</strong>
              <span>{options.target}. O resultado é uma estimativa do round hipotético, não da partida inteira.</span>
            </div>
            <div className={`offline-status-tag ${options.model_ready ? 'ready' : 'not-ready'}`}>
              {options.model_ready ? 'Pronto' : 'Indisponível'}
            </div>
          </section>

          <form className="offline-form" onSubmit={handleSubmit}>
            <section className="offline-panel">
              <div className="offline-panel-title">
                <div><MapPinned size={18} /><h3>1. Contexto hipotético</h3></div>
                <span>Dados antes do round</span>
              </div>
              <div className="offline-context-grid">
                <label className="offline-field">
                  <span>Mapa</span>
                  <select value={mapName} onChange={(event) => setMapName(event.target.value)} required>
                    {options.maps.map((map) => <option key={map} value={map}>{map}</option>)}
                  </select>
                </label>
                <label className="offline-field">
                  <span>Número do round</span>
                  <input type="number" min={1} max={50} value={roundNumber} onChange={(event) => setRoundNumber(Number(event.target.value))} required />
                </label>
                <label className="offline-field">
                  <span>Placar da sua equipe</span>
                  <input type="number" min={0} max={50} value={teamScore} onChange={(event) => setTeamScore(Number(event.target.value))} required />
                </label>
                <label className="offline-field">
                  <span>Placar adversário</span>
                  <input type="number" min={0} max={50} value={opponentScore} onChange={(event) => setOpponentScore(Number(event.target.value))} required />
                </label>
                <label className="offline-field">
                  <span>Vitórias da equipe nos últimos 5 rounds</span>
                  <select value={recentWins} onChange={(event) => setRecentWins(Number(event.target.value))}>
                    {[0, 1, 2, 3, 4, 5].map((wins) => <option key={wins} value={wins}>{wins} de 5 ({wins * 20}%)</option>)}
                  </select>
                </label>
                <label className="offline-field">
                  <span>Valor do equipamento adversário</span>
                  <div className="offline-number-with-prefix"><span>CR</span><input type="number" min={0} max={100000} step={50} value={opponentLoadoutValue} onChange={(event) => setOpponentLoadoutValue(Number(event.target.value))} required /></div>
                </label>
              </div>
              <div className="offline-inline-note"><Info size={15} /><span>O valor de equipamento é a soma de <code>loadoutValue</code> registrada nos dados — não é o saldo de créditos disponível para gastar.</span></div>
            </section>

            <section className="offline-panel">
              <div className="offline-panel-title">
                <div><Coins size={18} /><h3>2. Compare três cenários econômicos</h3></div>
                <span>Todos são editáveis</span>
              </div>
              <p className="offline-panel-description">Mude o nome e o valor total de equipamento da sua equipe em cada hipótese. Os valores iniciais são exemplos próximos de faixas observadas nos históricos, não recomendações de compra.</p>
              <div className="offline-scenario-inputs">
                {scenarios.map((scenario, index) => (
                  <article className="offline-scenario-input-card" key={index}>
                    <div className="offline-scenario-number">0{index + 1}</div>
                    <label className="offline-field">
                      <span>Nome do cenário</span>
                      <input type="text" maxLength={60} value={scenario.label} onChange={(event) => updateScenario(index, { label: event.target.value })} required />
                    </label>
                    <label className="offline-field">
                      <span>Valor total do equipamento</span>
                      <div className="offline-number-with-prefix"><span>CR</span><input type="number" min={0} max={100000} step={50} value={scenario.team_loadout_value} onChange={(event) => updateScenario(index, { team_loadout_value: Number(event.target.value) })} required /></div>
                    </label>
                  </article>
                ))}
              </div>
              <div className="offline-form-actions">
                <button type="button" className="offline-reset-button" onClick={resetForm}><RotateCcw size={15} /> Restaurar exemplos</button>
                <button type="submit" className="offline-run-button" disabled={submitting || !options.model_ready}>
                  {submitting ? <LoaderCircle size={17} className="offline-spin" /> : <Play size={16} fill="currentColor" />}
                  {submitting ? 'Calculando cenários...' : 'Comparar cenários'}
                </button>
              </div>
            </section>
          </form>

          {submitError && (
            <section className="offline-message offline-message-error" role="alert"><AlertCircle size={18} /><span>{submitError}</span></section>
          )}

          {result && (
            <section className="offline-results" aria-live="polite">
              <div className="offline-results-header">
                <div>
                  <div className="offline-eyebrow"><Target size={15} /> RESULTADO DA SIMULAÇÃO</div>
                  <h3>Como os cenários se comparam?</h3>
                  <p>{result.context.map} · Round {result.context.round_number} · Placar {result.context.score_before} · {result.context.team_recent_winrate_last5_percent}% de vitórias nos últimos 5 rounds</p>
                </div>
                {bestScenario && <div className="offline-best-label"><Trophy size={16} /><span>Maior estimativa</span><strong>{bestScenario.label}</strong></div>}
              </div>
              <div className="offline-result-grid">
                {result.scenarios.map((scenario, index) => {
                  const isHighest = scenario.label === result.highest_estimated_probability_scenario;
                  const delta = scenario.difference_vs_first_scenario_percentage_points;
                  return (
                    <article className={`offline-result-card ${isHighest ? 'highest' : ''}`} key={`${scenario.label}-${index}`}>
                      <div className="offline-result-card-top"><span>{scenario.label}</span>{isHighest && <span className="offline-highest-pill">Maior estimativa</span>}</div>
                      <strong className="offline-probability">{formatPercent(scenario.estimated_round_win_probability)}</strong>
                      <span className="offline-probability-caption">chance estimada de vencer este round</span>
                      <div className="offline-probability-track"><div style={{ width: `${Math.max(0, Math.min(100, scenario.estimated_round_win_probability * 100))}%` }} /></div>
                      <div className="offline-result-meta"><span>Derrota estimada</span><strong>{formatPercent(scenario.estimated_round_loss_probability)}</strong></div>
                      <div className="offline-result-meta"><span>Equipamento da equipe</span><strong>CR {formatCredits(scenario.team_loadout_value)}</strong></div>
                      <div className={`offline-delta ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'}`}>
                        {delta > 0 ? <ArrowUpRight size={15} /> : delta < 0 ? <ArrowDownRight size={15} /> : <Info size={14} />}
                        {delta > 0 ? '+' : ''}{delta.toFixed(2).replace('.', ',')} p.p. em relação ao primeiro cenário
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="offline-interpretation">
                <div className="offline-interpretation-icon"><BrainCircuit size={19} /></div>
                <div>
                  <strong>Como interpretar</strong>
                  <p>O modelo estima a chance de vencer um round com base em padrões dos JSONs históricos. A diferença entre cenários não prova que o valor investido causaria esse resultado, e a probabilidade não representa a vitória na partida inteira.</p>
                </div>
              </div>
              {result.warnings.length > 0 && (
                <div className="offline-warnings"><strong><ShieldAlert size={15} /> Limitações da simulação</strong><ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>
              )}
            </section>
          )}

          <SimulatorChat
            context={{
              mapName,
              roundNumber,
              teamScore,
              opponentScore,
              recentWins,
              opponentLoadoutValue,
              scenarios,
              modelName: options.model_name,
              simulationResult: chatSimulationResult,
            }}
          />

          <footer className="offline-data-footer"><Info size={14} /><span>Fonte exclusiva: JSONs locais fornecidos para o desafio. Modelo: {options.model_name}. A acurácia histórica ({options.metrics.accuracy === undefined ? 'não informada' : formatPercent(options.metrics.accuracy)}) não é a probabilidade deste cenário.</span></footer>
        </>
      )}
    </main>
  );
};
