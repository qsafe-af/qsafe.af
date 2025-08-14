import React, { useState, useEffect, useRef } from 'react';
import { Card, Badge, Row, Col } from 'react-bootstrap';
import { themeClasses } from '../theme-utils';

interface ChainStatusProps {
  ws: WebSocket | null;
  connectionStatus: string;
}

interface ChainStats {
  bestBlock: number | null;
  bestBlockHash: string | null;
  finalizedBlock: number | null;
  finalizedBlockHash: string | null;
  runtimeVersion: {
    specName: string;
    specVersion: number;
  } | null;
  lastBlockTime: number;
  blockTimes: number[]; // Recent block times for average calculation
}

const ChainStatus: React.FC<ChainStatusProps> = ({ ws, connectionStatus }) => {
  const [stats, setStats] = useState<ChainStats>({
    bestBlock: null,
    bestBlockHash: null,
    finalizedBlock: null,
    finalizedBlockHash: null,
    runtimeVersion: null,
    lastBlockTime: Date.now(),
    blockTimes: []
  });
  
  const [timeSinceBlock, setTimeSinceBlock] = useState(0);
  const animationRef = useRef<number | null>(null);
  const subscriptionIds = useRef<{ newHeads?: string; finalized?: string }>({});
  const pendingRequests = useRef<Map<number, string>>(new Map());

  // Calculate average block time
  const avgBlockTime = stats.blockTimes.length > 0
    ? stats.blockTimes.reduce((a, b) => a + b, 0) / stats.blockTimes.length
    : 6000; // Default to 6s

  // Update time since last block
  useEffect(() => {
    const updateTimer = () => {
      setTimeSinceBlock(Date.now() - stats.lastBlockTime);
      animationRef.current = requestAnimationFrame(updateTimer);
    };
    
    animationRef.current = requestAnimationFrame(updateTimer);
    
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [stats.lastBlockTime]);

  // WebSocket message handler
  useEffect(() => {
    console.log('ChainStatus: Component mounted, ws:', !!ws, 'status:', connectionStatus);
    if (!ws || connectionStatus !== 'connected') {
      console.log('ChainStatus: Not connected, skipping setup');
      return;
    }

    console.log('ChainStatus: Setting up WebSocket listeners');
    const messageHandler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        // Handle subscription confirmations
        if (data.id === 10001) {
          if (data.result) {
            subscriptionIds.current.newHeads = data.result;
            console.log('ChainStatus: Subscribed to new heads:', data.result);
          } else if (data.error) {
            console.error('ChainStatus: Error subscribing to new heads:', data.error);
          }
        } else if (data.id === 10002) {
          if (data.result) {
            subscriptionIds.current.finalized = data.result;
            console.log('ChainStatus: Subscribed to finalized heads:', data.result);
          } else if (data.error) {
            console.error('ChainStatus: Error subscribing to finalized heads:', data.error);
          }
        } else if (data.id === 10005) {
          if (data.result) {
            console.log('ChainStatus: Got initial finalized head hash:', data.result);
            // This returns a hash, so we need to fetch the header
            const getHeaderMessage = {
              id: 13000 + Math.floor(Math.random() * 1000),
              jsonrpc: "2.0",
              method: "chain_getHeader",
              params: [data.result]
            };
            pendingRequests.current.set(getHeaderMessage.id, `getFinalizedHeader:${data.result}`);
            ws.send(JSON.stringify(getHeaderMessage));
          } else if (data.error) {
            console.error('ChainStatus: Error getting finalized head:', data.error);
          }
        }

        // Handle pending request responses
        if (data.id && pendingRequests.current.has(data.id)) {
          const requestType = pendingRequests.current.get(data.id);
          pendingRequests.current.delete(data.id);

          if (requestType === 'getRuntimeVersion' && data.result) {
            setStats(prev => ({
              ...prev,
              runtimeVersion: {
                specName: data.result.specName,
                specVersion: data.result.specVersion
              }
            }));
          } else if (requestType === 'getInitialFinalizedHead' && data.result) {
            // Got initial finalized head hash, now get its header
            const getHeaderMessage = {
              id: 13000 + Math.floor(Math.random() * 1000),
              jsonrpc: "2.0",
              method: "chain_getHeader",
              params: [data.result]
            };
            pendingRequests.current.set(getHeaderMessage.id, `getFinalizedHeader:${data.result}`);
            ws.send(JSON.stringify(getHeaderMessage));
          }
        }

        // Handle new heads subscription
        if (data.method === 'chain_newHead' && data.params?.subscription === subscriptionIds.current.newHeads) {
          const header = data.params.result;
          const blockNumber = parseInt(header.number, 16);
          
          setStats(prev => {
            const now = Date.now();
            const timeDiff = now - prev.lastBlockTime;
            
            // Keep last 10 block times
            const newBlockTimes = [...prev.blockTimes, timeDiff].slice(-10);
            
            return {
              ...prev,
              bestBlock: blockNumber,
              bestBlockHash: header.hash || null,
              lastBlockTime: now,
              blockTimes: newBlockTimes
            };
          });

          // Fetch runtime version for new block
          const getRuntimeMessage = {
            id: 12000 + Math.floor(Math.random() * 1000),
            jsonrpc: "2.0",
            method: "state_getRuntimeVersion",
            params: [header.hash]
          };
          pendingRequests.current.set(getRuntimeMessage.id, 'getRuntimeVersion');
          ws.send(JSON.stringify(getRuntimeMessage));
        }

        // Handle finalized heads subscription
        if (data.method === 'chain_finalizedHead' && data.params?.subscription === subscriptionIds.current.finalized) {
          const header = data.params.result;
          console.log('ChainStatus: Received finalized head:', header);
          
          // The result is already a header object, not just a hash
          if (header && header.number) {
            const blockNumber = parseInt(header.number, 16);
            console.log('ChainStatus: Got finalized block number:', blockNumber);
            
            setStats(prev => ({
              ...prev,
              finalizedBlock: blockNumber,
              finalizedBlockHash: header.hash || null
            }));
          }
        }

        // Handle finalized header response
        if (data.id && data.result && pendingRequests.current.has(data.id)) {
          const requestInfo = pendingRequests.current.get(data.id);
          if (requestInfo?.startsWith('getFinalizedHeader:')) {
            const hash = requestInfo.split(':')[1];
            if (data.result && data.result.number) {
              const blockNumber = parseInt(data.result.number, 16);
              console.log('ChainStatus: Got finalized block number:', blockNumber);
              
              setStats(prev => ({
                ...prev,
                finalizedBlock: blockNumber,
                finalizedBlockHash: hash
              }));
            } else {
              console.warn('ChainStatus: Invalid finalized header response:', data.result);
            }
            
            pendingRequests.current.delete(data.id);
          }
        }
      } catch (error) {
        console.error('ChainStatus: Error handling message:', error);
      }
    };

    ws.addEventListener('message', messageHandler);
    console.log('ChainStatus: Added message listener');

    // Subscribe to new heads
    const subscribeNewHeads = {
      id: 10001,
      jsonrpc: "2.0",
      method: "chain_subscribeNewHeads",
      params: []
    };
    console.log('ChainStatus: Sending new heads subscription:', subscribeNewHeads);
    ws.send(JSON.stringify(subscribeNewHeads));

    // Subscribe to finalized heads
    const subscribeFinalizedHeads = {
      id: 10002,
      jsonrpc: "2.0",
      method: "chain_subscribeFinalizedHeads",
      params: []
    };
    console.log('ChainStatus: Sending finalized heads subscription:', subscribeFinalizedHeads);
    ws.send(JSON.stringify(subscribeFinalizedHeads));

    // Get initial finalized head
    const getFinalizedHead = {
      id: 10005,
      jsonrpc: "2.0",
      method: "chain_getFinalizedHead",
      params: []
    };
    console.log('ChainStatus: Getting initial finalized head:', getFinalizedHead);
    pendingRequests.current.set(getFinalizedHead.id, 'getInitialFinalizedHead');
    ws.send(JSON.stringify(getFinalizedHead));

    return () => {
      ws.removeEventListener('message', messageHandler);
      
      // Unsubscribe if needed
      if (subscriptionIds.current.newHeads) {
        const unsubscribeNewHeads = {
          id: 10003,
          jsonrpc: "2.0",
          method: "chain_unsubscribeNewHeads",
          params: [subscriptionIds.current.newHeads]
        };
        ws.send(JSON.stringify(unsubscribeNewHeads));
      }
      
      if (subscriptionIds.current.finalized) {
        const unsubscribeFinalizedHeads = {
          id: 10004,
          jsonrpc: "2.0",
          method: "chain_unsubscribeFinalizedHeads",
          params: [subscriptionIds.current.finalized]
        };
        ws.send(JSON.stringify(unsubscribeFinalizedHeads));
      }
    };
  }, [ws, connectionStatus]);

  // Format block number
  const formatBlockNumber = (num: number | null) => {
    if (num === null) return '—';
    return num.toLocaleString();
  };

  // Calculate progress towards next block
  const blockProgress = Math.min(100, (timeSinceBlock / avgBlockTime) * 100);
  const secondsSinceBlock = (timeSinceBlock / 1000).toFixed(1);
  const expectedBlockTime = (avgBlockTime / 1000).toFixed(1);

  // Determine block time status color
  const getBlockTimeColor = () => {
    if (timeSinceBlock < avgBlockTime * 0.8) return 'success';
    if (timeSinceBlock < avgBlockTime * 1.5) return 'warning';
    return 'danger';
  };

  return (
    <Card className={`${themeClasses.bg.tertiary} border mb-4`}>
      <Card.Body className="py-2 py-sm-3">
        <Row className="align-items-center g-3">
          {/* Block Time Animation */}
          <Col xs={12} sm={6} md={3}>
            <div className="d-flex align-items-center">
              <div className="flex-grow-1">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <small className={`${themeClasses.text.secondary} fw-bold`}>Block Time</small>
                  <Badge bg={getBlockTimeColor()} className="ms-2">
                    {secondsSinceBlock}s
                  </Badge>
                </div>
                <div className="position-relative" style={{ height: '16px' }}>
                  {/* Background track */}
                  <div 
                    className="position-absolute w-100 h-100 rounded-pill"
                    style={{ 
                      backgroundColor: 'var(--bs-gray-700)',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Progress bar */}
                    <div 
                      className="h-100 rounded-pill position-relative"
                      style={{ 
                        width: `${blockProgress}%`,
                        backgroundColor: `var(--bs-${getBlockTimeColor()})`,
                        transition: 'width 0.1s linear'
                      }}
                    >
                      {/* Animated pulse effect */}
                      <div 
                        className="position-absolute h-100 w-100"
                        style={{
                          background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)`,
                          animation: 'pulse-slide 2s infinite'
                        }}
                      />
                    </div>
                  </div>
                  {/* Expected time marker */}
                  <div 
                    className="position-absolute d-none d-sm-block"
                    style={{ 
                      left: '100%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: '0.7rem',
                      whiteSpace: 'nowrap',
                      marginLeft: '10px'
                    }}
                  >
                    <span className={themeClasses.text.secondary}>
                      ~{expectedBlockTime}s avg
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Col>

          {/* Best Block */}
          <Col xs={6} sm={6} md={3}>
            <div className="text-center">
              <small className={`${themeClasses.text.secondary} d-block`}>Best Block</small>
              <div className="d-flex align-items-center justify-content-center">
                <i className="bi bi-box text-primary me-1 me-sm-2"></i>
                <span className="fw-bold fs-6 fs-sm-5">
                  #{formatBlockNumber(stats.bestBlock)}
                </span>
              </div>
            </div>
          </Col>

          {/* Finalized Block */}
          <Col xs={6} sm={6} md={3}>
            <div className="text-center">
              <small className={`${themeClasses.text.secondary} d-block`}>Finalized</small>
              <div className="d-flex align-items-center justify-content-center">
                <i className="bi bi-shield-check text-success me-1 me-sm-2"></i>
                <span className="fw-bold fs-6 fs-sm-5">
                  #{formatBlockNumber(stats.finalizedBlock)}
                </span>
              </div>
              {stats.bestBlock && stats.finalizedBlock && (
                <small className={`${themeClasses.text.secondary} d-none d-md-block`}>
                  {stats.bestBlock - stats.finalizedBlock} behind
                </small>
              )}
            </div>
          </Col>

          {/* Runtime Version */}
          <Col xs={12} sm={6} md={3}>
            <div className="text-center">
              <small className={`${themeClasses.text.secondary} d-block`}>Runtime</small>
              {stats.runtimeVersion ? (
                <div>
                  <Badge bg="info" className="me-1">
                    {stats.runtimeVersion.specName}
                  </Badge>
                  <Badge bg="secondary">
                    v{stats.runtimeVersion.specVersion}
                  </Badge>
                </div>
              ) : (
                <Badge bg="secondary">Loading...</Badge>
              )}
            </div>
          </Col>
        </Row>
      </Card.Body>
      
      <style>{`
        @keyframes pulse-slide {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }
      `}</style>
    </Card>
  );
};

export default ChainStatus;