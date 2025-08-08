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
    };

    // Track pending requests
    const pendingRequests = new Map<number, { type: string, data: any }>();

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle subscription confirmation
        if (data.id === 1 && data.result) {
          subscriptionIdRef.current = data.result;
          console.log("Subscribed with ID:", data.result);
        }
        
        // Handle responses to our requests
        if (data.id && data.result !== undefined && pendingRequests.has(data.id)) {
          const request = pendingRequests.get(data.id);
          pendingRequests.delete(data.id);
          
          if (request?.type === 'getBlockHash') {
            const { blockNumber } = request.data;
            const actualHash = data.result;
            
            // Update the block with the actual hash
            setBlocks(prevBlocks => 
              prevBlocks.map(block => 
                block.number === blockNumber 
                  ? { ...block, hash: actualHash }
                  : block
              )
            );
            
            // Now fetch events for this block
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              const getEventsMessage = {
                id: Date.now() + Math.random(),
                jsonrpc: "2.0",
                method: "state_getStorage",
                params: [
                  "0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7", // system.events() storage key
                  actualHash
                ]
              };
              pendingRequests.set(getEventsMessage.id, { 
                type: 'getEvents', 
                data: { blockNumber, blockHash: actualHash } 
              });
              wsRef.current.send(JSON.stringify(getEventsMessage));
            }
          } else if (request?.type === 'getEvents') {
            const { blockNumber } = request.data;
            let events: SubstrateEvent[] = [];
            
            try {
              // Check if this is a quantum-resistant chain
              if (chain && isQuantumChain(chain.name)) {
                // Use quantum decoder for quantus and resonance chains
                const quantumEvents = QuantumDecoder.decodeEventsFromHex(data.result);
                events = QuantumDecoder.toSubstrateEvents(quantumEvents);
                console.log(`Decoded ${events.length} quantum events for block ${blockNumber}`);
              } else {
                // For other chains, we'd use standard SCALE decoding
                console.log(`Events for block ${blockNumber} (standard chain):`, data.result);
                // TODO: Implement standard SCALE decoder
              }
            } catch (error) {
              console.error(`Error decoding events for block ${blockNumber}:`, error);
            }
            
            // Update block with decoded events
            setBlocks(prevBlocks => 
              prevBlocks.map(block => 
                block.number === blockNumber 
                  ? { ...block, events }
                  : block
              )
            );
          }
        }
        
        // Handle new block headers
        if (data.method === "chain_newHead" && data.params) {
          const { result: header } = data.params;
          
          // In Substrate chains, the block number is in hex format
          const blockNumber = parseInt(header.number, 16).toString();
          
          // For new head subscriptions, we need to fetch the block hash
          // Since it's not included in the header, we'll use a placeholder
          // In a production app, you'd make an additional RPC call to get the actual hash
          const blockHash = `0x${blockNumber.padStart(64, '0')}`; // Placeholder
          
          const newBlock: BlockHeader = {
            number: blockNumber,
            hash: blockHash,
            timestamp: Date.now(),
            events: [] // Initialize with empty events
          };
          
          setBlocks(prevBlocks => [newBlock, ...prevBlocks].slice(0, 20)); // Keep last 20 blocks
          
          // Fetch the actual block hash
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const getBlockHashMessage = {
              id: Date.now() + Math.random(),
              jsonrpc: "2.0",
              method: "chain_getBlockHash",
              params: [header.number]
            };
            pendingRequests.set(getBlockHashMessage.id, { 
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