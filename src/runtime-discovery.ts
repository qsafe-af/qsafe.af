// Minimal, fast Substrate JSON-RPC client for runtime discovery
type Json = any;

class RpcClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, {resolve: (v: any) => void; reject: (e: any) => void;}>();

  constructor(endpoint: string) {
    this.ws = new WebSocket(endpoint);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message ?? "RPC error"));
        else resolve(msg.result);
      }
    };
    this.ws.onclose = () => {
      for (const { reject } of this.pending.values()) reject(new Error("WS closed"));
      this.pending.clear();
    };
  }

  ready(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error("WS error")); };
      const cleanup = () => {
        this.ws.removeEventListener("open", onOpen);
        this.ws.removeEventListener("error", onError);
      };
      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("error", onError);
    });
  }

  request<T = Json>(method: string, params: Json[] = [], timeoutMs = 10000): Promise<T> {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v as T); },
        reject:  (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() { try { this.ws.close(); } catch {} }
}

export type RuntimeSpan = {
  spec_name: string;
  spec_version: number;
  start_block: number;
  end_block: number;      // inclusive
  code_hash: string;      // 0x… blake2_256 of :code at start_block (from state_getStorageHash)
};

export type WalkOptions = {
  endpoint?: string;      // default wss://a.t.res.fm
  useBest?: boolean;      // default false => finalized
  maxHeight?: number;     // default = tip height
  onProgress?: (current: number, total: number, message: string) => void;
};

const CODE_KEY_HEX = "0x3a636f6465"; // ":code"

function hexNumberToU32(hex: string): number {
  if (!hex.startsWith("0x")) throw new Error(`bad hex: ${hex}`);
  const n = Number.parseInt(hex.slice(2), 16);
  if (!Number.isFinite(n)) throw new Error(`bad num: ${hex}`);
  return n >>> 0;
}

async function getTipHeight(c: RpcClient, useBest: boolean): Promise<number> {
  if (useBest) {
    // Best header (no params)
    const hdr = await c.request<{ number: string }>("chain_getHeader", []);
    return hexNumberToU32(hdr.number);
  } else {
    // Finalized head -> header
    const hash = await c.request<string>("chain_getFinalizedHead", []);
    const hdr = await c.request<{ number: string }>("chain_getHeader", [hash]);
    return hexNumberToU32(hdr.number);
  }
}

async function blockHashAt(c: RpcClient, height: number): Promise<string> {
  const h = await c.request<string | null>("chain_getBlockHash", [height]);
  if (!h) throw new Error(`No block hash at height ${height}`);
  return h;
}

type RuntimeVersion = { specName: string; specVersion: number };

async function runtimeVersionAt(c: RpcClient, height: number, cache: Map<number, RuntimeVersion>): Promise<RuntimeVersion> {
  const cached = cache.get(height);
  if (cached) return cached;
  const hash = await blockHashAt(c, height);
  const rv = await c.request<RuntimeVersion>("state_getRuntimeVersion", [hash]);
  cache.set(height, rv);
  return rv;
}

async function codeHashAt(c: RpcClient, height: number): Promise<string> {
  const hash = await blockHashAt(c, height);
  const h = await c.request<string | null>("state_getStorageHash", [CODE_KEY_HEX, hash]);
  if (!h) throw new Error(`No :code hash at height ${height}`);
  return h;
}

/**
 * Walks runtime spans efficiently (galloping + binary search).
 * Returns spans keyed by specVersion and annotated with :code hash at each span start.
 */
export async function walkRuntimeSpans(endpoint: string, opts: WalkOptions = {}): Promise<RuntimeSpan[]> {
  const useBest = !!opts.useBest;
  const progress = opts.onProgress || (() => {});

  const client = new RpcClient(endpoint);
  try {
    progress(0, 100, 'Connecting to endpoint...');
    await client.ready();
    
    progress(5, 100, 'Fetching chain tip...');
    const tip = await getTipHeight(client, useBest);
    const maxH = Math.min(opts.maxHeight ?? tip, tip);

    progress(10, 100, 'Fetching genesis runtime...');
    const cache = new Map<number, RuntimeVersion>();
    const genesis = await runtimeVersionAt(client, 0, cache);

    const spans: RuntimeSpan[] = [];
    let curStart = 0;
    let curVer = genesis.specVersion;
    let curName = genesis.specName;
    let curHash = await codeHashAt(client, 0);
    let spanCount = 0;

    while (true) {
      if (curStart >= maxH) {
        spans.push({ spec_name: curName, spec_version: curVer, start_block: curStart, end_block: maxH, code_hash: curHash });
        progress(100, 100, `Discovery complete: found ${spans.length} runtime spans`);
        break;
      }

      // Update progress
      const progressPct = Math.min(90, 10 + (curStart / maxH) * 80);
      progress(progressPct, 100, `Scanning blocks: ${curStart.toLocaleString()} / ${maxH.toLocaleString()}`);

      // Exponential (galloping) search to find a different version (or hit tip)
      let step = 1;
      let lowSame = curStart;
      let hi = curStart;

      while (true) {
        const cand = curStart + step;
        hi = Math.min(cand, maxH);
        const v = await runtimeVersionAt(client, hi, cache);
        if (v.specVersion === curVer) {
          lowSame = hi;
          if (hi === maxH) {
            spans.push({ spec_name: curName, spec_version: curVer, start_block: curStart, end_block: maxH, code_hash: curHash });
            progress(100, 100, `Discovery complete: found ${spans.length + 1} runtime spans`);
            break; // done
          }
          step *= 2;
        } else {
          spanCount++;
          progress(Math.min(90, 10 + (hi / maxH) * 80), 100, `Found runtime change at block ~${hi.toLocaleString()}`);
          break; // found a boundary between lowSame and hi
        }
      }

      if (lowSame === maxH) break;

      // Binary search first block with different version in (lowSame+1 .. hi]
      let l = lowSame + 1;
      let r = hi;
      let firstDiff = hi; // invariant: at hi it differs
      while (l <= r) {
        const mid = l + ((r - l) >> 1);
        const v = await runtimeVersionAt(client, mid, cache);
        if (v.specVersion === curVer) l = mid + 1;
        else { firstDiff = mid; r = mid - 1; }
      }

      // Emit previous span
      const endBlock = firstDiff - 1;
      spans.push({ spec_name: curName, spec_version: curVer, start_block: curStart, end_block: endBlock, code_hash: curHash });

      // Start next span
      const next = await runtimeVersionAt(client, firstDiff, cache);
      curStart = firstDiff;
      curVer = next.specVersion;
      curName = next.specName;
      curHash = await codeHashAt(client, firstDiff);
    }

    return spans;
  } finally {
    client.close();
  }
}

// Get block timestamp for a given block number
export async function getBlockTimestamp(endpoint: string, blockNumber: number): Promise<number | null> {
  const client = new RpcClient(endpoint);
  try {
    await client.ready();
    const hash = await blockHashAt(client, blockNumber);
    
    // Try to get the timestamp from storage
    try {
      // The timestamp is stored at Timestamp::Now
      // Storage key: twox_128("Timestamp") + twox_128("Now")
      const timestampKey = "0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb";
      const timestampValue = await client.request<string | null>("state_getStorage", [timestampKey, hash]);
      
      if (timestampValue) {
        // The timestamp is stored as a compact-encoded u64 in milliseconds
        // For simplicity, we'll decode it as a little-endian u64
        const hex = timestampValue.slice(2); // Remove 0x prefix
        const bytes = hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [];
        
        // Read as little-endian u64 (first 8 bytes)
        let timestampMs = 0;
        for (let i = 0; i < Math.min(8, bytes.length); i++) {
          timestampMs += bytes[i] * Math.pow(256, i);
        }
        
        if (timestampMs > 0 && timestampMs < Date.now() * 2) { // Sanity check
          return timestampMs;
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch timestamp from storage for block ${blockNumber}:`, e);
    }
    
    // Fallback: estimate based on block number and 6s block time
    const currentHeight = await getTipHeight(client, false);
    const blocksAgo = currentHeight - blockNumber;
    return Date.now() - (blocksAgo * 6000);
  } catch (error) {
    console.error(`Failed to get timestamp for block ${blockNumber}:`, error);
    return null;
  } finally {
    client.close();
  }
}

// Batch fetch timestamps for multiple blocks
export async function getBlockTimestamps(endpoint: string, blockNumbers: number[]): Promise<Map<number, number | null>> {
  const results = new Map<number, number | null>();
  const client = new RpcClient(endpoint);
  
  try {
    await client.ready();
    const currentHeight = await getTipHeight(client, false);
    
    // Create all requests in parallel
    const timestampPromises = blockNumbers.map(async (blockNumber) => {
      try {
        const hash = await blockHashAt(client, blockNumber);
        
        // The timestamp is stored at Timestamp::Now
        const timestampKey = "0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb";
        const timestampValue = await client.request<string | null>("state_getStorage", [timestampKey, hash]);
        
        if (timestampValue) {
          const hex = timestampValue.slice(2);
          const bytes = hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [];
          
          let timestampMs = 0;
          for (let i = 0; i < Math.min(8, bytes.length); i++) {
            timestampMs += bytes[i] * Math.pow(256, i);
          }
          
          if (timestampMs > 0 && timestampMs < Date.now() * 2) {
            return { blockNumber, timestamp: timestampMs };
          }
        }
        
        // Fallback to estimation
        const blocksAgo = currentHeight - blockNumber;
        return { blockNumber, timestamp: Date.now() - (blocksAgo * 6000) };
      } catch (e) {
        // Fallback to estimation on error
        const blocksAgo = currentHeight - blockNumber;
        return { blockNumber, timestamp: Date.now() - (blocksAgo * 6000) };
      }
    });
    
    // Wait for all timestamps
    const timestamps = await Promise.all(timestampPromises);
    
    // Populate results map
    for (const { blockNumber, timestamp } of timestamps) {
      results.set(blockNumber, timestamp);
    }
    
    return results;
  } catch (error) {
    console.error('Failed to batch fetch timestamps:', error);
    // Return estimations for all blocks
    const currentHeight = await getTipHeight(client, false).catch(() => 0);
    for (const blockNumber of blockNumbers) {
      const blocksAgo = currentHeight - blockNumber;
      results.set(blockNumber, Date.now() - (blocksAgo * 6000));
    }
    return results;
  } finally {
    client.close();
  }
}

// Cache for runtime spans to avoid repeated discoveries
const runtimeSpansCache = new Map<string, { spans: RuntimeSpan[], timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCachedRuntimeSpans(
  endpoint: string, 
  onProgress?: (current: number, total: number, message: string) => void
): Promise<RuntimeSpan[]> {
  const cached = runtimeSpansCache.get(endpoint);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (onProgress) {
      onProgress(100, 100, 'Using cached runtime spans');
    }
    return cached.spans;
  }

  try {
    const spans = await walkRuntimeSpans(endpoint, { onProgress });
    runtimeSpansCache.set(endpoint, { spans, timestamp: Date.now() });
    return spans;
  } catch (error) {
    // If we have stale cache, return it rather than failing completely
    if (cached) {
      console.warn('Failed to refresh runtime spans, using stale cache:', error);
      return cached.spans;
    }
    throw error;
  }
}

// Clear the cache for a specific endpoint
export function clearRuntimeSpansCache(endpoint?: string): void {
  if (endpoint) {
    runtimeSpansCache.delete(endpoint);
  } else {
    // Clear all cached spans if no endpoint specified
    runtimeSpansCache.clear();
  }
}