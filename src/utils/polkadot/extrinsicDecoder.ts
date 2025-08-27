// Extrinsic decoder utilities based on proven reference implementation
// Handles runtime-specific decoding with metadata alignment

import { encodeAddress } from "@polkadot/util-crypto";
import { BN } from "@polkadot/util";
import type { CallInfo } from "../metadata";

/** ---------- Types ---------- */
export type Era =
  | { type: "immortal" }
  | { type: "mortal"; period: number; phase: number };

export type MultiAddress =
  | { type: "Id"; id: Uint8Array }
  | { type: "Index"; index: bigint }
  | { type: "Raw"; data: Uint8Array }
  | { type: "Address32"; data: Uint8Array }
  | { type: "Address20"; data: Uint8Array };

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

/** ---------- SCALE helpers ---------- */
export function hexToU8a(hex: string): Uint8Array {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (s.length % 2) throw new Error("Invalid hex");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.substr(i * 2, 2), 16);
  }
  return out;
}

export function readCompactInt(a: Uint8Array, o: number): [bigint, number] {
  if (o >= a.length) {
    console.warn(
      `[readCompactInt] Offset ${o} is beyond array length ${a.length}`,
    );
    return [0n, 0];
  }

  const b0 = a[o];
  const mode = b0 & 3;
  if (mode === 0) return [BigInt(b0 >>> 2), 1];
  if (mode === 1) {
    if (o + 1 >= a.length) return [0n, 1];
    return [BigInt(((a[o] | (a[o + 1] << 8)) >>> 2) >>> 0), 2];
  }
  if (mode === 2) {
    if (o + 3 >= a.length) return [0n, 1];
    return [
      BigInt(
        ((a[o] | (a[o + 1] << 8) | (a[o + 2] << 16) | (a[o + 3] << 24)) >>>
          2) >>>
          0,
      ),
      4,
    ];
  }
  const len = (b0 >>> 2) + 4;
  if (len > 67 || o + len >= a.length) {
    console.warn(`[readCompactInt] Invalid length ${len} at offset ${o}`);
    return [0n, 1];
  }
  let v = 0n;
  for (let i = 0; i < len; i++) {
    if (o + 1 + i >= a.length) break;
    v |= BigInt(a[o + 1 + i]) << (8n * BigInt(i));
  }
  return [v, 1 + len];
}

export function readScaleBytes(a: Uint8Array, o: number): [Uint8Array, number] {
  const [len, r] = readCompactInt(a, o);
  const L = Number(len);

  // Bounds checking
  if (o + r + L > a.length) {
    console.warn(
      `[readScaleBytes] Attempting to read ${L} bytes at offset ${o + r}, but only ${a.length - o - r} bytes available`,
    );
    // Return what we can read
    return [a.slice(o + r), a.length - o];
  }

  return [a.slice(o + r, o + r + L), r + L];
}

export function readEra(a: Uint8Array, o: number): [Era, number] {
  const first = a[o];
  if (first === 0x00) return [{ type: "immortal" }, 1];
  const second = a[o + 1];
  const encoded = first + (second << 8);
  const period = 2 ** (encoded & 0b111111);
  const quant = Math.max(period >> 12, 1);
  const phase = (encoded >> 6) * quant;
  return [{ type: "mortal", period, phase }, 2];
}

export function readMultiAddress(
  a: Uint8Array,
  o: number,
): [MultiAddress, number] {
  const k = a[o];
  if (k === 0x00) return [{ type: "Id", id: a.slice(o + 1, o + 33) }, 33];
  if (k === 0x01) {
    const [v, r] = readCompactInt(a, o + 1);
    return [{ type: "Index", index: v }, 1 + r];
  }
  if (k === 0x02) {
    const [b, r] = readScaleBytes(a, o + 1);
    return [{ type: "Raw", data: b }, 1 + r];
  }
  if (k === 0x03) {
    return [{ type: "Address32", data: a.slice(o + 1, o + 33) }, 33];
  }
  if (k === 0x04) {
    return [{ type: "Address20", data: a.slice(o + 1, o + 21) }, 21];
  }
  throw new Error(`Unknown MultiAddress kind 0x${k.toString(16)}`);
}

/** ---------- Formatting ---------- */
export function toHuman(v: BN | bigint | string, decimals: number): string {
  const bn = BN.isBN(v) ? v : new BN(v.toString());
  const base = new BN(10).pow(new BN(decimals));
  const i = bn.div(base).toString();
  const fFull = bn.mod(base).toString().padStart(decimals, "0");
  const fTrim = fFull.replace(/0+$/, "");
  return fTrim ? `${i}.${fTrim}` : i;
}

/** ---------- Metadata helpers ---------- */

/**
 * Align to call header by validating (pallet, call) against metadata
 */
export function findCallHeaderWithMeta(
  a: Uint8Array,
  start: number,
  callMap: Map<number, { callsCount: number }>,
  scanLimit = 4096,
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

/** ---------- Parser (PQ-safe, metadata-aligned) ---------- */

/**
 * Parse extrinsic header and call information
 * This is the main entry point for decoding extrinsics
 */
export function parseExtrinsicHeaderAndCall(
  hex: string,
  ss58: number,
  decimals: number,
  callMap: Map<number, CallInfo>,
  symbol: string,
): ParsedExtrinsic {
  try {
    const all = hexToU8a(hex);
    let o = 0;
    const [len, lenBytes] = readCompactInt(all, o);
    const L = Number(len);
    o += lenBytes;
    const x = all.slice(o, o + L);
    let i = 0;

    const version = x[i++];
    const isSigned = (version & 0x80) !== 0;
    const vers = version & 0x7f;
    if (vers !== 4 && vers !== 5) {
      throw new Error(`Unsupported version ${vers}`);
    }

    let sender: string | undefined;
    let tip: bigint | undefined;
    let nonce: bigint | undefined;
    let era: Era | undefined;

    if (isSigned) {
      const [signer, sRead] = readMultiAddress(x, i);
      i += sRead;
      if (signer.type === "Id") {
        sender = encodeAddress(signer.id, ss58);
      }
      // Robust signature skip: try classic and PQ candidates, validate via metadata alignment
      {
        const sigStart = i;
        const slimMap = new Map<number, { callsCount: number }>(
          [...callMap.entries()].map(([k, v]) => [
            k,
            { callsCount: v.callsCount },
          ]),
        );
        // From pq.yml: ML-DSA-87 signature-with-public concatenation
        // signature: 4595 bytes, public_key: 2592 bytes, total: 7187 bytes
        const PQ_SIG_WITH_PUB = 7187;
        const candidates: number[] = [
          1 + 64, // Ed25519/Sr25519 (tagged)
          1 + 65, // ECDSA (tagged)
          PQ_SIG_WITH_PUB, // PQ raw signature-with-public (no tag)
          1 + PQ_SIG_WITH_PUB, // PQ tagged signature
        ].filter((len) => sigStart + len < x.length);

        let chosen: {
          offsetAfterNonce: number;
          _era: Era;
          _nonce: bigint;
        } | null = null;

        for (const len of candidates) {
          let j = sigStart + len;
          try {
            const [eraC, eraReadC] = readEra(x, j);
            j += eraReadC;
            const [nonceC, nReadC] = readCompactInt(x, j);
            j += nReadC;
            // Peek tip to estimate where call starts and validate alignment
            const [tipC, tReadC] = readCompactInt(x, j);
            const callStart = j + tReadC;
            const found = findCallHeaderWithMeta(x, callStart, slimMap, 512);
            // Sanity: nonce reasonable and metadata-aligned call header found
            if (found && nonceC < 1n << 64n) {
              chosen = { offsetAfterNonce: j, _era: eraC, _nonce: nonceC };
              break;
            }
          } catch {
            // ignore candidate parse errors
          }
        }

        if (chosen) {
          era = chosen._era;
          nonce = chosen._nonce;
          // Set i so that tip reading begins next
          i = chosen.offsetAfterNonce;
        } else {
          // Fallback to classic MultiSignature skipping by tag
          const sigKind = x[i];
          const sigLen = sigKind === 0x02 ? 1 + 65 : 1 + 64;
          i += sigLen;
          const [_eraF, eraReadF] = readEra(x, i);
          i += eraReadF;
          era = _eraF;
          const [_nonceF, nReadF] = readCompactInt(x, i);
          i += nReadF;
          nonce = _nonceF;
        }
      }

      // For v5, there might be additional signed extensions before tip
      // Try to detect if we're reading the right data
      const [_tip, tRead] = readCompactInt(x, i);

      // Validate tip is reasonable - tips over 1000 tokens are extremely rare
      const MAX_REASONABLE_TIP = 1000n * 10n ** BigInt(decimals);
      if (_tip > MAX_REASONABLE_TIP) {
        console.warn(
          "[ExtrinsicDecoder] Unreasonably large tip detected:",
          _tip.toString(),
        );
        console.warn(
          "[ExtrinsicDecoder] Hex context:",
          Array.from(x.slice(Math.max(0, i - 10), Math.min(i + 20, x.length)))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" "),
        );

        // For v5, there might be an extra compact length field before tip
        if (vers === 5 && tRead === 1 && _tip < 256n) {
          // This might actually be a length prefix, skip it and read actual tip
          i += tRead;
          const [_actualTip, actualTRead] = readCompactInt(x, i);
          if (_actualTip <= MAX_REASONABLE_TIP) {
            tip = _actualTip;
            i += actualTRead;
          } else {
            // Still unreasonable, default to 0
            tip = 0n;
            i += tRead;
          }
        } else {
          // Default to 0 for unreasonable tips
          tip = 0n;
          i += tRead;
        }
      } else {
        tip = _tip;
        i += tRead;
      }

      // signed extensions beyond tip are ignored; we align using metadata next
    }

    const slimMap = new Map<number, { callsCount: number }>(
      [...callMap.entries()].map(([k, v]) => [k, { callsCount: v.callsCount }]),
    );
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
        era,
      };
    }

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
      era,
    };
  } catch (e) {
    return {
      ok: false,
      rawLength: 0,
      version: 0,
      isSigned: false,
      callIndex: { pallet: 0, call: 0 },
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
