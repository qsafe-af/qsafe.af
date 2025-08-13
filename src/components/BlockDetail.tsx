import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, Alert, Badge, Spinner, Button } from "react-bootstrap";
import { decodeEnhancedEvents } from "../decoders/eventDecoder";
import { getChain } from "../chains";
import { getSystemEventsStorageKey } from "../generated/resonanceRuntimeMappings";
import type { SubstrateEvent, ConnectionStatus } from "../types";
import { themeClasses } from "../theme-utils";
import { decodeDigest } from "../decoders/digestDecoder";
import { formatAuthorAddress } from "../utils/ss58";
import BlockExtrinsic from "./BlockExtrinsic";

import "./BlockExtrinsics.css";
import "./ExtrinsicEvents.css";

interface BlockDetailData {
  blockNumber: string;
  blockHash: string;
  block?: any;
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
  const [formattedAuthor, setFormattedAuthor] = useState<string | null>(null);
  const [authorAddress, setAuthorAddress] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);

  const chain = chainId ? getChain(chainId) : null;

  // Helper function to group events by extrinsic index
  const groupEventsByExtrinsic = (events: SubstrateEvent[], extrinsicsCount: number) => {
    const grouped: { [key: number]: SubstrateEvent[] } = {};
    
    // Initialize groups for all extrinsics
    for (let i = 0; i < extrinsicsCount; i++) {
      grouped[i] = [];
    }
    
    // Group events
    events.forEach(event => {
      if (event.phase?.applyExtrinsic !== undefined) {
        const extrinsicIndex = event.phase.applyExtrinsic;
        if (!grouped[extrinsicIndex]) {
          grouped[extrinsicIndex] = [];
        }
        grouped[extrinsicIndex].push(event);
      }
    });
    
    return grouped;
  };

  useEffect(() => {
    if (!chainId || !blockNumberOrHash || !chain || !chain.endpoints) {
      setBlockData((prev) => ({
        ...prev,
        loading: false,
        error: "Invalid chain configuration",
      }));
      return;
    }

    console.log("BlockDetail mounted. Chain:", chainId, "Block:", blockNumberOrHash);

    // Clear any pending error timeout when we start a new connection
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }

    const endpoint = chain.endpoints[0];
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;

    const queryBlockWithHash = (hash: string) => {
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
      console.log("WebSocket connected");
      setConnectionStatus("connected");

      const isBlockNumber = /^\d+$/.test(blockNumberOrHash);

      if (isBlockNumber) {
        const blockNum = parseInt(blockNumberOrHash, 10);
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

        const getHashMessage = {
          id: 1,
          jsonrpc: "2.0",
          method: "chain_getBlockHash",
          params: [blockNum],
        };
        console.log("Requesting block hash for number:", blockNumberOrHash);
        ws.send(JSON.stringify(getHashMessage));
      } else {
        if (!blockNumberOrHash.startsWith("0x") || blockNumberOrHash.length < 66) {
          setBlockData((prev) => ({
            ...prev,
            loading: false,
            error: `Invalid block hash format: ${blockNumberOrHash}`,
          }));
          setConnectionStatus("connected");
          return;
        }

        console.log("Querying block with hash:", blockNumberOrHash);
        queryBlockWithHash(blockNumberOrHash);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus("error");
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
          return;
        }

        if (data.id === 1) {
          if (data.result) {
            console.log("Got block hash:", data.result);
            queryBlockWithHash(data.result);
          } else {
            console.error("Failed to get block hash for number:", blockNumberOrHash);
            errorTimeoutRef.current = setTimeout(() => {
              setBlockData((prev) => ({
                ...prev,
                loading: false,
                error: `Block #${blockNumberOrHash} not found. The block may not exist yet or may have been pruned.`,
              }));
            }, 500) as unknown as number;
          }
        } else if (data.id === 2) {
          if (data.result && data.result.block) {
            const block = data.result.block;
            console.log("Got block data:", block);
            const blockNumber = parseInt(block.header.number, 16).toString();
            const blockHash = resolvedBlockHash || blockNumberOrHash;
            console.log(`Block #${blockNumber} hash: ${blockHash}`);

            // Extract author from digest
            const digestInfo = block.header.digest ? decodeDigest(block.header.digest) : null;
            const author = digestInfo?.author;

            // Format author address
            if (author) {
              setAuthorAddress(author);
              formatAuthorAddress(author, chain.endpoints?.[0], chain.genesis)
                .then((formatted: string) => setFormattedAuthor(formatted))
                .catch((err: any) => {
                  console.error("[BlockDetail] Error formatting author:", err);
                  setFormattedAuthor(author);
                });
            }

            setBlockData((prev) => ({
              ...prev,
              blockNumber,
              blockHash,
              block: block,
              loading: false,
            }));

            const eventsStorageKey = getSystemEventsStorageKey();
            const getEventsMessage = {
              id: 3,
              jsonrpc: "2.0",
              method: "state_getStorage",
              params: [eventsStorageKey, blockHash],
            };
            console.log("Requesting events for block:", blockHash);
            ws.send(JSON.stringify(getEventsMessage));
          } else {
            console.error("Failed to get block data");
            errorTimeoutRef.current = setTimeout(() => {
              setBlockData((prev) => ({
                ...prev,
                loading: false,
                error: `Block not found. The block may not exist or may have been pruned.`,
              }));
            }, 500) as unknown as number;
          }
        } else if (data.id === 3) {
          if (data.result) {
            console.log("Got events data");
            try {
              const events = decodeEnhancedEvents(data.result);
              console.log(`Decoded ${events.length} events`);
              setBlockData((prev) => ({
                ...prev,
                eventsHex: data.result,
                events,
                hasEvents: true,
              }));
            } catch (error) {
              console.error("Failed to decode events:", error);
              setBlockData((prev) => ({
                ...prev,
                eventsHex: data.result,
                hasEvents: true,
                error: "Failed to decode events",
              }));
            }
          } else {
            console.log("No events found for block");
            setBlockData((prev) => ({
              ...prev,
              hasEvents: false,
            }));
          }
        }
      } catch (error) {
        console.error("Error processing message:", error);
      }
    };

    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [chainId, blockNumberOrHash, chain, retryCount]);

  const handleBack = () => {
    navigate(`/chains/${chainId}`);
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

  return (
    <div className="container mt-4">
      <div className="d-flex align-items-center mb-4">
        <Button variant="outline-secondary" size="sm" onClick={handleBack}>
          ← Back to {chain.name}
        </Button>
        <h2 className="ms-3 mb-0">Block Details</h2>
      </div>

      {blockData.error && (
        <Alert variant="danger" className="mb-4">
          <h5>Error</h5>
          <p className="mb-0">{blockData.error}</p>
        </Alert>
      )}

      {blockData.loading && !blockData.error && (
        <Card className={themeClasses.card}>
          <Card.Body className="text-center py-5">
            <Spinner animation="border" role="status" className="mb-3" />
            <p className="mb-0">Loading block details...</p>
            <small className="text-muted">
              {connectionStatus === "connecting"
                ? "Connecting to blockchain..."
                : connectionStatus === "error"
                  ? "Connection error, retrying..."
                  : "Fetching data..."}
            </small>
          </Card.Body>
        </Card>
      )}

      {!blockData.loading && !blockData.error && blockData.blockNumber && (
        <>
          <Card className={`${themeClasses.card} mb-4`}>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Block #{blockData.blockNumber}</h5>
              <Badge bg="secondary">{chain.name}</Badge>
            </Card.Header>
            <Card.Body>
              <div className="row">
                <div className="col-md-6">
                  <h6 className="text-muted mb-2">Block Hash</h6>
                  <p className="font-monospace small text-break">
                    {blockData.blockHash}
                  </p>
                </div>
                <div className="col-md-6">
                  <h6 className="text-muted mb-2">Parent Hash</h6>
                  <p className="font-monospace small text-break">
                    {blockData.block?.header?.parentHash || "N/A"}
                  </p>
                </div>
              </div>
              {formattedAuthor && (
                <div className="row mt-3">
                  <div className="col-12">
                    <h6 className="text-muted mb-2">Miner</h6>
                    <p className="font-monospace small text-break">
                      <Link 
                        to={`/chains/${chainId}/account/${formattedAuthor}`}
                        className="text-decoration-none"
                      >
                        {formattedAuthor}
                      </Link>
                    </p>
                  </div>
                </div>
              )}
              <div className="row mt-3">
                <div className="col-md-3">
                  <h6 className="text-muted mb-2">State Root</h6>
                  <p className="font-monospace small text-truncate">
                    {blockData.block?.header?.stateRoot || "N/A"}
                  </p>
                </div>
                <div className="col-md-3">
                  <h6 className="text-muted mb-2">Extrinsics Root</h6>
                  <p className="font-monospace small text-truncate">
                    {blockData.block?.header?.extrinsicsRoot || "N/A"}
                  </p>
                </div>
                <div className="col-md-3">
                  <h6 className="text-muted mb-2">Extrinsics Count</h6>
                  <p>{blockData.block?.extrinsics?.length || 0}</p>
                </div>
                <div className="col-md-3">
                  <h6 className="text-muted mb-2">Events Count</h6>
                  <p>{blockData.events?.length || 0}</p>
                </div>
              </div>
            </Card.Body>
          </Card>

          {blockData.block?.extrinsics && blockData.block.extrinsics.length > 0 && (
            <Card className={`${themeClasses.card} mb-4`}>
              <Card.Header>
                <h5 className="mb-0">
                  Extrinsics ({blockData.block.extrinsics.length})
                </h5>
              </Card.Header>
              <Card.Body>
                <div className="block-extrinsics">
                  {(() => {
                    const eventGroups = blockData.events 
                      ? groupEventsByExtrinsic(blockData.events, blockData.block.extrinsics.length)
                      : {};
                    
                    return blockData.block.extrinsics.map((extrinsicHex: string, index: number) => {
                      // Skip if extrinsic data is invalid
                      if (!extrinsicHex || typeof extrinsicHex !== 'string') {
                        console.warn(`Invalid extrinsic data at index ${index}:`, extrinsicHex);
                        return null;
                      }
                      
                      return (
                        <div key={index} className="mb-3">
                          <BlockExtrinsic
                            extrinsic={extrinsicHex}
                            index={index}
                            events={eventGroups[index] || []}
                            chain={chain}
                          />
                        </div>
                      );
                    }).filter(Boolean);
                  })()}
                </div>
              </Card.Body>
            </Card>
          )}

          {blockData.block && (
            <Card className={`${themeClasses.card} mb-4`}>
              <Card.Header>
                <h5 className="mb-0">Raw Block Data</h5>
              </Card.Header>
              <Card.Body>
                <pre className="mb-0 text-break" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {JSON.stringify(blockData.block, null, 2)}
                </pre>
              </Card.Body>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default BlockDetail;