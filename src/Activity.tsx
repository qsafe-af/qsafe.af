import React, { useEffect, useState, useRef } from "react";
import { useParams, Navigate } from "react-router-dom";
import { Container, Alert, Card, Badge, Spinner } from "react-bootstrap";
import { getChain, normalizeToGenesis } from "./chains";
import Block from "./Block";
import BlockExtrinsics from "./components/BlockExtrinsics";
import { isQuantumChain } from "./decoder";
import { decodeEnhancedEvents } from "./decoders/eventDecoder";
import { getSystemEventsStorageKey } from "./generated/resonanceRuntimeMappings";
import QuantumBadge from "./QuantumBadge";
import ChainStatus from "./components/ChainStatus";
import type { BlockHeader, ConnectionStatus, SubstrateEvent } from "./types";
import { themeClasses } from "./theme-utils";
import { fetchMetadata } from "./utils/metadata";
import type { MetadataInfo } from "./utils/metadata";
import "./Activity.css";

const Activity: React.FC = () => {
  const { chainId } = useParams<{ chainId: string }>();
  const [blocks, setBlocks] = useState<BlockHeader[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [blockMetadata, setBlockMetadata] = useState<Map<string, MetadataInfo>>(
    new Map(),
  );
  const [metadataBySpecVersion, setMetadataBySpecVersion] = useState<
    Map<number, MetadataInfo>
  >(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionIdRef = useRef<string | null>(null);

  // Get chain information
  const chain = getChain(chainId || "");
  const genesisHash = chain ? chain.genesis : normalizeToGenesis(chainId || "");

  useEffect(() => {
    // Clear previous blocks when chain changes
    setBlocks([]);
    // Clear metadata caches when chain changes
    setBlockMetadata(new Map());
    setMetadataBySpecVersion(new Map());

    // Only connect if chain has endpoints
    if (!chain?.endpoints || chain.endpoints.length === 0) {
      return;
    }

    // Select a random endpoint
    const endpoint =
      chain.endpoints[Math.floor(Math.random() * chain.endpoints.length)];
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
        params: [],
      };

      ws.send(JSON.stringify(subscribeMessage));

      // Discover available RPC methods
      const methodsMessage = {
        id: 999,
        jsonrpc: "2.0",
        method: "rpc_methods",
        params: [],
      };
      ws.send(JSON.stringify(methodsMessage));
    };

    // Track pending requests
    const pendingRequests = new Map<number, { type: string; data: any }>();

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Only log non-subscription messages for clarity
        if (!data.method || data.method !== "chain_newHead") {
          console.log("WebSocket message received:", data);
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
          const eventMethods = data.result.methods.filter(
            (method: string) =>
              method.includes("event") ||
              method.includes("Event") ||
              method.includes("storage") ||
              method.includes("Storage"),
          );
          console.log("Event-related methods:", eventMethods);

          // Also check hash-related methods
          const hashMethods = data.result.methods.filter(
            (method: string) =>
              method.includes("hash") || method.includes("Hash"),
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

            if (request?.type === "getBlockHash") {
              const { blockNumber } = request.data;
              const actualHash = data.result;

              // Validate the hash format
              if (
                !actualHash ||
                !actualHash.startsWith("0x") ||
                actualHash.length !== 66
              ) {
                console.error(
                  `Invalid block hash received for block ${blockNumber}:`,
                  actualHash,
                );
                return;
              }

              // Update the block with the actual hash
              console.log(
                `Got valid block hash for block ${blockNumber}: ${actualHash}`,
              );
              setBlocks((prevBlocks) => {
                const updated = prevBlocks.map((block) =>
                  block.number === blockNumber
                    ? { ...block, hash: actualHash }
                    : block,
                );
                console.log(
                  `Updated blocks after hash fetch:`,
                  updated.find((b) => b.number === blockNumber),
                );
                console.log(
                  `[Activity] Block ${blockNumber} hash updated to ${actualHash}`,
                );
                return updated;
              });

              // Now fetch events for this block
              if (
                wsRef.current &&
                wsRef.current.readyState === WebSocket.OPEN
              ) {
                // First, let's try to get the runtime version to understand the chain better
                const getRuntimeMessage = {
                  id: Math.floor(Math.random() * 1000000),
                  jsonrpc: "2.0",
                  method: "state_getRuntimeVersion",
                  params: [actualHash],
                };
                pendingRequests.set(getRuntimeMessage.id, {
                  type: "getRuntimeVersion",
                  data: { blockNumber, blockHash: actualHash },
                });
                console.log(
                  `[Activity] Sending getRuntimeVersion request for block ${blockNumber} with hash ${actualHash}`,
                );
                wsRef.current.send(JSON.stringify(getRuntimeMessage));

                // Get the storage key for System.Events
                const systemEventsKey = getSystemEventsStorageKey();

                // First, let's see what storage keys exist for this block
                const getKeysMessage = {
                  id: Math.floor(Math.random() * 1000000),
                  jsonrpc: "2.0",
                  method: "state_getKeys",
                  params: ["0x26aa394eea5630e07c48ae0c9558cef7", actualHash],
                };
                console.log(
                  `Getting storage keys for block ${blockNumber} to find events storage`,
                );
                pendingRequests.set(getKeysMessage.id, {
                  type: "getStorageKeys",
                  data: { blockNumber, blockHash: actualHash },
                });
                wsRef.current.send(JSON.stringify(getKeysMessage));

                const getEventsMessage = {
                  id: Math.floor(Math.random() * 1000000),
                  jsonrpc: "2.0",
                  method: "state_getStorage",
                  params: [systemEventsKey, actualHash],
                };
                console.log(
                  `Fetching events for block ${blockNumber} with message:`,
                  getEventsMessage,
                );
                pendingRequests.set(getEventsMessage.id, {
                  type: "getEvents",
                  data: { blockNumber, blockHash: actualHash },
                });
                wsRef.current.send(JSON.stringify(getEventsMessage));

                // Also try chain_getBlock to get full block with extrinsics
                const getBlockMessage = {
                  id: Math.floor(Math.random() * 1000000),
                  jsonrpc: "2.0",
                  method: "chain_getBlock",
                  params: [actualHash],
                };
                pendingRequests.set(getBlockMessage.id, {
                  type: "getBlock",
                  data: { blockNumber, blockHash: actualHash },
                });
                wsRef.current.send(JSON.stringify(getBlockMessage));
              }
            } else if (request?.type === "getStorageKeys") {
              const { blockNumber } = request.data;
              console.log(
                `Storage keys for block ${blockNumber}:`,
                data.result,
              );
              // Look for any key that might contain events
              if (data.result && Array.isArray(data.result)) {
                const eventKeys = data.result.filter(
                  (key: string) =>
                    key.includes("26aa394eea5630e07c48ae0c9558cef7") ||
                    key.toLowerCase().includes("event"),
                );
                console.log(`Found potential event storage keys:`, eventKeys);
              }
            } else if (request?.type === "getEvents") {
              const { blockNumber, blockHash } = request.data;
              console.log(
                `Got events response for block ${blockNumber}:`,
                data.result,
              );
              console.log(`Response type:`, typeof data.result);
              console.log(
                `Response length:`,
                data.result ? data.result.length : "null",
              );
              let events: SubstrateEvent[] = [];

              if (
                !data.result ||
                data.result === "0x" ||
                data.result === null
              ) {
                console.log(
                  `No events found for block ${blockNumber} (empty or null result)`,
                );
                // Try alternative event fetching for quantum chains
                if (chain && isQuantumChain(chain.name) && wsRef.current) {
                  console.log(
                    `Trying alternative event storage for quantum chain`,
                  );
                  // Try getting all storage changes for this block
                  const getStorageAtMessage = {
                    id: Math.floor(Math.random() * 1000000),
                    jsonrpc: "2.0",
                    method: "state_queryStorage",
                    params: [
                      [getSystemEventsStorageKey()],
                      blockHash,
                      blockHash,
                    ],
                  };
                  console.log(
                    `Querying storage changes for block ${blockNumber}`,
                  );
                  pendingRequests.set(getStorageAtMessage.id, {
                    type: "queryStorageChanges",
                    data: { blockNumber, blockHash },
                  });
                  wsRef.current.send(JSON.stringify(getStorageAtMessage));
                }
              } else {
                try {
                  // All chains (including quantum) use standard SCALE encoding for events
                  console.log(
                    `Decoding enhanced SCALE events for block ${blockNumber}...`,
                  );
                  events = decodeEnhancedEvents(data.result);
                  console.log(
                    `Decoded ${events.length} events for block ${blockNumber}:`,
                    events,
                  );
                } catch (error) {
                  console.error(
                    `Error decoding events for block ${blockNumber}:`,
                    error,
                  );
                  console.error(
                    `Raw event data that failed to decode:`,
                    data.result,
                  );
                }
              }

              // Update block with decoded events
              setBlocks((prevBlocks) =>
                prevBlocks.map((block) =>
                  block.number === blockNumber ? { ...block, events } : block,
                ),
              );
            } else if (request?.type === "getRuntimeVersion") {
              const { blockNumber, blockHash } = request.data;
              console.log(
                `[Activity] Runtime version for block ${blockNumber}:`,
                data.result,
              );

              // Fetch metadata for this runtime version
              if (data.result && data.result.specVersion && endpoint) {
                const specVersion = data.result.specVersion;
                console.log(
                  `[Activity] Processing runtime version ${specVersion} for block ${blockNumber} (hash: ${blockHash})`,
                );

                // Check if we already have metadata for this spec version
                if (!metadataBySpecVersion.has(specVersion)) {
                  console.log(
                    `[Activity] Fetching metadata for spec version ${specVersion}...`,
                  );
                  fetchMetadata(endpoint, blockHash)
                    .then((metadata) => {
                      // Store metadata by spec version for reuse
                      setMetadataBySpecVersion((prev) => {
                        const updated = new Map(prev);
                        updated.set(specVersion, metadata);
                        return updated;
                      });

                      // Also store for this specific block
                      setBlockMetadata((prev) => {
                        const updated = new Map(prev);
                        updated.set(blockHash, metadata);
                        console.log(
                          `[Activity] Stored metadata for block hash ${blockHash}, map now has ${updated.size} entries`,
                        );
                        return updated;
                      });

                      console.log(
                        `[Activity] Fetched metadata for spec version ${specVersion}: ${metadata.callMap.size} pallets`,
                      );

                      // Force re-render of blocks that use this metadata
                      setBlocks((prevBlocks) => [...prevBlocks]);
                    })
                    .catch((error) => {
                      console.error(
                        `Failed to fetch metadata for block ${blockNumber}:`,
                        error,
                      );
                    });
                } else {
                  // Reuse existing metadata for this spec version
                  const metadata = metadataBySpecVersion.get(specVersion);
                  if (metadata) {
                    setBlockMetadata((prev) => {
                      const updated = new Map(prev);
                      updated.set(blockHash, metadata);
                      console.log(
                        `[Activity] Reusing metadata for block hash ${blockHash}, map now has ${updated.size} entries`,
                      );
                      return updated;
                    });
                    console.log(
                      `[Activity] Reusing metadata for block ${blockNumber} (spec version ${specVersion})`,
                    );
                  }
                }
              }
            } else if (request?.type === "getBlock") {
              const { blockNumber } = request.data;
              console.log(
                `Full block data for block ${blockNumber}:`,
                data.result,
              );

              // Check if block contains extrinsics
              if (
                data.result &&
                data.result.block &&
                data.result.block.extrinsics
              ) {
                console.log(
                  `Block ${blockNumber} contains ${data.result.block.extrinsics.length} extrinsics`,
                );
                console.log(`Extrinsics:`, data.result.block.extrinsics);

                // Update block with extrinsics
                const extrinsics = data.result.block.extrinsics;
                setBlocks((prevBlocks) =>
                  prevBlocks.map((block) =>
                    block.number === blockNumber
                      ? { ...block, extrinsics }
                      : block,
                  ),
                );

                // If we find extrinsics but no events via storage, let's try to query events differently
                if (data.result.block.extrinsics.length > 0) {
                  // Try state_queryStorageAt as an alternative
                  const queryStorageMessage = {
                    id: Math.floor(Math.random() * 1000000),
                    jsonrpc: "2.0",
                    method: "state_queryStorageAt",
                    params: [
                      [getSystemEventsStorageKey()],
                      data.result.block.header.hash || data.result.block.hash,
                    ],
                  };
                  console.log(
                    `Trying state_queryStorageAt for block ${blockNumber}`,
                  );
                  pendingRequests.set(queryStorageMessage.id, {
                    type: "queryStorage",
                    data: { blockNumber },
                  });
                  wsRef.current?.send(JSON.stringify(queryStorageMessage));
                }
              }
            } else if (request?.type === "queryStorage") {
              const { blockNumber } = request.data;
              console.log(
                `Query storage result for block ${blockNumber}:`,
                data.result,
              );
            } else if (request?.type === "queryStorageChanges") {
              const { blockNumber } = request.data;
              console.log(
                `Storage changes for block ${blockNumber}:`,
                data.result,
              );
              if (
                data.result &&
                Array.isArray(data.result) &&
                data.result.length > 0
              ) {
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

          // In Substrate chains, the block number is in hex format
          const blockNumber = parseInt(header.number, 16).toString();

          // The hash is not in the header - it needs to be computed or fetched
          // Initialize with pending status
          let blockHash = `pending_${blockNumber}`;

          console.log(
            `New block header received: #${blockNumber}, will fetch hash via RPC`,
          );

          const newBlock: BlockHeader = {
            number: blockNumber,
            hash: blockHash,
            timestamp: Date.now(),
            events: [], // Initialize with empty events
            digest: header.digest, // Capture digest from header
          };

          setBlocks((prevBlocks) => {
            // Check if block already exists
            const existingBlockIndex = prevBlocks.findIndex(
              (b) => b.number === blockNumber,
            );
            if (existingBlockIndex !== -1) {
              // Block already exists, update it instead of adding duplicate
              const updated = [...prevBlocks];
              updated[existingBlockIndex] = newBlock;
              return updated.slice(0, 20);
            }
            // Block doesn't exist, add it to the beginning
            return [newBlock, ...prevBlocks].slice(0, 20);
          });

          // Fetch the block hash via RPC (exactly as the working command line example)
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const blockNumberInt = parseInt(header.number, 16);
            const requestId = Math.floor(Math.random() * 1000000);
            const getBlockHashMessage = {
              id: requestId,
              jsonrpc: "2.0",
              method: "chain_getBlockHash",
              params: [blockNumberInt],
            };
            console.log(
              `Requesting block hash for block ${blockNumberInt}:`,
              JSON.stringify(getBlockHashMessage),
            );
            pendingRequests.set(requestId, {
              type: "getBlockHash",
              data: { blockNumber },
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
          params: [subscriptionIdRef.current],
        };
        ws.send(JSON.stringify(unsubscribeMessage));
      }

      ws.close();
      wsRef.current = null;
      subscriptionIdRef.current = null;
    };
  }, [chain, chainId]);

  const formatEventDataForDisplay = (data: any): React.ReactNode => {
    if (!data) return null;

    if (typeof data === "string")
      return <span className="text-muted">{data}</span>;

    if (Array.isArray(data)) {
      if (
        data.length === 1 &&
        typeof data[0] === "string" &&
        data[0].startsWith("0x")
      ) {
        return (
          <span className="text-muted font-monospace small">{data[0]}</span>
        );
      }
      return (
        <>
          {data.map((item, idx) => (
            <div key={idx} className={idx > 0 ? "mt-2" : ""}>
              {formatEventDataForDisplay(item)}
            </div>
          ))}
        </>
      );
    }

    if (typeof data === "object") {
      return (
        <div className="small">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="d-flex align-items-start">
              <span className="text-info me-2">{formatKey(key)}:</span>
              <span className={themeClasses.text.primary}>
                {formatValue(value)}
              </span>
            </div>
          ))}
        </div>
      );
    }

    return String(data);
  };

  const formatKey = (key: string): string => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const formatValue = (value: any): React.ReactNode => {
    if (!value) return "null";

    if (
      value &&
      typeof value === "object" &&
      "display" in value &&
      "value" in value
    ) {
      return (
        <span className="font-monospace" title={value.value}>
          {value.display}
        </span>
      );
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      return (
        <span>
          {Object.entries(value).map(([k, v], idx) => (
            <span key={k}>
              {idx > 0 && ", "}
              {formatKey(k)}: {formatValue(v)}
            </span>
          ))}
        </span>
      );
    }

    if (Array.isArray(value)) {
      return value.map((item, idx) => (
        <span key={idx}>
          {idx > 0 && ", "}
          {formatValue(item)}
        </span>
      ));
    }

    return String(value);
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
              {chain ? (
                <img
                  src={`/chains/${chain.name}/logo.png`}
                  alt={chain.name}
                  className="rounded-circle"
                  style={{
                    width: "24px",
                    height: "24px",
                    marginRight: "0.4em",
                  }}
                />
              ) : null}
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
                <strong>Cryptography:</strong> ML-DSA (Dilithium) signatures,
                Poseidon hashing
              </>
            )}
          </div>
        </Card.Body>
      </Card>

      {chain?.endpoints &&
        chain.endpoints.length > 0 &&
        connectionStatus === "connected" && (
          <ChainStatus ws={wsRef.current} connectionStatus={connectionStatus} />
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
          {!chain?.endpoints || chain.endpoints.length === 0 ? (
            <Alert variant="info">
              No endpoints configured for this chain.
            </Alert>
          ) : blocks.length === 0 ? (
            <p className="text-muted">
              {connectionStatus === "connected"
                ? "Waiting for new blocks..."
                : "Connecting to blockchain..."}
            </p>
          ) : (
            <div className="activity-blocks-events">
              {blocks.map((block, index) => {
                const metadata =
                  block.hash && !block.hash.startsWith("pending_")
                    ? blockMetadata.get(block.hash)
                    : undefined;
                console.log(
                  `[Activity] Rendering block ${block.number} with hash ${block.hash}, metadata available: ${!!metadata}`,
                );
                return (
                  <div
                    key={`${block.number}-${index}`}
                    className="block-event-row"
                  >
                    <div className="block-column">
                      <Block block={block} index={index} />
                    </div>
                    <div className="event-column">
                      <BlockExtrinsics
                        block={block}
                        chain={chain}
                        metadata={metadata}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
};

export default Activity;
