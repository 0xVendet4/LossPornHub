export class ScanError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code = "scan_failed"
  ) {
    super(message);
  }
}

/** Na Vercel as chaves ficam nas variáveis de ambiente do projeto; no PC, no .env.local. */
export const onVercel = Boolean(process.env.VERCEL);
export const ENV_WHERE = onVercel ? "the Vercel environment variables" : ".env.local";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Timeout de uma chamada que respeita o prazo do raio-x: perto do fim, espera menos.
 * A função da Vercel morre em 60 s e devolve erro sem corpo; melhor cortar antes e mostrar o que deu para ler.
 */
export const until = (deadline: number, max = 20_000) => AbortSignal.timeout(Math.max(2_000, Math.min(max, deadline + 8_000 - Date.now())));
