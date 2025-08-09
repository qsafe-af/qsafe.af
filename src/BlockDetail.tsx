import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Alert, Badge, Spinner, Button } from "react-bootstrap";
import { decodeEnhancedEvents } from "./decoders/eventDecoder";
import { getChain } from "./chains";
import type { SubstrateEvent, ConnectionStatus } from "./types";
import { themeClasses } from "./theme-utils";

interface BlockDetailData {
  blockNumber: string;
  blockHash: string;
  eventsHex?: string;
  events?: SubstrateEvent[];
  hasEvents: boolean;
  loading: boolean;
  error?: string;
}

const BlockDetail: React.FC = () => {
  const { chainId, blockNumberOrHash } = useParams<{
    chainId: string;
    blockNumberOrHash: string;
  }>();
  const navigate = useNavigate();
  const [blockData, setBlockData] = useState<BlockDetailData>({
    blockNumber: "",
    blockHash: "",
    hasEvents: false,
    loading: true,
  });
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [retryCount, setRetryCount] = useState(0);
  const [resolvedBlockHash, setResolvedBlockHash] = useState<string | null>(
    null,
  );
  const wsRef = useRef<WebSocket | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);

  const chain = chainId ? getChain(chainId) : null;

  const formatEventData = (data: any): React.ReactNode => {
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
              {formatEventData(item)}
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

  const connectWebSocket = () => {
    // Reset resolved hash on new connection
    setResolvedBlockHash(null);

    // Clear any pending error timeouts
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }

    if (!chain || !blockNumberOrHash) {
      console.error("Invalid chain or block:", { chain, blockNumberOrHash });
      setBlockData((prev) => ({
        ...prev,
        loading: false,
        error: "Invalid chain or block",
      }));
      return;
    }

    const endpoint = chain.endpoints?.[0];
    if (!endpoint) {
      console.error("No endpoint available for chain:", chain.name);
      setBlockData((prev) => ({
        ...prev,
        loading: false,
        error: "No endpoint available",
      }));
      return;
    }

    console.log(
      `Connecting to ${chain.displayName} at ${endpoint} for block ${blockNumberOrHash} (attempt ${retryCount + 1})`,
    );
    setConnectionStatus("connecting");
    setBlockData((prev) => ({ ...prev, loading: true, error: undefined }));

    const ws = new WebSocket(endpoint);
    wsRef.current = ws;

    const queryBlockWithHash = (hash: string) => {
      // Store the hash for later use
      setResolvedBlockHash(hash);
      const getBlockMessage = {
        id: 2,
        jsonrpc: "2.0",
        method: "chain_getBlock",
        params: [hash],
      };
      ws.send(JSON.stringify(getBlockMessage));
    };

    ws.onopen = () => {
      console.log("WebSocket connected successfully");
      setConnectionStatus("connected");

      // Determine if we have a block number or hash
      const isBlockNumber = /^\d+$/.test(blockNumberOrHash);

      if (isBlockNumber) {
        const blockNum = parseInt(blockNumberOrHash, 10);

        // Validate block number
        if (isNaN(blockNum) || blockNum < 0) {
          setBlockData((prev) => ({
            ...prev,
            loading: false,
            error: `Invalid block number: ${blockNumberOrHash}`,
          }));
          setConnectionStatus("connected");
          return;
        }

        if (blockNum > 999999999) {
          setBlockData((prev) => ({
            ...prev,
            loading: false,
            error: `Block number too large: ${blockNumberOrHash}`,
          }));
          setConnectionStatus("connected");
          return;
        }

        // First get the block hash for the number
        const getHashMessage = {
          id: 1,
          jsonrpc: "2.0",
          method: "chain_getBlockHash",
          params: [blockNum],
        };
        console.log("Requesting block hash for number:", blockNumberOrHash);
        ws.send(JSON.stringify(getHashMessage));
      } else {
        // Validate hash format
        if (
          !blockNumberOrHash.startsWith("0x") ||
          blockNumberOrHash.length < 66
        ) {
          setBlockData((prev) => ({
            ...prev,
            loading: false,
            error: `Invalid block hash format: ${blockNumberOrHash}`,
          }));
          setConnectionStatus("connected");
          return;
        }

        // We already have a hash, query the block directly
        console.log("Querying block with hash:", blockNumberOrHash);
        queryBlockWithHash(blockNumberOrHash);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus("error");
      // Don't set error in blockData here - wait for onclose to determine if it's final
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      setConnectionStatus("disconnected");
      if (!event.wasClean && retryCount < 3) {
        console.log("Connection lost, retrying in 2 seconds...");
        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
        }, 2000);
      } else if (!event.wasClean && retryCount >= 3) {
        // Only show error after all retries exhausted
        const errorMessage = `Unable to connect to blockchain node`;
        setBlockData((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.error) {
          console.error("RPC error:", data.error);
          // Don't set error during initial load sequence - just log it
          return;
        }

        if (data.id === 1) {
          if (data.result) {
            // Got block hash from number
            console.log("Got block hash:", data.result);
            queryBlockWithHash(data.result);
          } else {
            // Block number doesn't exist
            console.error(
              "Failed to get block hash for number:",
              blockNumberOrHash,
            );
            // Delay error display to avoid flash
            errorTimeoutRef.current = setTimeout(() => {
              setBlockData((prev) => ({
                ...prev,
                loading: false,
                error: `Block #${blockNumberOrHash} not found. The block may not exist yet or may have been pruned.`,
              }));
            }, 500);
          }
        } else if (data.id === 2) {
          if (!data.result) {
            // Block not found
            errorTimeoutRef.current = setTimeout(() => {
              setBlockData((prev) => ({
                ...prev,
                loading: false,
                error: `Block not found: ${blockNumberOrHash}`,
              }));
            }, 500);
            return;
          }
          // Got block data
          console.log("Got block data:", data.result);
          const blockNumber = parseInt(
            data.result.block.header.number,
            16,
          ).toString();
          // Use the hash we resolved (either from chain_getBlockHash or from URL)
          const blockHash = resolvedBlockHash || blockNumberOrHash;
          console.log(`Block #${blockNumber} hash: ${blockHash}`);
          // Keep loading state true - wait for events
          setBlockData((prev) => ({
            ...prev,
            blockNumber,
            blockHash: blockHash,
            // Don't change loading state - keep it true
          }));

          // Now query for events at this block
          const getEventsMessage = {
            id: 3,
            jsonrpc: "2.0",
            method: "state_getStorage",
            params: [
              "0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7",
              blockHash,
            ],
          };
          console.log("Querying events for block:", blockHash);
          ws.send(JSON.stringify(getEventsMessage));
        } else if (data.id === 3) {
          // Got events data
          let decodedEvents: SubstrateEvent[] = [];
          let hasEvents = false;

          if (data.result && data.result !== "0x" && data.result !== null) {
            hasEvents = true;
            console.log(`Found events data (${data.result.length} chars)`);
            try {
              decodedEvents = decodeEnhancedEvents(data.result);
              console.log(`Decoded ${decodedEvents.length} events`);
            } catch (error) {
              console.error("Failed to decode events:", error);
            }
          } else {
            console.log("No events found in block");
          }

          // Clear any pending error timeouts since we got successful data
          if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
            errorTimeoutRef.current = null;
          }

          // Now we have final results - stop loading
          setBlockData((prev) => ({
            ...prev,
            eventsHex: data.result,
            events: decodedEvents,
            hasEvents,
            loading: false,
          }));
        }
      } catch (error) {
        console.error("Error processing message:", error);
        setBlockData((prev) => ({
          ...prev,
          loading: false,
          error: "Failed to process block data",
        }));
      }
    };
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, [chain, blockNumberOrHash, retryCount]);

  if (!chain) {
    return (
      <Alert variant="danger">
        <strong>Error:</strong> Chain not found
      </Alert>
    );
  }

  return (
    <div className="container-fluid mt-4">
      <div className="mb-3">
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
          <i className="bi bi-arrow-left me-2"></i>
          Back
        </Button>
      </div>

      <Card
        className={`${themeClasses.bg.tertiary} ${themeClasses.text.primary}`}
      >
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Block Details - {chain.displayName}</h5>
            <div className="d-flex align-items-center small">
              <span className="me-2">Connection:</span>
              <Badge
                bg={
                  connectionStatus === "connected"
                    ? "success"
                    : connectionStatus === "connecting"
                      ? "warning"
                      : connectionStatus === "error"
                        ? "danger"
                        : "secondary"
                }
              >
                {connectionStatus}
              </Badge>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          {blockData.loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
              <div className="mt-3">
                <h6>Loading block {blockNumberOrHash}</h6>
                <p className="text-muted small mb-0">
                  {connectionStatus === "connecting"
                    ? "Connecting to blockchain node..."
                    : "Fetching block data..."}
                </p>
              </div>
            </div>
          ) : blockData.error ? (
            <Alert variant="danger">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <strong>Error:</strong> {blockData.error}
                  <div className="mt-2 small text-muted">
                    <div>Block: {blockNumberOrHash}</div>
                    <div>Chain: {chain.displayName}</div>
                    <div>Endpoint: {chain.endpoints?.[0] || "None"}</div>
                  </div>
                </div>
                {retryCount < 3 && (
                  <Button
                    variant="outline-light"
                    size="sm"
                    onClick={() => {
                      setRetryCount((prev) => prev + 1);
                    }}
                  >
                    <i className="bi bi-arrow-clockwise me-2"></i>
                    Retry
                  </Button>
                )}
              </div>
            </Alert>
          ) : (
            <>
              <div className="mb-4">
                <h6>Block Information</h6>
                <div className={`${themeClasses.bg.subtle} p-3 rounded`}>
                  <div className="mb-2">
                    <strong>Block Number:</strong> {blockData.blockNumber}
                  </div>
                  <div className="mb-2">
                    <strong>Block Hash:</strong>{" "}
                    <span className="font-monospace small">
                      {blockData.blockHash}
                    </span>
                  </div>
                  <div>
                    <strong>Events:</strong>{" "}
                    {blockData.hasEvents
                      ? `${blockData.events?.length || 0} found`
                      : "None"}
                  </div>
                </div>
              </div>

              {blockData.events && blockData.events.length > 0 && (
                <div className="mb-4">
                  <h6>Events</h6>
                  <div className="events-list">
                    {blockData.events.map(
                      (event: SubstrateEvent, idx: number) => (
                        <div
                          key={idx}
                          className={`mb-3 p-3 ${themeClasses.bg.subtle} rounded`}
                        >
                          <div className="d-flex align-items-start justify-content-between">
                            <div>
                              <Badge
                                bg={
                                  event.event.section === "system"
                                    ? "primary"
                                    : event.event.section === "balances"
                                      ? "success"
                                      : event.event.section === "utility"
                                        ? "dark"
                                        : "secondary"
                                }
                              >
                                {event.event.section}.{event.event.method}
                              </Badge>
                              {event.phase.applyExtrinsic !== undefined &&
                                event.phase.applyExtrinsic > 0 && (
                                  <small className="text-muted ms-2">
                                    Extrinsic #{event.phase.applyExtrinsic}
                                  </small>
                                )}
                              {event.phase.initialization && (
                                <small className="text-muted ms-2">
                                  Initialization
                                </small>
                              )}
                              {event.phase.finalization && (
                                <small className="text-muted ms-2">
                                  Finalization
                                </small>
                              )}
                            </div>
                          </div>
                          {event.event.data && event.event.data.length > 0 && (
                            <div className="mt-3 ms-3">
                              {formatEventData(event.event.data)}
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {blockData.eventsHex && (
                <div className="mb-4">
                  <h6>Raw Block (Hex)</h6>
                  <pre
                    className={`mt-2 p-3 ${themeClasses.bg.subtle} rounded`}
                    style={{ maxHeight: "300px", overflow: "auto" }}
                  >
                    {blockData.eventsHex}
                  </pre>
                </div>
              )}
            </>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default BlockDetail;
