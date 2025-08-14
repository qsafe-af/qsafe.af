import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Badge, Alert, Button, Spinner } from 'react-bootstrap';
import { getChain } from '../chains';
import { themeClasses } from '../theme-utils';

interface TelemetryNode {
  id: string;
  name: string;
  version?: string;
  networkId?: string;
  address?: string;
  connectedAt?: number;
  latency?: number;
  blockHeight?: number;
  blockHash?: string;
  finalized?: number;
  txcount?: number;
  peers?: number;
  uploadBandwidth?: number;
  downloadBandwidth?: number;
  stateSize?: number;
  location?: {
    city?: string;
    country?: string;
    lat?: number;
    lon?: number;
  };
  // Additional fields from telemetry
  best?: string;
  height?: number;
  msg?: string;
  ts?: number;
}

interface TelemetryMessage {
  action: string;
  payload?: any;
}

const Nodes: React.FC = () => {
  const { chainId } = useParams<{ chainId: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<Map<string, TelemetryNode>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSubscribedRef = useRef<boolean>(false);

  const chain = chainId ? getChain(chainId) : null;

  useEffect(() => {
    if (!chain?.telemetry) {
      setError('No telemetry endpoint configured for this chain');
      setLoading(false);
      return;
    }

    const connectWebSocket = () => {
      try {
        console.log('[telemetry] Connecting to:', chain.telemetry);
        console.log('[telemetry] Chain genesis:', chain.genesis);
        setConnectionStatus('connecting');
        
        const ws = new WebSocket(chain.telemetry);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[telemetry] WebSocket connected');
          setConnectionStatus('connected');
          setLoading(false);
          setError(null);
          hasSubscribedRef.current = false;
          console.log('[telemetry] Connected, waiting for chain list...');
        };

        ws.onmessage = (event) => {
          // Handle Blob data asynchronously
          const processMessage = async () => {
            try {
              let textData: string;
              
              // Check if the data is a Blob
              if (event.data instanceof Blob) {
                textData = await event.data.text();
              } else {
                textData = event.data;
              }
              
              // Try to parse as JSON
              let data;
              try {
                data = JSON.parse(textData);
                // console.log('[telemetry] Successfully parsed JSON:', data);
              } catch (parseErr) {
                console.error('[telemetry] JSON parse failed:', parseErr);
                console.log('[telemetry] Text that failed to parse:', textData.substring(0, 200));
                return;
              }
              
              // Log post-subscription messages for debugging
              // if (hasSubscribedRef.current && data) {
              //   console.log('[telemetry] Received data after subscription:', data);
              // }
              
              // Check if it's an array or object
              if (Array.isArray(data)) {
                // console.log('[telemetry] Message is an array with', data.length, 'items');
                
                // Check if this is the telemetry format: [0, 32, 11, [chain_info], ...]
                if (data.length >= 4 && data[0] === 0 && typeof data[1] === 'number') {
                  // console.log('[telemetry] Detected telemetry chain list format');
                  
                  // Parse chain list
                  let chainIndex = -1;
                  for (let i = 2; i < data.length; i += 2) {
                    if (data[i] === 11 && Array.isArray(data[i + 1])) {
                      const chainInfo = data[i + 1];
                      // console.log('[telemetry] Chain info:', chainInfo);
                      if (chainInfo[1] === chain.genesis) {
                        chainIndex = (i - 2) / 2;
                        // console.log('[telemetry] Found our chain at index:', chainIndex);
                        // console.log('[telemetry] Chain has', chainInfo[2], 'nodes');
                        
                        // Subscribe to this chain using plain text format
                        const subscribeMessage = `subscribe:${chain.genesis}`;
                        // console.log('[telemetry] Sending subscription:', subscribeMessage);
                        ws.send(subscribeMessage);
                        hasSubscribedRef.current = true;
                        
                        break;
                      }
                    }
                  }
                  
                  if (chainIndex === -1) {
                    console.log('[telemetry] Chain not found in telemetry list');
                    setError('Chain not found in telemetry feed');
                  }
                  return;
                }
                

                
                // Check if this is actual node data
                if (data.length > 0 && typeof data[0] === 'object' && 'name' in data[0]) {
                  console.log('[telemetry] Received node data array');
                  handleTelemetryMessage({ action: 'init', payload: data });
                } else if (data.length >= 2 && typeof data[0] === 'number') {
                  // Check for telemetry update format: [msg_type, ...]
                  // console.log('[telemetry] Received telemetry message type:', data[0]);
                  
                  // Parse different message types from telemetry
                  if (data[0] === 3) {
                    // Type 3: Node updates - format: [3, nodeData, 7, removeData, 3, nodeData, ...]
                    for (let i = 0; i < data.length; i += 2) {
                      if (data[i] === 3 && i + 1 < data.length && Array.isArray(data[i + 1])) {
                        // console.log('[telemetry] Type 3 node update:', data[i + 1]);
                        handleTelemetryMessage({ action: 'add', payload: data[i + 1] });
                      } else if (data[i] === 7 && i + 1 < data.length) {
                        // Type 7 might be node removal
                        // console.log('[telemetry] Type 7 node removal:', data[i + 1]);
                        // Handle removal if needed
                      }
                    }
                  } else if (data[0] === 13) {
                    // Type 13: Initial state or summary
                    // console.log('[telemetry] Type 13 initial state message');
                  }
                }
              } else if (data && typeof data === 'object') {
                // Check for different possible message formats
                if ('nodes' in data) {
                  console.log('[telemetry] Found nodes property:', data.nodes);
                  handleTelemetryMessage({ action: 'init', payload: data.nodes });
                } else if ('node' in data) {
                  console.log('[telemetry] Found node property:', data.node);
                  handleTelemetryMessage({ action: 'add', payload: data.node });
                } else if ('action' in data) {
                  console.log('[telemetry] Found action property:', data.action);
                  handleTelemetryMessage(data);
                } else {
                  handleTelemetryMessage(data);
                }
              }
            } catch (err) {
              console.error('[telemetry] Error processing message:', err);
              console.error('[telemetry] Error stack:', err.stack);
              console.error('[telemetry] Raw event data:', event.data);
            }
          };
          
          // Execute async processing
          processMessage().catch(err => {
            console.error('[telemetry] Unhandled error in processMessage:', err);
          });
        };

        ws.onerror = (event) => {
          console.error('[telemetry] WebSocket error:', event);
          console.error('[telemetry] Error type:', event.type);
          setError('Connection error');
        };

        ws.onclose = (event) => {
          console.log('[telemetry] WebSocket closed. Code:', event.code, 'Reason:', event.reason);
          console.log('[telemetry] Clean close?', event.wasClean);
          setConnectionStatus('disconnected');
          
          // Attempt to reconnect after 5 seconds
          if (!reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log('[telemetry] Attempting reconnection...');
              reconnectTimeoutRef.current = null;
              connectWebSocket();
            }, 5000);
          }
        };
      } catch (err) {
        console.error('[telemetry] Failed to connect:', err);
        setError('Failed to connect to telemetry');
        setLoading(false);
      }
    };

    const handleTelemetryMessage = (message: any) => {
      // console.log('[telemetry] Handling message:', message);
      // console.log('[telemetry] Message has action?', 'action' in message);
      
      // First check if message has expected structure
      if (!message || typeof message !== 'object') {
        console.log('[telemetry] Invalid message structure');
        return;
      }
      
      const action = message.action || (Array.isArray(message) ? 'init' : null);
      // console.log('[telemetry] Determined action:', action);
      
      switch (action) {
        case 'add':
        case 'update':
          // console.log('[telemetry] Adding/updating node:', message.payload);
          if (message.payload && Array.isArray(message.payload)) {
            // Parse telemetry array format
            // Format: [nodeId, details, hardware, location, stats, network, uptime, timestamp]
            const [nodeId, details, hardware, location, stats, network, uptime, timestamp] = message.payload;
            

            
            let nodeName = 'Unknown';
            let nodeVersion = '';
            let nodeImpl = '';
            
            // Parse details array [name, version, impl, ...]
            if (Array.isArray(details) && details.length >= 3) {
              nodeName = details[0] || 'Unknown';
              nodeVersion = details[1] || '';
              nodeImpl = details[2] || '';
            }
            
            // Parse network array [blockHeight, blockHash, ???, timestamp, latency]
            let blockHeight, blockHash, peers, latency;
            if (Array.isArray(network) && network.length >= 5) {
              blockHeight = network[0];
              blockHash = network[1];
              // network[2] is not peers - it's some other metric (maybe txcount?)
              // network[3] is timestamp
              latency = network[4]; // This is latency in ms
            }
            
            // Parse location from uptime array [lat, lon, city]
            let locationObj;
            if (Array.isArray(uptime) && uptime.length >= 3) {
              locationObj = {
                lat: uptime[0],
                lon: uptime[1],
                city: uptime[2],
                country: undefined // Not provided in current format
              };
            }
            
            // Find peer count - most nodes have < 40, bootnodes can have 70-81
            peers = undefined;
            
            // Special logging for known bootnodes only
            const isBootnode = nodeName === 'effrafax' || nodeName === 'frootmig' || nodeName === 'bob';
            if (isBootnode) {
              console.log(`[telemetry] BOOTNODE "${nodeName}" hardware:`, hardware);
            }
            
            // Peer count is in hardware[0]
            if (Array.isArray(hardware) && hardware.length >= 1 && typeof hardware[0] === 'number') {
              peers = hardware[0];
            }
            
            // Stats contains historical data, not current block info
            let uploadBandwidth, downloadBandwidth;
            // These might be calculated from stats arrays if needed
            
            const telemetryNode: TelemetryNode = {
              id: String(nodeId),
              name: nodeName,
              version: nodeVersion,
              address: nodeImpl,
              connectedAt: timestamp || Date.now(),
              latency: latency,
              blockHeight: blockHeight,
              blockHash: blockHash,
              finalized: undefined, // Not in current telemetry format
              txcount: undefined, // Not in current telemetry format
              peers: peers,
              uploadBandwidth: uploadBandwidth,
              downloadBandwidth: downloadBandwidth,
              stateSize: undefined, // Not in current format
              location: locationObj
            };
            
            setNodes(prev => {
              const updated = new Map(prev);
              updated.set(String(nodeId), telemetryNode);
              // Removed for cleaner logs
              return updated;
            });
          }
          break;
          
        case 'remove':
          console.log('[telemetry] Removing node:', message.payload?.id);
          if (message.payload?.id) {
            setNodes(prev => {
              const updated = new Map(prev);
              updated.delete(message.payload.id);
              console.log('[telemetry] Total nodes after removal:', updated.size);
              return updated;
            });
          }
          break;
          
        case 'init':
          // Initial node list
          console.log('[telemetry] Received init with payload:', message.payload);
          if (Array.isArray(message.payload)) {
            console.log('[telemetry] Init payload is array with', message.payload.length, 'nodes');
            const nodeMap = new Map<string, TelemetryNode>();
            message.payload.forEach((node: any) => {
              // Generate ID if not present
              const nodeId = node.id || `${node.name}-${node.address || Math.random()}`;
              
              // Map fields from telemetry format
              const telemetryNode: TelemetryNode = {
                id: nodeId,
                name: node.name || 'Unknown',
                version: node.version,
                address: node.address,
                connectedAt: node.connectedAt || node.ts || Date.now(),
                latency: node.latency,
                blockHeight: node.height || node.blockHeight,
                blockHash: node.best || node.blockHash,
                finalized: node.finalized,
                txcount: node.txcount,
                peers: node.peers,
                uploadBandwidth: node.uploadBandwidth,
                downloadBandwidth: node.downloadBandwidth,
                stateSize: node.stateSize,
                location: node.location
              };
              
              nodeMap.set(nodeId, telemetryNode);
            });
            console.log('[telemetry] Initialized', nodeMap.size, 'nodes');
            setNodes(nodeMap);
          } else {
            console.log('[telemetry] Init payload is not an array:', typeof message.payload);
          }
          break;
          
        default:
          console.log('[telemetry] Unknown action:', message.action);
          break;
      }
    };

    connectWebSocket();

    // Cleanup
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [chain]);

  const handleBack = () => {
    navigate(`/chains/${chainId}`);
  };

  const formatUptime = (connectedAt?: number): string => {
    if (!connectedAt) return '-';
    const uptime = Date.now() - connectedAt;
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const formatBandwidth = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B/s`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const formatStateSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  if (!chain) {
    return (
      <div className="container mt-5">
        <Alert variant="danger">
          <h4>Invalid Chain</h4>
          <p>The specified chain "{chainId}" does not exist.</p>
          <Button variant="outline-danger" onClick={() => navigate("/")}>
            Go to Chains List
          </Button>
        </Alert>
      </div>
    );
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const nodeList = Array.from(nodes.values()).sort((a, b) => {
    if (!sortColumn) {
      // Default sort by block height (descending), then by name
      if (a.blockHeight && b.blockHeight) {
        return b.blockHeight - a.blockHeight;
      }
      return a.name.localeCompare(b.name);
    }

    let aValue: any;
    let bValue: any;

    switch (sortColumn) {
      case 'name':
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case 'implementation':
        aValue = a.address?.toLowerCase() || '';
        bValue = b.address?.toLowerCase() || '';
        break;
      case 'block':
        aValue = a.blockHeight || 0;
        bValue = b.blockHeight || 0;
        break;
      case 'peers':
        aValue = a.peers || 0;
        bValue = b.peers || 0;
        break;
      case 'uptime':
        aValue = a.connectedAt || 0;
        bValue = b.connectedAt || 0;
        break;
      case 'latency':
        aValue = a.latency || 999999;
        bValue = b.latency || 999999;
        break;
      case 'location':
        aValue = a.location?.city || '';
        bValue = b.location?.city || '';
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <i className="bi bi-chevron-expand text-muted opacity-50"></i>;
    return sortDirection === 'asc' 
      ? <i className="bi bi-chevron-up"></i>
      : <i className="bi bi-chevron-down"></i>;
  };

  return (
    <div className="container mt-4">
      <div className="d-flex align-items-center mb-4">
        <Button variant="outline-secondary" size="sm" onClick={handleBack}>
          ← Back to {chain.displayName}
        </Button>
        <h2 className="ms-3 mb-0">Network Nodes</h2>
      </div>

      {error && (
        <Alert variant="danger" className="mb-4">
          <h5>Error</h5>
          <p className="mb-0">{error}</p>
        </Alert>
      )}

      <Card className={themeClasses.card}>
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Connected Nodes</h5>
            <div className="d-flex align-items-center gap-3">
              <Badge bg={connectionStatus === 'connected' ? 'success' : connectionStatus === 'connecting' ? 'warning' : 'danger'}>
                {connectionStatus === 'connected' ? (
                  <>
                    <i className="bi bi-circle-fill me-1"></i>
                    Connected
                  </>
                ) : connectionStatus === 'connecting' ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-1" />
                    Connecting
                  </>
                ) : (
                  <>
                    <i className="bi bi-x-circle me-1"></i>
                    Disconnected
                  </>
                )}
              </Badge>
              <Badge bg="secondary">
                {nodeList.length} node{nodeList.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" role="status" className="mb-3" />
              <p className="mb-0">Connecting to telemetry feed...</p>
            </div>
          ) : nodeList.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-server display-4 mb-3 d-block"></i>
              <p className="mb-0">No nodes connected</p>
            </div>
          ) : (
            <Table responsive hover className={themeClasses.table}>
              <thead>
                <tr>
                  <th 
                    onClick={() => handleSort('name')} 
                    className="sortable-header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Node {getSortIcon('name')}
                  </th>
                  <th 
                    onClick={() => handleSort('implementation')} 
                    className="sortable-header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Implementation {getSortIcon('implementation')}
                  </th>
                  <th 
                    onClick={() => handleSort('block')} 
                    className="sortable-header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Block {getSortIcon('block')}
                  </th>
                  <th>Finalized</th>
                  <th 
                    onClick={() => handleSort('peers')} 
                    className="sortable-header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Peers {getSortIcon('peers')}
                  </th>
                  <th>Txs</th>
                  <th>Bandwidth</th>
                  <th>State</th>
                  <th 
                    onClick={() => handleSort('location')} 
                    className="sortable-header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Location {getSortIcon('location')}
                  </th>
                  <th 
                    onClick={() => handleSort('uptime')} 
                    className="sortable-header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Uptime {getSortIcon('uptime')}
                  </th>
                  <th 
                    onClick={() => handleSort('latency')} 
                    className="sortable-header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Latency {getSortIcon('latency')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {nodeList.map((node) => (
                  <tr key={node.id}>
                    <td>
                      <div>
                        <strong>{node.name}</strong>
                        {node.version && (
                          <div className="small text-muted">
                            {node.version}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      {node.address ? (
                        <span className="small font-monospace">{node.address}</span>
                      ) : '-'}
                    </td>
                    <td>
                      {node.blockHeight ? (
                        <span className="font-monospace">
                          #{node.blockHeight.toLocaleString()}
                        </span>
                      ) : '-'}
                    </td>
                    <td>
                      {node.finalized ? (
                        <span className="font-monospace">
                          #{node.finalized.toLocaleString()}
                        </span>
                      ) : '-'}
                    </td>
                    <td>{node.peers ?? '-'}</td>
                    <td>{node.txcount ?? '-'}</td>
                    <td>
                      <div className="small">
                        <i className="bi bi-arrow-up text-success"></i> {formatBandwidth(node.uploadBandwidth)}
                        <br />
                        <i className="bi bi-arrow-down text-primary"></i> {formatBandwidth(node.downloadBandwidth)}
                      </div>
                    </td>
                    <td>{formatStateSize(node.stateSize)}</td>
                    <td>
                      {node.location?.city ? (
                        <small>{node.location.city}</small>
                      ) : '-'}
                    </td>
                    <td>
                      <small>{node.connectedAt ? formatUptime(node.connectedAt) : '-'}</small>
                    </td>
                    <td>
                      {node.latency ? (
                        <Badge bg={node.latency < 100 ? 'success' : node.latency < 300 ? 'warning' : 'danger'}>
                          {node.latency}ms
                        </Badge>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
      <style>{`
        .sortable-header {
          transition: background-color 0.2s ease;
          position: relative;
        }
        .sortable-header:hover {
          background-color: rgba(255, 255, 255, 0.05);
        }
        .sortable-header i {
          margin-left: 4px;
          font-size: 0.8em;
          vertical-align: middle;
        }
        .sortable-header .bi-chevron-expand {
          transition: opacity 0.2s ease;
        }
        .sortable-header:hover .bi-chevron-expand {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
};

export default Nodes;