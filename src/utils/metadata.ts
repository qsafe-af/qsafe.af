// Metadata utilities for fetching and parsing runtime metadata
import { TypeRegistry } from "@polkadot/types/create";
import { Metadata } from "@polkadot/types/metadata";
import { xxhashAsU8a } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";

// Types
export interface CallInfo {
  name: string;
  callsCount: number;
  callNameByIndex: Map<number, string>;
}

export interface MetadataInfo {
  registry: TypeRegistry;
  metadata: Metadata;
  callMap: Map<number, CallInfo>;
  ss58Format?: number;
  tokenSymbol?: string;
  tokenDecimals?: number;
}

// Cache for metadata by spec version
const metadataCache = new Map<string, MetadataInfo>();

/**
 * Convert hex string to Uint8Array
 */
function hexToU8a(hex: string): Uint8Array {
  const cleaned = hex.startsWith("0x") ? hex.slice(2) : hex;
  const u8a = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < u8a.length; i++) {
    u8a[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return u8a;
}

/**
 * Build call index map from metadata
 */
export function buildCallIndexMap(metaHex: string): MetadataInfo {
  const registry = new TypeRegistry();
  const metadata = new Metadata(registry, hexToU8a(metaHex));
  registry.setMetadata(metadata);

  const pallets: any[] = (metadata as any).asLatest.pallets;
  const callMap = new Map<number, CallInfo>();

  pallets.forEach((p: any) => {
    if (p.calls && p.calls.isSome) {
      const idx = Number(p.index.toNumber());
      const name = p.name.toString();

      // v14: calls.unwrap().type is SiLookupTypeId
      const callTypeId = p.calls.unwrap().type;
      const siType = registry.lookup.getSiType(callTypeId);

      const names = new Map<number, string>();
      let count = 0;

      if (siType?.def?.isVariant) {
        const variants = siType.def.asVariant.variants;
        count = variants.length;
        variants.forEach((v: any, i: number) =>
          names.set(i, v.name.toString()),
        );
      }
      callMap.set(idx, { name, callsCount: count, callNameByIndex: names });
    }
  });

  // Extract chain properties from metadata if available
  const ss58Format: number | undefined = (registry as any).chainSS58;
  const tokenSymbol: string | undefined = (registry as any).chainTokens?.[0];
  const tokenDecimals: number | undefined = (registry as any)
    .chainDecimals?.[0];

  return {
    registry,
    metadata,
    callMap,
    ss58Format,
    tokenSymbol,
    tokenDecimals,
  };
}

/**
 * Fetch runtime version for a specific block
 */
async function fetchRuntimeVersion(
  endpoint: string,
  blockHash: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    let resolved = false;

    ws.onopen = () => {
      const message = {
        id: 1,
        jsonrpc: "2.0",
        method: "state_getRuntimeVersion",
        params: [blockHash],
      };
      ws.send(JSON.stringify(message));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id === 1) {
          if (data.error) {
            throw new Error(
              data.error.message || "Failed to fetch runtime version",
            );
          }
          if (data.result) {
            const specVersion = data.result.specVersion;
            resolved = true;
            ws.close();
            resolve(specVersion);
          }
        }
      } catch (error) {
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(error);
        }
      }
    };

    ws.onerror = (error) => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(error);
      }
    };

    ws.onclose = () => {
      if (!resolved) {
        reject(new Error("WebSocket closed unexpectedly"));
      }
    };
  });
}

async function fetchGenesisHash(endpoint: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    let resolved = false;

    ws.onopen = () => {
      const message = {
        id: 1,
        jsonrpc: "2.0",
        method: "chain_getBlockHash",
        params: [0],
      };
      ws.send(JSON.stringify(message));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id === 1) {
          resolved = true;
          ws.close();
          if (data.error) {
            reject(
              new Error(data.error.message || "Failed to fetch genesis hash"),
            );
          } else {
            resolve(data.result as string);
          }
        }
      } catch (error) {
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(error);
        }
      }
    };

    ws.onerror = (error) => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(error);
      }
    };

    ws.onclose = () => {
      if (!resolved) {
        reject(new Error("WebSocket closed unexpectedly"));
      }
    };
  });
}

/**
 * Fetch metadata for a specific block
 */
export async function fetchMetadata(
  endpoint: string,
  blockHash: string,
): Promise<MetadataInfo> {
  // First get the spec version for this block
  let specVersion: number;
  try {
    specVersion = await fetchRuntimeVersion(endpoint, blockHash);
    console.log(
      "[Metadata] Runtime spec version for block",
      blockHash,
      "is",
      specVersion,
    );
  } catch (error) {
    console.error("[Metadata] Failed to fetch runtime version:", error);
    throw error;
  }

  // Check cache with genesisHash+spec version (cross-chain safe)
  const genesisHash = await fetchGenesisHash(endpoint);
  const cacheKey = `${genesisHash}::${specVersion}`;
  const cached = metadataCache.get(cacheKey);
  if (cached) {
    console.log("[Metadata] Using cached metadata for", cacheKey);
    return cached;
  }

  console.log(
    "[Metadata] Fetching metadata for spec version",
    specVersion,
    "genesis",
    genesisHash,
    "at block",
    blockHash,
  );

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    let resolved = false;

    ws.onopen = () => {
      const message = {
        id: 1,
        jsonrpc: "2.0",
        method: "state_getMetadata",
        params: [blockHash],
      };
      ws.send(JSON.stringify(message));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id === 1) {
          if (data.error) {
            throw new Error(data.error.message || "Failed to fetch metadata");
          }
          if (data.result) {
            const metadataInfo = buildCallIndexMap(data.result);
            metadataCache.set(cacheKey, metadataInfo);
            resolved = true;
            ws.close();
            resolve(metadataInfo);
          }
        }
      } catch (error) {
        console.error("[Metadata] Error processing metadata:", error);
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(error);
        }
      }
    };

    ws.onerror = (error) => {
      console.error("[Metadata] WebSocket error:", error);
      if (!resolved) {
        resolved = true;
        reject(error);
      }
    };

    ws.onclose = () => {
      if (!resolved) {
        reject(new Error("WebSocket closed before metadata received"));
      }
    };

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!resolved) {
        console.warn("[Metadata] Timeout fetching metadata");
        resolved = true;
        ws.close();
        reject(new Error("Timeout fetching metadata"));
      }
    }, 10000);
  });
}

/**
 * Generate storage key for system events
 */
export function systemEventsStorageKey(): `0x${string}` {
  const p = xxhashAsU8a("System", 128);
  const m = xxhashAsU8a("Events", 128);
  const key = new Uint8Array(p.length + m.length);
  key.set(p, 0);
  key.set(m, p.length);
  return u8aToHex(key) as `0x${string}`;
}

/**
 * Find call header in extrinsic data by validating against metadata
 */
export function findCallHeaderWithMeta(
  data: Uint8Array,
  start: number,
  callMap: Map<number, CallInfo>,
  scanLimit = 4096,
): { offset: number; pallet: number; call: number } | null {
  for (let shift = 0; shift <= scanLimit; shift++) {
    const i = start + shift;
    if (i + 2 > data.length) break;

    const pallet = data[i];
    const call = data[i + 1];
    const info = callMap.get(pallet);

    if (info && call < info.callsCount) {
      return { offset: i, pallet, call };
    }
  }
  return null;
}

/**
 * Get pallet name by index
 */
export function getPalletName(
  callMap: Map<number, CallInfo>,
  palletIndex: number,
): string | undefined {
  return callMap.get(palletIndex)?.name;
}

/**
 * Get call name by indices
 */
export function getCallName(
  callMap: Map<number, CallInfo>,
  palletIndex: number,
  callIndex: number,
): string | undefined {
  const pallet = callMap.get(palletIndex);
  if (!pallet) return undefined;
  return pallet.callNameByIndex.get(callIndex);
}

/**
 * Get cached metadata if available
 */

/**
 * Clear metadata cache
 */
export function clearMetadataCache(): void {
  metadataCache.clear();
  console.log("[Metadata] Cache cleared");
}

/**
 * Register custom types for a specific chain
 */
export function registerChainTypes(
  registry: TypeRegistry,
  chainId: string,
): void {
  // Register chain-specific types
  // For Resonance/Quantus chains with big integers in events
  if (chainId === "resonance" || chainId === "quantus") {
    registry.register({
      U512: "UInt<512>",
    });
  }

  // Add other chain-specific type registrations as needed
}
