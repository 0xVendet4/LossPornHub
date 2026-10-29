import { money } from "./format";
import type { PublicLoss } from "./types";

/** Frase do post, usada no título da página dele e no compartilhamento. */
export function headline(loss: PublicLoss) {
  const sym = `$${loss.token.toUpperCase()}`;
  if (loss.kind === "realized") return `Lost ${money(loss.amountUsd)} on ${sym}`;
  if (loss.kind === "wallet") return `Left ${money(loss.amountUsd)} on the table across ${loss.tokensCount} tokens`;
  return `Left ${money(loss.amountUsd)} on the table with ${sym}`;
}
