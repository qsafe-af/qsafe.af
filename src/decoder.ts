// Custom decoder for quantum-resistant blockchain data
// Handles ML-DSA (Dilithium) signatures and Poseidon hashing

import type { SubstrateEvent } from './types';

// Constants for quantum-resistant chains
const MLDSA_SIGNATURE_LENGTH = 3293; // ML-DSA-87 signature length in bytes
const POSEIDON_HASH_LENGTH = 32; // Poseidon hash output length
const MLDSA_PUBLIC_KEY_LENGTH = 2592; // ML-DSA-87 public key length

// Custom types for quantum-resistant chains
export interface QuantumEvent {
  phase: EventPhase;
  event: {
    section: string;
    method: string;
    data: QuantumEventData;
  };
  topics: string[];
}

export interface EventPhase {
  applyExtrinsic?: number;
  finalization?: boolean;
  initialization?: boolean;
}

export interface QuantumEventData {
  raw: Uint8Array;
  decoded?: any;
}

export interface MLDSASignature {
  algorithm: 'ML-DSA-87' | 'ML-DSA-65' | 'ML-DSA-44';
  signature: Uint8Array;
  publicKey: Uint8Array;
}

export interface PoseidonHash {
  value: Uint8Array;
  preimage?: Uint8Array;
}

export interface QuantumExtrinsic {
  signature: MLDSASignature;
  method: {
    section: string;
    method: string;
    args: any[];
  };
  nonce: number;
  era: ExtrinsicEra;
  tip: bigint;
  hash: PoseidonHash;
}

export interface ExtrinsicEra {
  immortal?: boolean;
  mortal?: {
    period: number;
    phase: number;
  };
}

// Decoder class for quantum-resistant chain data
export class QuantumDecoder {
  private buffer: Uint8Array;
  private offset: number;

  constructor(data: Uint8Array | string) {
    if (typeof data === 'string') {
      // Remove 0x prefix if present
      const hex = data.startsWith('0x') ? data.slice(2) : data;
      this.buffer = this.hexToBytes(hex);
    } else {
      this.buffer = data;
    }
    this.offset = 0;
  }

  // Utility methods
  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Read methods
  private readU8(): number {
    if (this.offset >= this.buffer.length) {
      throw new Error('Buffer underflow');
    }
    return this.buffer[this.offset++];
  }

  private readU32(): number {
    const b1 = this.readU8();
    const b2 = this.readU8();
    const b3 = this.readU8();
    const b4 = this.readU8();
    return b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
  }

  private readCompactU32(): number {
    const first = this.readU8();
    const mode = first & 0x03;

    if (mode === 0) {
      return first >> 2;
    } else if (mode === 1) {
      const second = this.readU8();
      return ((first >> 2) | (second << 6));
    } else if (mode === 2) {
      const b2 = this.readU8();
      const b3 = this.readU8();
      const b4 = this.readU8();
      return ((first >> 2) | (b2 << 6) | (b3 << 14) | (b4 << 22));
    } else {
      throw new Error('BigInt compact encoding not supported yet');
    }
  }

  private readBytes(length: number): Uint8Array {
    if (this.offset + length > this.buffer.length) {
      throw new Error('Buffer underflow');
    }
    const bytes = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  private readString(): string {
    const length = this.readCompactU32();
    const bytes = this.readBytes(length);
    return new TextDecoder().decode(bytes);
  }

  // ML-DSA signature decoding
  private readMLDSASignature(): MLDSASignature {
    const algorithmByte = this.readU8();
    let algorithm: MLDSASignature['algorithm'];
    let signatureLength: number;
    let publicKeyLength: number;

    switch (algorithmByte) {
      case 0x00:
        algorithm = 'ML-DSA-44';
        signatureLength = 2420;
        publicKeyLength = 1312;
        break;
      case 0x01:
        algorithm = 'ML-DSA-65';
        signatureLength = 3309;
        publicKeyLength = 1952;
        break;
      case 0x02:
        algorithm = 'ML-DSA-87';
        signatureLength = 4627;
        publicKeyLength = 2592;
        break;
      default:
        throw new Error(`Unknown ML-DSA algorithm: ${algorithmByte}`);
    }

    const signature = this.readBytes(signatureLength);
    const publicKey = this.readBytes(publicKeyLength);

    return { algorithm, signature, publicKey };
  }

  // Poseidon hash decoding
  private readPoseidonHash(): PoseidonHash {
    const value = this.readBytes(POSEIDON_HASH_LENGTH);
    return { value };
  }

  // Event decoding
  decodeEvents(): QuantumEvent[] {
    const events: QuantumEvent[] = [];
    const eventCount = this.readCompactU32();

    for (let i = 0; i < eventCount; i++) {
      const phase = this.decodeEventPhase();
      const section = this.readString();
      const method = this.readString();
      
      // Read raw event data
      const dataLength = this.readCompactU32();
      const rawData = this.readBytes(dataLength);

      // Read topics
      const topicCount = this.readCompactU32();
      const topics: string[] = [];
      for (let j = 0; j < topicCount; j++) {
        const topicHash = this.readPoseidonHash();
        topics.push('0x' + this.bytesToHex(topicHash.value));
      }

      events.push({
        phase,
        event: {
          section,
          method,
          data: {
            raw: rawData,
            decoded: this.decodeEventData(section, method, rawData)
          }
        },
        topics
      });
    }

    return events;
  }

  private decodeEventPhase(): EventPhase {
    const phaseType = this.readU8();
    switch (phaseType) {
      case 0x00:
        return { applyExtrinsic: this.readU32() };
      case 0x01:
        return { finalization: true };
      case 0x02:
        return { initialization: true };
      default:
        throw new Error(`Unknown event phase type: ${phaseType}`);
    }
  }

  private decodeEventData(section: string, method: string, data: Uint8Array): any {
    // Create a new decoder for the event data
    const dataDecoder = new QuantumDecoder(data);

    // Common event decodings
    if (section === 'system') {
      switch (method) {
        case 'ExtrinsicSuccess':
          return {
            dispatchInfo: {
              weight: dataDecoder.readCompactU32(),
              class: dataDecoder.readU8(),
              paysFee: dataDecoder.readU8()
            }
          };
        case 'ExtrinsicFailed':
          return {
            dispatchError: dataDecoder.readU8(),
            dispatchInfo: {
              weight: dataDecoder.readCompactU32(),
              class: dataDecoder.readU8(),
              paysFee: dataDecoder.readU8()
            }
          };
      }
    }

    if (section === 'balances') {
      switch (method) {
        case 'Transfer':
          return {
            from: dataDecoder.readAccountId(),
            to: dataDecoder.readAccountId(),
            amount: dataDecoder.readCompactU128()
          };
      }
    }

    // Return raw data if we don't know how to decode
    return { raw: '0x' + this.bytesToHex(data) };
  }

  private readAccountId(): string {
    // For quantum chains, account IDs are derived from ML-DSA public keys
    const publicKeyHash = this.readPoseidonHash();
    return '0x' + this.bytesToHex(publicKeyHash.value);
  }

  private readCompactU128(): bigint {
    // Simplified compact encoding for u128
    const first = this.readU8();
    const mode = first & 0x03;

    if (mode < 3) {
      // For small values, use existing U32 logic
      this.offset--; // Reset to re-read
      return BigInt(this.readCompactU32());
    } else {
      // Read 16 bytes for large values
      const bytes = this.readBytes(16);
      let value = 0n;
      for (let i = 0; i < 16; i++) {
        value |= BigInt(bytes[i]) << BigInt(i * 8);
      }
      return value;
    }
  }

  // Extrinsic decoding
  decodeExtrinsic(): QuantumExtrinsic {
    // Read extrinsic length (compact encoded)
    const _length = this.readCompactU32();

    // Version byte (should be 0x84 for signed extrinsics)
    const version = this.readU8();
    if ((version & 0x80) === 0) {
      throw new Error('Unsigned extrinsics not supported');
    }

    // Read signature
    const signature = this.readMLDSASignature();

    // Read era
    const era = this.decodeEra();

    // Read nonce
    const nonce = this.readCompactU32();

    // Read tip
    const tip = this.readCompactU128();

    // Read method
    const methodSection = this.readU8();
    const methodIndex = this.readU8();
    
    // For now, we'll store the raw method data
    const remainingData = this.buffer.slice(this.offset);

    // Calculate Poseidon hash of the extrinsic
    const hash: PoseidonHash = {
      value: new Uint8Array(32) // Placeholder - actual hashing would be done here
    };

    return {
      signature,
      method: {
        section: `pallet_${methodSection}`,
        method: `method_${methodIndex}`,
        args: [] // Would decode based on metadata
      },
      nonce,
      era,
      tip,
      hash
    };
  }

  private decodeEra(): ExtrinsicEra {
    const first = this.readU8();
    if (first === 0) {
      return { immortal: true };
    } else {
      const second = this.readU8();
      const encoded = first | (second << 8);
      const period = 2 << (encoded % (1 << 4));
      const phase = (encoded >> 4) * Math.max(1, period >> 12);
      return {
        mortal: { period, phase }
      };
    }
  }

  // Convenience method to decode events from hex string
  static decodeEventsFromHex(hex: string): QuantumEvent[] {
    const decoder = new QuantumDecoder(hex);
    return decoder.decodeEvents();
  }

  // Convert quantum events to substrate-compatible format for display
  static toSubstrateEvents(quantumEvents: QuantumEvent[]): SubstrateEvent[] {
    return quantumEvents.map(qe => ({
      phase: qe.phase,
      event: {
        section: qe.event.section,
        method: qe.event.method,
        data: qe.event.data.decoded || []
      },
      topics: qe.topics
    }));
  }
}

// Helper function to identify if a chain is quantum-resistant
export function isQuantumChain(chainName: string): boolean {
  return ['quantus', 'resonance'].includes(chainName.toLowerCase());
}