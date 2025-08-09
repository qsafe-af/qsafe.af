// SS58 address encoding utilities
import { blake2b } from '@noble/hashes/blake2b';

// Base58 alphabet used by Bitcoin and SS58
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// SS58 prefix for checksum
const SS58_PREFIX = 'SS58PRE';

// Cache for chain properties
const chainPropertiesCache = new Map<string, { ss58Format: number; tokenSymbol?: string; tokenDecimals?: number }>();

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  
  return bytes;
}

/**
 * Blake2b hash with 512-bit output (as used by Substrate)
 */
function blake2b512(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 64 }); // 64 bytes = 512 bits
}

/**
 * Create SS58 checksum
 */
function createSS58Checksum(data: Uint8Array): Uint8Array {
  const prefixBytes = new TextEncoder().encode(SS58_PREFIX);
  const combined = new Uint8Array(prefixBytes.length + data.length);
  combined.set(prefixBytes);
  combined.set(data, prefixBytes.length);
  
  const hash = blake2b512(combined);
  // SS58 uses the first 1, 2, 4, or 8 bytes depending on address length
  // For standard 32-byte addresses, we use 2 bytes
  return hash.slice(0, 2);
}

/**
 * Base58 encode
 */
function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  // Convert bytes to big integer
  let num = 0n;
  for (const byte of bytes) {
    num = num * 256n + BigInt(byte);
  }

  // Convert to base58
  let encoded = '';
  while (num > 0n) {
    const remainder = num % 58n;
    num = num / 58n;
    encoded = BASE58_ALPHABET[Number(remainder)] + encoded;
  }

  // Handle leading zeros
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = '1' + encoded;
  }

  return encoded;
}

/**
 * Encode an address to SS58 format
 */
export function encodeAddress(address: string | Uint8Array, ss58Format = 42): string {
  const bytes = typeof address === 'string' ? hexToBytes(address) : address;
  
  // Prepare the data for encoding
  let data: Uint8Array;
  
  if (ss58Format < 64) {
    // Single byte prefix
    data = new Uint8Array(1 + bytes.length);
    data[0] = ss58Format;
    data.set(bytes, 1);
  } else {
    // Two byte prefix
    const first = ((ss58Format & 0xfc) >> 2) | 0x40;
    const second = (ss58Format >> 8) | ((ss58Format & 0x03) << 6);
    data = new Uint8Array(2 + bytes.length);
    data[0] = first;
    data[1] = second;
    data.set(bytes, 2);
  }
  
  // Calculate checksum
  const checksum = createSS58Checksum(data);
  
  // Combine all parts
  const full = new Uint8Array(data.length + checksum.length);
  full.set(data);
  full.set(checksum, data.length);
  
  // Base58 encode
  return base58Encode(full);
}

/**
 * Fetch and cache system properties for a chain
 */
export async function fetchSystemProperties(endpoint: string, genesis: string): Promise<{ ss58Format: number }> {
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
    const ss58Address = encodeAddress(hexAddress, ss58Format);
    
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