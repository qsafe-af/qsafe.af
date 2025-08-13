import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Table, Badge, Spinner, Alert, ButtonGroup, Button, Row, Col } from "react-bootstrap";
import { getChain } from "../chains";
import { themeClasses } from "../theme-utils";
import { formatAuthorAddress } from "../utils/ss58";

interface MinerStats {
  address: string;
  ss58Address?: string;
  blockCount: number;
  lastBlock: number;
  percentage: number;
}

interface MinerStatsCalculation extends MinerStats {
  blocks: Set<number>;
}

interface BlockRange {
  start: number;
  end: number;
  startTimestamp?: Date;
  endTimestamp?: Date;
}

const BLOCK_WINDOW_OPTIONS = [100, 500, 1000, 5000, 10000];

// GraphQL queries
const HEIGHT_QUERY = `
  query Height {
    blocks(orderBy: height_DESC, limit: 1) {
      height
    }
  }
`;

const MINING_EVENTS_QUERY = `
  query MinedBlocks($start: Int!, $end: Int!, $treasury: String!) {
    events(
      orderBy: id_ASC
      where: {
        balanceEvent: {
          type_eq: Minted
          account: {
            id_not_eq: $treasury
          }
        }
        block: {
          height_gte: $start
          height_lte: $end
        }
      }
    ) {
      balanceEvent {
        account {
          id
        }
        type
      }
      block {
        height
        timestamp
      }
    }
  }
`;

const MiningStats: React.FC = () => {
  const { chainId } = useParams<{ chainId: string }>();
  const navigate = useNavigate();
  const [miners, setMiners] = useState<MinerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentHeight, setCurrentHeight] = useState<number>(0);
  const [blockWindow, setBlockWindow] = useState<number>(1000);
  const [blockRange, setBlockRange] = useState<BlockRange | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uniqueBlockCount, setUniqueBlockCount] = useState(0);

  const chain = chainId ? getChain(chainId) : null;

  const fetchGraphQL = async (query: string, variables?: any) => {
    if (!chain?.indexer) {
      throw new Error("No indexer URL configured");
    }

    const response = await fetch(chain.indexer, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} - ${responseText}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Failed to parse GraphQL response: ${e}`);
    }

    if (data.errors) {
      throw new Error(data.errors[0]?.message || "GraphQL error");
    }

    return data.data;
  };

  const fetchCurrentHeight = async () => {
    try {
      const data = await fetchGraphQL(HEIGHT_QUERY);
      const height = data.blocks?.[0]?.height || 0;
      setCurrentHeight(height);
      return height;
    } catch (err) {
      console.error("Error fetching current height:", err);
      throw err;
    }
  };

  const fetchMiningEvents = async (start: number, end: number) => {
    try {
      setRefreshing(true);
      const data = await fetchGraphQL(MINING_EVENTS_QUERY, { 
        start, 
        end,
        treasury: chain?.treasury || ""
      });
      
      // Process events to extract miner information
      const minerMap = new Map<string, MinerStatsCalculation>();
      const blockToMiner = new Map<number, string>(); // Track which miner gets credit for each block
      const events = data.events || [];
      
      // Get timestamps for range display
      if (events.length > 0) {
        setBlockRange({
          start,
          end,
          startTimestamp: new Date(events[0].block.timestamp),
          endTimestamp: new Date(events[events.length - 1].block.timestamp),
        });
      }

      // First pass: assign each block to only one miner (first valid miner for that block)
      for (const event of events) {
        const blockHeight = event.block.height;
        const minerAddress = event.balanceEvent?.account?.id;
        
        // Only assign block if it hasn't been assigned yet and miner is valid
        if (minerAddress && 
            minerAddress !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
            !blockToMiner.has(blockHeight)) {
          blockToMiner.set(blockHeight, minerAddress);
        }
      }

      // Second pass: build miner statistics from unique block assignments
      for (const [blockHeight, minerAddress] of blockToMiner.entries()) {
        let existing = minerMap.get(minerAddress);
        if (!existing) {
          existing = {
            address: minerAddress,
            blockCount: 0,
            lastBlock: 0,
            percentage: 0,
            blocks: new Set<number>(),
          };
          minerMap.set(minerAddress, existing);
        }
        
        existing.blocks.add(blockHeight);
        existing.lastBlock = Math.max(existing.lastBlock, blockHeight);
      }

      // Set the count of unique blocks
      setUniqueBlockCount(blockToMiner.size);

      // Calculate percentages and format addresses
      const totalBlocks = blockToMiner.size;
      const statsArray = Array.from(minerMap.values());
      
      for (const stat of statsArray) {
        // Set block count from unique blocks
        stat.blockCount = stat.blocks.size;
        stat.percentage = totalBlocks > 0 ? (stat.blockCount / totalBlocks) * 100 : 0;
        
        // Format SS58 address
        if (chain) {
          try {
            const ss58 = await formatAuthorAddress(stat.address, chain.endpoints?.[0], chain.genesis);
            stat.ss58Address = ss58;
          } catch (error) {
            console.error("Error formatting address:", error);
            stat.ss58Address = stat.address;
          }
        }
      }
      
      // Sort by block count descending
      statsArray.sort((a, b) => b.blockCount - a.blockCount);
      
      // Remove the blocks Set before setting state
      const cleanedStats: MinerStats[] = statsArray.map(({ blocks, ...stat }) => stat);
      
      setMiners(cleanedStats);
      setRefreshing(false);
    } catch (err) {
      console.error("Error fetching mining events:", err);
      setRefreshing(false);
      throw err;
    }
  };

  const loadMiningStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const height = await fetchCurrentHeight();
      const start = Math.max(1, height - blockWindow + 1);
      const end = height;
      
      await fetchMiningEvents(start, end);
      setLoading(false);
    } catch (err) {
      console.error("Error loading mining stats:", err);
      setError(err instanceof Error ? err.message : "Failed to load mining statistics");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!chain?.indexer) {
      setError("No indexer configured for this chain");
      setLoading(false);
      return;
    }

    loadMiningStats();

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => {
      if (!refreshing) {
        loadMiningStats();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [chainId, chain, blockWindow]);

  const handleBlockWindowChange = (newWindow: number) => {
    if (newWindow === blockWindow) return;
    setBlockWindow(newWindow);
  };

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

  if (!chain.indexer) {
    return (
      <div className="container mt-5">
        <Alert variant="warning">
          <h4>Indexer Not Available</h4>
          <p>Mining statistics are not available for this chain as no indexer is configured.</p>
          <Button variant="outline-warning" onClick={handleBack}>
            Back to {chain.name}
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
        <h2 className="ms-3 mb-0">Mining Statistics</h2>
      </div>

      {error && (
        <Alert variant="danger" className="mb-4" dismissible onClose={() => setError(null)}>
          <h5>Error</h5>
          <p className="mb-2">{error}</p>
          <Button variant="outline-danger" size="sm" onClick={loadMiningStats}>
            Retry
          </Button>
        </Alert>
      )}

      <Card className={`${themeClasses.card} mb-4`}>
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h5 className="mb-0">Mining Leaderboard</h5>
              {blockRange && (
                <small className="text-muted">
                  Blocks {blockRange.start.toLocaleString()} - {blockRange.end.toLocaleString()}
                  {blockRange.startTimestamp && blockRange.endTimestamp && (
                    <>
                      {" "}
                      ({new Intl.DateTimeFormat("default", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(blockRange.startTimestamp)}
                      {" - "}
                      {new Intl.DateTimeFormat("default", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(blockRange.endTimestamp)})
                    </>
                  )}
                </small>
              )}
            </div>
            <div className="d-flex align-items-center gap-3">
              {refreshing && !loading && (
                <div className="d-flex align-items-center">
                  <Spinner animation="border" size="sm" className="me-2" />
                  <small>Refreshing...</small>
                </div>
              )}
              <ButtonGroup size="sm">
                {BLOCK_WINDOW_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    variant={blockWindow === option ? "primary" : "outline-primary"}
                    onClick={() => handleBlockWindowChange(option)}
                    disabled={loading || refreshing || option > currentHeight}
                  >
                    {option.toLocaleString()}
                  </Button>
                ))}
              </ButtonGroup>
              <small className="text-muted">blocks</small>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          {loading && !refreshing ? (
            <div className="text-center py-5">
              <Spinner animation="border" role="status" className="mb-3" />
              <p className="mb-0">Loading mining statistics...</p>
            </div>
          ) : miners.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <p className="mb-0">No mining data found for the selected range</p>
            </div>
          ) : (
            <>
              <Row className="mb-3">
                <Col md={3}>
                  <div className={`${themeClasses.bg.subtle} p-3 rounded`}>
                    <h6 className="text-muted mb-1">Total Miners</h6>
                    <h3 className="mb-0">{miners.length}</h3>
                  </div>
                </Col>
                <Col md={3}>
                  <div className={`${themeClasses.bg.subtle} p-3 rounded`}>
                    <h6 className="text-muted mb-1">Blocks Analyzed</h6>
                    <h3 className="mb-0">
                      {uniqueBlockCount.toLocaleString()}
                    </h3>
                  </div>
                </Col>
                <Col md={3}>
                  <div className={`${themeClasses.bg.subtle} p-3 rounded`}>
                    <h6 className="text-muted mb-1">Top Miner Share</h6>
                    <h3 className="mb-0">{miners[0]?.percentage.toFixed(1)}%</h3>
                  </div>
                </Col>
                <Col md={3}>
                  <div className={`${themeClasses.bg.subtle} p-3 rounded`}>
                    <h6 className="text-muted mb-1">Current Height</h6>
                    <h3 className="mb-0">{currentHeight.toLocaleString()}</h3>
                  </div>
                </Col>
              </Row>

              <Table responsive hover className={themeClasses.table}>
                <thead>
                  <tr>
                    <th style={{ width: "60px" }}>Rank</th>
                    <th>Miner</th>
                    <th style={{ width: "120px" }}>Blocks</th>
                    <th style={{ width: "100px" }}>Share</th>
                    <th style={{ width: "120px" }}>Last Block</th>
                  </tr>
                </thead>
                <tbody>
                  {miners.map((miner, index) => (
                    <tr key={miner.address}>
                      <td>
                        <Badge 
                          bg={index === 0 ? "warning" : index < 3 ? "secondary" : "light"} 
                          text={index >= 3 ? "dark" : undefined}
                        >
                          #{index + 1}
                        </Badge>
                      </td>
                      <td>
                        <span className="font-monospace small">
                          {miner.ss58Address || miner.address}
                        </span>
                      </td>
                      <td>
                        <strong>{miner.blockCount.toLocaleString()}</strong>
                      </td>
                      <td>
                        <div className="d-flex align-items-center">
                          <div className="progress flex-grow-1 me-2" style={{ height: "6px" }}>
                            <div
                              className="progress-bar"
                              role="progressbar"
                              style={{ width: `${miner.percentage}%` }}
                              aria-valuenow={miner.percentage}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            />
                          </div>
                          <small>{miner.percentage.toFixed(1)}%</small>
                        </div>
                      </td>
                      <td>
                        <Badge 
                          bg={miner.lastBlock > currentHeight - 100 ? "success" : "secondary"}
                        >
                          {miner.lastBlock.toLocaleString()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default MiningStats;