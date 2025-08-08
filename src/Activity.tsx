import React, { useEffect, useState, useRef } from "react";
import { useParams, Navigate } from "react-router-dom";
import { Container, Alert, Card, Badge, Spinner, Row, Col } from "react-bootstrap";
import { getChain, normalizeToGenesis } from "./chains";
import Blocks from "./Blocks";
import Events from "./Events";
import type { BlockHeader, ConnectionStatus } from "./types";
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

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle subscription confirmation
        if (data.id === 1 && data.result) {
          subscriptionIdRef.current = data.result;
          console.log("Subscribed with ID:", data.result);
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
            timestamp: Date.now()
          };
          
          setBlocks(prevBlocks => [newBlock, ...prevBlocks].slice(0, 20)); // Keep last 20 blocks
          
          // Optional: Fetch the actual block hash
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const getBlockHashMessage = {
              id: Date.now(),
              jsonrpc: "2.0",
              method: "chain_getBlockHash",
              params: [header.number]
            };
            wsRef.current.send(JSON.stringify(getBlockHashMessage));
            
            // Store the request ID to match the response
            const requestId = getBlockHashMessage.id;
            
            // Update the message handler to handle the block hash response
            const originalOnMessage = wsRef.current.onmessage;
            wsRef.current.onmessage = (event) => {
              try {
                const response = JSON.parse(event.data);
                if (response.id === requestId && response.result) {
                  // Update the block with the actual hash
                  setBlocks(prevBlocks => 
                    prevBlocks.map(block => 
                      block.number === blockNumber 
                        ? { ...block, hash: response.result }
                        : block
                    )
                  );
                  // Restore original handler
                  if (wsRef.current) {
                    wsRef.current.onmessage = originalOnMessage;
                  }
                }
              } catch (error) {
                console.error("Error parsing block hash response:", error);
              }
              // Call original handler
              if (originalOnMessage && wsRef.current) {
                originalOnMessage.call(wsRef.current, event);
              }
            };
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
          </div>
        </Card.Body>
      </Card>

      <Row>
        <Col lg={6}>
          <Card className="mb-4">
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Recent Blocks</h5>
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
        </Col>
        <Col lg={6}>
          <Events />
        </Col>
      </Row>
    </Container>
  );
};

export default Activity;