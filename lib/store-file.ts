import { promises as fs } from "fs";
import path from "path";
import { CHAINS, walletKey } from "./chains";
import type { Loss } from "./types";
import type { Backend } from "./store";

/** Backend em arquivo JSON, para rodar no PC sem banco. Na Vercel o disco não persiste: lá entra o Postgres. */
const FILE = path.join(process.cwd(), "data", "losses.json");
const LINKS = path.join(process.cwd(), "data", "links.json");

/** Posts antigos (valor digitado à mão) viram "realized" sem detalhes. */
function upgrade(l: any): Loss {
  return {
    kind: "realized",
    family: CHAINS[l.chain as keyof typeof CHAINS]?.family ?? "evm",
    target: "legacy",
    ...l,
  };
}

export function fileBackend(): Backend {
  let cache: Loss[] | null = null;
  let writing: Promise<void> = Promise.resolve();

  async function load(): Promise<Loss[]> {
    if (cache) return cache;
    try {
      cache = (JSON.parse(await fs.readFile(FILE, "utf8")) as any[]).map(upgrade);
    } catch {
      cache = [];
    }
    return cache!;
  }

  function persist() {
    const snapshot = JSON.stringify(cache, null, 2);
    writing = writing.then(async () => {
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      await fs.writeFile(FILE + ".tmp", snapshot);
      await fs.rename(FILE + ".tmp", FILE);
    });
    return writing;
  }

  let links: Map<string, string> | null = null;
  async function loadLinks() {
    if (links) return links;
    try {
      links = new Map(Object.entries(JSON.parse(await fs.readFile(LINKS, "utf8")) as Record<string, string>));
    } catch {
      links = new Map();
    }
    return links;
  }
  function persistLinks() {
    const snapshot = JSON.stringify(Object.fromEntries(links!), null, 2);
    writing = writing.then(async () => {
      await fs.mkdir(path.dirname(LINKS), { recursive: true });
      await fs.writeFile(LINKS + ".tmp", snapshot);
      await fs.rename(LINKS + ".tmp", LINKS);
    });
    return writing;
  }

  return {
    all: load,
    links: loadLinks,
    async setLinks(keys, profile) {
      const map = await loadLinks();
      for (const k of keys) map.set(k, profile);
      await persistLinks();
    },
    async unlink(key) {
      const map = await loadLinks();
      if (!map.delete(key)) return false;
      await persistLinks();
      return true;
    },
    async insert(loss) {
      const all = await load();
      const w = walletKey(loss.wallet);
      if (all.some((l) => walletKey(l.wallet) === w && l.target === loss.target)) return false;
      all.push(loss);
      await persist();
      return true;
    },
    async respect(id, voter) {
      const loss = (await load()).find((l) => l.id === id);
      if (!loss) return null;
      if (!loss.respectedBy.includes(voter)) {
        loss.respectedBy.push(voter);
        loss.respects++;
        await persist();
      }
      return loss.respects;
    },
    async remove(id) {
      const all = await load();
      const i = all.findIndex((l) => l.id === id);
      if (i < 0) return;
      all.splice(i, 1);
      await persist();
    },
  };
}
