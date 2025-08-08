import React, { useState } from 'react';
import { Card, Collapse, Badge } from 'react-bootstrap';
import './Block.css';
import type { BlockHeader, SubstrateEvent } from './types';

interface BlockProps {
  block: BlockHeader;
  index: number;
}

const Block: React.FC<BlockProps> = ({ block, index }) => {
  const [showEvents, setShowEvents] = useState(false);
  
  const truncateHash = (hash: string) => {
    if (hash.startsWith('pending_')) return 'Fetching hash...';
    if (hash.length <= 16) return hash;
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  const getAnimationDelay = () => {
    // Stagger animations for new blocks
    return `${index * 0.05}s`;
  };

  const formatEventData = (data: any): string => {
    if (typeof data === 'string') return data;
    if (typeof data === 'object' && data !== null) {
      return JSON.stringify(data, null, 2);
    }
    return String(data);
  };

  const getEventTypeColor = (section: string): string => {
    const colorMap: Record<string, string> = {
      'system': 'primary',
      'balances': 'success',
      'staking': 'warning',
      'session': 'info',
      'grandpa': 'danger',
      'imonline': 'secondary',
      'utility': 'dark'
    };
    return colorMap[section.toLowerCase()] || 'secondary';
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
            <div className={`font-monospace small text-truncate ${block.hash.startsWith('pending_') ? 'text-warning' : ''}`} title={block.hash}>
              {block.hash.startsWith('pending_') ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                  {truncateHash(block.hash)}
                </>
              ) : (
                truncateHash(block.hash)
              )}
            </div>
          </div>
          {block.events && block.events.length > 0 && (
            <div className="block-events mt-2">
              <div 
                className="events-header d-flex justify-content-between align-items-center"
                onClick={() => setShowEvents(!showEvents)}
                style={{ cursor: 'pointer' }}
              >
                <small className="text-muted">
                  <i className={`bi bi-chevron-${showEvents ? 'down' : 'right'} me-1`}></i>
                  {block.events.length} Event{block.events.length !== 1 ? 's' : ''}
                </small>
                <div className="events-preview-badges">
                  {!showEvents && block.events.slice(0, 2).map((event, idx) => (
                    <Badge 
                      key={idx} 
                      bg={getEventTypeColor(event.event.section)}
                      className="ms-1 small"
                    >
                      {event.event.section}
                    </Badge>
                  ))}
                  {!showEvents && block.events.length > 2 && (
                    <Badge bg="light" text="dark" className="ms-1 small">
                      +{block.events.length - 2}
                    </Badge>
                  )}
                </div>
              </div>
              <Collapse in={showEvents}>
                <div className="events-details mt-2">
                  {block.events.map((event, idx) => (
                    <div key={idx} className="event-detail-item p-2 mb-1">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <Badge bg={getEventTypeColor(event.event.section)} className="mb-1">
                            {event.event.section}.{event.event.method}
                          </Badge>
                          {event.phase.applyExtrinsic !== undefined && (
                            <small className="text-muted ms-2">
                              Extrinsic #{event.phase.applyExtrinsic}
                            </small>
                          )}
                          {event.phase.finalization && (
                            <small className="text-muted ms-2">Finalization</small>
                          )}
                          {event.phase.initialization && (
                            <small className="text-muted ms-2">Initialization</small>
                          )}
                        </div>
                      </div>
                      {event.event.data && event.event.data.length > 0 && (
                        <div className="event-data mt-1">
                          <pre className="mb-0 small">
                            {formatEventData(event.event.data)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Collapse>
            </div>
          )}
          <div className="block-connector"></div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Block;