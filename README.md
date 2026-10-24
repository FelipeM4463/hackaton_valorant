# VALO ECONOMIX

### Transformando dados de VALORANT em decisões mais inteligentes.

O **VALO ECONOMIX** é uma plataforma de análise de partidas de VALORANT que transforma históricos de jogos em informações visuais e estatísticas sobre economia, desempenho e resultados.

A solução combina um dashboard interativo, análise histórica, modelos de aprendizado de máquina, simulação offline e inteligência artificial local para tornar os dados de partidas mais acessíveis e compreensíveis.

## 🎯 O problema

Em VALORANT, investir mais créditos em equipamentos não garante a vitória de um round. Compreender a relação entre economia, equipamentos e resultados pode ajudar a identificar padrões relevantes nos históricos de partidas.

## 💡 Nossa solução

O VALO ECONOMIX reúne ferramentas de visualização e análise para explorar dados históricos, investigar padrões e comparar cenários econômicos hipotéticos.

### Principais funcionalidades

- **Dashboard de economia:** visualização dos dados por round e equipe.
- **Análise histórica:** processamento de arquivos JSON locais para identificar tendências e associações estatísticas.
- **Árvore de decisão:** exploração de padrões históricos por meio de regras interpretáveis.
- **Modelos de aprendizado de máquina:** análise e avaliação de modelos estatísticos nos dados disponíveis.
- **Simulador offline:** comparação de cenários econômicos hipotéticos e estimativa de vitória de um round.
- **Chat com IA:** consultas em linguagem natural sobre os dados e históricos disponíveis.
- **Inteligência artificial local:** integração com Ollama e o modelo Qwen2.5:3b.

## 🧰 Tecnologias utilizadas

| Camada | Tecnologias |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Interface e gráficos | Recharts, Lucide React, CSS |
| Backend | Python, FastAPI, Uvicorn |
| Análise de dados | pandas, scikit-learn, joblib |
| Inteligência artificial | Ollama, Qwen2.5:3b |
| Dados | Arquivos JSON locais de partidas |
| Versionamento | Git e GitHub |

## 🏗️ Arquitetura

```text
┌────────────────────────────────┐
│       FRONTEND                 │
│   React + TypeScript + Vite    │
│          Porta 5173            │
└───────────────┬────────────────┘
                │ HTTP / REST
                ▼
┌────────────────────────────────┐
│          BACKEND               │
│       Python + FastAPI         │
│          Porta 8000            │
│                                │
│  Estatísticas e análise        │
│  Árvore de decisão             │
│  Simulação offline             │
│  API do chat                   │
└────────┬──────────────┬────────┘
         │              │
         ▼              ▼
┌────────────────┐ ┌─────────────────┐
│ JSONs locais   │ │ Ollama          │
│ das partidas   │ │ Qwen2.5:3b      │
└────────────────┘ │ Porta 11434     │
                   └─────────────────┘
```

## ⚙️ Requisitos

- Windows 10 ou 11.
- Node.js e npm.
- Python 3.12.
- Ollama instalado.
- Modelo `qwen2.5:3b` disponível no Ollama.
- Arquivos históricos JSON na pasta `backend/data`.

**O projeto pode ser executado localmente sem Docker.**

## 🚀 Como executar no Windows

### 1. Preparar a inteligência artificial

Instale o Ollama:

https://ollama.com/download/windows

No PowerShell, execute:

```powershell
ollama pull qwen2.5:3b
ollama list
```

Confirme que o serviço do Ollama está em execução antes de utilizar o chat.

### 2. Instalar e iniciar o backend

Abra um terminal na raiz do projeto e execute:

```powershell
Set-Location .\backend

py -3.12 -m venv .venv

.\.venv\Scripts\python.exe -m pip install --upgrade pip

.\.venv\Scripts\python.exe -m pip install -r requirements.txt

.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Mantenha esse terminal aberto.

A documentação interativa da API estará disponível em:

http://127.0.0.1:8000/docs

### 3. Instalar e iniciar o frontend

Abra outro terminal na raiz do projeto:

```powershell
Set-Location "C:\Users\joaoj\Downloads\hackaton_valorant-simulador-offline-etapa2\hackaton_valorant-git"

npm ci

npm run dev -- --host 127.0.0.1
```

Acesse a aplicação:

http://127.0.0.1:5173/

### 4. Verificar a conexão com a IA

Com o Ollama e o backend em execução, abra outro PowerShell:

```powershell
Invoke-RestMethod `
    -Uri "http://127.0.0.1:8000/api/ai-chat/health" `
    -TimeoutSec 20 |
    ConvertTo-Json -Depth 5
```

A resposta deve informar a disponibilidade do Ollama, o modelo configurado e a quantidade de arquivos JSON encontrados.

## 🔌 Endpoints da API

| Método | Endpoint | Finalidade |
| --- | --- | --- |
| GET | `/api/match-data?team=Red` | Consultar dados da equipe |
| GET | `/api/decision-tree/status` | Verificar o estado da análise histórica |
| GET | `/api/decision-tree/report` | Consultar o relatório de avaliação |
| GET | `/api/decision-tree/rules` | Consultar regras interpretáveis |
| GET | `/api/ai-chat/health` | Verificar a integração com a IA |
| POST | `/api/ai-chat` | Enviar perguntas ao chat |
| GET | `/api/offline-simulator/options` | Consultar opções do simulador |
| POST | `/api/offline-simulator/simulate` | Simular um cenário hipotético |

Consulte `/docs` para conhecer os parâmetros de cada endpoint.

## 📊 Dados e metodologia

As análises utilizam arquivos JSON locais de partidas históricas. Os resultados dependem da qualidade, da quantidade e dos campos disponíveis nos dados.

As classificações econômicas, como Eco, Force Buy e Full Buy, são aproximações utilizadas pelo projeto, não regras oficiais do jogo.

As associações encontradas nos históricos não comprovam causalidade. Um equipamento de maior valor não garante a vitória de um round.

## ⚠️ Limitações

- O sistema não está conectado ao cliente do VALORANT.
- Não realiza análise de partidas ao vivo.
- O simulador utiliza cenários hipotéticos informados manualmente.
- A estimativa do simulador se refere à vitória de um round hipotético, não necessariamente da partida inteira.
- O valor do equipamento representa o investimento em loadout registrado nos dados, não o saldo de créditos disponíveis.
- A IA pode levar mais tempo para responder dependendo dos recursos do computador.
- As respostas do modelo devem ser interpretadas com senso crítico.

## 🛠️ Validação do projeto

Para verificar a compilação do frontend, na raiz:

```powershell
npm run build
```

Para verificar a sintaxe do backend, dentro da pasta `backend`:

```powershell
.\.venv\Scripts\python.exe -m compileall .
```

## 🌟 Objetivo

O VALO ECONOMIX busca aproximar análise de dados e tomada de decisão competitiva, transformando históricos de partidas em informações visuais, estatísticas e acessíveis.

**VALO ECONOMIX — entenda os números por trás de cada round.**
'@

$path = Join-Path (Get-Location) "README.md"

[System.IO.File]::WriteAllText(
    $path,
    $readme.TrimStart() + [Environment]::NewLine,
    (New-Object System.Text.UTF8Encoding($false))
)

git add README.md

Write-Host "`nREADME atualizado e preparado para o GitHub." -ForegroundColor Green

Write-Host "`n=== VALIDANDO O README ==="
git diff --cached --check
