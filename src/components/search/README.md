# Search Component

This directory contains the search functionality for the blockchain explorer, designed specifically for Substrate-based chains.

## Overview

The search component provides intelligent pattern detection and routing for various blockchain identifiers:

- **Account Addresses** - SS58 format addresses (47-48 characters)
- **Block Numbers** - Numeric block heights
- **Block Hashes** - 0x-prefixed 64-character hex strings
- **Extrinsic Hashes** - 0x-prefixed 64-character hex strings

## Components

### BasicSearch

The main search component that provides:

- **Pattern Detection** - Automatically identifies the type of input
- **Confidence Scoring** - Ranks suggestions by likelihood
- **Recent Searches** - Stores up to 10 recent searches in localStorage
- **Mobile Responsive** - Toggleable search on mobile devices
- **Keyboard Navigation** - Arrow keys to navigate, Enter to select, Esc to close
- **Chain Context Aware** - Maintains current chain context when navigating

## Usage

The search component is integrated into the main Header and automatically available on all pages.

### Desktop Experience
- Search bar is always visible in the header
- Type to see suggestions with confidence scores
- Click or press Enter to navigate to results

### Mobile Experience
- Tap the search icon to open the search overlay
- Full-screen search experience
- Tap X or outside to close

## Pattern Detection

The component uses regex patterns to identify input types:

```typescript
// SS58 Address (Substrate accounts)
/^[1-9A-HJ-NP-Za-km-z]{47,48}$/

// Hex Hash (blocks and extrinsics)
/^0x[0-9a-fA-F]{64}$/

// Block Number
/^\d+$/
```

## Navigation

Based on the detected pattern, the search navigates to:

- **Account**: `/chains/{chainId}/account/{address}`
- **Block (by number or hash)**: `/chains/{chainId}/block/{identifier}`
- **Extrinsic**: `/chains/{chainId}/extrinsic/{hash}`

## Future Enhancements

### SmartSearch Component

A more advanced search component (`SmartSearch.tsx`) is included but requires additional dependencies:

- Apollo Client for GraphQL queries
- Real-time verification of identifiers
- Enhanced suggestion accuracy

To enable SmartSearch:
1. Install dependencies: `npm install @apollo/client graphql lodash @types/lodash`
2. Update the import in `index.ts`
3. Replace `BasicSearch` with `SmartSearch` in the Header

### Additional Features

Potential improvements:
- Fuzzy matching for partial inputs
- Search history sync across devices
- Advanced filters (date ranges, amounts, etc.)
- Multi-chain search
- ENS/identity resolution
- Copy/paste detection
- Search analytics