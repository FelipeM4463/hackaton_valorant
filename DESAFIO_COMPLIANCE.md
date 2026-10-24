# Regras do desafio — implementação atual

- **Fonte dos dados:** arquivos JSON locais disponibilizados para o desafio.
- **Sem coleta externa:** a solução não usa scraping nem busca dados adicionais em sites, plataformas ou serviços.
- **Sem API externa de VALORANT:** a análise funciona com os arquivos locais e endpoints locais do FastAPI.
- **Pós-partida:** os modelos comparam padrões históricos; o dashboard expõe métricas e regras interpretáveis. O endpoint de previsão de round foi removido.
- **Simulador offline:** permite comparar cenários hipotéticos preenchidos manualmente usando o modelo histórico. Não lê estado de jogo, não se conecta ao cliente e não fornece orientação para partidas em andamento. As probabilidades são estimativas para um round hipotético.
- **Dados da aba round a round:** o detalhe exibido agora vem dos resultados retornados pelo JSON local; a geração aleatória de jogadores e estatísticas foi removida.
- **Licenças:** antes da entrega final, confira as licenças das dependências listadas em `backend/requirements.txt` e `package.json` e mantenha os avisos de terceiros exigidos por cada licença.

## Limites conhecidos

A API atual do dashboard mostra o resumo round a round de um arquivo JSON local específico. A árvore de decisão treina sobre o conjunto JSON local completo incluído na pasta `backend/data`. A acurácia apresentada é uma métrica de validação histórica, não uma probabilidade de vitória futura.

- **Limites do simulador:** as entradas de cenário são fornecidas manualmente; o modelo estima resultado de round, não o resultado final da partida. Os valores de equipamento são `loadoutValue` dos JSONs e não devem ser interpretados como créditos disponíveis.
