import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  LoaderCircle,
  MessageCircle,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import '../styles/SimulatorChat.css';

const API_BASE_URL = 'http://127.0.0.1:8000';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatApiResponse {
  answer: string;
  detail?: string;
}

interface SimulatorChatProps {
  // Mantido para compatibilidade com componentes antigos que passam context.
  context?: unknown;
}

interface ChatHealth {
  ollama_reachable: boolean;
  model: string;
  model_available: boolean;
  json_files?: number;
}

const quickPrompts = [
  'Analise os padrões históricos de vitória e derrota por tipo de compra.',
  'Por que uma equipe pode perder mesmo tendo um loadout maior?',
  'O que os JSONs mostram sobre créditos restantes e gastos por round?',
  'Estamos perdendo por 4–8. Quais dados devo analisar antes do próximo round?',
];

function normalizeMarkdown(value: string): string {
  return value
    // Alguns modelos devolvem os símbolos Markdown escapados com barra invertida.
    .replace(/\\([*_#`-])/g, '$1')
    .replace(/\r\n/g, '\n')
    .trim();
}

function renderInlineMarkdown(value: string): React.ReactNode[] {
  const parts = value.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }

    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function renderMarkdown(content: string): React.ReactNode {
  const lines = normalizeMarkdown(content).split('\n');
  const elements: React.ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;

    elements.push(
      <p key={`paragraph-${elements.length}`}>
        {paragraphLines.map((line, index) => (
          <React.Fragment key={index}>
            {index > 0 && <br />}
            {renderInlineMarkdown(line)}
          </React.Fragment>
        ))}
      </p>,
    );

    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }

    const items = listItems;
    const currentType = listType;
    const key = `list-${elements.length}`;

    if (currentType === 'ul') {
      elements.push(
        <ul key={key}>
          {items.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
    } else {
      elements.push(
        <ol key={key}>
          {items.map((item, index) => (
            <li key={index}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>,
      );
    }

    listType = null;
    listItems = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      elements.push(
        <h4 key={`heading-${elements.length}`}>
          {renderInlineMarkdown(heading[1])}
        </h4>,
      );
      return;
    }

    const bullet = trimmed.match(/^[-•]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);

    if (bullet || numbered) {
      flushParagraph();

      const nextType: 'ul' | 'ol' = bullet ? 'ul' : 'ol';
      if (listType && listType !== nextType) flushList();

      listType = nextType;
      listItems.push((bullet ?? numbered)![1]);
      return;
    }

    flushList();
    paragraphLines.push(line);
  });

  flushParagraph();
  flushList();

  return <>{elements}</>;
}

async function readChatResponse(response: Response): Promise<ChatApiResponse> {
  const body: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      typeof body === 'object' && body !== null && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Erro HTTP ${response.status}`;

    throw new Error(detail);
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('answer' in body) ||
    typeof (body as { answer?: unknown }).answer !== 'string'
  ) {
    throw new Error('A API respondeu, mas não retornou uma resposta de texto.');
  }

  return body as ChatApiResponse;
}

export const SimulatorChat: React.FC<SimulatorChatProps> = (_props) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [health, setHealth] = useState<ChatHealth | null>(null);
  const [healthChecked, setHealthChecked] = useState(false);

  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    let active = true;

    fetch(`${API_BASE_URL}/api/ai-chat/health`)
      .then(async (response) => {
        if (!response.ok) throw new Error('A API de saúde não respondeu.');
        return (await response.json()) as ChatHealth;
      })
      .then((data) => {
        if (active) setHealth(data);
      })
      .catch(() => {
        if (active) setHealth(null);
      })
      .finally(() => {
        if (active) setHealthChecked(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages, loading]);

  const sendMessage = async (rawText: string = draft) => {
    const question = rawText.trim();
    if (!question || sendingRef.current) return;

    sendingRef.current = true;

    const history = messages.slice(-8).map(({ role, content }) => ({
      role,
      content,
    }));

    setMessages((current) => [
      ...current,
      { role: 'user', content: question },
    ]);
    setDraft('');
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history }),
      });

      const data = await readChatResponse(response);
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: data.answer.trim() },
      ]);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Não foi possível consultar a IA local.';

      setError(
        `${message} Confirme se o backend está rodando em http://127.0.0.1:8000 e se o Ollama está disponível.`,
      );
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  };

  const modelReady = Boolean(
    health?.ollama_reachable && health?.model_available,
  );

  return (
    <section
      className="sim-chat sim-chat-fullpage"
      aria-label="Chat VALO ECONOMIX AI"
    >
      <header className="sim-chat-header">
        <div className="sim-chat-heading">
          <div className="sim-chat-icon">
            <BrainCircuit size={22} aria-hidden="true" />
          </div>

          <div className="sim-chat-heading-copy">
            <div className="sim-chat-eyebrow">
              <Sparkles size={13} aria-hidden="true" />
              ANALISTA ECONÔMICO
            </div>
            <h3>VALO ECONOMIX AI</h3>
            <p>
              Converse sobre economia, rounds e desempenho usando os dados
              históricos do projeto.
            </p>
          </div>
        </div>

        <div
          className={`sim-chat-local-badge ${
            healthChecked && !modelReady ? 'is-offline' : ''
          }`}
          role="status"
        >
          <span />
          {!healthChecked
            ? 'Verificando IA local'
            : modelReady
              ? `${health?.model ?? 'Qwen local'} disponível`
              : 'IA local indisponível'}
        </div>
      </header>

      <div
        className="sim-chat-thread"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.length === 0 ? (
          <div className="sim-chat-welcome">
            <div className="sim-chat-welcome-top">
              <div className="sim-chat-welcome-icon">
                <MessageCircle size={22} aria-hidden="true" />
              </div>

              <div className="sim-chat-welcome-copy">
                <span className="sim-chat-welcome-kicker">
                  SEU ANALISTA DE VALORANT
                </span>
                <h2>O que você quer analisar?</h2>
                <p>
                  Pergunte em linguagem natural sobre sua equipe, vitórias,
                  derrotas, compras, créditos e desempenho por round. A IA usa
                  os dados históricos locais e não lê uma partida ao vivo.
                  {health?.json_files != null
                    ? ` A base local encontrou ${health.json_files} arquivos JSON.`
                    : ''}
                </p>
              </div>
            </div>

            <div className="sim-chat-prompts" aria-label="Sugestões de perguntas">
              {quickPrompts.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  className="sim-chat-prompt"
                  onClick={() => void sendMessage(prompt)}
                  disabled={loading}
                >
                  <Sparkles size={15} aria-hidden="true" />
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <article
              className={`sim-chat-message ${message.role}`}
              key={`${message.role}-${index}`}
            >
              <div className="sim-chat-message-label">
                {message.role === 'user' ? 'VOCÊ' : 'VALO ECONOMIX AI'}
              </div>
              {message.role === 'assistant' ? (
                <div className="sim-chat-markdown">
                  {renderMarkdown(message.content)}
                </div>
              ) : (
                <p>{message.content}</p>
              )}
            </article>
          ))
        )}

        {loading && (
          <div className="sim-chat-thinking" role="status">
            <LoaderCircle
              size={17}
              className="sim-chat-spin"
              aria-hidden="true"
            />
            <span>A IA está analisando sua pergunta...</span>
          </div>
        )}

        <div ref={endOfMessagesRef} />
      </div>

      {error && (
        <div className="sim-chat-error" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form
        className="sim-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="Ex.: Estamos perdendo por 4–8 no round 13. Temos poucos créditos; o que os dados históricos sugerem?"
          aria-label="Mensagem para a IA"
          rows={2}
          maxLength={2000}
          disabled={loading}
        />

        <button
          type="submit"
          className="sim-chat-send"
          disabled={loading || !draft.trim()}
        >
          {loading ? (
            <LoaderCircle
              size={18}
              className="sim-chat-spin"
              aria-hidden="true"
            />
          ) : (
            <Send size={18} aria-hidden="true" />
          )}
          <span>{loading ? 'Analisando' : 'Enviar'}</span>
        </button>
      </form>

      <footer className="sim-chat-footer">
        <span>Enter cria uma nova linha · Ctrl+Enter envia · Dados históricos</span>
        <button
          type="button"
          className="sim-chat-clear"
          onClick={() => {
            setMessages([]);
            setDraft('');
            setError('');
          }}
          disabled={loading || messages.length === 0}
        >
          <Trash2 size={14} aria-hidden="true" />
          Limpar conversa
        </button>
      </footer>
    </section>
  );
};

export default SimulatorChat;
