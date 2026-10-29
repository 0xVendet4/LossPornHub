# LossPornHub

Loss porn cripto para EVM e Solana. Você cola a carteira e o site lê seus swaps:

- **Deixou na mesa:** quanto o que você vendeu valeria hoje, menos o que você recebeu na venda. É o "quanto eu teria se não tivesse vendido".
- **Prejuízo realizado:** nos tokens que você comprou e vendeu, quanto pagou a mais do que recebeu (custo médio).

Para postar no feed, a carteira assina uma mensagem (sem gas). O servidor recalcula os números a partir da blockchain, então ninguém consegue inventar valor.

## Rodar (Windows, cmd)

```
cd %USERPROFILE%\Downloads\losspornhub
copy .env.example .env.local
notepad .env.local            &REM cole HELIUS_API_KEY e ETHERSCAN_API_KEY
npm install
npm run seed                  &REM opcional: posts de exemplo no feed
npm run dev                   &REM http://localhost:3000
```

Sem a chave dá para ver a tela com "ver um exemplo" em /scan, mas não dá para ler carteiras de verdade.

## Chaves grátis (Helius e Etherscan)

Nenhuma pede cartão. Dá para preencher só uma, se for ler só uma das redes.

1. **Solana:** conta em https://dashboard.helius.dev (plano Free, 1 milhão de créditos por mês). Copie a API key
2. **EVM:** conta em https://etherscan.io/apidashboard (plano Free, 100 mil chamadas por dia). Uma chave vale para Ethereum, Base, Arbitrum, Optimism, Polygon e BNB
3. Em `.env.local`: `HELIUS_API_KEY=...` e `ETHERSCAN_API_KEY=...`
4. Reinicie o `npm run dev`

Um raio-x EVM faz até 7 chamadas por rede na Etherscan (limite de 3 por segundo no plano grátis, então leva uns segundos). O resultado fica em cache por 15 minutos.

## Subir na Vercel

O disco da Vercel não guarda arquivo, então lá os posts vão para um Postgres (Neon, plano grátis). No PC continua tudo em `data/losses.json`.

1. Suba o código para um repositório no GitHub
2. Em https://vercel.com/new importe o repositório (Framework: Next.js, sem mudar nada) e clique em Deploy
3. No projeto: **Storage → Create Database → Neon** (plano Free). Isso cria a `DATABASE_URL` sozinho
4. **Settings → Environment Variables:** `HELIUS_API_KEY` e `ETHERSCAN_API_KEY` (e, se tiver, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`)
5. **Deployments → Redeploy** para o site subir já com as variáveis

As tabelas são criadas sozinhas no primeiro acesso. Para colocar os posts de exemplo no banco, no PC: `set DATABASE_URL=<valor copiado da Vercel>` e `npm run seed`.

## Como funciona

- `lib/scan/helius.ts` lê o histórico de swaps da carteira Solana (já interpretado pela Helius, até 500 mais recentes)
- `lib/scan/etherscan.ts` lê transferências de token, ETH enviado e ETH recebido nas 6 redes EVM e junta por transação
- `lib/scan/legs.ts` transforma cada transação em "o que saiu" e "o que entrou". O lado em stable ou SOL/ETH/BNB/POL dá o valor em dólar; o outro lado é o token
- `lib/scan/history.ts` pega o preço do dia de SOL/ETH/BNB/POL na Binance (sem chave; CryptoCompare se a Binance falhar)
- `lib/scan/prices.ts` pega o preço atual na DexScreener (grátis, sem chave), usando o par de maior liquidez
- `lib/scan/report.ts` agrupa por token e calcula "deixou na mesa" e "prejuízo realizado". Stablecoins ficam de fora
- `lib/scan/draft.ts` monta o post; o mesmo código faz a prévia no navegador e o valor final no servidor
- `app/api/losses` confere a assinatura (viem / tweetnacl), refaz o raio-x e salva
- `lib/store.ts` escolhe onde guardar: `lib/store-pg.ts` (Postgres, quando existe `DATABASE_URL`) ou `lib/store-file.ts` (`data/losses.json`)

## Limitações conhecidas

- Só entra swap em DEX com stable ou SOL/ETH/BNB/POL de um lado. Swap token por token fica de fora (aparece como "sem preço"). Venda em corretora (Binance etc.) não aparece
- O valor em dólar de uma venda por SOL/ETH usa o fechamento do dia, não o preço do minuto
- Token sem par na DexScreener (geralmente morto) fica sem preço e fora da conta
- O custo médio considera só as compras que aparecem no histórico lido
