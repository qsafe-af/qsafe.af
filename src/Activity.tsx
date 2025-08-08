import React, { useEffect, useState, useRef } from "react";
import { useParams, Navigate } from "react-router-dom";
import { Container, Alert, Card, Badge, Spinner, Form, Button, Row, Col } from "react-bootstrap";
import { getChain, normalizeToGenesis } from "./chains";
import Blocks from "./Blocks";
import { QuantumDecoder, isQuantumChain } from "./decoder";
import QuantumBadge from "./QuantumBadge";
import type { BlockHeader, ConnectionStatus, SubstrateEvent } from "./types";
import "./Activity.css";

// Basic SCALE decoder for standard Substrate events
function decodeStandardEvents(hex: string): SubstrateEvent[] {
  if (!hex || hex === '0x') return [];
  
  const events: SubstrateEvent[] = [];
  const data = new Uint8Array(hex.slice(2).match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []);
  let offset = 0;
  
  const readU8 = () => data[offset++];
  const readCompact = () => {
    const first = readU8();
    const mode = first & 0x03;
    if (mode === 0) return first >> 2;
    if (mode === 1) return ((first >> 2) | (readU8() << 6));
    if (mode === 2) {
      const b2 = readU8();
      const b3 = readU8();
      const b4 = readU8();
      return ((first >> 2) | (b2 << 6) | (b3 << 14) | (b4 << 22));
    }
    // For simplicity, treat mode 3 as a large number we can't fully decode
    return 999999;
  };
  
  try {
    const eventCount = readCompact();
    console.log(`Found ${eventCount} events in block`);
    
    for (let i = 0; i < eventCount && offset < data.length; i++) {
      const phaseType = readU8();
      let phase: any = {};
      
      if (phaseType === 0x00) {
        // ApplyExtrinsic
        const extrinsicIndex = readU8() | (readU8() << 8) | (readU8() << 16) | (readU8() << 24);
        phase = { applyExtrinsic: extrinsicIndex };
      } else if (phaseType === 0x01) {
        phase = { finalization: true };
      } else if (phaseType === 0x02) {
        phase = { initialization: true };
      } else {
        // Unknown phase, skip this event
        console.warn(`Unknown phase type: 0x${phaseType.toString(16)}`);
        continue;
      }
      
      const palletIndex = readU8();
      const eventIndex = readU8();
      
      // Map common pallet indices to names
      const palletNames: Record<number, string> = {
        0: 'system',
        1: 'timestamp',
        2: 'balances',
        10: 'balances', // Sometimes balances is at index 10
        18: 'utility',
      };
      
      // Map common event indices
      const eventNames: Record<string, Record<number, string>> = {
        'system': {
          0: 'ExtrinsicSuccess',
          1: 'ExtrinsicFailed',
          6: 'NewAccount',
        },
        'balances': {
          0: 'Endowed',
          1: 'DustLost',
          2: 'Transfer',
          7: 'Deposit',
          8: 'Withdraw',
        },
      };
      
      const palletName = palletNames[palletIndex] || `pallet${palletIndex}`;
      const eventName = eventNames[palletName]?.[eventIndex] || `event${eventIndex}`;
      
      // For now, we'll store remaining data as raw bytes
      // In a real implementation, you'd decode based on metadata
      const eventDataStart = offset;
      let eventData: any[] = [`Raw data starts at byte ${eventDataStart}`];
      
      // Try to extract some common patterns
      if (palletName === 'balances' && eventName === 'Transfer') {
        // Transfer typically has: from (32 bytes), to (32 bytes), amount (compact)
        if (data.length - offset >= 64) {
          const from = Array.from(data.slice(offset, offset + 32))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          offset += 32;
          const to = Array.from(data.slice(offset, offset + 32))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          offset += 32;
          eventData = [`from: 0x${from.slice(0, 8)}...`, `to: 0x${to.slice(0, 8)}...`];
        }
      }
      
      events.push({
        phase,
        event: {
          section: palletName,
          method: eventName,
          data: eventData,
        },
        topics: [],
      });
    }
  } catch (error) {
    console.error('Error in basic SCALE decoder:', error);
    console.log(`Failed at offset ${offset} of ${data.length} bytes`);
  }
  
  return events;
}

const Activity: React.FC = () => {
  const { chainId } = useParams<{ chainId: string }>();
  const [blocks, setBlocks] = useState<BlockHeader[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [manualBlockNumber, setManualBlockNumber] = useState<string>("");
  const [manualQueryResult, setManualQueryResult] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionIdRef = useRef<string | null>(null);

  // Get chain information
  const chain = getChain(chainId || '');
  const genesisHash = chain ? chain.genesis : normalizeToGenesis(chainId || '');

  useEffect(() => {
    // Clear previous blocks when chain changes
    setBlocks([]);
    
    // Only connect if chain has endpoints
    if (!chain?.endpoints || chain.endpoints.length === 0) {
      return;
    }

    // Select a random endpoint
    const endpoint = chain.endpoints[Math.floor(Math.random() * chain.endpoints.length)];
    setSelectedEndpoint(endpoint);
    
    // Connect to websocket
    setConnectionStatus("connecting");
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected to", endpoint);
      setConnectionStatus("connected");
      
      // Subscribe to new heads
      const subscribeMessage = {
        id: 1,
        jsonrpc: "2.0",
        method: "chain_subscribeNewHeads",
        params: []
      };
      
      ws.send(JSON.stringify(subscribeMessage));
      
      // Discover available RPC methods
      const methodsMessage = {
        id: 999,
        jsonrpc: "2.0",
        method: "rpc_methods",
        params: []
      };
      ws.send(JSON.stringify(methodsMessage));
    };

    // Track pending requests
    const pendingRequests = new Map<number, { type: string, data: any }>();

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Only log non-subscription messages for clarity
        if (!data.method || data.method !== 'chain_newHead') {
          console.log('WebSocket message received:', data);
        }
        
        // Handle subscription confirmation
        if (data.id === 1 && data.result) {
          subscriptionIdRef.current = data.result;
          console.log("Subscribed with ID:", data.result);
        }
        
        // Handle RPC methods discovery response
        if (data.id === 999 && data.result) {
          console.log("Available RPC methods:", data.result.methods);
          // Check if events-related methods are available
          const eventMethods = data.result.methods.filter((method: string) => 
            method.includes('event') || method.includes('Event') || 
            method.includes('storage') || method.includes('Storage')
          );
          console.log("Event-related methods:", eventMethods);
          
          // Also check hash-related methods
          const hashMethods = data.result.methods.filter((method: string) => 
            method.includes('hash') || method.includes('Hash')
          );
          console.log("Hash-related methods:", hashMethods);
        }
        
        // Handle responses to our requests
        if (data.id !== undefined && data.id !== null) {
          console.log(`Got RPC response for id ${data.id}:`, data);
          
          if (pendingRequests.has(data.id)) {
            const request = pendingRequests.get(data.id);
            console.log(`Matched pending request type: ${request?.type}`);
            
            // Check for errors
            if (data.error) {
              console.error(`RPC Error for request ${data.id}:`, data.error);
              pendingRequests.delete(data.id);
              return;
            }
            
            pendingRequests.delete(data.id);
          
          if (request?.type === 'getBlockHash') {
            const { blockNumber } = request.data;
            const actualHash = data.result;
            
            // Validate the hash format
            if (!actualHash || !actualHash.startsWith('0x') || actualHash.length !== 66) {
              console.error(`Invalid block hash received for block ${blockNumber}:`, actualHash);
              return;
            }
            
            // Update the block with the actual hash
            console.log(`Got valid block hash for block ${blockNumber}: ${actualHash}`);
            setBlocks(prevBlocks => {
              const updated = prevBlocks.map(block => 
                block.number === blockNumber 
                  ? { ...block, hash: actualHash }
                  : block
              );
              console.log(`Updated blocks after hash fetch:`, updated.find(b => b.number === blockNumber));
              return updated;
            });
            
            // Now fetch events for this block
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              // First, let's try to get the runtime version to understand the chain better
              const getRuntimeMessage = {
                id: Math.floor(Math.random() * 1000000),
                jsonrpc: "2.0",
                method: "state_getRuntimeVersion",
                params: [actualHash]
              };
              pendingRequests.set(getRuntimeMessage.id, { 
                type: 'getRuntimeVersion', 
                data: { blockNumber, blockHash: actualHash } 
              });
              wsRef.current.send(JSON.stringify(getRuntimeMessage));
              
              // Try multiple storage keys for events (different chains might use different keys)
              const eventStorageKeys = [
                "0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7", // standard system.events
                "0x26aa394eea5630e07c48ae0c9558cef7780d41e5e16056765bc8461851072c9d7", // frame_system.Events
                "0xcc956bdb7605e3547539f321ac2bc95c5f9f9b32b6d503fd8a855a3639c0209c", // possible alternative
              ];
              
              // First, let's see what storage keys exist for this block
              const getKeysMessage = {
                id: Math.floor(Math.random() * 1000000),
                jsonrpc: "2.0",
                method: "state_getKeys",
                params: ["0x26aa394eea5630e07c48ae0c9558cef7", actualHash]
              };
              console.log(`Getting storage keys for block ${blockNumber} to find events storage`);
              pendingRequests.set(getKeysMessage.id, { 
                type: 'getStorageKeys', 
                data: { blockNumber, blockHash: actualHash } 
              });
              wsRef.current.send(JSON.stringify(getKeysMessage));
              
              const getEventsMessage = {
                id: Math.floor(Math.random() * 1000000),
                jsonrpc: "2.0",
                method: "state_getStorage",
                params: [
                  eventStorageKeys[0],
                  actualHash
                ]
              };
              console.log(`Fetching events for block ${blockNumber} with message:`, getEventsMessage);
              pendingRequests.set(getEventsMessage.id, { 
                type: 'getEvents', 
                data: { blockNumber, blockHash: actualHash } 
              });
              wsRef.current.send(JSON.stringify(getEventsMessage));
              
              // Also try chain_getBlock to get full block with extrinsics
              const getBlockMessage = {
                id: Math.floor(Math.random() * 1000000),
                jsonrpc: "2.0",
                method: "chain_getBlock",
                params: [actualHash]
              };
              pendingRequests.set(getBlockMessage.id, { 
                type: 'getBlock', 
                data: { blockNumber, blockHash: actualHash } 
              });
              wsRef.current.send(JSON.stringify(getBlockMessage));
            }
          } else if (request?.type === 'getStorageKeys') {
            const { blockNumber } = request.data;
            console.log(`Storage keys for block ${blockNumber}:`, data.result);
            // Look for any key that might contain events
            if (data.result && Array.isArray(data.result)) {
              const eventKeys = data.result.filter((key: string) => 
                key.includes('26aa394eea5630e07c48ae0c9558cef7') || 
                key.toLowerCase().includes('event')
              );
              console.log(`Found potential event storage keys:`, eventKeys);
            }
          } else if (request?.type === 'getEvents') {
            const { blockNumber, blockHash } = request.data;
            console.log(`Got events response for block ${blockNumber}:`, data.result);
            console.log(`Response type:`, typeof data.result);
            console.log(`Response length:`, data.result ? data.result.length : 'null');
            let events: SubstrateEvent[] = [];
            
            if (!data.result || data.result === '0x' || data.result === null) {
              console.log(`No events found for block ${blockNumber} (empty or null result)`);
              // Try alternative event fetching for quantum chains
              if (chain && isQuantumChain(chain.name) && wsRef.current) {
                console.log(`Trying alternative event storage for quantum chain`);
                // Try getting all storage changes for this block
                const getStorageAtMessage = {
                  id: Math.floor(Math.random() * 1000000),
                  jsonrpc: "2.0",
                  method: "state_queryStorage",
                  params: [
                    [
                      "0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7",
                      "0x26aa394eea5630e07c48ae0c9558cef7780d41e5e16056765bc8461851072c9d7"
                    ],
                    blockHash,
                    blockHash
                  ]
                };
                console.log(`Querying storage changes for block ${blockNumber}`);
                pendingRequests.set(getStorageAtMessage.id, { 
                  type: 'queryStorageChanges', 
                  data: { blockNumber, blockHash } 
                });
                wsRef.current.send(JSON.stringify(getStorageAtMessage));
              }
            } else {
              try {
                // All chains (including quantum) use standard SCALE encoding for events
                console.log(`Decoding standard SCALE events for block ${blockNumber}...`);
                events = decodeStandardEvents(data.result);
                console.log(`Decoded ${events.length} events for block ${blockNumber}:`, events);
              } catch (error) {
                console.error(`Error decoding events for block ${blockNumber}:`, error);
                console.error(`Raw event data that failed to decode:`, data.result);
              }
            }
            
            // Update block with decoded events
            setBlocks(prevBlocks => 
              prevBlocks.map(block => 
                block.number === blockNumber 
                  ? { ...block, events }
                  : block
              )
            );
          } else if (request?.type === 'getRuntimeVersion') {
            const { blockNumber } = request.data;
            console.log(`Runtime version for block ${blockNumber}:`, data.result);
          } else if (request?.type === 'getBlock') {
            const { blockNumber } = request.data;
            console.log(`Full block data for block ${blockNumber}:`, data.result);
            
            // Check if block contains extrinsics
            if (data.result && data.result.block && data.result.block.extrinsics) {
              console.log(`Block ${blockNumber} contains ${data.result.block.extrinsics.length} extrinsics`);
              console.log(`Extrinsics:`, data.result.block.extrinsics);
              
              // If we find extrinsics but no events via storage, let's try to query events differently
              if (data.result.block.extrinsics.length > 0) {
                // Try state_queryStorageAt as an alternative
                const queryStorageMessage = {
                  id: Math.floor(Math.random() * 1000000),
                  jsonrpc: "2.0",
                  method: "state_queryStorageAt",
                  params: [
                    ["0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7"],
                    data.result.block.header.hash || data.result.block.hash
                  ]
                };
                console.log(`Trying state_queryStorageAt for block ${blockNumber}`);
                pendingRequests.set(queryStorageMessage.id, { 
                  type: 'queryStorage', 
                  data: { blockNumber } 
                });
                wsRef.current?.send(JSON.stringify(queryStorageMessage));
              }
            }
          } else if (request?.type === 'queryStorage') {
            const { blockNumber } = request.data;
            console.log(`Query storage result for block ${blockNumber}:`, data.result);
          } else if (request?.type === 'queryStorageChanges') {
            const { blockNumber } = request.data;
            console.log(`Storage changes for block ${blockNumber}:`, data.result);
            if (data.result && Array.isArray(data.result) && data.result.length > 0) {
              const changes = data.result[0]?.changes || [];
              console.log(`Found ${changes.length} storage changes`);
              changes.forEach((change: any, idx: number) => {
                console.log(`Change ${idx}:`, change);
              });
            }
          }
          }
        }
        
        // Handle new block headers
        if (data.method === "chain_newHead" && data.params) {
          const { result: header } = data.params;
          
          // Log the full header to see what fields are available
          console.log(`Full header data for analysis:`, header);
          
          // In Substrate chains, the block number is in hex format
          const blockNumber = parseInt(header.number, 16).toString();
          
          // The hash is not in the header - it needs to be computed or fetched
          // Initialize with pending status
          let blockHash = `pending_${blockNumber}`;
          
          console.log(`New block header received: #${blockNumber}, will fetch hash via RPC`);
          
          const newBlock: BlockHeader = {
            number: blockNumber,
            hash: blockHash,
            timestamp: Date.now(),
            events: [] // Initialize with empty events
          };
          
          setBlocks(prevBlocks => [newBlock, ...prevBlocks].slice(0, 20)); // Keep last 20 blocks
          
          // Fetch the block hash via RPC (exactly as the working command line example)
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const blockNumberInt = parseInt(header.number, 16);
            const requestId = Math.floor(Math.random() * 1000000);
            const getBlockHashMessage = {
              id: requestId,
              jsonrpc: "2.0",
              method: "chain_getBlockHash",
              params: [blockNumberInt]
            };
            console.log(`Requesting block hash for block ${blockNumberInt}:`, JSON.stringify(getBlockHashMessage));
            pendingRequests.set(requestId, { 
              type: 'getBlockHash', 
              data: { blockNumber } 
            });
            wsRef.current.send(JSON.stringify(getBlockHashMessage));
          }
        }
      } catch (error) {
        console.error("Error parsing websocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus("error");
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setConnectionStatus("disconnected");
    };

    // Cleanup function
    return () => {
      if (subscriptionIdRef.current && ws.readyState === WebSocket.OPEN) {
        // Unsubscribe before closing
        const unsubscribeMessage = {
          id: 2,
          jsonrpc: "2.0",
          method: "chain_unsubscribeNewHeads",
          params: [subscriptionIdRef.current]
        };
        ws.send(JSON.stringify(unsubscribeMessage));
      }
      
      ws.close();
      wsRef.current = null;
      subscriptionIdRef.current = null;
    };
  }, [chain, chainId]);

  const handleManualBlockQuery = () => {
    if (!manualBlockNumber || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const blockNum = parseInt(manualBlockNumber);
    if (isNaN(blockNum)) {
      console.error("Invalid block number");
      return;
    }

    console.log(`Manually querying block ${blockNum} for events...`);
    setManualQueryResult({ loading: true, blockNumber: blockNum });

    // First get the block hash
    const requestId = Math.floor(Math.random() * 1000000);
    const getBlockHashMessage = {
      id: requestId,
      jsonrpc: "2.0",
      method: "chain_getBlockHash",
      params: [blockNum]
    };
    
    // Track this as a manual query
    const pendingRequests = new Map<number, { type: string, data: any }>();
    pendingRequests.set(requestId, { 
      type: 'manualBlockHash', 
      data: { blockNumber: blockNum.toString() } 
    });

    // Add custom handler for manual queries
    const originalOnMessage = wsRef.current.onmessage;
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.id === requestId && data.result) {
          const blockHash = data.result;
          console.log(`Manual query: Got hash ${blockHash} for block ${blockNum}`);
          
          // Now get events for this block
          const eventsRequestId = Math.floor(Math.random() * 1000000);
          const getEventsMessage = {
            id: eventsRequestId,
            jsonrpc: "2.0",
            method: "state_getStorage",
            params: [
              "0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7",
              blockHash
            ]
          };
          
          wsRef.current?.send(JSON.stringify(getEventsMessage));
          
          // Handle events response
          const eventsHandler = (eventsEvent: MessageEvent) => {
            try {
              const eventsData = JSON.parse(eventsEvent.data);
              if (eventsData.id === eventsRequestId) {
                console.log(`Manual query: Events result for block ${blockNum}:`, eventsData.result);
                setManualQueryResult({
                  loading: false,
                  blockNumber: blockNum,
                  blockHash: blockHash,
                  eventsHex: eventsData.result,
                  hasEvents: eventsData.result && eventsData.result !== '0x' && eventsData.result !== null
                });
                
                // Restore original handler
                if (wsRef.current) {
                  wsRef.current.onmessage = originalOnMessage;
                }
              }
            } catch (error) {
              console.error("Error in manual events query:", error);
            }
            
            // Continue with original handler
            if (originalOnMessage) {
              originalOnMessage.call(wsRef.current, eventsEvent);
            }
          };
          
          wsRef.current.onmessage = eventsHandler;
        }
      } catch (error) {
        console.error("Error in manual block query:", error);
      }
      
      // Continue with original handler
      if (originalOnMessage) {
        originalOnMessage.call(wsRef.current, event);
      }
    };
    
    wsRef.current.send(JSON.stringify(getBlockHashMessage));
  };

  if (!chainId) {
    return <Navigate to="/chains/resonance/activity" />;
  }

  // If chain not found and the chainId is not a valid genesis hash format
  if (!chain && !chainId.startsWith("0x")) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          <Alert.Heading>Chain Not Found</Alert.Heading>
          <p>
            The chain "{chainId}" was not found. Please check the URL and try
            again.
          </p>
        </Alert>
      </Container>
    );
  }

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case "connecting":
        return <Badge bg="warning">Connecting...</Badge>;
      case "connected":
        return <Badge bg="success">Connected</Badge>;
      case "error":
        return <Badge bg="danger">Connection Error</Badge>;
      case "disconnected":
        return <Badge bg="secondary">Disconnected</Badge>;
    }
  };

  return (
    <Container className="mt-4">
      <Card className="mb-4">
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <h3 className="h5 mb-0">
              {chain ? chain.displayName : "Unknown Chain"}
              {chain && isQuantumChain(chain.name) && (
                <QuantumBadge variant="inline" />
              )}
            </h3>
            {chain?.endpoints && chain.endpoints.length > 0 && getStatusBadge()}
          </div>
        </Card.Header>
        <Card.Body>
          <div className="text-muted small">
            <strong>Genesis Hash:</strong>
            <br />
            <code className="text-break">{genesisHash}</code>
            {selectedEndpoint && (
              <>
                <br />
                <strong>Connected to:</strong>
                <br />
                <code className="text-break">{selectedEndpoint}</code>
              </>
            )}
            {chain && isQuantumChain(chain.name) && (
              <>
                <br />
                <strong>Cryptography:</strong> ML-DSA (Dilithium) signatures, Poseidon hashing
              </>
            )}
          </div>
        </Card.Body>
      </Card>

      {chain && isQuantumChain(chain.name) && (
        <Card className="mb-4">
          <Card.Header>
            <h5 className="mb-0">Debug: Manual Block Query</h5>
          </Card.Header>
          <Card.Body>
            <Form onSubmit={(e) => { e.preventDefault(); handleManualBlockQuery(); }}>
              <Row>
                <Col md={8}>
                  <Form.Group>
                    <Form.Label>Block Number</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="Enter block number (e.g., 113380)"
                      value={manualBlockNumber}
                      onChange={(e) => setManualBlockNumber(e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={4} className="d-flex align-items-end">
                  <Button 
                    variant="primary" 
                    onClick={handleManualBlockQuery}
                    disabled={connectionStatus !== "connected"}
                  >
                    Query Events
                  </Button>
                </Col>
              </Row>
            </Form>
            
            {manualQueryResult && (
              <div className="mt-3">
                {manualQueryResult.loading ? (
                  <div><Spinner animation="border" size="sm" /> Querying block {manualQueryResult.blockNumber}...</div>
                ) : (
                  <Alert variant={manualQueryResult.hasEvents ? "info" : "warning"}>
                    <strong>Block {manualQueryResult.blockNumber}</strong><br />
                    <small className="text-muted">Hash: {manualQueryResult.blockHash}</small><br />
                    <strong>Events:</strong> {manualQueryResult.hasEvents ? "Found" : "None"}<br />
                    {manualQueryResult.eventsHex && (
                      <details className="mt-2">
                        <summary>Raw event data (click to expand)</summary>
                        <pre className="mt-2 small" style={{ maxHeight: "200px", overflow: "auto" }}>
                          {manualQueryResult.eventsHex}
                        </pre>
                      </details>
                    )}
                  </Alert>
                )}
              </div>
            )}
          </Card.Body>
        </Card>
      )}

      <Card className="mb-4">
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Recent Activity</h5>
            {connectionStatus === "connecting" && (
              <Spinner animation="border" size="sm" />
            )}
          </div>
        </Card.Header>
        <Card.Body>
          <Blocks 
            blocks={blocks}
            connectionStatus={connectionStatus}
            hasEndpoints={!!chain?.endpoints && chain.endpoints.length > 0}
          />
        </Card.Body>
      </Card>
    </Container>
  );
};

export default Activity;