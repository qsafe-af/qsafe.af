// Event decoder utilities based on proven reference implementation
// Handles runtime-specific event decoding with metadata

import { xxhashAsU8a, encodeAddress } from '@polkadot/util-crypto';
import { TypeRegistry } from '@polkadot/types/create';
import { Metadata } from '@polkadot/types/metadata';
import { UInt } from '@polkadot/types-codec';
import { hexToU8a, toHuman } from './extrinsicDecoder';

/** ---------- Event types ---------- */
export interface TransferEvent {
  from: string;
  to: string;
  amountPlanck: string;
  amountHuman?: string;
}

export interface FeePaidEvent {
  payer: string;
  amountPlanck: string;
  amountHuman?: string;
}

export interface ExtrinsicEvents {
  transfers: TransferEvent[];
  feePaid?: FeePaidEvent;
}

/** ---------- Storage key helpers ---------- */
/**
 * Generate the storage key for System.Events
 */
export function systemEventsStorageKey(): `0x${string}` {
  const p = xxhashAsU8a('System', 128);
  const m = xxhashAsU8a('Events', 128);
  const key = new Uint8Array(p.length + m.length);
  key.set(p, 0);
  key.set(m, p.length);
  const hex = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
  return ('0x' + hex) as `0x${string}`;
}

/** ---------- Event decoding ---------- */
/**
 * Decode events at a specific block
 * Returns a map of extrinsic index to events
 */
export function decodeEventsAtBlock(
  registry: TypeRegistry,
  metadata: Metadata,
  eventsHex: string,
  ss58: number,
  decimals: number
): Map<number, ExtrinsicEvents> {
  registry.setMetadata(metadata);
  // Register chain's big int type used in events (U512 on Resonance)
  registry.register({ U512: UInt.with(512 as any) });

  const bytes = hexToU8a(eventsHex);
  const EventRecords = registry.createType(
    'Vec<EventRecord>',
    bytes
  ) as any;

  const byEx = new Map<number, ExtrinsicEvents>();

  for (const rec of EventRecords as any[]) {
    const phase = rec.phase;
    const event = rec.event;
    const section = event.section?.toString?.() ?? event.pallet?.toString?.() ?? '';
    const method = event.method?.toString?.() ?? event.variant?.toString?.() ?? '';

    if (!phase.isApplyExtrinsic) continue;
    const idx = phase.asApplyExtrinsic.toNumber();

    if (section.toLowerCase() === 'balances' && method === 'Transfer') {
      const [from, to, amount] = event.data;
      const amtStr = amount.toBn ? amount.toBn().toString() : amount.toString();
      const t: TransferEvent = {
        from: encodeAddress(from.toU8a(), ss58),
        to: encodeAddress(to.toU8a(), ss58),
        amountPlanck: amtStr,
        amountHuman: `${toHuman(amtStr, decimals)}`,
      };
      const e = byEx.get(idx) ?? { transfers: [] };
      e.transfers.push(t);
      byEx.set(idx, e);
    }

    if (section === 'TransactionPayment' && method === 'TransactionFeePaid') {
      // (AccountId, Balance)
      const [payer, fee] = event.data;
      const feeStr = fee.toBn ? fee.toBn().toString() : fee.toString();
      const f: FeePaidEvent = {
        payer: encodeAddress(payer.toU8a(), ss58),
        amountPlanck: feeStr,
        amountHuman: `${toHuman(feeStr, decimals)}`,
      };
      const e = byEx.get(idx) ?? { transfers: [] };
      e.feePaid = f;
      byEx.set(idx, e);
    }
  }
  return byEx;
}

/**
 * Get events for a specific extrinsic
 */
export function getExtrinsicEvents(
  eventsByExtrinsic: Map<number, ExtrinsicEvents>,
  extrinsicIndex: number
): ExtrinsicEvents | undefined {
  return eventsByExtrinsic.get(extrinsicIndex);
}

/**
 * Format event for display
 */
export function formatEvent(event: TransferEvent | FeePaidEvent, symbol: string): string {
  if ('from' in event) {
    // Transfer event
    return `Transfer ${event.amountHuman} ${symbol} from ${event.from} to ${event.to}`;
  } else {
    // Fee paid event
    return `Fee ${event.amountHuman} ${symbol} paid by ${event.payer}`;
  }
}