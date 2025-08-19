# Substrate Blockchain Explorer

A modern, real-time blockchain explorer for Substrate-based chains with support for quantum-safe cryptography.

## Overview

This explorer provides a unified interface for monitoring and analyzing multiple Substrate chains, with special support for quantum-safe chains using ML-DSA (Dilithium) signatures and Poseidon hashing.

## Features

### 🔍 Chain Exploration
- **Multi-chain Support**: Switch between different chains (Resonance, Quantus, Heisenberg)
- **Real-time Activity**: Live block and extrinsic monitoring via WebSocket connections
- **Block Details**: Deep dive into blocks, extrinsics, and events with full decoding
- **Search**: Find blocks by number or hash

### 📊 Analytics & Visualization
- **Runtime Timeline**: Visual history of runtime upgrades with version tracking
- **Mining Statistics**: Leaderboards and performance metrics for PoW chains
- **Chain Status**: Real-time display of block production, finalization, and runtime version

### 🛠 Advanced Features
- **Quantum-Safe Support**: Full support for ML-DSA signatures and Poseidon hashing
- **Runtime Discovery**: Automatic detection of all runtime versions used by a chain
- **Metadata Decoding**: Runtime-aware decoding of extrinsics and events
- **SS58 Address Formatting**: Proper address display for each chain

### 💎 User Experience
- **Dark/Light Theme**: Automatic theme detection with manual toggle
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Case-Insensitive Search**: Flexible block hash searching
- **Progressive Loading**: Smooth data loading with visual feedback

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm

### Installation
```bash
cd explorer
pnpm install
```

### Development
```bash
pnpm dev
```

The application will be available at `http://localhost:5173`

### Building
```bash
pnpm build
```

### Deployment
```bash
pnpm deploy  # Deploys to Cloudflare Pages
```

## Architecture

### Technology Stack
- **Frontend**: React 19 with TypeScript
- **Styling**: Bootstrap 5 with custom theme system
- **Build Tool**: Vite
- **Deployment**: Cloudflare Pages
- **Blockchain Interaction**: Direct WebSocket RPC connections

### Key Components
- **Activity Monitor**: Real-time block and transaction feed
- **Block Explorer**: Detailed block inspection with extrinsic decoding
- **Runtime Timeline**: Visual representation of runtime upgrade history
- **Chain Status**: Live chain metrics and health indicators

### Data Flow
1. WebSocket connections to chain endpoints for real-time data
2. Runtime metadata fetching for accurate decoding
3. Local caching of metadata and chain properties
4. Progressive enhancement with lazy loading

## Configuration

Chains are configured in `src/chains.ts`. Each chain requires:
- Display name
- Genesis hash
- WebSocket endpoints
- Optional: Indexer URL for mining statistics
- Optional: Treasury address

## Development

### Adding a New Chain
1. Add chain configuration to `src/chains.ts`
2. Ensure WebSocket endpoints are accessible
3. Add any chain-specific decoding logic if needed

### Code Structure
```
explorer/
├── src/
│   ├── components/     # React components
│   ├── decoders/       # Blockchain data decoders
│   ├── utils/          # Utility functions
│   ├── hooks/          # React hooks
│   ├── types.ts        # TypeScript definitions
│   └── chains.ts       # Chain configurations
├── public/             # Static assets
└── dist/              # Build output
```

## Contributing

Contributions are welcome! Please ensure:
- Code follows existing patterns
- TypeScript types are properly defined
- Components are responsive
- Dark/light themes are supported

## License

This project is open source. See LICENSE file for details.