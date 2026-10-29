import { createHmac } from "node:crypto";
import { walletKey } from "./chains";

// Segredo do servidor: sem ele, ninguém consegue testar endereços para descobrir de quem é um apelido.
// Com Postgres, a própria URL do banco serve (os posts moram nele); AUTHOR_SECRET troca, se um dia precisar.
const SECRET = process.env.AUTHOR_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL || "losspornhub-local";

/** Apelido público e estável de uma carteira: 8 caracteres hex que não deixam voltar ao endereço. */
export const authorOf = (wallet: string) => (wallet === "example" ? "example" : createHmac("sha256", SECRET).update(walletKey(wallet)).digest("hex").slice(0, 8));

/** Hash com o mesmo segredo, para guardar coisas como o IP sem guardar o valor em si. */
export const privateHash = (value: string) => createHmac("sha256", SECRET).update(value).digest("hex").slice(0, 24);
