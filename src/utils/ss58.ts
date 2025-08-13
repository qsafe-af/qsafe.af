// SS58 address encoding utilities
import { blake2b as blake2bHash } from '@noble/hashes/blake2b';

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
  return blake2bHash(data, { dkLen: 64 }); // 64 bytes = 512 bits
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
  
  // SS58 checksum length is based on the length of the entire payload
  const payloadLength = data.length;
  let checksumLength: number;
  
  // Standard addresses (1 byte prefix + 32 bytes address = 33 bytes) get 2 byte checksum
  if (payloadLength === 33) {
    checksumLength = 2;
  } else if (payloadLength < 34) {
    checksumLength = 1;
  } else if (payloadLength < 89) {
    checksumLength = 2;
  } else if (payloadLength < 147) {
    checksumLength = 4;
  } else if (payloadLength < 258) {
    checksumLength = 8;
  } else {
    checksumLength = 32;
  }
  
  return hash.slice(0, checksumLength);
}

/**
 * Base58 encode
 */
function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  // Count leading zeros
  let zeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    zeros++;
  }

  // Allocate enough space for full number
  const digits = new Uint8Array(bytes.length * 2);
  let digitLength = 1;

  // Process bytes
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digitLength; j++) {
      carry += digits[j] * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits[digitLength++] = carry % 58;
      carry = Math.floor(carry / 58);
    }
  }

  // Convert to string
  let encoded = '';
  for (let i = digitLength - 1; i >= 0; i--) {
    encoded += BASE58_ALPHABET[digits[i]];
  }

  // Add leading 1s
  for (let i = 0; i < zeros; i++) {
    encoded = '1' + encoded;
  }

  return encoded;
}

/**
 * Encode an address to SS58 format (matching Polkadot.js implementation)
 */
export function encodeAddress(address: string | Uint8Array, ss58Format = 42): string {
  const bytes = typeof address === 'string' ? hexToBytes(address) : address;
  
  // Validate input
  if (bytes.length === 0) {
    throw new Error('Invalid address length');
  }
  
  // Prepare the data for encoding
  let data: Uint8Array;
  
  if (ss58Format < 64) {
    // Simple single byte prefix
    data = new Uint8Array(1 + bytes.length);
    data[0] = ss58Format;
    data.set(bytes, 1);
  } else if (ss58Format < 16384) {
    // Two-byte prefix encoding
    const first = 0x40 | ((ss58Format & 0xfc) >> 2);
    const second = ((ss58Format & 0x03) << 6) | ((ss58Format & 0xff00) >> 8);
    data = new Uint8Array(2 + bytes.length);
    data[0] = first;
    data[1] = second;
    data.set(bytes, 2);
  } else {
    throw new Error('Invalid SS58 format');
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