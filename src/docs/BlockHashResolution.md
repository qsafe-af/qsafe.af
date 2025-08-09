# Block Hash Resolution in BlockDetail Component

## Overview

The BlockDetail component supports accessing blocks by either their block number or block hash. This document explains how the component resolves block identifiers and the fix implemented for proper hash tracking.

## The Problem

When accessing a block by its number (e.g., `/chains/resonance/block/115241`), the component needs to:
1. First query the chain to get the block hash for that number
2. Use the hash to query the actual block data
3. Use the same hash to query the block's events

The issue was that the block hash obtained in step 1 wasn't being properly preserved for step 3, causing the events query to fail with "Invalid params" error.

## The Solution

### State Management

Added a state variable to track the resolved block hash:
```typescript
const [resolvedBlockHash, setResolvedBlockHash] = useState<string | null>(null);
```

### Query Flow

1. **Block Number Input**: When the route contains a block number:
   - Call `chain_getBlockHash` with the block number
   - Store the returned hash in `resolvedBlockHash` state
   - Use this hash for subsequent queries

2. **Block Hash Input**: When the route contains a block hash:
   - Directly use the hash from the URL
   - Store it in `resolvedBlockHash` for consistency

3. **Events Query**: Always use the `resolvedBlockHash` for querying events:
   ```typescript
   const blockHash = resolvedBlockHash || blockNumberOrHash;
   ```

## URL Formats

The component supports two URL formats:

### By Block Number
```
/chains/:chainId/block/:blockNumber
Example: /chains/resonance/block/115241
```

### By Block Hash
```
/chains/:chainId/block/:blockHash
Example: /chains/resonance/block/0x398e230d73a6fc31fb0d5c377951781c83ce0e9d607bb27e0c601d30d44f909a
```

## Validation

The component includes validation for both formats:

### Block Number Validation
- Must be a positive integer
- Must be reasonable size (< 999999999)
- Shows helpful error if block doesn't exist

### Block Hash Validation
- Must start with '0x'
- Must be at least 66 characters (0x + 64 hex chars)
- Shows error for invalid format

## Error Messages

Enhanced error messages provide better context:

- **Block not found by number**: "Block #115241 not found. The block may not exist yet or may have been pruned."
- **Invalid params**: Translates to user-friendly message based on input type
- **Invalid format**: Specific messages for malformed numbers or hashes

## WebSocket Query Sequence

For block number input:
```
1. → chain_getBlockHash([115241])
2. ← { result: "0x398e230d..." }
3. → chain_getBlock(["0x398e230d..."])
4. ← { result: { block: { header: { number: "0x1c241" } } } }
5. → state_getStorage(["0x26aa394e...", "0x398e230d..."])
6. ← { result: "0x1c0212065..." }
```

For block hash input:
```
1. → chain_getBlock(["0x398e230d..."])
2. ← { result: { block: { header: { number: "0x1c241" } } } }
3. → state_getStorage(["0x26aa394e...", "0x398e230d..."])
4. ← { result: "0x1c0212065..." }
```

## Best Practices

1. **Always validate input**: Check format before making RPC calls
2. **Preserve hash through flow**: Use state to track resolved hash
3. **Clear state on reset**: Reset `resolvedBlockHash` when reconnecting
4. **Provide context in errors**: Help users understand what went wrong

## Testing

To test the fix:

1. **Test with block number**: Navigate to `/chains/resonance/block/115241`
2. **Test with block hash**: Navigate to `/chains/resonance/block/0x398e...`
3. **Test with invalid number**: Try `/chains/resonance/block/999999999`
4. **Test with invalid hash**: Try `/chains/resonance/block/invalid`

All scenarios should now work correctly or show appropriate error messages.