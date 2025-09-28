// Chain configuration with friendly names mapped to genesis hashes
import type { Chain } from "./types";

// Dictionary of chains with lowercase name as key
export const chains: Record<string, Chain> = {
  schrodinger: {
    name: "schrodinger",
    genesis:
      "0xc54142365c8b26364d6f3768d4633f736ffb07d7b23aba1c450bd5bd3fad09f4",
    displayName: "Quantus Testnet",
    endpoints: ["wss://quantu.se"],
    indexer: "https://quantu.se/graphql",
    telemetry: "wss://tc0.res.fm/feed",
  },
  resonance: {
    name: "resonance",
    genesis:
      "0xdbacc01ae41b79388135ccd5d0ebe81eb0905260344256e6f4003bb8e75a91b5",
    displayName: "Resonance",
    endpoints: ["wss://a.t.res.fm"],
    indexer: "https://gql.res.fm/graphql",
    treasury: "qzgtEuKmVEPNrjjttgZfKjdHdvWEFKYMintizFuSJvXPiWEv8",
    telemetry: "wss://tc0.res.fm/feed",
  },
  heisenberg: {
    name: "heisenberg",
    genesis:
      "0x67391d3f740ef644c4dc91c9004af18fb4b41a6ead0719a06ccfbca50f27b015",
    displayName: "Heisenberg",
    endpoints: ["wss://a.i.res.fm"],
    telemetry: "wss://tc0.res.fm/feed",
  },
};

// Get chain by genesis hash
export function getChainByGenesis(genesis: string): Chain | undefined {
  const normalizedGenesis = genesis.toLowerCase();
  return Object.values(chains).find(
    (chain) => chain.genesis.toLowerCase() === normalizedGenesis,
  );
}

// Get chain by name (case-insensitive)
export function getChainByName(name: string): Chain | undefined {
  return chains[name.toLowerCase()];
}

// Get chain by either name or genesis hash
export function getChain(nameOrGenesis: string): Chain | undefined {
  // First try to find by name
  const byName = getChainByName(nameOrGenesis);
  if (byName) return byName;

  // Then try to find by genesis hash
  return getChainByGenesis(nameOrGenesis);
}

// Get all available chains
export function getAllChains(): Chain[] {
  return Object.values(chains);
}

// Get display name for a chain identifier (name or genesis)
export function getChainDisplayName(nameOrGenesis: string): string {
  const chain = getChain(nameOrGenesis);
  return chain ? chain.displayName : nameOrGenesis;
}

// Normalize chain identifier to genesis hash
export function normalizeToGenesis(nameOrGenesis: string): string {
  const chain = getChain(nameOrGenesis);
  return chain ? chain.genesis : nameOrGenesis;
}

// Normalize chain identifier to friendly name
export function normalizeToName(nameOrGenesis: string): string {
  const chain = getChain(nameOrGenesis);
  return chain ? chain.name : nameOrGenesis;
}
