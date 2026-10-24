import React, { useEffect, useState } from 'react';
import {
  AlertCircle, ArrowUpRight, BrainCircuit, CheckCircle2, ChevronDown,
  Database, RefreshCw, ShieldAlert, Sparkles, Target, Trophy, TrendingUp
} from 'lucide-react';

const API_BASE_URL = 'http://127.0.0.1:8000';

interface TreeStatus {
  model_ready: boolean;
  explanation_tree_ready?: boolean;
  champion_model_ready?: boolean;
  report_ready: boolean;
  rules_ready: boolean;
  model_type?: string;
  target: string;
  note: string;
}

interface MetricSet {
  accuracy?: number;
  balanced_accuracy?: number;
  brier_score?: number;
  majority_class_baseline_accuracy?: number;
}

interface FeatureImportance {
  feature: string;
  importance: number;
}

interface RulePattern {
  kind: string;
  summary: string;
  conditions: string[];
  support: number;
  wins: number;
  losses: number;
  win_rate: number;
  confidence_label: string;
}

interface ModelComparison {
  name: string;
  selected: boolean;
  validation_metrics: MetricSet;
}

interface DecisionTreeReport {
  model?: string;
  purpose?: string;
  data_quality?: {
    valid_completed_matches?: number;
    invalid_json_files?: number;
    invalid_schema_files?: number;
  };
  preparation?: {
    matches_used?: number;
    rounds_used?: number;
    team_perspective_examples?: number;
  };
  split?: {
    train_matches?: number;
    validation_matches?: number;
    test_matches?: number;
  };
  metrics?: MetricSet;
  decision_tree_metrics?: MetricSet;
  selected_model?: {
    name?: string;
    validation_metrics?: MetricSet;
    test_metrics?: MetricSet;
    selection_rule?: string;
  };
  model_comparison?: ModelComparison[];
  feature_importances?: FeatureImportance[];
  tree_feature_importances?: FeatureImportance[];
  rule_patterns?: {
    win_patterns?: RulePattern[];
    loss_patterns?: RulePattern[];
  };
  tree_rules?: string;
  caveats?: string[];
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `Falha ao consultar ${path} (HTTP ${response.status}).`);
  return body as T;
}

function pct(value?: number | null): string {
  return value === undefined || value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}
function num(value?: number | null): string {
  return value === undefined || value === null ? '—' : value.toLocaleString('pt-BR');
}
function labelFeature(feature: string): string {
  const labels: Record<string, string> = {
    loadout_ratio: 'Vantagem relativa de equipamento',
    score_diff_before: 'Diferença no placar',
    team_loadout_value: 'Valor do equipamento da equipe',
    opponent_loadout_value: 'Valor do equipamento adversário',
    loadout_diff: 'Diferença no valor de equipamento',
    team_score_before: 'Placar anterior da equipe',
    opponent_score_before: 'Placar anterior do adversário',
    round_number: 'Número do round',
    team_loadout_per_player: 'Equipamento médio por jogador',
    opponent_loadout_per_player: 'Equipamento médio adversário',
    team_recent_winrate_last5: 'Desempenho nos últimos 5 rounds',
  };
  if (feature.startsWith('map_')) return `Mapa: ${feature.slice(4)}`;
  return labels[feature] || feature.replace(/_/g, ' ');
}

export const SimulationView: React.FC = () => {
  const [status, setStatus] = useState<TreeStatus | null>(null);
  const [report, setReport] = useState<DecisionTreeReport | null>(null);
  const [rules, setRules] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      getJson<TreeStatus>('/api/decision-tree/status'),
      getJson<DecisionTreeReport>('/api/decision-tree/report'),
      getJson<{ rules: string }>('/api/decision-tree/rules'),
    ]).then(([s, r, ruleData]) => {
      if (!active) return;
      setStatus(s);
      setReport(r);
      setRules(r.tree_rules || ruleData.rules || '');
    }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : 'Não foi possível carregar os resultados.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refreshKey]);

  const selected = report?.selected_model;
  const metrics = selected?.test_metrics || report?.metrics;
  const baseline = metrics?.majority_class_baseline_accuracy ?? 0.5;
  const accuracy = metrics?.accuracy;
  const uplift = accuracy === undefined ? null : (accuracy - baseline) * 100;
  const features = (report?.feature_importances || []).slice(0, 4);
  const bestFeature = features[0];
  const winPatterns = report?.rule_patterns?.win_patterns || [];
  const lossPatterns = report?.rule_patterns?.loss_patterns || [];
  const comparison = report?.model_comparison || [];

  return (
    <main className="ai-insights-page">
      <header className="ai-page-header">
        <div className="ai-heading-copy">
          <div className="ai-eyebrow"><Sparkles size={14} /> VALORANT INTELLIGENCE · PÓS-PARTIDA</div>
          <h2>O que os dados mostram?</h2>
          <p>IA treinada com os JSONs do desafio. Sem coleta externa e sem análise em tempo real.</p>
        </div>
        <button className="ai-refresh" onClick={() => setRefreshKey((v) => v + 1)} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'ai-spinning' : ''} /> Atualizar
        </button>
      </header>

      {loading && <section className="ai-panel ai-loading">Carregando a análise dos históricos...</section>}
      {error && (
        <section className="ai-error" role="alert">
          <AlertCircle size={20} />
          <div><strong>Não consegui carregar a análise.</strong><p>{error}</p><span>Confira se o FastAPI está rodando em 127.0.0.1:8000.</span></div>
        </section>
      )}

      {!loading && !error && status && report && (
        <>
          <section className="ai-hero-insight">
            <div className="ai-hero-topline">
              <span className="ai-live-dot" />
              <span>PRINCIPAL DESCOBERTA</span>
              <span className="ai-hero-model"><BrainCircuit size={14} /> {selected?.name || status.model_type || 'Modelo de ML'}</span>
            </div>
            <div className="ai-hero-body">
              <div className="ai-hero-copy">
                <h3>{bestFeature ? labelFeature(bestFeature.feature) : 'Padrões de vitória e derrota'}</h3>
                <p>
                  {bestFeature
                    ? `É o fator mais utilizado pelo modelo atual (${(bestFeature.importance * 100).toFixed(1)}% da importância das variáveis). A árvore explicável ajuda a entender em quais condições esse sinal aparece.`
                    : 'A análise está pronta, mas o relatório não contém importâncias de variáveis.'}
                </p>
                <small>Importância estatística não prova causa e efeito.</small>
              </div>
              <div className="ai-hero-stat">
                <strong>{bestFeature ? `${(bestFeature.importance * 100).toFixed(1)}%` : '—'}</strong>
                <span>importância relativa</span>
              </div>
            </div>
          </section>

          <section className="ai-kpis">
            <article className="ai-kpi">
              <span><Database size={15} /> Partidas válidas</span>
              <strong>{num(report.data_quality?.valid_completed_matches ?? report.preparation?.matches_used)}</strong>
              <small>JSONs processados</small>
            </article>
            <article className="ai-kpi">
              <span><Target size={15} /> Rounds históricos</span>
              <strong>{num(report.preparation?.rounds_used)}</strong>
              <small>Dados usados no treino e teste</small>
            </article>
            <article className="ai-kpi ai-kpi-accent">
              <span><Trophy size={15} /> Resultado no teste</span>
              <strong>{pct(accuracy)}</strong>
              <small>{uplift === null ? 'Acurácia do modelo' : `${uplift >= 0 ? '+' : ''}${uplift.toFixed(1)} p.p. sobre a referência`}</small>
            </article>
            <article className="ai-kpi">
              <span><ShieldAlert size={15} /> Confiabilidade</span>
              <strong>{accuracy !== undefined && uplift !== null && uplift >= 5 ? 'Promissor' : 'Em validação'}</strong>
              <small>Teste em partidas não usadas no treino</small>
            </article>
          </section>

          <section className="ai-two-column">
            <article className="ai-panel">
              <div className="ai-section-title">
                <div><TrendingUp size={18} /><h3>Modelos comparados</h3></div>
                <span className="ai-section-tag">Validação cronológica</span>
              </div>
              <p className="ai-muted">A escolha foi feita numa validação separada. As partidas mais recentes ficaram reservadas para o teste final.</p>
              <div className="ai-model-list">
                {comparison.map((model) => (
                  <div className={`ai-model-row ${model.selected ? 'selected' : ''}`} key={model.name}>
                    <div className="ai-model-name">
                      <span>{model.selected ? <CheckCircle2 size={16} /> : <BrainCircuit size={16} />}</span>
                      <div><strong>{model.name}</strong>{model.selected && <small>Modelo escolhido na validação</small>}</div>
                    </div>
                    <div className="ai-model-score">
                      <strong>{pct(model.validation_metrics.balanced_accuracy)}</strong>
                      <small>acurácia balanceada</small>
                    </div>
                  </div>
                ))}
                {comparison.length === 0 && <p className="ai-muted">Este relatório foi gerado por uma versão anterior. Execute novamente a análise para comparar modelos.</p>}
              </div>
              <div className="ai-test-note">
                <ArrowUpRight size={16} />
                <span>Teste final: {num(report.split?.test_matches)} partidas · referência simples: {pct(baseline)}</span>
              </div>
            </article>

            <article className="ai-panel">
              <div className="ai-section-title">
                <div><BrainCircuit size={18} /><h3>O que o modelo usa</h3></div>
              </div>
              <p className="ai-muted">Fatores mais importantes no modelo selecionado.</p>
              <div className="ai-feature-list">
                {features.map((feature) => (
                  <div className="ai-feature" key={feature.feature}>
                    <div className="ai-feature-label"><span>{labelFeature(feature.feature)}</span><strong>{(feature.importance * 100).toFixed(1)}%</strong></div>
                    <div className="ai-feature-track"><div style={{ width: `${Math.max(0, Math.min(100, feature.importance * 100))}%` }} /></div>
                  </div>
                ))}
              </div>
              <p className="ai-muted ai-small-note">Esses percentuais descrevem o uso interno do modelo, não o percentual de vitórias causado por cada fator.</p>
            </article>
          </section>

          <section className="ai-panel ai-pattern-panel">
            <div className="ai-section-title">
              <div><Sparkles size={18} /><h3>Padrões encontrados pela árvore explicável</h3></div>
              <span className="ai-section-tag">Históricos concluídos</span>
            </div>
            <p className="ai-muted">Cada padrão vem de um grupo de exemplos que terminou em vitória ou derrota nos dados de treino da árvore. Não é uma regra garantida para outros jogos.</p>
            <div className="ai-pattern-grid">
              <div className="ai-pattern-group ai-pattern-loss">
                <h4><span /> Associados a mais derrotas</h4>
                {lossPatterns.slice(0, 3).map((pattern, index) => (
                  <div className="ai-pattern-card" key={`loss-${index}`}>
                    <div className="ai-pattern-heading"><strong>{pct(1 - pattern.win_rate)} de derrotas</strong><span>{num(pattern.support)} exemplos</span></div>
                    <p>{pattern.summary}</p>
                  </div>
                ))}
                {lossPatterns.length === 0 && <p className="ai-muted">Não há padrões fortes de derrota no relatório atual.</p>}
              </div>
              <div className="ai-pattern-group ai-pattern-win">
                <h4><span /> Associados a mais vitórias</h4>
                {winPatterns.slice(0, 3).map((pattern, index) => (
                  <div className="ai-pattern-card" key={`win-${index}`}>
                    <div className="ai-pattern-heading"><strong>{pct(pattern.win_rate)} de vitórias</strong><span>{num(pattern.support)} exemplos</span></div>
                    <p>{pattern.summary}</p>
                  </div>
                ))}
                {winPatterns.length === 0 && <p className="ai-muted">Não há padrões fortes de vitória no relatório atual.</p>}
              </div>
            </div>
          </section>

          <details className="ai-details">
            <summary>Ver regras técnicas completas da árvore <ChevronDown size={16} /></summary>
            <pre>{rules || 'Nenhuma regra encontrada.'}</pre>
          </details>

          <footer className="ai-footer">
            <ShieldAlert size={15} />
            <span>Fonte: somente JSONs locais da organização. Análise pós-partida; resultados históricos não garantem desempenho futuro. {report.data_quality?.invalid_json_files ?? 0} JSONs inválidos identificados.</span>
          </footer>
        </>
      )}
    </main>
  );
};
