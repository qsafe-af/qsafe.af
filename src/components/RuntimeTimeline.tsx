import React, { useState, useEffect } from 'react';
import { Card, Spinner, Alert, Badge, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { getCachedRuntimeSpans, getBlockTimestamps, clearRuntimeSpansCache } from '../runtime-discovery';
import type { RuntimeSpan } from '../runtime-discovery';
import { themeClasses } from '../theme-utils';

interface RuntimeTimelineProps {
  endpoint: string;
  chainName: string;
}

interface EnhancedRuntimeSpan extends RuntimeSpan {
  startTimestamp?: number;
  endTimestamp?: number;
  percentage?: number;
  isActive?: boolean;
}

const RuntimeTimeline: React.FC<RuntimeTimelineProps> = ({ endpoint, chainName }) => {
  const [spans, setSpans] = useState<EnhancedRuntimeSpan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number | null>(null);
  const [discoveryProgress, setDiscoveryProgress] = useState({ current: 0, total: 100, message: 'Initializing...' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchRuntimeSpans = async (forceRefresh = false) => {
      try {
        setLoading(!isRefreshing);
        setError(null);
        
        // Clear cache if force refresh
        if (forceRefresh) {
          clearRuntimeSpansCache(endpoint);
        }
        
        const runtimeSpans = await getCachedRuntimeSpans(endpoint, (current, total, message) => {
          setDiscoveryProgress({ current, total, message });
        });
        
        // Get current block height
        const ws = new WebSocket(endpoint);
        const getCurrentBlock = new Promise<number>((resolve, reject) => {
          ws.onopen = () => {
            ws.send(JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "chain_getHeader",
              params: []
            }));
          };
          ws.onmessage = (event) => {
            const response = JSON.parse(event.data);
            if (response.id === 1 && response.result) {
              const blockNumber = parseInt(response.result.number, 16);
              resolve(blockNumber);
              ws.close();
            }
          };
          ws.onerror = () => reject(new Error('WebSocket error'));
          setTimeout(() => {
            ws.close();
            reject(new Error('Timeout'));
          }, 5000);
        });

        const currentBlockHeight = await getCurrentBlock;
        setCurrentBlock(currentBlockHeight);

        // Batch fetch all timestamps for better performance
        const blockNumbers: number[] = [];
        runtimeSpans.forEach((span, index) => {
          // Special case: block 0 doesn't have reliable timestamp, use block 1 instead
          const startBlock = span.start_block === 0 ? 1 : span.start_block;
          blockNumbers.push(startBlock);
          
          // Check if this span is active
          const isActive = span.end_block >= currentBlockHeight || 
                          (index === runtimeSpans.length - 1 && span.end_block === runtimeSpans[runtimeSpans.length - 1].end_block);
          
          if (!isActive || span.end_block < currentBlockHeight) {
            blockNumbers.push(span.end_block);
          }
        });
        const timestamps = await getBlockTimestamps(endpoint, blockNumbers);

        // Calculate percentages and enhance spans
        const totalBlocks = currentBlockHeight;
        const enhancedSpans: EnhancedRuntimeSpan[] = runtimeSpans.map((span, index) => {
          const blockRange = span.end_block - span.start_block + 1;
          const percentage = (blockRange / totalBlocks) * 100;
          
          // Get timestamps from batch results
          // Special case: block 0 doesn't have reliable timestamp, use block 1 instead
          const startBlock = span.start_block === 0 ? 1 : span.start_block;
          const startTimestamp = timestamps.get(startBlock) || undefined;
          const isActive = span.end_block >= currentBlockHeight || 
                         (index === runtimeSpans.length - 1 && span.end_block === runtimeSpans[runtimeSpans.length - 1].end_block);
          const endTimestamp = isActive ? undefined : timestamps.get(span.end_block) || undefined;

          return {
            ...span,
            percentage,
            startTimestamp,
            endTimestamp,
            isActive
          };
        });

        setSpans(enhancedSpans);
        setLastRefresh(new Date());
      } catch (err) {
        console.error('Failed to fetch runtime spans:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch runtime information');
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchRuntimeSpans(true);
  };

  useEffect(() => {

    fetchRuntimeSpans(false);
  }, [endpoint, chainName]);

  const formatBlockNumber = (block: number): string => {
    return block.toLocaleString();
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCodeHash = (hash: string): string => {
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  if (loading && !isRefreshing) {
    return (
      <Card className={`${themeClasses.bg.tertiary} border mb-4`}>
        <Card.Header>
          <h5 className="mb-0">Runtime Timeline</h5>
        </Card.Header>
        <Card.Body className="text-center py-5">
          <Spinner animation="border" role="status" className="mb-3">
            <span className="visually-hidden">Loading runtime timeline...</span>
          </Spinner>
          <p className={themeClasses.text.secondary}>{discoveryProgress.message}</p>
          <div className="mt-3 px-5">
            <div className="progress" style={{ height: '8px' }}>
              <div 
                className="progress-bar progress-bar-striped progress-bar-animated" 
                role="progressbar" 
                style={{ width: `${(discoveryProgress.current / discoveryProgress.total) * 100}%` }}
                aria-valuenow={discoveryProgress.current} 
                aria-valuemin={0} 
                aria-valuemax={discoveryProgress.total}
              />
            </div>
            <small className="text-muted mt-2 d-block">
              {Math.round((discoveryProgress.current / discoveryProgress.total) * 100)}% complete
            </small>
          </div>
        </Card.Body>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`${themeClasses.bg.tertiary} border mb-4`}>
        <Card.Header>
          <h5 className="mb-0">Runtime Timeline</h5>
        </Card.Header>
        <Card.Body>
          <Alert variant="warning" className="mb-0">
            <i className="bi bi-exclamation-triangle me-2"></i>
            Unable to load runtime timeline: {error}
          </Alert>
        </Card.Body>
      </Card>
    );
  }

  if (spans.length === 0) {
    return (
      <Card className={`${themeClasses.bg.tertiary} border mb-4`}>
        <Card.Header>
          <h5 className="mb-0">Runtime Timeline</h5>
        </Card.Header>
        <Card.Body>
          <Alert variant="info" className="mb-0">
            <i className="bi bi-info-circle me-2"></i>
            No runtime information available
          </Alert>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className={`${themeClasses.bg.tertiary} border mb-4`}>
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Runtime Timeline</h5>
          <div className="d-flex align-items-center gap-3">
            <div className="text-muted small">
              <i className="bi bi-box-arrow-up me-1"></i>
              {spans.length} runtime{spans.length !== 1 ? 's' : ''} detected
            </div>
            <button 
              className={`btn btn-sm btn-outline-secondary ${isRefreshing ? 'disabled' : ''}`}
              onClick={handleRefresh}
              disabled={isRefreshing}
              title={lastRefresh ? `Last refreshed: ${lastRefresh.toLocaleTimeString()}` : 'Refresh runtime discovery'}
            >
              <i className={`bi bi-arrow-clockwise ${isRefreshing ? 'spinning' : ''}`}></i>
              {isRefreshing ? ' Refreshing...' : ' Refresh'}
            </button>
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        {/* Visual Timeline Bar */}
        <div className="mb-4">
          <div className="position-relative" style={{ height: '60px' }}>
            <div className="position-absolute w-100 h-100 d-flex">
              {spans.map((span, index) => (
                <OverlayTrigger
                  key={`${span.spec_version}-${span.start_block}`}
                  placement="top"
                  overlay={
                    <Tooltip>
                      <div className="text-start">
                        <strong>{span.spec_name} v{span.spec_version}</strong>
                        <br />
                        Blocks: {formatBlockNumber(span.start_block)} - {formatBlockNumber(span.end_block)}
                        <br />
                        {span.startTimestamp && `Started: ${formatDate(span.startTimestamp)}`}
                      </div>
                    </Tooltip>
                  }
                >
                  <div
                    className={`h-100 border-end position-relative ${span.isActive ? 'bg-primary bg-gradient active-runtime' : 'bg-secondary'}`}
                    style={{
                      width: `${span.percentage}%`,
                      opacity: span.isActive ? 1 : 0.7,
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      borderRadius: index === 0 ? '4px 0 0 4px' : index === spans.length - 1 ? '0 4px 4px 0' : '0',
                      boxShadow: span.isActive ? '0 0 10px rgba(var(--bs-primary-rgb), 0.5)' : 'none'
                    }}
                  >
                    {span.percentage && span.percentage > 5 && (
                      <div className="position-absolute top-50 start-50 translate-middle text-white small fw-bold">
                        v{span.spec_version}
                        {span.isActive && (
                          <div className="badge bg-success ms-1" style={{ fontSize: '0.7em' }}>
                            ACTIVE
                          </div>
                        )}
                      </div>
                    )}
                    {span.isActive && span.percentage && span.percentage <= 5 && (
                      <div className="position-absolute" style={{ top: '-25px', right: '0', whiteSpace: 'nowrap' }}>
                        <Badge bg="success" className="small">
                          <i className="bi bi-play-fill"></i> Current
                        </Badge>
                      </div>
                    )}
                  </div>
                </OverlayTrigger>
              ))}
            </div>
            
            {/* Timeline markers */}
            <div className="position-absolute w-100" style={{ bottom: '-25px' }}>
              <div className="d-flex justify-content-between">
                <small className="text-muted">Block 0</small>
                {currentBlock && (
                  <small className="text-muted">
                    Block {formatBlockNumber(currentBlock)}
                  </small>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Runtime Details List */}
        <div className="mt-5">
          <h6 className="mb-3">Runtime History</h6>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Runtime</th>
                  <th>Version</th>
                  <th>Block Range</th>
                  <th>Duration</th>
                  <th>Code Hash</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...spans].reverse().map((span) => {
                  const blocks = span.end_block - span.start_block + 1;
                  let durationDisplay = '';
                  
                  // Calculate duration based on timestamps
                  if (span.startTimestamp) {
                    let elapsedMs = 0;
                    
                    if (span.isActive) {
                      // For active runtimes, calculate from start to now
                      elapsedMs = Date.now() - span.startTimestamp;
                    } else if (span.endTimestamp) {
                      // For historical runtimes, calculate from start to end
                      elapsedMs = span.endTimestamp - span.startTimestamp;
                    }
                    
                    if (elapsedMs > 0) {
                      const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
                      const hours = Math.floor((elapsedMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                      const minutes = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000));
                      
                      if (days > 0) {
                        durationDisplay = `${days} day${days !== 1 ? 's' : ''}`;
                        if (hours > 0) {
                          durationDisplay += `, ${hours} hour${hours !== 1 ? 's' : ''}`;
                        }
                      } else if (hours > 0) {
                        durationDisplay = `${hours} hour${hours !== 1 ? 's' : ''}`;
                        if (minutes > 0) {
                          durationDisplay += `, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
                        }
                      } else {
                        durationDisplay = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
                      }
                    }
                  }
                  
                  return (
                    <tr key={`${span.spec_version}-${span.start_block}`}>
                      <td className="font-monospace">{span.spec_name}</td>
                      <td>
                        <Badge bg="secondary">v{span.spec_version}</Badge>
                      </td>
                      <td className="small">
                        <div>{formatBlockNumber(span.start_block)} → {formatBlockNumber(span.end_block)}</div>
                        {span.startTimestamp && (
                          <div className="text-muted" style={{ fontSize: '0.8em' }}>
                            Started: {formatDate(span.startTimestamp)}
                          </div>
                        )}
                        {!span.isActive && span.endTimestamp && (
                          <div className="text-muted" style={{ fontSize: '0.8em' }}>
                            Ended: {formatDate(span.endTimestamp)}
                          </div>
                        )}
                      </td>
                      <td className="small">
                        <div>{blocks.toLocaleString()} blocks</div>
                        {durationDisplay && (
                          <div className="text-muted" style={{ fontSize: '0.85em' }}>
                            {durationDisplay}
                          </div>
                        )}
                      </td>
                      <td className="font-monospace small">
                        <OverlayTrigger
                          placement="top"
                          overlay={<Tooltip>{span.code_hash}</Tooltip>}
                        >
                          <span>{formatCodeHash(span.code_hash)}</span>
                        </OverlayTrigger>
                      </td>
                      <td>
                        {span.isActive ? (
                          <Badge bg="success">Active</Badge>
                        ) : (
                          <Badge bg="secondary">Historical</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card.Body>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.8; }
          100% { opacity: 1; }
        }
        .active-runtime {
          animation: pulse 2s ease-in-out infinite;
        }
      `}</style>
    </Card>
  );
};

export default RuntimeTimeline;