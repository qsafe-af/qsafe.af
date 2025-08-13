// Digest decoder for extracting block author and other information from Quantus/Resonance blocks

// DigestItem Tags (first byte of digest log)
export const DigestItemTag = {
  Other: 0x00,
  Consensus: 0x04,
  Seal: 0x05,
  PreRuntime: 0x06,
  RuntimeEnvironmentUpdated: 0x08,
} as const;

// POW Engine ID: "pow_" in ASCII (used by Resonance chain)
export const POW_ENGINE_ID = '0x706f775f';

export interface DecodedDigest {
  author?: string;
  consensusEngine?: string;
  logs: DecodedDigestLog[];
}

export interface DecodedDigestLog {
  type: string;
  engine?: string;
  data?: string;
  decoded?: any;
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Decode digest logs from a block header
 * @param digest - The digest object containing logs array
 * @returns Decoded digest information including author if available
 */
export function decodeDigest(digest: { logs: string[] }): DecodedDigest {
  const result: DecodedDigest = {
    logs: [],
  };

  if (!digest || !digest.logs || !Array.isArray(digest.logs)) {
    return result;
  }

  console.log('[Digest] Processing digest with', digest.logs.length, 'logs');

  for (const log of digest.logs) {
    try {
      const decoded = decodeDigestLog(log);
      result.logs.push(decoded);

      console.log('[Digest] Decoded log:', {
        type: decoded.type,
        engine: decoded.engine,
        dataLength: decoded.data?.length,
        hasDecodedAccountId: !!decoded.decoded?.accountId
      });

      // Extract author from PreRuntime digest with POW engine
      if (decoded.type === 'PreRuntime' && 
          decoded.engine === POW_ENGINE_ID && 
          decoded.decoded?.accountId) {
        result.author = decoded.decoded.accountId;
        result.consensusEngine = 'PoW';
        console.log('[Digest] Found block author:', result.author);
      }
    } catch (error) {
      console.warn('Failed to decode digest log:', log, error);
      result.logs.push({
        type: 'Unknown',
        data: log,
      });
    }
  }

  return result;
}

/**
 * Decode a single digest log entry
 * @param log - Hex-encoded log entry
 * @returns Decoded log information
 */
function decodeDigestLog(log: string): DecodedDigestLog {
  const bytes = hexToBytes(log);
  
  if (bytes.length === 0) {
    throw new Error('Empty digest log');
  }

  const digestTag = bytes[0];
  
  switch (digestTag) {
    case DigestItemTag.PreRuntime:
      return decodePreRuntimeLog(bytes);
    
    case DigestItemTag.Seal:
      return decodeSealLog(bytes);
    
    case DigestItemTag.Consensus:
      return decodeConsensusLog(bytes);
    
    case DigestItemTag.Other:
      return {
        type: 'Other',
        data: bytesToHex(bytes.slice(1)),
      };
    
    case DigestItemTag.RuntimeEnvironmentUpdated:
      return {
        type: 'RuntimeEnvironmentUpdated',
      };
    
    default:
      return {
        type: `Unknown(${digestTag})`,
        data: bytesToHex(bytes.slice(1)),
      };
  }
}

/**
 * Decode PreRuntime digest log
 * Format: [0x06][engine_id (4 bytes)][payload (variable)]
 * For POW: payload is AccountId32 (32 bytes)
 */
function decodePreRuntimeLog(bytes: Uint8Array): DecodedDigestLog {
  if (bytes.length < 5) {
    throw new Error('PreRuntime log too short');
  }

  // Skip the tag byte (0x06)
  const engineId = bytesToHex(bytes.slice(1, 5));
  const payload = bytes.slice(5);

  console.log('[Digest] PreRuntime log - engineId:', engineId, 'payload length:', payload.length);

  const result: DecodedDigestLog = {
    type: 'PreRuntime',
    engine: engineId,
    data: bytesToHex(payload),
  };

  // If this is a POW engine, decode the AccountId
  if (engineId.toLowerCase() === POW_ENGINE_ID.toLowerCase()) {
    console.log('[Digest] POW engine detected, checking for AccountId');
    
    // The payload may have a compact-encoded length prefix
    let offset = 0;
    let accountIdLength = payload.length;
    
    // Check if there's a compact length prefix
    if (payload.length > 32) {
      // Try to read compact length
      const firstByte = payload[0];
      const mode = firstByte & 0x03;
      
      if (mode === 0x00) {
        // Single byte mode
        accountIdLength = firstByte >> 2;
        offset = 1;
      } else if (mode === 0x01) {
        // Two byte mode
        if (payload.length > 1) {
          accountIdLength = ((firstByte >> 2) | (payload[1] << 6));
          offset = 2;
        }
      } else if (mode === 0x10) {
        // Four byte mode
        if (payload.length > 3) {
          accountIdLength = ((firstByte >> 2) | (payload[1] << 6) | (payload[2] << 14) | (payload[3] << 22));
          offset = 4;
        }
      }
      console.log('[Digest] Compact length prefix detected, length:', accountIdLength, 'offset:', offset);
    }
    
    // Extract AccountId
    if (accountIdLength === 32 && payload.length >= offset + 32) {
      const accountId = payload.slice(offset, offset + 32);
      result.decoded = {
        accountId: bytesToHex(accountId),
      };
      console.log('[Digest] Decoded AccountId:', result.decoded.accountId);
    } else {
      console.warn(`POW PreRuntime payload issue - length: ${payload.length}, expected accountId length: ${accountIdLength}, offset: ${offset}`);
    }
  } else {
    console.log('[Digest] Non-POW engine:', engineId, '(expected:', POW_ENGINE_ID, ')');
  }

  return result;
}

/**
 * Decode Seal digest log
 * Format: [0x05][engine_id (4 bytes)][payload (variable)]
 * For POW: payload contains the proof-of-work solution/nonce
 */
function decodeSealLog(bytes: Uint8Array): DecodedDigestLog {
  if (bytes.length < 5) {
    throw new Error('Seal log too short');
  }

  // Skip the tag byte (0x05)
  const engineId = bytesToHex(bytes.slice(1, 5));
  const payload = bytes.slice(5);

  return {
    type: 'Seal',
    engine: engineId,
    data: bytesToHex(payload),
  };
}

/**
 * Decode Consensus digest log
 * Format: [0x04][engine_id (4 bytes)][payload (variable)]
 */
function decodeConsensusLog(bytes: Uint8Array): DecodedDigestLog {
  if (bytes.length < 5) {
    throw new Error('Consensus log too short');
  }

  // Skip the tag byte (0x04)
  const engineId = bytesToHex(bytes.slice(1, 5));
  const payload = bytes.slice(5);

  return {
    type: 'Consensus',
    engine: engineId,
    data: bytesToHex(payload),
  };
}

/**
 * Format author for display
 */
export function formatAuthor(author: string | undefined): string {
  if (!author) {
    return 'Unknown';
  }
  
  // Return full hex address
  return author;
}