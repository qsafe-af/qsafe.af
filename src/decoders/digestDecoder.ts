// Digest decoder for extracting block author and other information

// Digest log type prefixes (SCALE encoded)
export const DigestLogType = {
  Other: 0,
  Consensus: 4,
  Seal: 5,
  PreRuntime: 6,
  RuntimeEnvironmentUpdated: 8,
} as const;

// Common consensus engine IDs
export const CONSENSUS_ENGINES = {
  BABE: '0x42414245', // 'BABE' in hex
  AURA: '0x61757261', // 'aura' in hex
  GRAN: '0x4752414e', // 'GRAN' in hex
  POW: '0x706f7720',  // 'pow ' in hex (note: space at end)
  POWA: '0x706f7761', // 'powa' in hex (PoW alternative)
};

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

  for (const log of digest.logs) {
    try {
      const decoded = decodeDigestLog(log);
      result.logs.push(decoded);

      // Try to extract author from the log
      if (decoded.type === 'PreRuntime' || decoded.type === 'Consensus' || decoded.type === 'Seal') {
        const author = extractAuthorFromLog(decoded);
        if (author && !result.author) {
          result.author = author;
          result.consensusEngine = decoded.engine;
        }
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
    throw new Error('Empty log');
  }

  const logType = bytes[0];
  const logData = bytes.slice(1);

  switch (logType) {
    case DigestLogType.PreRuntime:
      return decodePreRuntimeLog(logData);
    
    case DigestLogType.Consensus:
      return decodeConsensusLog(logData);
    
    case DigestLogType.Seal:
      return decodeSealLog(logData);
    
    case DigestLogType.Other:
      return {
        type: 'Other',
        data: bytesToHex(logData),
      };
    
    case DigestLogType.RuntimeEnvironmentUpdated:
      return {
        type: 'RuntimeEnvironmentUpdated',
        data: bytesToHex(logData),
      };
    
    default:
      return {
        type: `Unknown(${logType})`,
        data: bytesToHex(logData),
      };
  }
}

/**
 * Decode PreRuntime digest log
 * Format: [engine_id (4 bytes), data (remaining)]
 */
function decodePreRuntimeLog(data: Uint8Array): DecodedDigestLog {
  if (data.length < 4) {
    throw new Error('PreRuntime log too short');
  }

  const engineId = bytesToHex(data.slice(0, 4));
  const engineData = data.slice(4);

  return {
    type: 'PreRuntime',
    engine: getEngineName(engineId),
    data: bytesToHex(engineData),
    decoded: decodeEngineData(engineId, engineData),
  };
}

/**
 * Decode Consensus digest log
 * Format: [engine_id (4 bytes), data (remaining)]
 */
function decodeConsensusLog(data: Uint8Array): DecodedDigestLog {
  if (data.length < 4) {
    throw new Error('Consensus log too short');
  }

  const engineId = bytesToHex(data.slice(0, 4));
  const engineData = data.slice(4);

  return {
    type: 'Consensus',
    engine: getEngineName(engineId),
    data: bytesToHex(engineData),
    decoded: decodeEngineData(engineId, engineData),
  };
}

/**
 * Decode Seal digest log
 * Format: [engine_id (4 bytes), data (remaining)]
 */
function decodeSealLog(data: Uint8Array): DecodedDigestLog {
  if (data.length < 4) {
    throw new Error('Seal log too short');
  }

  const engineId = bytesToHex(data.slice(0, 4));
  const engineData = data.slice(4);

  return {
    type: 'Seal',
    engine: getEngineName(engineId),
    data: bytesToHex(engineData),
  };
}

/**
 * Get human-readable engine name from engine ID
 */
function getEngineName(engineId: string): string {
  const normalizedId = engineId.toLowerCase();
  switch (normalizedId) {
    case CONSENSUS_ENGINES.BABE.toLowerCase():
      return 'BABE';
    case CONSENSUS_ENGINES.AURA.toLowerCase():
      return 'Aura';
    case CONSENSUS_ENGINES.GRAN.toLowerCase():
      return 'GRANDPA';
    case CONSENSUS_ENGINES.POW.toLowerCase():
      return 'PoW';
    case CONSENSUS_ENGINES.POWA.toLowerCase():
      return 'PoW';
    default:
      // Try to convert hex to ASCII for readable engine names
      try {
        const bytes = hexToBytes(engineId);
        const ascii = String.fromCharCode(...bytes);
        // Check if it's printable ASCII
        if (/^[\x20-\x7E]+$/.test(ascii)) {
          return ascii.trim();
        }
      } catch {}
      return engineId;
  }
}

/**
 * Decode engine-specific data
 */
function decodeEngineData(engineId: string, data: Uint8Array): any {
  const normalizedId = engineId.toLowerCase();
  try {
    switch (normalizedId) {
      case CONSENSUS_ENGINES.BABE.toLowerCase():
        return decodeBABEData(data);
      case CONSENSUS_ENGINES.AURA.toLowerCase():
        return decodeAuraData(data);
      case CONSENSUS_ENGINES.POW.toLowerCase():
      case CONSENSUS_ENGINES.POWA.toLowerCase():
        return decodePowData(data);
      default:
        // For unknown engines, try to decode as raw account data
        return decodeRawAccountData(data);
    }
  } catch (error) {
    console.warn(`Failed to decode ${engineId} data:`, error);
    return null;
  }
}

/**
 * Decode BABE consensus data
 * BABE PreRuntime contains: (slot, authority_index, vrf_output, vrf_proof)
 */
function decodeBABEData(data: Uint8Array): any {
  if (data.length < 8) {
    return null;
  }

  // Read slot number (u64 - 8 bytes, little-endian)
  const slot = readU64LE(data.slice(0, 8));
  
  // Read authority index (compact encoded)
  let offset = 8;
  const [authorityIndex, bytesRead] = readCompact(data.slice(offset));
  offset += bytesRead;

  return {
    slot: slot.toString(),
    authorityIndex: authorityIndex.toString(),
  };
}

/**
 * Decode Aura consensus data
 * Aura PreRuntime contains: (slot, authority_index)
 */
function decodeAuraData(data: Uint8Array): any {
  if (data.length < 8) {
    return null;
  }

  // Read slot number (u64 - 8 bytes, little-endian)
  const slot = readU64LE(data.slice(0, 8));
  
  // Read authority index if present
  let authorityIndex = 0;
  if (data.length > 8) {
    [authorityIndex] = readCompact(data.slice(8));
  }

  return {
    slot: slot.toString(),
    authorityIndex: authorityIndex.toString(),
  };
}

/**
 * Decode PoW consensus data
 * PoW seal typically contains the author's account directly
 */
function decodePowData(data: Uint8Array): any {
  // PoW typically puts the author account directly in the seal
  // Try to decode as an account (usually 32 bytes)
  if (data.length >= 32) {
    const account = bytesToHex(data.slice(0, 32));
    return {
      author: account,
    };
  }
  
  return null;
}

/**
 * Try to decode raw account data
 */
function decodeRawAccountData(data: Uint8Array): any {
  // Most Substrate accounts are 32 bytes
  if (data.length >= 32) {
    const account = bytesToHex(data.slice(0, 32));
    return {
      author: account,
    };
  }
  
  return null;
}

/**
 * Extract author information from a decoded log
 */
function extractAuthorFromLog(log: DecodedDigestLog): string | null {
  // For PoW, the author is in the decoded data
  if (log.decoded && log.decoded.author) {
    return log.decoded.author;
  }
  
  // For authority-based consensus
  if (log.decoded && log.decoded.authorityIndex !== undefined) {
    return `Authority #${log.decoded.authorityIndex}`;
  }
  
  // For Seal logs, the data might be the author directly
  if (log.type === 'Seal' && log.data) {
    const bytes = hexToBytes(log.data);
    if (bytes.length >= 32) {
      const account = bytesToHex(bytes.slice(0, 32));
      return account;
    }
  }
  
  return null;
}

/**
 * Read a u64 from bytes (little-endian)
 */
function readU64LE(bytes: Uint8Array): bigint {
  if (bytes.length < 8) {
    throw new Error('Not enough bytes for u64');
  }

  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value;
}

/**
 * Read a compact-encoded integer
 * Returns [value, bytesRead]
 */
function readCompact(bytes: Uint8Array): [number, number] {
  if (bytes.length === 0) {
    throw new Error('Empty bytes for compact');
  }

  const flag = bytes[0] & 0b11;
  
  if (flag === 0b00) {
    // Single byte mode
    return [bytes[0] >> 2, 1];
  } else if (flag === 0b01) {
    // Two byte mode
    if (bytes.length < 2) throw new Error('Not enough bytes');
    return [(bytes[0] >> 2) | (bytes[1] << 6), 2];
  } else if (flag === 0b10) {
    // Four byte mode
    if (bytes.length < 4) throw new Error('Not enough bytes');
    return [
      (bytes[0] >> 2) | (bytes[1] << 6) | (bytes[2] << 14) | (bytes[3] << 22),
      4
    ];
  } else {
    // Big integer mode - for simplicity, return 0
    // In a real implementation, you would handle this properly
    const bytesToRead = ((bytes[0] >> 2) + 4);
    return [0, bytesToRead + 1];
  }
}

/**
 * Format author for display
 */
export function formatAuthor(author: string | undefined): string {
  if (!author) {
    return 'Unknown';
  }
  
  // Return author as-is without truncation
  return author;
}