# Block Detail View

The Block Detail view provides comprehensive information about a specific block in the blockchain, including all events that occurred within that block.

## Overview

The Block Detail component (`BlockDetail.tsx`) is a dedicated page for viewing detailed information about a single block. It can be accessed by clicking on any block number in the Activity view or by navigating directly to a block via URL.

## Navigation

### Route Pattern
```
/chains/:chainId/block/:blockNumberOrHash
```

### Examples
- `/chains/resonance/block/115138` - View block by number
- `/chains/resonance/block/0x1234abcd...` - View block by hash

### Access Methods
1. **From Activity View**: Click on any block number (e.g., #115138)
2. **From Manual Query**: After querying a block, click "View Block Details" button
3. **Direct URL**: Navigate directly by entering the URL

## Features

### Block Information
- **Block Number**: The sequential block number
- **Block Hash**: The cryptographic hash of the block
- **Event Count**: Total number of events in the block
- **Connection Status**: Real-time WebSocket connection indicator

### Event Display
Events are displayed with enhanced decoding:

1. **Event Header**
   - Colored badges for different pallets (system, balances, utility, etc.)
   - Event name in format `pallet.method`
   - Extrinsic number (hidden for system.extrinsicsuccess #0)
   - Phase information (initialization, finalization)

2. **Event Data**
   - Fully decoded and formatted data
   - Human-readable account addresses (shortened with full address on hover)
   - Formatted balances with proper decimal places
   - Structured display of complex data types

3. **Raw Data**
   - Collapsible section showing raw hex data
   - Useful for debugging or verification

### Special Handling

#### Extrinsic #0 Label
The component hides the "Extrinsic #0" label for `system.extrinsicsuccess` events to reduce visual clutter, as these are typically implicit success events for the block itself.

#### Unknown Events
Events without specific decoders are analyzed and displayed with:
- Detected patterns (AccountIds, amounts, etc.)
- Helpful hints about the data structure
- Raw hex data as fallback

## Technical Implementation

### Data Flow
1. Component receives `chainId` and `blockNumberOrHash` from URL params
2. Establishes WebSocket connection to chain endpoint
3. If block number provided:
   - Queries `chain_getBlockHash` to get hash
   - Then queries block data
4. If hash provided:
   - Directly queries block data
5. Queries `state_getStorage` for events at the block
6. Decodes events using enhanced decoder
7. Displays formatted results

### Error Handling
- Invalid chain or block parameters show error message
- WebSocket connection errors are displayed
- Decoding failures fall back to raw data display
- Loading states with spinner during data fetch

## Integration with Activity View

The Block Detail view complements the Activity view by providing:
- Detailed view of events that are collapsed in Activity
- Dedicated space for analyzing specific blocks
- Shareable URLs for specific blocks
- Better formatting for complex event data

## Future Enhancements

Potential improvements:
- Extrinsics display alongside events
- Block metadata (author, timestamp, etc.)
- Navigation to previous/next blocks
- Export functionality for block data
- Search within block events