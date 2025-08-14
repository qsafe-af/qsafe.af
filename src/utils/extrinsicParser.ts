// Extrinsic parser utilities for decoding blockchain extrinsics
import { BN } from '@polkadot/util';
import { encodeAddress } from '@polkadot/util-crypto';
import type { CallInfo } from './metadata';

// Types
export type Era =
  | { type: 'immortal' }
  | { type: 'mortal'; period: number; phase: number };

export type MultiAddress =
  | { type: 'Id'; id: Uint8Array }
  | { type: 'Index'; index: bigint }
  | { type: 'Raw'; data: Uint8Array }
  | { type: 'Address32'; data: Uint8Array }
  | { type: 'Address20'; data: Uint8Array };

export interface ParsedExtrinsic {
  ok: boolean;
  rawLength: number;
  version: number;
  isSigned: boolean;
  callIndex: { pallet: number; call: number };
  section?: string;
  method?: string;
  sender?: string;
  tipPlanck?: string;
  tipHuman?: string;
  nonce?: string;
  era?: Era;
  error?: string;
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToU8a(hex: string): Uint8Array {
  const s = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (s.length % 2) throw new Error('Invalid hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.substr(i * 2, 2), 16);
  }
  return out;
}

/**
 * Read SCALE compact integer
 */
export function readCompactInt(a: Uint8Array, o: number): [bigint, number] {
  const b0 = a[o];
  const mode = b0 & 3;
  
  if (mode === 0) return [BigInt(b0 >>> 2), 1];
  if (mode === 1) return [BigInt(((a[o] | (a[o + 1] << 8)) >>> 2) >>> 0), 2];
  if (mode === 2) {
    return [
      BigInt(
        ((a[o] | (a[o + 1] << 8) | (a[o + 2] << 16) | (a[o + 3] << 24)) >>> 2) >>> 0
      ),
      4
    ];
  }
  
  // Mode 3: big integer
  const len = (b0 >>> 2) + 4;
  let v = 0n;
  for (let i = 0; i < len; i++) {
    v |= BigInt(a[o + 1 + i]) << (8n * BigInt(i));
  }
  return [v, 1 + len];
}

/**
 * Read SCALE-encoded bytes (with compact length prefix)
 */
export function readScaleBytes(a: Uint8Array, o: number): [Uint8Array, number] {
  const [len, r] = readCompactInt(a, o);
  const L = Number(len);
  return [a.slice(o + r, o + r + L), r + L];
}

/**
 * Read Era encoding
 */
export function readEra(a: Uint8Array, o: number): [Era, number] {
  const first = a[o];
  if (first === 0x00) return [{ type: 'immortal' }, 1];
  
  const second = a[o + 1];
  const encoded = first + (second << 8);
  const period = 2 ** (encoded & 0b111111);
  const quant = Math.max(period >> 12, 1);
  const phase = (encoded >> 6) * quant;
  
  return [{ type: 'mortal', period, phase }, 2];
}

/**
 * Read MultiAddress
 */
export function readMultiAddress(a: Uint8Array, o: number): [MultiAddress, number] {
  const k = a[o];
  
  if (k === 0x00) return [{ type: 'Id', id: a.slice(o + 1, o + 33) }, 33];
  if (k === 0x01) {
    const [v, r] = readCompactInt(a, o + 1);
    return [{ type: 'Index', index: v }, 1 + r];
  }
  if (k === 0x02) {
    const [b, r] = readScaleBytes(a, o + 1);
    return [{ type: 'Raw', data: b }, 1 + r];
  }
  if (k === 0x03) {
    return [{ type: 'Address32', data: a.slice(o + 1, o + 33) }, 33];
  }
  if (k === 0x04) {
    return [{ type: 'Address20', data: a.slice(o + 1, o + 21) }, 21];
  }
  
  throw new Error(`Unknown MultiAddress kind 0x${k.toString(16)}`);
}

/**
 * Convert amount to human readable format
 */
export function toHuman(v: BN | bigint | string, decimals: number): string {
  const bn = BN.isBN(v) ? v : new BN(v.toString());
  const base = new BN(10).pow(new BN(decimals));
  const i = bn.div(base).toString();
  const fFull = bn.mod(base).toString().padStart(decimals, '0');
  const fTrim = fFull.replace(/0+$/, '');
  return fTrim ? `${i}.${fTrim}` : i;
}

/**
 * Find call header in extrinsic data aligned with metadata
 */
function findCallHeaderWithMeta(
  a: Uint8Array,
  start: number,
  callMap: Map<number, { callsCount: number }>,
  scanLimit = 4096
): { offset: number; pallet: number; call: number } | null {
  for (let sh = 0; sh <= scanLimit; sh++) {
    const i = start + sh;
    if (i + 2 > a.length) break;
    
    const pallet = a[i];
    const call = a[i + 1];
    const info = callMap.get(pallet);
    
    if (info && call < info.callsCount) {
      return { offset: i, pallet, call };
    }
  }
  return null;
}

/**
 * Parse extrinsic header and call (PQ-safe, metadata-aligned)
 */
export function parseExtrinsicHeaderAndCall(
  hex: string,
  ss58Format: number,
  decimals: number,
  callMap: Map<number, CallInfo>,
  symbol: string
): ParsedExtrinsic {
  try {
    const all = hexToU8a(hex);
    let o = 0;
    
    // Read compact length
    const [len, lenBytes] = readCompactInt(all, o);
    const L = Number(len);
    o += lenBytes;
    
    const x = all.slice(o, o + L);
    let i = 0;
    
    // Read version byte
    const version = x[i++];
    const isSigned = (version & 0x80) !== 0;
    const vers = version & 0x7f;
    
    if (vers !== 4 && vers !== 5) {
      console.warn(`Unsupported extrinsic version ${vers}`);
    }
    
    let sender: string | undefined;
    let tip: bigint | undefined;
    let nonce: bigint | undefined;
    let era: Era | undefined;
    
    if (isSigned) {
      // Read signer
      const [signer, sRead] = readMultiAddress(x, i);
      i += sRead;
      
      if (signer.type === 'Id') {
        sender = encodeAddress(signer.id, ss58Format);
      }
      
      // Read signature (opaque, PQ-safe)
      const [_sig, sigRead] = readScaleBytes(x, i);
      i += sigRead;
      
      // Read era
      const [_era, eraRead] = readEra(x, i);
      i += eraRead;
      era = _era;
      
      // Read nonce
      const [_nonce, nRead] = readCompactInt(x, i);
      i += nRead;
      nonce = _nonce;
      
      // Read tip
      const [_tip, tRead] = readCompactInt(x, i);
      i += tRead;
      tip = _tip;
      
      // Skip remaining signed extensions - we'll align with metadata next
    }
    
    // Create slim map for finding call header
    const slimMap = new Map(
      [...callMap.entries()].map(([k, v]) => [k, { callsCount: v.callsCount }])
    );
    
    // Find call header aligned with metadata
    const found = findCallHeaderWithMeta(x, i, slimMap, 4096);
    
    if (!found) {
      return {
        ok: false,
        rawLength: L,
        version,
        isSigned,
        callIndex: { pallet: x[i] ?? 0, call: x[i + 1] ?? 0 },
        sender,
        tipPlanck: tip?.toString(),
        tipHuman: tip ? `${toHuman(tip, decimals)} ${symbol}` : undefined,
        nonce: nonce?.toString(),
        era
      };
    }
    
    // We found the call
    i = found.offset;
    const palletIndex = x[i++];
    const callIndex = x[i++];
    
    const info = callMap.get(palletIndex)!;
    const section = info?.name;
    const method = info?.callNameByIndex.get(callIndex) ?? `call_${callIndex}`;
    
    return {
      ok: true,
      rawLength: L,
      version,
      isSigned,
      callIndex: { pallet: palletIndex, call: callIndex },
      section,
      method,
      sender,
      tipPlanck: tip?.toString(),
      tipHuman: tip ? `${toHuman(tip, decimals)} ${symbol}` : undefined,
      nonce: nonce?.toString(),
      era
    };
  } catch (e: any) {
    return {
      ok: false,
      rawLength: 0,
      version: 0,
      isSigned: false,
      callIndex: { pallet: 0, call: 0 },
      error: e?.message ?? String(e)
    };
  }
}