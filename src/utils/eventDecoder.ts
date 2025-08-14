// Event decoder utilities for decoding blockchain events
import { TypeRegistry } from '@polkadot/types/create';
import { Metadata } from '@polkadot/types/metadata';
import { UInt } from '@polkadot/types-codec';
import { encodeAddress } from '@polkadot/util-crypto';
import { hexToU8a } from './extrinsicParser';
import { toHuman } from './extrinsicParser';

// Types
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

/**
 * Decode events at a specific block
 */
export function decodeEventsAtBlock(
  registry: TypeRegistry,
  metadata: Metadata,
  eventsHex: string,
  ss58Format: number,
  decimals: number,
  symbol: string
): Map<number, ExtrinsicEvents> {
  // Set metadata on registry
  registry.setMetadata(metadata);
  
  // Register chain's big int type used in events (U512 on Resonance)
  registry.register({ U512: (UInt.with as any)(512) });
  
  // Decode the events
  const bytes = hexToU8a(eventsHex);
  const EventRecords = (registry as any).createType(
    'Vec<EventRecord>',
    bytes
  ) as any;
  
  // Group events by extrinsic index
  const byExtrinsic = new Map<number, ExtrinsicEvents>();
  
  for (const rec of EventRecords as any[]) {
    const phase = rec.phase;
    const event = rec.event;
    const section = event.section?.toString?.() ?? event.pallet?.toString?.() ?? '';
    const method = event.method?.toString?.() ?? event.variant?.toString?.() ?? '';
    
    // Only process events for extrinsics
    if (!phase.isApplyExtrinsic) continue;
    const idx = phase.asApplyExtrinsic.toNumber();
    
    // Handle balance transfer events
    if (section.toLowerCase() === 'balances' && method === 'Transfer') {
      const [from, to, amount] = event.data as any[];
      const amtStr = amount.toBn ? amount.toBn().toString() : amount.toString();
      
      const transfer: TransferEvent = {
        from: encodeAddress(from.toU8a(), ss58Format),
        to: encodeAddress(to.toU8a(), ss58Format),
        amountPlanck: amtStr,
        amountHuman: `${toHuman(amtStr, decimals)} ${symbol}`
      };
      
      const events = byExtrinsic.get(idx) ?? { transfers: [] };
      events.transfers.push(transfer);
      byExtrinsic.set(idx, events);
    }
    
    // Handle transaction fee paid events
    if (section === 'TransactionPayment' && method === 'TransactionFeePaid') {
      // (AccountId, Balance)
      const [payer, fee] = event.data as any[];
      const feeStr = fee.toBn ? fee.toBn().toString() : fee.toString();
      
      const feePaid: FeePaidEvent = {
        payer: encodeAddress(payer.toU8a(), ss58Format),
        amountPlanck: feeStr,
        amountHuman: `${toHuman(feeStr, decimals)} ${symbol}`
      };
      
      const events = byExtrinsic.get(idx) ?? { transfers: [] };
      events.feePaid = feePaid;
      byExtrinsic.set(idx, events);
    }
    
    // Handle custom events (like system.event95 for this chain)
    if (section === 'system' && method === 'event95') {
      // This is a custom transfer event for this chain
      // We'll need to decode it based on the chain's specific format
      console.log('[EventDecoder] Found custom transfer event system.event95');
      
      // For now, we'll skip custom event decoding
      // In a real implementation, you'd decode based on chain-specific logic
    }
  }
  
  return byExtrinsic;
}

/**
 * Extract transfer events from decoded events
 */
export function extractTransfers(
  eventsMap: Map<number, ExtrinsicEvents>
): TransferEvent[] {
  const transfers: TransferEvent[] = [];
  
  for (const [_idx, events] of eventsMap) {
    transfers.push(...events.transfers);
  }
  
  return transfers;
}

/**
 * Get events for a specific extrinsic
 */
export function getExtrinsicEvents(
  eventsMap: Map<number, ExtrinsicEvents>,
  extrinsicIndex: number
): ExtrinsicEvents | undefined {
  return eventsMap.get(extrinsicIndex);
}

/**
 * Check if an extrinsic has any events
 */
export function hasEvents(
  eventsMap: Map<number, ExtrinsicEvents>,
  extrinsicIndex: number
): boolean {
  const events = eventsMap.get(extrinsicIndex);
  return !!(events && (events.transfers.length > 0 || events.feePaid));
}