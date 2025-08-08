import React from 'react';
import { Card } from 'react-bootstrap';
import './Block.css';
import type { BlockHeader } from './types';

interface BlockProps {
  block: BlockHeader;
  index: number;
}

const Block: React.FC<BlockProps> = ({ block, index }) => {
  const truncateHash = (hash: string) => {
    if (hash.length <= 16) return hash;
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  const getAnimationDelay = () => {
    // Stagger animations for new blocks
    return `${index * 0.05}s`;
  };

  return (
    <div 
      className="block-node"
      style={{ animationDelay: getAnimationDelay() }}
    >
      <Card className="block-card">
        <Card.Body className="p-3">
          <div className="d-flex justify-content-between align-items-start mb-2">
            <div className="block-number">
              #{block.number}
            </div>
            {block.timestamp && (
              <small className="text-muted">
                {new Date(block.timestamp).toLocaleTimeString()}
              </small>
            )}
          </div>
          <div className="block-hash">
            <small className="text-muted">Hash:</small>
            <div className="font-monospace small text-truncate" title={block.hash}>
              {truncateHash(block.hash)}
            </div>
          </div>
          <div className="block-connector"></div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Block;