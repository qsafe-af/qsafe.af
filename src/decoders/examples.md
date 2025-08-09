# Enhanced Event Decoder Examples

This document shows examples of how the enhanced event decoder improves the display of blockchain events.

## Before (Raw Event Data)

Previously, events were displayed with minimal decoding:

```
system.ExtrinsicSuccess
Raw data starts at byte 123

balances.Transfer  
from: 0x1234abcd...
to: 0x5678efgh...
```

## After (Enhanced Decoded Events)

With the enhanced decoder, events now display structured, meaningful data:

### System Events

**system.ExtrinsicSuccess**
- Dispatch Info:
  - Weight: 125000
  - Class: Normal
  - Pays Fee: Yes

**system.ExtrinsicFailed**
- Dispatch Error:
  - Type: Module
  - Module: 10
  - Error: 3
- Dispatch Info:
  - Weight: 125000
  - Class: Normal
  - Pays Fee: No

**system.NewAccount**
- Account: 0x1234abcd...ef01

### Balance Events

**balances.Transfer**
- From: 0x1234abcd...ef01
- To: 0x5678efgh...2345
- Amount: 1000.5

**balances.Deposit**
- Who: 0x1234abcd...ef01
- Amount: 500.25

**balances.Reserved**
- Who: 0x5678efgh...2345
- Amount: 100

### Staking Events

**staking.Rewarded**
- Stash: 0xabcdef01...4567
- Amount: 50.125

**staking.Bonded**
- Stash: 0x12345678...abcd
- Amount: 10000

### Session Events

**session.NewSession**
- Session Index: 1234

### Timestamp Events

**timestamp.Set**
- Now: 1699123456789
- Timestamp: 2023-11-04T12:34:56.789Z

### Democracy Events

**democracy.Proposed**
- Proposal Index: 42
- Deposit: 1000

**democracy.Started**
- Referendum Index: 15
- Threshold: SuperMajorityApprove

**democracy.Delegated**
- Who: 0x1234abcd...ef01
- Target: 0x5678efgh...2345

### Treasury Events

**treasury.Awarded**
- Proposal Index: 5
- Award: 5000
- Beneficiary: 0xabcdef01...4567

**treasury.Burnt**
- Burnt Funds: 250

### Identity Events

**identity.IdentitySet**
- Who: 0x1234abcd...ef01

**identity.JudgementGiven**
- Target: 0x5678efgh...2345
- Registrar Index: 2

### Multisig Events

**multisig.MultisigExecuted**
- Approving: 0x1234abcd...ef01
- Timepoint:
  - Height: 12345
  - Index: 2
- Multisig: 0xabcdef01...4567
- Call Hash: 0x12345678...abcd
- Result: Success

### Proxy Events

**proxy.ProxyAdded**
- Delegator: 0x1234abcd...ef01
- Delegatee: 0x5678efgh...2345
- Proxy Type: Governance
- Delay: 100

## Features

1. **Human-Readable Values**: Balances are displayed with decimal points instead of raw integers
2. **Formatted Addresses**: Account IDs show shortened format with full address on hover
3. **Structured Data**: Complex data is displayed in a hierarchical, easy-to-read format
4. **Type-Specific Formatting**: Different data types (amounts, timestamps, enums) are formatted appropriately
5. **Extensible**: New event types can be easily added to the decoder registry
6. **Debug Support**: Unknown events show analysis hints about their structure
7. **Error Recovery**: Failed decodings show raw hex data with helpful context

## Adding New Event Decoders

To add support for a new event type, register a decoder in `eventDecoder.ts`:

```typescript
EventDecoder.registerDecoder('palletName.EventName', (decoder) => {
  const field1 = decoder.readAccountId();
  const field2 = decoder.readBalance();
  const field3 = decoder.readU32();
  
  return {
    field1,
    field2,
    field3
  };
});
```

The decoder will automatically format AccountId and Balance types for display.

## Debugging Unknown Events

When the decoder encounters an unknown event, it provides helpful analysis:

```
Raw Data: 0x1234abcd...
Hints:
- Data contains at least one AccountId (32 bytes)
- First field appears to be compact-encoded
- Possible zero value at offset 64
```

## Debug Utilities

The decoder includes debug utilities for development:

```typescript
import { debugAnalyzeEvents, hexDump } from './decoders/debugUtils';

// Analyze events in a block
const debugInfo = debugAnalyzeEvents(eventHex);
console.log(debugInfo);

// Get hex dump of event data
const dump = hexDump(eventData);
console.log(dump);
```

## Supported Event Types

The enhanced decoder currently supports events from these pallets:

- **System**: ExtrinsicSuccess, ExtrinsicFailed, NewAccount, KilledAccount
- **Balances**: Transfer, Deposit, Withdraw, Reserved, Unreserved, Endowed, DustLost
- **Staking**: Rewarded, Slashed, Bonded, Unbonded
- **Session**: NewSession
- **Timestamp**: Set
- **Democracy**: Proposed, Tabled, Started, Passed, NotPassed, Cancelled, Delegated, Undelegated
- **Treasury**: Proposed, Spending, Awarded, Rejected, Burnt, Rollover, Deposit
- **Identity**: IdentitySet, IdentityCleared, IdentityKilled, JudgementRequested, JudgementGiven, SubIdentityAdded
- **Grandpa**: NewAuthorities, Paused, Resumed
- **ImOnline**: HeartbeatReceived, AllGood, SomeOffline
- **Multisig**: NewMultisig, MultisigApproval, MultisigExecuted, MultisigCancelled
- **Proxy**: ProxyExecuted, ProxyAdded, ProxyRemoved
- **Utility**: BatchCompleted, BatchInterrupted

More pallets can be easily added by extending the decoder registry.