export class ScanError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code = "scan_failed"
  ) {
    super(message);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
