# Event Decoder Troubleshooting Guide

This guide helps diagnose and fix common issues with the Substrate event decoder.

## Common Issues

### 1. Extrinsic Numbers Show as #0

**Symptom**: All events show "Extrinsic #0" regardless of the actual extrinsic index.

**Cause**: The phase data is using compact encoding, not fixed U32.

**Solution**: In `eventDecoder.ts`, ensure phase reading uses compact encoding:
```typescript
if (phaseType === 0x00) {
  phase = { applyExtrinsic: Number(decoder.readCompact()) };
}
```

### 2. Events Display as [object object]

**Symptom**: Event data shows "[object object]" instead of formatted data.

**Cause**: Objects are being converted to strings without proper formatting.

**Solution**: Check the display component (`BlockEvents.tsx`) to ensure it properly formats objects:
```typescript
if (typeof data === "object") {
  return formatDecodedData(data);
}
```

### 3. Events Show "Raw data starts at byte X"

**Symptom**: Events display raw data messages instead of decoded information.

**Cause**: The enhanced decoder is not being used, or the event type is not recognized.

**Solution**: 
1. Ensure `decodeEnhancedEvents` is imported and used instead of `decodeStandardEvents`
2. Add decoder for the specific event type
3. Check that the pallet and event indices are mapped correctly

### 4. Unknown Pallet/Event Names

**Symptom**: Events show as "pallet84.event154" instead of meaningful names.

**Cause**: The pallet index is not in the mapping table.

**Solution**: Add the pallet to the `palletNames` mapping in `eventDecoder.ts`:
```typescript
const palletNames: Record<number, string> = {
  // ...
  84: 'contracts',
  // ...
};
```

### 5. Incorrect Event Data

**Symptom**: Event data values are wrong or in unexpected format.

**Cause**: The decoder is reading the wrong types or in wrong order.

**Solution**: 
1. Check the chain's metadata or documentation for correct event structure
2. Update the decoder to match the expected types
3. Use debug utilities to analyze the raw data

## Debugging Tools

### 1. Analyze Raw Event Data

Use the debug utilities to understand event structure:

```typescript
import { debugAnalyzeEvents } from './decoders/debugUtils';

const analysis = debugAnalyzeEvents(eventHex);
console.log(analysis);
```

### 2. Check Event Hex Data

In the browser console, look for logs like:
```
Got events response for block 115138: 0x1c0212065...
```

### 3. Verify Decoder Registration

Ensure your decoder is registered:
```typescript
EventDecoder.registerDecoder('palletName.EventName', (decoder) => {
  // decoder implementation
});
```

## Adding New Event Decoders

### Step 1: Identify the Event

Find the pallet and event indices from the raw data or chain metadata.

### Step 2: Create Decoder

```typescript
EventDecoder.registerDecoder('palletName.EventName', (decoder) => {
  // Read fields in the order they appear in the event
  const field1 = decoder.readAccountId();
  const field2 = decoder.readBalance();
  
  return {
    field1,
    field2
  };
});
```

### Step 3: Map Indices

Add to the mapping tables:
```typescript
const palletNames = {
  // ...
  XX: 'palletName'
};

const eventNames = {
  palletName: {
    YY: 'EventName'
  }
};
```

## Event Data Types

### Common Types and Their Decoders

- **AccountId**: `decoder.readAccountId()` - 32 bytes
- **Balance**: `decoder.readBalance()` - Compact encoded
- **BlockNumber**: `decoder.readCompact()` or `decoder.readU32()`
- **Boolean**: `decoder.readBool()` - 1 byte
- **Compact**: `decoder.readCompact()` - Variable length
- **Hash**: `decoder.readBytes(32)` - 32 bytes
- **Vec<T>**: `decoder.readVec(() => readT())`
- **Option<T>**: `decoder.readOption(() => readT())`

### Type Indicators

Look for these patterns in hex data:
- `0x00` - Often indicates a phase type or enum variant
- 32-byte sequences - Usually AccountIds or Hashes
- Compact encoding - First byte `& 0x03` indicates mode

## Testing Event Decoders

### Manual Testing

1. Find a block with the event type
2. Use the manual block query tool
3. Check if the event decodes correctly

### Unit Testing

```typescript
import { ScaleDecoder } from './eventDecoder';

// Test data (hex string)
const testHex = '0x00123456...';
const decoder = new ScaleDecoder(testHex);

// Test your decoder
const result = YourDecoder(decoder);
expect(result).toEqual(expectedValue);
```

## Performance Considerations

### Event Data Length Detection

The decoder tries to detect event boundaries. If having issues:

1. Check the heuristics in `decodeEnhancedEvents`
2. Adjust the maximum pallet index check
3. Consider using metadata for exact lengths

### Large Events

For events with lots of data:
- Implement pagination in the UI
- Consider truncating displayed data
- Add "show more" functionality

## Chain-Specific Issues

### Custom Pallets

Chains often have custom pallets at higher indices (>100). Add these to your mappings.

### Runtime Upgrades

Event structures can change with runtime upgrades. Consider:
- Versioned decoders
- Fallback to generic decoder
- Runtime version detection

## Getting Help

When reporting issues, provide:

1. The event hex data
2. Block number and chain
3. Expected vs actual output
4. Any console errors

## Quick Fixes

### Event Not Decoding?
1. Check if enhanced decoder is being used
2. Verify pallet/event indices are mapped
3. Add specific decoder if missing

### Wrong Data Format?
1. Check type order in decoder
2. Verify compact vs fixed encoding
3. Check for optional fields

### Display Issues?
1. Check formatEventData function
2. Verify object formatting
3. Look for [object object] conversions