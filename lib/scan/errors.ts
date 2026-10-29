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
