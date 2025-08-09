# Event Decoder System

This directory contains the enhanced event decoding system for the Substrate blockchain explorer. The decoder transforms raw SCALE-encoded event data into human-readable, structured information.

## Overview

The event decoder system provides:

- **Automatic decoding** of common Substrate events
- **Human-readable formatting** for addresses, balances, and other data types
- **Extensible architecture** for adding new event types
- **Debug utilities** for analyzing unknown events
- **Error recovery** with helpful context when decoding fails

## Architecture

### Core Components

1. **`eventDecoder.ts`** - Main decoder implementation
   - `ScaleDecoder` class for reading SCALE-encoded data
   - `EventDecoder` registry for event-specific decoders
   - Type-specific formatters (AccountId, Balance, etc.)

2. **`debugUtils.ts`** - Debugging and analysis tools
   - Event analysis functions
   - Hex dump utilities
   - Unknown event pattern detection

### Supported Types

The decoder handles common Substrate types:

- **Basic Types**: u8, u32, u64, u128, bool
- **Compact Encoding**: Compact<u32>, Compact<u64>, Compact<u128>
- **AccountId**: 32-byte account identifiers with shortened display
- **Balance**: Compact-encoded amounts with decimal formatting
- **Vectors**: Variable-length arrays of any type
- **Options**: Optional values

## Supported Events

The decoder currently supports events from these pallets:

### System Pallet
- `ExtrinsicSuccess` - Dispatched when an extrinsic executes successfully
- `ExtrinsicFailed` - Dispatched when an extrinsic fails
- `NewAccount` - A new account was created
- `KilledAccount` - An account was removed

### Balances Pallet
- `Transfer` - Transfer between accounts
- `Deposit` - Deposit into an account
- `Withdraw` - Withdrawal from an account
- `Reserved` - Balance reserved
- `Unreserved` - Balance unreserved
- `Endowed` - Account endowed with initial balance
- `DustLost` - Account balance too low, dust removed

### Staking Pallet
- `Rewarded` - Staking rewards paid
- `Slashed` - Validator slashed
- `Bonded` - Funds bonded for staking
- `Unbonded` - Funds unbonded from staking

### Democracy Pallet
- `Proposed` - New proposal submitted
- `Started` - Referendum started
- `Passed` - Referendum passed
- `NotPassed` - Referendum failed
- `Delegated` - Votes delegated
- `Undelegated` - Delegation removed

### Treasury Pallet
- `Awarded` - Treasury proposal awarded
- `Rejected` - Treasury proposal rejected
- `Burnt` - Excess funds burnt
- `Deposit` - Funds deposited to treasury

### Other Pallets
- **Session**: NewSession
- **Timestamp**: Set
- **Identity**: IdentitySet, JudgementGiven, SubIdentityAdded
- **Grandpa**: NewAuthorities, Paused, Resumed
- **ImOnline**: HeartbeatReceived, AllGood, SomeOffline
- **Multisig**: MultisigExecuted, MultisigApproval
- **Proxy**: ProxyAdded, ProxyRemoved
- **Utility**: BatchCompleted, BatchInterrupted

## Usage

### Basic Usage

The decoder is automatically used by the BlockEvents component:

```typescript
import { decodeEnhancedEvents } from './decoders/eventDecoder';

// Decode events from hex data
const events = decodeEnhancedEvents(hexData);
```

### Adding New Event Decoders

To add support for a new event:

```typescript
import { EventDecoder } from './decoders/eventDecoder';

// Register a decoder for a specific event
EventDecoder.registerDecoder('palletName.EventName', (decoder) => {
  // Read fields in order
  const account = decoder.readAccountId();
  const amount = decoder.readBalance();
  const index = decoder.readU32();
  
  // Return structured data
  return {
    account,  // Will be formatted as "0x1234...5678"
    amount,   // Will be formatted as "1,234.56"
    index     // Will be displayed as number
  };
});
```

### Debugging Unknown Events

For events without decoders:

```typescript
import { debugAnalyzeEvents, analyzeUnknownEvent } from './decoders/debugUtils';

// Analyze all events in a block
const debugInfo = debugAnalyzeEvents(eventHex);

// Analyze a specific unknown event
const analysis = analyzeUnknownEvent(palletIndex, eventIndex, eventData);
// Returns hints about the event structure
```

## Display Format

### Before (Raw Data)
```
balances.Transfer
["0x1234...","0x5678...","0x1000000000000"]
```

### After (Decoded)
```
balances.Transfer
From: 0x1234abcd...ef01
To: 0x5678efgh...2345  
Amount: 4,096
```

## Type Formatting

Different types are formatted for readability:

- **AccountId**: `0x1234abcd...ef01` (shortened with full address on hover)
- **Balance**: `1,234.567` (with decimals, assuming 12 decimal places)
- **Timestamps**: `2023-11-04T12:34:56.789Z` (ISO format)
- **Enums**: `"Normal"` instead of `0`
- **Booleans**: `"Yes"/"No"` for certain contexts

## Error Handling

When decoding fails, the system:

1. Logs the error with context
2. Falls back to displaying raw hex data
3. Provides hints about possible structure
4. Shows analysis for unknown events

Example of unknown event display:
```
Raw Data: 0x1234abcd...
Hints:
- Pallet index: 50, Event index: 3
- Data contains at least one AccountId (32 bytes)
- First field appears to be compact-encoded
```

## Future Improvements

Potential enhancements:

1. **Metadata Integration**: Automatically generate decoders from chain metadata
2. **Custom Type Support**: Handle chain-specific custom types
3. **Batch Decoding**: Optimize for decoding multiple events
4. **Versioning**: Support different decoder versions for runtime upgrades
5. **Export Functionality**: Export decoded events to JSON/CSV

## Contributing

When adding new decoders:

1. Add the decoder to `eventDecoder.ts`
2. Update the pallet/event name mappings
3. Add examples to `examples.md`
4. Test with real event data
5. Update this README with the new events

## Testing

Test decoders with known event data:

```typescript
// Create test event
const testEvent = createTestEvent('balances', 'Transfer', [
  accountIdBytes,
  accountIdBytes,
  compactAmount
]);

// Validate decoded output
const validation = validateDecodedEvent(decodedEvent);
console.log(validation.valid, validation.issues);
```
