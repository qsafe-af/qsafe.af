import React from 'react';
import { Alert } from 'react-bootstrap';
import Block from './Block';
import type { BlockHeader, ConnectionStatus } from './types';

interface BlocksProps {
  blocks: BlockHeader[];
  connectionStatus: ConnectionStatus;
  hasEndpoints: boolean;
}

const Blocks: React.FC<BlocksProps> = ({ blocks, connectionStatus, hasEndpoints }) => {
  if (!hasEndpoints) {
    return (
      <Alert variant="info">
        No endpoints configured for this chain.
      </Alert>
    );
  }

  if (blocks.length === 0) {
    return (
      <p className="text-muted">
        {connectionStatus === "connected" 
          ? "Waiting for new blocks..."
          : "Connecting to blockchain..."}
      </p>
    );
  }

  return (
    <div className="blocks-container">
      {blocks.map((block, index) => (
        <Block 
          key={`${block.number}-${index}`} 
          block={block} 
          index={index} 
        />
      ))}
    </div>
  );
};

export default Blocks;