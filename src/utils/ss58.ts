// SS58 address encoding utilities using @polkadot/util-crypto
import { encodeAddress as polkadotEncodeAddress, decodeAddress as polkadotDecodeAddress, cryptoWaitReady } from '@polkadot/util-crypto';

// Cache for chain properties
const chainPropertiesCache = new Map<string, { 
  ss58Format: number; 
  tokenSymbol?: string; 
  tokenDecimals?: number 
}>();

// Ensure crypto is ready
let cryptoReady = false;
const cryptoReadyPromise = cryptoWaitReady().then(() => {
  cryptoReady = true;
});

/**
 * Ensure crypto is initialized before using crypto functions
 */
async function ensureCryptoReady(): Promise<void> {
  if (!cryptoReady) {
    await cryptoReadyPromise;
  }
}

/**
 * Encode an address to SS58 format using @polkadot/util-crypto
 */
export async function encodeAddress(address: string | Uint8Array, ss58Format = 42): Promise<string> {
  await ensureCryptoReady();
  return polkadotEncodeAddress(address, ss58Format);
}

/**
 * Decode an SS58 address to raw bytes using @polkadot/util-crypto
 */
export async function decodeAddress(address: string, ignoreChecksum?: boolean, ss58Format?: number): Promise<Uint8Array> {
  await ensureCryptoReady();
  return polkadotDecodeAddress(address, ignoreChecksum, ss58Format);
}

/**
 * Synchronous version of encodeAddress (requires crypto to be ready)
 */
export function encodeAddressSync(address: string | Uint8Array, ss58Format = 42): string {
  if (!cryptoReady) {
    throw new Error('Crypto not ready. Call ensureCryptoReady() first.');
  }
  return polkadotEncodeAddress(address, ss58Format);
}

/**
 * Synchronous version of decodeAddress (requires crypto to be ready)
 */
export function decodeAddressSync(address: string, ignoreChecksum?: boolean, ss58Format?: number): Uint8Array {
  if (!cryptoReady) {
    throw new Error('Crypto not ready. Call ensureCryptoReady() first.');
  }
  return polkadotDecodeAddress(address, ignoreChecksum, ss58Format);
}

/**
 * Fetch and cache system properties for a chain
 */
export async function fetchSystemProperties(
  endpoint: string, 
  genesis: string
): Promise<{ ss58Format: number; tokenSymbol?: string; tokenDecimals?: number }> {
  // Check cache first
  const cached = chainPropertiesCache.get(genesis);
  if (cached) {
    console.log('[SS58] Using cached properties for', genesis, cached);
    return cached;
  }

  console.log('[SS58] Fetching system properties from', endpoint);
  
  return new Promise((resolve) => {
    const ws = new WebSocket(endpoint);
    let resolved = false;
    
    ws.onopen = () => {
      const message = {
        id: 1,
        jsonrpc: '2.0',
        method: 'system_properties',
        params: []
      };
      ws.send(JSON.stringify(message));
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id === 1 && data.result) {
          const properties = {
            ss58Format: data.result.ss58Format || 42, // Default to 42 (Substrate)
            tokenSymbol: data.result.tokenSymbol,
            tokenDecimals: data.result.tokenDecimals
          };
          
          console.log('[SS58] Got system properties:', properties);
          chainPropertiesCache.set(genesis, properties);
          resolved = true;
          ws.close();
          resolve(properties);
        }
      } catch (error) {
        console.error('[SS58] Error parsing system properties:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('[SS58] WebSocket error:', error);
      if (!resolved) {
        resolved = true;
        // Default to Substrate format
        const defaultProps = { ss58Format: 42 };
        chainPropertiesCache.set(genesis, defaultProps);
        resolve(defaultProps);
      }
    };
    
    ws.onclose = () => {
      if (!resolved) {
        // Default to Substrate format
        const defaultProps = { ss58Format: 42 };
        chainPropertiesCache.set(genesis, defaultProps);
        resolve(defaultProps);
      }
    };
    
    // Timeout after 5 seconds
    setTimeout(() => {
      if (!resolved) {
        console.warn('[SS58] Timeout fetching system properties');
        resolved = true;
        ws.close();
        const defaultProps = { ss58Format: 42 };
        chainPropertiesCache.set(genesis, defaultProps);
        resolve(defaultProps);
      }
    }, 5000);
  });
}

/**
 * Format an author address with SS58 encoding
 */
export async function formatAuthorAddress(
  hexAddress: string,
  endpoint: string | undefined,
  genesis: string
): Promise<string> {
  if (!hexAddress || hexAddress === 'Unknown') {
    return hexAddress || 'Unknown';
  }
  
  // If no endpoint, just return hex
  if (!endpoint) {
    return hexAddress;
  }
  
  try {
    // Get SS58 format for this chain
    const { ss58Format } = await fetchSystemProperties(endpoint, genesis);
    
    // Encode to SS58
    const ss58Address = await encodeAddress(hexAddress, ss58Format);
    
    // Return full SS58 address
    return ss58Address;
  } catch (error) {
    console.error('[SS58] Error encoding address:', error);
    // Fallback to hex display
    return hexAddress;
  }
}

/**
 * Get cached SS58 format for a chain
 */
export function getCachedSS58Format(genesis: string): number | undefined {
  return chainPropertiesCache.get(genesis)?.ss58Format;
}

/**
 * Get cached chain properties
 */
export function getCachedChainProperties(genesis: string): { 
  ss58Format: number; 
  tokenSymbol?: string; 
  tokenDecimals?: number 
} | undefined {
  return chainPropertiesCache.get(genesis);
}

/**
 * Initialize crypto and optionally pre-cache chain properties
 */
export async function initializeSS58(endpoint?: string, genesis?: string): Promise<void> {
  await ensureCryptoReady();
  
  if (endpoint && genesis) {
    await fetchSystemProperties(endpoint, genesis);
  }
}