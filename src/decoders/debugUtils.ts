import type { SubstrateEvent } from '../types';
import { ScaleDecoder, EventDecoder } from './eventDecoder';
import { getPalletName, getEventName } from '../generated/resonanceRuntimeMappings';

/**
 * Debug utilities for event decoding
 */

export interface EventDebugInfo {
  eventIndex: number;
  palletIndex: number;
  palletName: string;
  eventName: string;
  phase: any;
  rawDataHex: string;
  rawDataBytes: number[];
  decodedData: any;
  error?: string;
}

/**
 * Analyzes raw event data and provides debug information
 */
export function debugAnalyzeEvents(hex: string): EventDebugInfo[] {
  if (!hex || hex === '0x') return [];

  const decoder = new ScaleDecoder(hex);
  const debugInfo: EventDebugInfo[] = [];

  try {
    const eventCount = Number(decoder.readCompact());
    console.log(`[DEBUG] Total events in block: ${eventCount}`);

    for (let i = 0; i < eventCount; i++) {
      let info: EventDebugInfo;

      try {
        // Read phase
        const phaseType = decoder.readU8();
        let phase: any = { type: phaseType };
        
        if (phaseType === 0x00) {
          phase = { applyExtrinsic: decoder.readU32() };
        } else if (phaseType === 0x01) {
          phase = { finalization: true };
        } else if (phaseType === 0x02) {
          phase = { initialization: true };
        }

        // Read event
        const palletIndex = decoder.readU8();
        const eventIndex = decoder.readU8();

        // Try to determine event data length
        const remainingBytes = decoder.getRemainingBytes();
        let dataLength = 0;

        // Look for next event marker
        if (i < eventCount - 1) {
          for (let j = 0; j < remainingBytes.length; j++) {
            if (remainingBytes[j] <= 0x02 && j + 2 < remainingBytes.length) {
              // Possible next event
              dataLength = j;
              break;
            }
          }
        }

        if (dataLength === 0) {
          dataLength = Math.min(remainingBytes.length, 256);
        }

        const eventData = decoder.readBytes(dataLength);
        const eventDataHex = '0x' + Array.from(eventData).map(b => b.toString(16).padStart(2, '0')).join('');

        info = {
          eventIndex: i,
          palletIndex,
          palletName: getPalletName(palletIndex),
          eventName: getEventName(palletIndex, eventIndex),
          phase,
          rawDataHex: eventDataHex,
          rawDataBytes: Array.from(eventData),
          decodedData: null
        };

        // Try to decode
        try {
          info.decodedData = EventDecoder.decodeEvent(info.palletName, info.eventName, eventData);
        } catch (decodeError) {
          info.error = decodeError instanceof Error ? decodeError.message : 'Unknown decode error';
        }

      } catch (error) {
        info = {
          eventIndex: i,
          palletIndex: -1,
          palletName: 'error',
          eventName: 'error',
          phase: { error: true },
          rawDataHex: '',
          rawDataBytes: [],
          decodedData: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      debugInfo.push(info);
      console.log(`[DEBUG] Event ${i}:`, info);
    }
  } catch (error) {
    console.error('[DEBUG] Failed to analyze events:', error);
  }

  return debugInfo;
}

/**
 * Generates a hex dump of event data for debugging
 */
export function hexDump(data: Uint8Array | string, bytesPerLine: number = 16): string {
  const bytes = typeof data === 'string' 
    ? new Uint8Array(data.slice(2).match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || [])
    : data;

  const lines: string[] = [];
  
  for (let offset = 0; offset < bytes.length; offset += bytesPerLine) {
    const lineBytes = bytes.slice(offset, offset + bytesPerLine);
    const hex = Array.from(lineBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(lineBytes)
      .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
      .join('');
    
    lines.push(
      `${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(bytesPerLine * 3 - 1, ' ')}  |${ascii}|`
    );
  }

  return lines.join('\n');
}

/**
 * Attempts to identify unknown events by analyzing their data patterns
 */
export function analyzeUnknownEvent(palletIndex: number, eventIndex: number, data: Uint8Array): {
  possibleStructure: string[];
  hints: string[];
} {
  const hints: string[] = [];
  const possibleStructure: string[] = [];
  
  // Add context about the event
  hints.push(`Pallet index: ${palletIndex}, Event index: ${eventIndex}`);

  // Check for common patterns
  if (data.length >= 32) {
    // Likely contains AccountId
    hints.push('Data contains at least one AccountId (32 bytes)');
    possibleStructure.push('AccountId');
  }

  if (data.length === 64) {
    hints.push('Possibly two AccountIds (Transfer-like event)');
    possibleStructure.push('AccountId', 'AccountId');
  }

  if (data.length > 64) {
    hints.push('Complex event with multiple fields');
    
    // Check for compact encoding patterns
    const firstByte = data[0];
    if ((firstByte & 0x03) < 3) {
      hints.push('First field appears to be compact-encoded');
      possibleStructure.push('Compact<u32/u64/u128>');
    }
  }

  // Look for patterns that might indicate specific types
  let offset = 0;
  while (offset < data.length) {
    // Check for possible compact values
    const byte = data[offset];
    if ((byte & 0x03) === 0 && byte >> 2 === 0) {
      hints.push(`Possible zero value at offset ${offset}`);
    }
    offset++;
  }

  return { possibleStructure, hints };
}

/**
 * Creates a test event for decoder development
 */
export function createTestEvent(section: string, method: string, data: any[]): SubstrateEvent {
  return {
    phase: { applyExtrinsic: 0 },
    event: {
      section,
      method,
      data
    },
    topics: []
  };
}

/**
 * Validates decoded event data
 */
export function validateDecodedEvent(event: SubstrateEvent): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check basic structure
  if (!event.phase) {
    issues.push('Missing phase information');
  }

  if (!event.event) {
    issues.push('Missing event data');
  } else {
    if (!event.event.section) {
      issues.push('Missing event section');
    }
    if (!event.event.method) {
      issues.push('Missing event method');
    }
    if (!event.event.data && event.event.data !== null) {
      issues.push('Missing event data array');
    }
  }

  // Check phase validity
  if (event.phase) {
    const hasValidPhase = 
      event.phase.applyExtrinsic !== undefined ||
      event.phase.finalization === true ||
      event.phase.initialization === true;
    
    if (!hasValidPhase) {
      issues.push('Invalid phase information');
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Helper to get pallet name by index
 */


/**
 * Helper to get event name by indices
 */


/**
 * Console log helper for event debugging
 */
export function logEventDebug(event: SubstrateEvent, prefix: string = ''): void {
  console.group(`${prefix}Event: ${event.event.section}.${event.event.method}`);
  console.log('Phase:', event.phase);
  console.log('Data:', event.event.data);
  console.log('Topics:', event.topics);
  console.groupEnd();
}

/**
 * Export debug info to clipboard-friendly format
 */
export function exportDebugInfo(events: EventDebugInfo[]): string {
  const output: string[] = ['=== Event Debug Information ==='];
  
  events.forEach((event, index) => {
    output.push('');
    output.push(`Event #${index}`);
    output.push(`  Pallet: ${event.palletName} (${event.palletIndex})`);
    output.push(`  Method: ${event.eventName} (${event.eventIndex})`);
    output.push(`  Phase: ${JSON.stringify(event.phase)}`);
    output.push(`  Raw Data: ${event.rawDataHex}`);
    if (event.decodedData) {
      output.push(`  Decoded: ${JSON.stringify(event.decodedData, null, 2)}`);
    }
    if (event.error) {
      output.push(`  Error: ${event.error}`);
    }
  });
  
  return output.join('\n');
}