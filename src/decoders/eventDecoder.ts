import type { SubstrateEvent } from '../types';
import { getPalletName, getEventName } from '../generated/resonanceRuntimeMappings';

// Common Substrate types
export interface AccountId {
  value: string;
  display: string;
}

export interface Balance {
  value: bigint;
  display: string;
}

export interface DecodedEventData {
  [key: string]: any;
}

// SCALE decoder utilities
export class ScaleDecoder {
  private data: Uint8Array;
  protected offset: number;

  constructor(data: Uint8Array | string) {
    if (typeof data === 'string') {
      const hex = data.startsWith('0x') ? data.slice(2) : data;
      this.data = new Uint8Array(
        hex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
    } else {
      this.data = data;
    }
    this.offset = 0;
  }

  // Basic readers
  readU8(): number {
    if (this.offset >= this.data.length) {
      throw new Error('Buffer underflow');
    }
    return this.data[this.offset++];
  }

  readU32(): number {
    const b1 = this.readU8();
    const b2 = this.readU8();
    const b3 = this.readU8();
    const b4 = this.readU8();
    return b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
  }

  readU64(): bigint {
    const low = BigInt(this.readU32());
    const high = BigInt(this.readU32());
    return low | (high << 32n);
  }

  readU128(): bigint {
    const b1 = BigInt(this.readU64());
    const b2 = BigInt(this.readU64());
    return b1 | (b2 << 64n);
  }

  readCompact(): bigint {
    const first = this.readU8();
    const mode = first & 0x03;

    if (mode === 0) {
      return BigInt(first >> 2);
    } else if (mode === 1) {
      const second = this.readU8();
      return BigInt((first >> 2) | (second << 6));
    } else if (mode === 2) {
      const b2 = this.readU8();
      const b3 = this.readU8();
      const b4 = this.readU8();
      return BigInt((first >> 2) | (b2 << 6) | (b3 << 14) | (b4 << 22));
    } else {
      // Read the remaining bytes based on the upper 6 bits of first byte
      const bytesToRead = ((first >> 2) & 0x3f) + 4;
      let value = 0n;
      for (let i = 0; i < bytesToRead && i < 16; i++) {
        value |= BigInt(this.readU8()) << BigInt(i * 8);
      }
      return value;
    }
  }

  readBytes(length: number): Uint8Array {
    if (this.offset + length > this.data.length) {
      throw new Error('Buffer underflow');
    }
    const bytes = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  readAccountId(): AccountId {
    const bytes = this.readBytes(32);
    const hex = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return {
      value: '0x' + hex,
      display: '0x' + hex.slice(0, 8) + '...' + hex.slice(-6)
    };
  }

  readBalance(): Balance {
    const value = this.readCompact();
    return {
      value,
      display: formatBalance(value)
    };
  }

  readBool(): boolean {
    return this.readU8() !== 0;
  }

  readOption<T>(readFn: () => T): T | null {
    const hasValue = this.readU8();
    return hasValue === 1 ? readFn() : null;
  }

  readVec<T>(readFn: () => T): T[] {
    const length = Number(this.readCompact());
    const result: T[] = [];
    for (let i = 0; i < length; i++) {
      result.push(readFn());
    }
    return result;
  }

  hasMoreData(): boolean {
    return this.offset < this.data.length;
  }

  getRemainingBytes(): Uint8Array {
    return this.data.slice(this.offset);
  }
}

// Balance formatting
function formatBalance(value: bigint, decimals: number = 12): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  
  if (fraction === 0n) {
    return whole.toString();
  }
  
  const fractionStr = fraction.toString().padStart(decimals, '0');
  const trimmedFraction = fractionStr.replace(/0+$/, '');
  
  if (trimmedFraction.length === 0) {
    return whole.toString();
  }
  
  return `${whole}.${trimmedFraction}`;
}

// Event decoder registry
export class EventDecoder {
  private static decoders: Map<string, (decoder: ScaleDecoder) => DecodedEventData> = new Map();

  static {
    // System pallet events
    this.registerDecoder('system.ExtrinsicSuccess', (decoder) => {
      const weight = decoder.readCompact();
      const classRaw = decoder.readU8();
      const paysFeeRaw = decoder.readU8();
      
      const dispatchClass = ['Normal', 'Operational', 'Mandatory'][classRaw] || `Unknown(${classRaw})`;
      const paysFee = ['Yes', 'No'][paysFeeRaw] || `Unknown(${paysFeeRaw})`;
      
      return {
        dispatchInfo: {
          weight: weight.toString(),
          class: dispatchClass,
          paysFee: paysFee
        }
      };
    });

    this.registerDecoder('system.ExtrinsicFailed', (decoder) => {
      // Dispatch error enum
      const errorType = decoder.readU8();
      let dispatchError: any = { type: 'Unknown' };
      
      if (errorType === 0) {
        // Module error
        const index = decoder.readU8();
        const error = decoder.readU8();
        dispatchError = {
          type: 'Module',
          index,
          error
        };
      } else if (errorType === 1) {
        dispatchError = { type: 'BadOrigin' };
      } else if (errorType === 2) {
        dispatchError = { type: 'CannotLookup' };
      } else if (errorType === 3) {
        dispatchError = { type: 'ConsumerRemaining' };
      } else if (errorType === 4) {
        dispatchError = { type: 'NoProviders' };
      } else if (errorType === 5) {
        dispatchError = { type: 'TooManyConsumers' };
      }
      
      // Dispatch info
      const weight = decoder.readCompact();
      const classRaw = decoder.readU8();
      const paysFeeRaw = decoder.readU8();
      
      const dispatchClass = ['Normal', 'Operational', 'Mandatory'][classRaw] || `Unknown(${classRaw})`;
      const paysFee = ['Yes', 'No'][paysFeeRaw] || `Unknown(${paysFeeRaw})`;
      
      return {
        dispatchError,
        dispatchInfo: {
          weight: weight.toString(),
          class: dispatchClass,
          paysFee: paysFee
        }
      };
    });

    this.registerDecoder('system.NewAccount', (decoder) => {
      const account = decoder.readAccountId();
      return { account };
    });

    this.registerDecoder('system.KilledAccount', (decoder) => {
      const account = decoder.readAccountId();
      return { account };
    });

    // Balances pallet events
    this.registerDecoder('balances.Transfer', (decoder) => {
      const from = decoder.readAccountId();
      const to = decoder.readAccountId();
      const amount = decoder.readBalance();
      return { from, to, amount };
    });

    this.registerDecoder('balances.Endowed', (decoder) => {
      const account = decoder.readAccountId();
      const freeBalance = decoder.readBalance();
      return { account, freeBalance };
    });

    this.registerDecoder('balances.DustLost', (decoder) => {
      const account = decoder.readAccountId();
      const amount = decoder.readBalance();
      return { account, amount };
    });

    this.registerDecoder('balances.Deposit', (decoder) => {
      const who = decoder.readAccountId();
      const amount = decoder.readBalance();
      return { who, amount };
    });

    this.registerDecoder('balances.Withdraw', (decoder) => {
      const who = decoder.readAccountId();
      const amount = decoder.readBalance();
      return { who, amount };
    });

    this.registerDecoder('balances.Reserved', (decoder) => {
      const who = decoder.readAccountId();
      const amount = decoder.readBalance();
      return { who, amount };
    });

    this.registerDecoder('balances.Unreserved', (decoder) => {
      const who = decoder.readAccountId();
      const amount = decoder.readBalance();
      return { who, amount };
    });

    // Staking pallet events
    this.registerDecoder('staking.Rewarded', (decoder) => {
      const stash = decoder.readAccountId();
      const amount = decoder.readBalance();
      return { stash, amount };
    });

    this.registerDecoder('staking.Slashed', (decoder) => {
      const staker = decoder.readAccountId();
      const amount = decoder.readBalance();
      return { staker, amount };
    });

    this.registerDecoder('staking.Bonded', (decoder) => {
      const stash = decoder.readAccountId();
      const amount = decoder.readBalance();
      return { stash, amount };
    });

    this.registerDecoder('staking.Unbonded', (decoder) => {
      const stash = decoder.readAccountId();
      const amount = decoder.readBalance();
      return { stash, amount };
    });

    // Session pallet events
    this.registerDecoder('session.NewSession', (decoder) => {
      const sessionIndex = decoder.readU32();
      return { sessionIndex };
    });

    // Timestamp pallet events  
    this.registerDecoder('timestamp.Set', (decoder) => {
      const now = decoder.readU64();
      const timestamp = new Date(Number(now));
      return { 
        now: now.toString(),
        timestamp: timestamp.toISOString()
      };
    });

    // Utility pallet events
    this.registerDecoder('utility.BatchCompleted', () => {
      return { status: 'All calls in batch completed successfully' };
    });

    this.registerDecoder('utility.BatchInterrupted', (decoder) => {
      const index = decoder.readU32();
      // Read dispatch error
      const errorType = decoder.readU8();
      let error: any = { type: 'Unknown' };
      
      if (errorType === 0) {
        const moduleIndex = decoder.readU8();
        const errorIndex = decoder.readU8();
        error = {
          type: 'Module',
          module: moduleIndex,
          error: errorIndex
        };
      }
      
      return { 
        failedIndex: index,
        error 
      };
    });

    this.registerDecoder('utility.ItemCompleted', () => {
      return { status: 'Call completed successfully' };
    });

    this.registerDecoder('utility.ItemFailed', (decoder) => {
      const errorType = decoder.readU8();
      let error: any = { type: 'Unknown' };
      
      if (errorType === 0) {
        const moduleIndex = decoder.readU8();
        const errorIndex = decoder.readU8();
        error = {
          type: 'Module',
          module: moduleIndex,
          error: errorIndex
        };
      }
      
      return { error };
    });

    this.registerDecoder('utility.DispatchedAs', (decoder) => {
      const result = decoder.readU8() === 0 ? 'Success' : 'Failed';
      return { result };
    });

    // Add common utility events that might have higher indices
    for (let i = 3; i <= 10; i++) {
      this.registerDecoder(`utility.Event${i}`, (decoder) => {
        // Try to decode as generic event with possible AccountId
        const remainingBytes = decoder.getRemainingBytes();
        if (remainingBytes.length >= 32) {
          const account = decoder.readAccountId();
          return { account, eventIndex: i };
        }
        return { eventIndex: i, rawData: `0x${Array.from(remainingBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` };
      });
    }

      // Contracts pallet events
      this.registerDecoder('contracts.Instantiated', (decoder) => {
        const deployer = decoder.readAccountId();
        const contract = decoder.readAccountId();
        return { deployer, contract };
      });

      this.registerDecoder('contracts.Terminated', (decoder) => {
        const contract = decoder.readAccountId();
        const beneficiary = decoder.readAccountId();
        return { contract, beneficiary };
      });

      this.registerDecoder('contracts.CodeStored', (decoder) => {
        const codeHash = decoder.readBytes(32);
        return { 
          codeHash: '0x' + Array.from(codeHash).map(b => b.toString(16).padStart(2, '0')).join('')
        };
      });

      this.registerDecoder('contracts.ContractEmitted', (decoder) => {
        const contract = decoder.readAccountId();
        const dataLength = Number(decoder.readCompact());
        const data = decoder.readBytes(dataLength);
        return { 
          contract,
          data: '0x' + Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('')
        };
      });

      this.registerDecoder('contracts.Called', (decoder) => {
        const caller = decoder.readAccountId();
        const contract = decoder.readAccountId();
        return { caller, contract };
      });

      this.registerDecoder('contracts.DelegateCalled', (decoder) => {
        const contract = decoder.readAccountId();
        const codeHash = decoder.readBytes(32);
        return { 
          contract,
          codeHash: '0x' + Array.from(codeHash).map(b => b.toString(16).padStart(2, '0')).join('')
        };
      });

      // Handle generic contracts events
      for (let i = 0; i <= 200; i++) {
        this.registerDecoder(`contracts.Event${i}`, (decoder) => {
          const remainingBytes = decoder.getRemainingBytes();
          if (remainingBytes.length >= 32) {
            const account = decoder.readAccountId();
            return { account, eventIndex: i };
          }
          return { eventIndex: i, rawData: `0x${Array.from(remainingBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` };
        });
      }

      // Democracy pallet events
      this.registerDecoder('democracy.Proposed', (decoder) => {
      const proposalIndex = decoder.readU32();
      const deposit = decoder.readBalance();
      return { proposalIndex, deposit };
    });

    this.registerDecoder('democracy.Tabled', (decoder) => {
      const proposalIndex = decoder.readU32();
      const deposit = decoder.readBalance();
      const depositors = decoder.readVec(() => decoder.readAccountId());
      return { proposalIndex, deposit, depositors };
    });

    this.registerDecoder('democracy.Started', (decoder) => {
      const refIndex = decoder.readU32();
      const threshold = decoder.readU8();
      const thresholdType = ['SuperMajorityApprove', 'SuperMajorityAgainst', 'SimpleMajority'][threshold] || `Unknown(${threshold})`;
      return { 
        referendumIndex: refIndex,
        threshold: thresholdType
      };
    });

    this.registerDecoder('democracy.Passed', (decoder) => {
      const refIndex = decoder.readU32();
      return { referendumIndex: refIndex };
    });

    this.registerDecoder('democracy.NotPassed', (decoder) => {
      const refIndex = decoder.readU32();
      return { referendumIndex: refIndex };
    });

    this.registerDecoder('democracy.Cancelled', (decoder) => {
      const refIndex = decoder.readU32();
      return { referendumIndex: refIndex };
    });

    this.registerDecoder('democracy.Delegated', (decoder) => {
      const who = decoder.readAccountId();
      const target = decoder.readAccountId();
      return { who, target };
    });

    this.registerDecoder('democracy.Undelegated', (decoder) => {
      const account = decoder.readAccountId();
      return { account };
    });

    // Treasury pallet events
    this.registerDecoder('treasury.Proposed', (decoder) => {
      const proposalIndex = decoder.readU32();
      return { proposalIndex };
    });

    this.registerDecoder('treasury.Spending', (decoder) => {
      const budgetRemaining = decoder.readBalance();
      return { budgetRemaining };
    });

    this.registerDecoder('treasury.Awarded', (decoder) => {
      const proposalIndex = decoder.readU32();
      const award = decoder.readBalance();
      const account = decoder.readAccountId();
      return { proposalIndex, award, beneficiary: account };
    });

    this.registerDecoder('treasury.Rejected', (decoder) => {
      const proposalIndex = decoder.readU32();
      const slashed = decoder.readBalance();
      return { proposalIndex, slashed };
    });

    this.registerDecoder('treasury.Burnt', (decoder) => {
      const burntFunds = decoder.readBalance();
      return { burntFunds };
    });

    this.registerDecoder('treasury.Rollover', (decoder) => {
      const rolloverBalance = decoder.readBalance();
      return { rolloverBalance };
    });

    this.registerDecoder('treasury.Deposit', (decoder) => {
      const value = decoder.readBalance();
      return { value };
    });

    // Identity pallet events
    this.registerDecoder('identity.IdentitySet', (decoder) => {
      const who = decoder.readAccountId();
      return { who };
    });

    this.registerDecoder('identity.IdentityCleared', (decoder) => {
      const who = decoder.readAccountId();
      const deposit = decoder.readBalance();
      return { who, deposit };
    });

    this.registerDecoder('identity.IdentityKilled', (decoder) => {
      const who = decoder.readAccountId();
      const deposit = decoder.readBalance();
      return { who, deposit };
    });

    this.registerDecoder('identity.JudgementRequested', (decoder) => {
      const who = decoder.readAccountId();
      const registrarIndex = decoder.readU32();
      return { who, registrarIndex };
    });

    this.registerDecoder('identity.JudgementUnrequested', (decoder) => {
      const who = decoder.readAccountId();
      const registrarIndex = decoder.readU32();
      return { who, registrarIndex };
    });

    this.registerDecoder('identity.JudgementGiven', (decoder) => {
      const target = decoder.readAccountId();
      const registrarIndex = decoder.readU32();
      return { target, registrarIndex };
    });

    this.registerDecoder('identity.RegistrarAdded', (decoder) => {
      const registrarIndex = decoder.readU32();
      return { registrarIndex };
    });

    this.registerDecoder('identity.SubIdentityAdded', (decoder) => {
      const sub = decoder.readAccountId();
      const main = decoder.readAccountId();
      const deposit = decoder.readBalance();
      return { sub, main, deposit };
    });

    this.registerDecoder('identity.SubIdentityRemoved', (decoder) => {
      const sub = decoder.readAccountId();
      const main = decoder.readAccountId();
      const deposit = decoder.readBalance();
      return { sub, main, deposit };
    });

    this.registerDecoder('identity.SubIdentityRevoked', (decoder) => {
      const sub = decoder.readAccountId();
      const main = decoder.readAccountId();
      const deposit = decoder.readBalance();
      return { sub, main, deposit };
    });

    // Grandpa pallet events
    this.registerDecoder('grandpa.NewAuthorities', (decoder) => {
      const authoritySet = decoder.readVec(() => ({
        authorityId: decoder.readBytes(32),
        weight: decoder.readU64()
      }));
      return { authoritySet };
    });

    this.registerDecoder('grandpa.Paused', () => {
      return { status: 'GRANDPA consensus paused' };
    });

    this.registerDecoder('grandpa.Resumed', () => {
      return { status: 'GRANDPA consensus resumed' };
    });

    // ImOnline pallet events
    this.registerDecoder('imonline.HeartbeatReceived', (decoder) => {
      const authorityId = decoder.readBytes(32);
      return { 
        authorityId: '0x' + Array.from(authorityId).map(b => b.toString(16).padStart(2, '0')).join('')
      };
    });

    this.registerDecoder('imonline.AllGood', () => {
      return { status: 'All validators are online' };
    });

    this.registerDecoder('imonline.SomeOffline', (decoder) => {
      const offline = decoder.readVec(() => ({
        validator: decoder.readAccountId(),
        identificationTuple: decoder.readBytes(32) // Simplified, actual structure may vary
      }));
      return { offline };
    });

    // Multisig pallet events
    this.registerDecoder('multisig.NewMultisig', (decoder) => {
      const approving = decoder.readAccountId();
      const multisig = decoder.readAccountId();
      const callHash = decoder.readBytes(32);
      return { 
        approving,
        multisig,
        callHash: '0x' + Array.from(callHash).map(b => b.toString(16).padStart(2, '0')).join('')
      };
    });

    this.registerDecoder('multisig.MultisigApproval', (decoder) => {
      const approving = decoder.readAccountId();
      const timepoint = {
        height: decoder.readU32(),
        index: decoder.readU32()
      };
      const multisig = decoder.readAccountId();
      const callHash = decoder.readBytes(32);
      return { 
        approving,
        timepoint,
        multisig,
        callHash: '0x' + Array.from(callHash).map(b => b.toString(16).padStart(2, '0')).join('')
      };
    });

    this.registerDecoder('multisig.MultisigExecuted', (decoder) => {
      const approving = decoder.readAccountId();
      const timepoint = {
        height: decoder.readU32(),
        index: decoder.readU32()
      };
      const multisig = decoder.readAccountId();
      const callHash = decoder.readBytes(32);
      const result = decoder.readU8() === 0 ? 'Success' : 'Failed';
      return { 
        approving,
        timepoint,
        multisig,
        callHash: '0x' + Array.from(callHash).map(b => b.toString(16).padStart(2, '0')).join(''),
        result
      };
    });

    this.registerDecoder('multisig.MultisigCancelled', (decoder) => {
      const cancelling = decoder.readAccountId();
      const timepoint = {
        height: decoder.readU32(),
        index: decoder.readU32()
      };
      const multisig = decoder.readAccountId();
      const callHash = decoder.readBytes(32);
      return { 
        cancelling,
        timepoint,
        multisig,
        callHash: '0x' + Array.from(callHash).map(b => b.toString(16).padStart(2, '0')).join('')
      };
    });

    // Proxy pallet events
    this.registerDecoder('proxy.ProxyExecuted', (decoder) => {
      const result = decoder.readU8() === 0 ? 'Success' : 'Failed';
      return { result };
    });

    this.registerDecoder('proxy.ProxyAdded', (decoder) => {
      const delegator = decoder.readAccountId();
      const delegatee = decoder.readAccountId();
      const proxyType = decoder.readU8();
      const delay = decoder.readU32();
      return { 
        delegator,
        delegatee,
        proxyType: ['Any', 'NonTransfer', 'Governance', 'Staking'][proxyType] || `Unknown(${proxyType})`,
        delay
      };
    });

    this.registerDecoder('proxy.ProxyRemoved', (decoder) => {
      const delegator = decoder.readAccountId();
      const delegatee = decoder.readAccountId();
      const proxyType = decoder.readU8();
      const delay = decoder.readU32();
      return { 
        delegator,
        delegatee,
        proxyType: ['Any', 'NonTransfer', 'Governance', 'Staking'][proxyType] || `Unknown(${proxyType})`,
        delay
      };
    });
  }

  static registerDecoder(
    eventKey: string, 
    decoder: (decoder: ScaleDecoder) => DecodedEventData
  ): void {
    this.decoders.set(eventKey, decoder);
  }

  static decodeEvent(
    section: string, 
    method: string, 
    data: Uint8Array | any[]
  ): DecodedEventData | any[] {
    const eventKey = `${section}.${method}`;
    let decoder = this.decoders.get(eventKey);
    
    if (!decoder) {
      // Try generic decoder for unknown events
      decoder = this.createGenericDecoder(section, method);
      if (!decoder) {
        // Return original data if no decoder is found
        return data instanceof Uint8Array ? [`0x${Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('')}`] : data;
      }
    }
    
    try {
      const scaleDecoder = new ScaleDecoder(data as Uint8Array);
      return decoder(scaleDecoder);
    } catch (error) {
      console.error(`Failed to decode ${eventKey}:`, error);
      // Try to provide more context about the error
      const errorInfo = {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventKey,
        dataLength: data instanceof Uint8Array ? data.length : 'N/A'
      };
      console.debug('Decoder error details:', errorInfo);
      return data instanceof Uint8Array ? [`0x${Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('')}`] : data;
    }
  }

  static createGenericDecoder(
    section: string,
    method: string
  ): ((decoder: ScaleDecoder) => DecodedEventData) | undefined {
    // Generic decoder that tries to decode common patterns
    return (decoder: ScaleDecoder) => {
      const remainingBytes = decoder.getRemainingBytes();
      const result: DecodedEventData = {
        _pallet: section,
        _method: method,
      };

      // Try to decode based on data length patterns
      if (remainingBytes.length === 0) {
        return { _info: 'No event data' };
      } else if (remainingBytes.length === 32) {
        // Likely an AccountId
        result.account = decoder.readAccountId();
      } else if (remainingBytes.length === 64) {
        // Likely two AccountIds
        result.account1 = decoder.readAccountId();
        result.account2 = decoder.readAccountId();
      } else if (remainingBytes.length > 64) {
        // Complex event, try to decode what we can
        let bytesRead = 0;
        
        // Check if it starts with AccountId(s)
        if (remainingBytes.length >= 32) {
          result.account = decoder.readAccountId();
          bytesRead += 32;
        }
        
        // If there's another 32 bytes, might be another AccountId
        if (remainingBytes.length - bytesRead >= 32) {
          const nextBytes = remainingBytes.slice(bytesRead, bytesRead + 32);
          // Check if it looks like an AccountId (not all zeros, not sequential)
          const isLikelyAccountId = nextBytes.some(b => b !== 0) && 
                                   !nextBytes.every((b, i) => i === 0 || b === nextBytes[i-1]);
          if (isLikelyAccountId) {
            result.account2 = decoder.readAccountId();
            bytesRead += 32;
          }
        }
        
        // Check if remaining data might be a compact-encoded value
        if (remainingBytes.length - bytesRead > 0) {
          const firstByte = remainingBytes[bytesRead];
          if ((firstByte & 0x03) < 3) {
            // Likely compact encoding
            try {
              result.value = decoder.readCompact().toString();
            } catch (e) {
              // If compact decoding fails, just show remaining as hex
            }
          }
        }
        
        // Add remaining bytes as hex if any
        if (decoder.hasMoreData()) {
          const remaining = decoder.getRemainingBytes();
          if (remaining.length > 0) {
            result._remainingData = `0x${Array.from(remaining).map(b => b.toString(16).padStart(2, '0')).join('')}`;
          }
        }
      } else {
        // Small data, just show as hex
        result._data = `0x${Array.from(remainingBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      }

      return result;
    };
  }
}

// Enhanced event decoding function
export function decodeEnhancedEvents(hex: string): SubstrateEvent[] {
  if (!hex || hex === '0x') return [];

  const decoder = new ScaleDecoder(hex);
  const events: SubstrateEvent[] = [];

  try {
    const eventCount = Number(decoder.readCompact());
    
    for (let i = 0; i < eventCount; i++) {
      // Read phase
      const phaseType = decoder.readU8();
      let phase: any = {};
      
      if (phaseType === 0x00) {
        phase = { applyExtrinsic: Number(decoder.readCompact()) };
      } else if (phaseType === 0x01) {
        phase = { finalization: true };
      } else if (phaseType === 0x02) {
        phase = { initialization: true };
      }
      
      // Read event
      const palletIndex = decoder.readU8();
      const eventIndex = decoder.readU8();
      
      const palletName = getPalletName(palletIndex);
      const eventName = getEventName(palletIndex, eventIndex);
      
      // Calculate data length and read event data
      const remainingData = decoder.getRemainingBytes();
      
      // Attempt to find the next event by looking for phase markers
      let eventDataLength = 0;
      if (i < eventCount - 1 && remainingData.length > 0) {
        // Look for the next phase byte pattern
        for (let j = 0; j < remainingData.length; j++) {
          if (remainingData[j] <= 0x02) {
            // Possible phase byte, check if followed by valid pallet index
            if (j + 1 < remainingData.length) {
              const possiblePallet = remainingData[j + 1];
              // Most pallets are under 200, but custom ones can be higher
              if (possiblePallet < 200 || (j + 2 < remainingData.length && remainingData[j + 2] < 100)) {
                // Likely found the next event
                eventDataLength = j;
                break;
              }
            }
          }
        }
      }
      
      // If we couldn't determine the length, use a reasonable default or all remaining
      if (eventDataLength === 0) {
        // For the last event, use all remaining data
        if (i === eventCount - 1) {
          eventDataLength = remainingData.length;
        } else {
          eventDataLength = Math.min(remainingData.length, 256);
        }
      }
      
      const eventData = decoder.readBytes(eventDataLength);
      
      // Decode the event data
      const decodedData = EventDecoder.decodeEvent(palletName, eventName, eventData);
      
      events.push({
        phase,
        event: {
          section: palletName,
          method: eventName,
          data: Array.isArray(decodedData) ? decodedData : [decodedData],
        },
        topics: [],
      });
    }
  } catch (error) {
    console.error('Error decoding events:', error);
  }
  
  return events;
}