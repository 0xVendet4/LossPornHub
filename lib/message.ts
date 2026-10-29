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

/** Cada carteira assina com o mesmo código: o servidor junta num perfil só as que assinaram juntas. */
export function buildLinkMessage(p: { wallet: string; code: string; timestamp: number }): string {
  return [
    "LossPornHub: link this wallet to one anonymous profile.",
    "Posts from every wallet signed with this code show under the same name.",
    "",
    `Wallet: ${p.wallet}`,
    `Link code: ${p.code}`,
    `Timestamp: ${p.timestamp}`,
  ].join("\n");
}

/** Tira a carteira do perfil: os posts dela voltam ao apelido próprio. */
export function buildUnlinkMessage(p: { wallet: string; timestamp: number }): string {
  return ["LossPornHub: remove this wallet from its profile.", "", `Wallet: ${p.wallet}`, `Timestamp: ${p.timestamp}`].join("\n");
}
