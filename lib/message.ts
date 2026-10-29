/**
 * Mensagem que a carteira assina para postar. Os números não entram aqui:
 * o servidor recalcula tudo a partir da blockchain, então não há o que falsificar.
 */
export function buildPostMessage(p: { wallet: string; target: string; caption: string; timestamp: number }): string {
  return [
    "LossPornHub: I want to post my wallet scan.",
    "",
    `Wallet: ${p.wallet}`,
    `Post: ${p.target}`,
    `Caption: ${p.caption}`,
    `Timestamp: ${p.timestamp}`,
  ].join("\n");
}

/** Mensagem para apagar um post. O servidor só aceita a assinatura da carteira que postou. */
export function buildDeleteMessage(p: { wallet: string; id: string; timestamp: number }): string {
  return ["LossPornHub: I want to delete my post.", "", `Wallet: ${p.wallet}`, `Post: ${p.id}`, `Timestamp: ${p.timestamp}`].join("\n");
}
