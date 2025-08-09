# Routing Documentation

## Overview

The explorer application uses React Router v6 for navigation. The routing structure is designed to provide a hierarchical navigation through chains and their associated data.

## Route Structure

```
/
├── /chains                                    # List all available chains
├── /chains/:chainId                          # Individual chain overview
├── /chains/:chainId/activity                 # Chain activity (blocks & events)
└── /chains/:chainId/block/:blockNumberOrHash # Block details
```

## Routes

### Home Route
- **Path**: `/`
- **Component**: Redirects to `/chains`
- **Description**: The root path automatically redirects users to the chains list

### Chains List
- **Path**: `/chains`
- **Component**: `Chains.tsx`
- **Description**: Displays all available chains in a card grid layout
- **Features**:
  - Shows chain display name, ID, and genesis hash
  - Lists available endpoints for each chain
  - Links to individual chain pages

### Individual Chain
- **Path**: `/chains/:chainId`
- **Component**: `Chain.tsx`
- **Parameters**:
  - `chainId`: The chain identifier (e.g., "resonance", "quantus")
- **Description**: Shows detailed information about a specific chain
- **Features**:
  - Chain metadata (name, genesis hash, endpoints)
  - List of available tools/routes for the chain
  - Currently includes link to Activity page

### Chain Activity
- **Path**: `/chains/:chainId/activity`
- **Component**: `Activity.tsx`
- **Parameters**:
  - `chainId`: The chain identifier
- **Description**: Real-time view of blocks and events for the chain
- **Features**:
  - WebSocket connection to chain endpoints
  - Live block updates
  - Event decoding and display
  - Manual block querying

### Block Details
- **Path**: `/chains/:chainId/block/:blockNumberOrHash`
- **Component**: `BlockDetail.tsx`
- **Parameters**:
  - `chainId`: The chain identifier
  - `blockNumberOrHash`: Block number or block hash
- **Description**: Detailed view of a specific block
- **Features**:
  - Block metadata
  - Decoded events
  - Raw hex data view

## Navigation Components

### Header Navigation
The `Header.tsx` component provides:
- **Logo/Brand**: Links to `/chains`
- **Chains Dropdown**: 
  - "View All Chains" option → `/chains`
  - Direct links to each chain's activity page
- **Breadcrumb Navigation**: Shows current location with friendly names

### Breadcrumb Examples
- `/chains` → "chains"
- `/chains/resonance` → "chains > Resonance"
- `/chains/resonance/activity` → "chains > Resonance > activity"

## Adding New Routes

To add a new route:

1. Create the component in `src/`
2. Import it in `App.tsx`
3. Add the route definition:
```tsx
<Route path="/chains/:chainId/new-feature" element={<NewFeature />} />
```

4. Update the `availableRoutes` array in `Chain.tsx` to include the new route:
```tsx
{
  path: `/chains/${chain.name}/new-feature`,
  name: 'New Feature',
  description: 'Description of the feature',
  icon: 'bi-icon-name'
}
```

## Chain Identification

Chains can be identified by:
- **Name**: Lowercase identifier (e.g., "resonance")
- **Genesis Hash**: Full genesis hash
- **Display Name**: Human-friendly name (e.g., "Resonance")

The routing system uses the chain name in URLs for readability.

## Error Handling

### Invalid Chain
If a user navigates to `/chains/invalid-chain`, the `Chain.tsx` component will:
- Display an error alert
- Provide a link back to the chains list

### Invalid Routes
Unmatched routes will result in a React Router 404 error.

## Theme Awareness

All route components use the theme-aware utility classes from `theme-utils.ts` to ensure proper appearance in both light and dark themes.