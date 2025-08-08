// Chain configuration with friendly names mapped to genesis hashes
import type { Chain } from './types';

// Dictionary of chains with lowercase name as key
export const chains: Record<string, Chain> = {
  resonance: {
    name: "resonance",
    genesis:
      "0xdbacc01ae41b79388135ccd5d0ebe81eb0905260344256e6f4003bb8e75a91b5",
    displayName: "Resonance",
    endpoints: ["wss://a.t.res.fm"],
  },
  quantus: {
    name: "quantus",
    genesis:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    displayName: "Quantus",
  },
  integration: {
    name: "integration",
    genesis:
      "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
    displayName: "Integration",
    endpoints: ["wss://a.i.res.fm"],
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
