import React, { useEffect, useState, useRef } from "react";
import { useParams, Navigate } from "react-router-dom";
import { Container, Alert, Card, Badge, Spinner } from "react-bootstrap";
import { getChain, normalizeToGenesis } from "./chains";
import Blocks from "./Blocks";
import { QuantumDecoder, isQuantumChain } from "./decoder";
import QuantumBadge from "./QuantumBadge";
import type { BlockHeader, ConnectionStatus, SubstrateEvent } from "./types";
import "./Activity.css";

const Activity: React.FC = () => {
  const { chainId } = useParams<{ chainId: string }>();
  const [blocks, setBlocks] = useState<BlockHeader[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
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
                "0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7", // system.events() for Substrate v2
              ];
              
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
          } else if (request?.type === 'getEvents') {
            const { blockNumber } = request.data;
            console.log(`Got events response for block ${blockNumber}:`, data.result);
            let events: SubstrateEvent[] = [];
            
            if (!data.result || data.result === '0x' || data.result === null) {
              console.log(`No events found for block ${blockNumber} (empty or null result)`);
            } else {
              try {
                // Check if this is a quantum-resistant chain
                if (chain && isQuantumChain(chain.name)) {
                  console.log(`Attempting to decode quantum events for ${chain.name} chain...`);
                  // Use quantum decoder for quantus and resonance chains
                  const quantumEvents = QuantumDecoder.decodeEventsFromHex(data.result);
                  events = QuantumDecoder.toSubstrateEvents(quantumEvents);
                  console.log(`Decoded ${events.length} quantum events for block ${blockNumber}:`, events);
                } else {
                  // For other chains, we'd use standard SCALE decoding
                  console.log(`Events for block ${blockNumber} (standard chain):`, data.result);
                  // TODO: Implement standard SCALE decoder
                }
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