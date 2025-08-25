import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Card,
  Table,
  Badge,
  Spinner,
  Alert,
  Button,
  Row,
  Col,
  Nav,
} from "react-bootstrap";
import { getChain } from "../chains";
import { themeClasses } from "../theme-utils";
import {
  encodeAddressSync,
  fetchSystemProperties,
  getCachedSS58Format,
  getCachedChainProperties,
} from "../utils/ss58";

interface AccountEvent {
  id: string;
  type: string;
  timestamp: Date;
  blockHeight: number;
  amount?: string;
  fee?: string;
  from?: string;
  to?: string;
  accountId?: string;
  extrinsicHash?: string;
}

// Removed unused AccountBalance interface

interface AccountData {
  id: string;
  free?: string;
  reserved?: string;
}

type EventFilter = "all" | "transfers" | "minted" | "burned" | "other";

// Base58 alphabet used by SS58
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Decode SS58 address to hex
 */
function decodeSS58ToHex(ss58Address: string): string {
  // Base58 decode
  let bytes = new Uint8Array(64); // Max size
  let bytesLen = 0;

  for (const char of ss58Address) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid character in SS58 address");
    }

    let carry = index;
    for (let i = 0; i < bytesLen; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes[bytesLen++] = carry & 0xff;
      carry >>= 8;
    }
  }

  // Reverse bytes
  bytes = bytes.slice(0, bytesLen).reverse();

  // Extract the actual address (skip prefix and checksum)
  // For most addresses: 1-2 byte prefix + 32 byte address + 2 byte checksum
  let addressStart = 1; // Default single byte prefix
  if (bytes.length > 35) {
    // Two byte prefix
    addressStart = 2;
  }

  const addressBytes = bytes.slice(addressStart, addressStart + 32);

  // Convert to hex
  return (
    "0x" +
    Array.from(addressBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// GraphQL queries
const ACCOUNT_QUERY = `
  query Account($accountId: String!) {
    accountById(id: $accountId) {
      id
      free
      reserved
    }
  }
`;

const ACCOUNT_EVENTS_QUERY = `
  query AccountEvents($accountId: String!, $limit: Int!, $cursor: String) {
    balanceEventsConnection(
      first: $limit
      after: $cursor
      orderBy: event_timestamp_DESC
      where: {
        OR: [
          { account: { id_eq: $accountId } }
          { from: { id_eq: $accountId } }
          { to: { id_eq: $accountId } }
        ]
      }
    ) {
      edges {
        node {
          id
          type
          amount
          account {
            id
          }
          from {
            id
          }
          to {
            id
          }
          event {
            timestamp
            block {
              height
            }
          }
        }
      }
      totalCount
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

const ACCOUNT_TRANSFERS_QUERY = `
  query AccountTransfers($accountId: String!, $limit: Int!, $cursor: String) {
    transfersConnection(
      first: $limit
      after: $cursor
      orderBy: [timestamp_DESC]
      where: {
        AND: [
          { extrinsicHash_isNull: false }
          { OR: [
              { from: { id_eq: $accountId } }
              { to:   { id_eq: $accountId } }
            ]
          }
        ]
      }
    ) {
      edges {
        node {
          id
          amount
          fee
          from {
            id
          }
          to {
            id
          }
          block {
            height
            timestamp
          }
          timestamp
          extrinsicHash
        }
      }
      totalCount
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

const TEST_QUERY = `
  query TestQuery {
    transfersConnection(first: 5, orderBy: timestamp_DESC) {
      edges {
        node {
          id
          from {
            id
          }
          to {
            id
          }
          timestamp
        }
      }
      totalCount
    }
  }
`;

const Account: React.FC = () => {
  const { chainId, accountId } = useParams<{
    chainId: string;
    accountId: string;
  }>();
  const navigate = useNavigate();
  const [events, setEvents] = useState<AccountEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EventFilter>("all");
  const [hexAddress, setHexAddress] = useState<string>("");
  const [ss58Address, setSs58Address] = useState<string>("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [endCursor, setEndCursor] = useState<string | null>(null);

  const handleFilterChange = (newFilter: EventFilter) => {
    setFilter(newFilter);
    setCursor(null);
    setEndCursor(null);
    setEvents([]);
  };

  const EVENTS_PER_PAGE = 50;
  const chain = chainId ? getChain(chainId) : null;

  const fetchGraphQL = useCallback(
    async (query: string, variables: Record<string, unknown>) => {
      if (!chain?.indexer) {
        throw new Error("No indexer endpoint configured for this chain");
      }

      console.log("=== GraphQL Request Debug ===");
      console.log("Endpoint:", chain.indexer);
      console.log("Query:", query);
      console.log("Variables:", JSON.stringify(variables, null, 2));

      const requestBody = JSON.stringify({
        query,
        variables,
      });
      console.log("Request Body:", requestBody);

      const response = await fetch(chain.indexer, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      const responseText = await response.text();
      console.log("Response Status:", response.status);
      console.log("Response Headers:", response.headers);
      console.log("Response Text:", responseText);

      if (!response.ok) {
        console.error("GraphQL request failed:", response.status, responseText);
        throw new Error(
          `GraphQL request failed: ${response.status} - ${responseText}`,
        );
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse response:", e);
        console.error("Raw response:", responseText);
        throw new Error(`Failed to parse GraphQL response: ${e}`);
      }

      console.log("Parsed Response Data:", JSON.stringify(data, null, 2));

      if (data.errors) {
        console.error("GraphQL Errors:", data.errors);
        throw new Error(data.errors[0]?.message || "GraphQL error");
      }

      console.log("=== End GraphQL Request ===");
      return data.data;
    },
    [chain],
  );

  const processEvents = useCallback(
    (
      rawEvents: Array<Record<string, unknown>>,
      isTransfer: boolean = false,
    ): AccountEvent[] => {
      return rawEvents.map((event) => {
        // Type assertions for the event structure
        const eventData = event as {
          id?: string;
          type?: string;
          amount?: string;
          fee?: string;
          extrinsicHash?: string;
          timestamp?: string;
          block?: { height?: number; timestamp?: string };
          event?: { timestamp?: string; block?: { height?: number } };
          from?: { id?: string } | string;
          to?: { id?: string } | string;
          account?: { id?: string };
        };

        const processed: AccountEvent = {
          id: String(eventData.id || ""),
          type: isTransfer ? "Transfer" : eventData.type || "Unknown",
          timestamp: new Date(
            eventData.timestamp ||
              eventData.event?.timestamp ||
              eventData.block?.timestamp ||
              Date.now(),
          ),
          blockHeight:
            eventData.block?.height || eventData.event?.block?.height || 0,
        };

        // Add amount if present
        if (eventData.amount) {
          processed.amount = String(eventData.amount);
        }

        // Add fee if present (for transfers)
        if (eventData.fee) {
          processed.fee = String(eventData.fee);
        }

        // Add extrinsicHash if present
        if (eventData.extrinsicHash) {
          processed.extrinsicHash = String(eventData.extrinsicHash);
        }

        // Add from/to - check both transfer format and balance event format
        if (typeof eventData.from === "object" && eventData.from?.id) {
          processed.from = String(eventData.from.id);
        } else if (eventData.from && typeof eventData.from === "string") {
          processed.from = eventData.from;
        }

        if (typeof eventData.to === "object" && eventData.to?.id) {
          processed.to = String(eventData.to.id);
        } else if (eventData.to && typeof eventData.to === "string") {
          processed.to = eventData.to;
        }

        // If we have both from and to, this is definitely a transfer
        if (processed.from && processed.to) {
          processed.type = "Transfer";
        }

        // Set accountId for non-transfer events
        if (!eventData.from && !eventData.to && eventData.account?.id) {
          processed.accountId = String(eventData.account.id);
        }

        return processed;
      });
    },
    [],
  );

  const loadAccountData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!accountId) {
        throw new Error("No account ID provided");
      }

      // Determine if the input is SS58 or hex
      let hexAddr: string;
      let ss58Addr: string;

      if (accountId.startsWith("0x")) {
        // Hex address provided
        hexAddr = accountId;
        // Convert to SS58
        if (chain) {
          // Try to get cached SS58 format first
          let ss58Format = getCachedSS58Format(chain.genesis);

          // If not cached and we have endpoints, fetch it
          if (
            ss58Format === undefined &&
            chain.endpoints &&
            chain.endpoints.length > 0
          ) {
            try {
              const properties = await fetchSystemProperties(
                chain.endpoints[0],
                chain.genesis,
              );
              ss58Format = properties.ss58Format;
            } catch (error) {
              console.error("Failed to fetch system properties:", error);
            }
          }

          // Use the format we got, or default to substrate format
          ss58Addr = encodeAddressSync(hexAddr, ss58Format || 42);
        } else {
          ss58Addr = encodeAddressSync(hexAddr);
        }
      } else {
        // SS58 address provided
        ss58Addr = accountId;
        // Convert to hex
        hexAddr = decodeSS58ToHex(accountId);
      }

      setHexAddress(hexAddr);
      setSs58Address(ss58Addr);

      // First, run a test query to verify the endpoint works
      try {
        console.log("Running test query to verify endpoint...");
        const testResult = await fetchGraphQL(TEST_QUERY, {});
        console.log("Test query successful! Recent transfers:", testResult);
      } catch (testErr) {
        console.error("Test query failed:", testErr);
      }

      // Fetch account data
      try {
        console.log("Fetching account data for SS58 address:", ss58Addr);
        const accountResult = await fetchGraphQL(ACCOUNT_QUERY, {
          accountId: ss58Addr,
        });

        console.log("Account Query Result:", accountResult);
        console.log("Account Data:", accountResult.accountById);

        if (accountResult.accountById) {
          setAccountData(accountResult.accountById);
        } else {
          console.warn("No account data found for:", hexAddr);
        }
      } catch (err) {
        console.error("Error fetching account data:", err);
      }

      // Fetch events based on filter
      let processedEvents: AccountEvent[] = [];

      console.log(`Fetching ${filter} events for account:`, ss58Addr);
      console.log("Current cursor:", cursor);

      if (filter === "all") {
        // For "all" filter, fetch both balance events and transfers
        console.log("Fetching all events (balance events + transfers)");

        // Note: For simplicity, we'll just fetch balance events which should include transfers
        // that have from/to fields populated
        const eventsData = await fetchGraphQL(ACCOUNT_EVENTS_QUERY, {
          accountId: ss58Addr,
          limit: EVENTS_PER_PAGE,
          cursor: cursor,
        });

        const eventNodes =
          eventsData.balanceEventsConnection?.edges?.map(
            (edge: { node: Record<string, unknown> }) => edge.node,
          ) || [];

        // Also fetch transfers to ensure we get all transfer details
        const transfersData = await fetchGraphQL(ACCOUNT_TRANSFERS_QUERY, {
          accountId: ss58Addr,
          limit: EVENTS_PER_PAGE,
          cursor: cursor,
        });

        const transferNodes =
          transfersData.transfersConnection?.edges?.map(
            (edge: { node: Record<string, unknown> }) => edge.node,
          ) || [];

        // Process both sets of events
        const balanceEvents = processEvents(eventNodes, false);
        const transferEvents = processEvents(transferNodes, true);

        // Merge and deduplicate events
        const eventMap = new Map<string, AccountEvent>();

        // Add balance events first
        balanceEvents.forEach((event) => {
          eventMap.set(event.id, event);
        });

        // Add/update with transfer events (transfers have more complete data)
        transferEvents.forEach((event) => {
          eventMap.set(event.id, event);
        });

        // Convert back to array and sort by timestamp
        processedEvents = Array.from(eventMap.values()).sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
        );

        // Update pagination state (use balance events pagination as primary)
        const pageInfo = eventsData.balanceEventsConnection?.pageInfo;
        if (pageInfo) {
          setHasMore(pageInfo.hasNextPage);
          setEndCursor(pageInfo.endCursor);
        }
      } else if (filter === "transfers") {
        console.log("Executing ACCOUNT_TRANSFERS_QUERY");
        const eventsData = await fetchGraphQL(ACCOUNT_TRANSFERS_QUERY, {
          accountId: ss58Addr,
          limit: EVENTS_PER_PAGE,
          cursor: cursor,
        });

        // Debug logging for transfers query
        console.log("Transfer Query Response:", eventsData);
        console.log("TransfersConnection:", eventsData.transfersConnection);
        console.log("Total Count:", eventsData.transfersConnection?.totalCount);
        console.log("Edges:", eventsData.transfersConnection?.edges);

        if (!eventsData.transfersConnection) {
          console.error("No transfersConnection in response!");
          console.log(
            "Full response structure:",
            JSON.stringify(eventsData, null, 2),
          );
        }

        const transferNodes =
          eventsData.transfersConnection?.edges?.map(
            (edge: { node: Record<string, unknown> }) => edge.node,
          ) || [];
        console.log("Transfer Nodes:", transferNodes);
        console.log("Number of transfer nodes:", transferNodes.length);

        processedEvents = processEvents(transferNodes, true);
        console.log("Processed Transfer Events:", processedEvents);

        // Update pagination state
        const pageInfo = eventsData.transfersConnection?.pageInfo;
        if (pageInfo) {
          setHasMore(pageInfo.hasNextPage);
          setEndCursor(pageInfo.endCursor);
        }
      } else {
        // For other filters (minted, burned, other), only query balance events
        console.log("Executing ACCOUNT_EVENTS_QUERY");
        const eventsData = await fetchGraphQL(ACCOUNT_EVENTS_QUERY, {
          accountId: ss58Addr,
          limit: EVENTS_PER_PAGE,
          cursor: cursor,
        });

        // Debug logging for balance events query
        console.log("Balance Events Query Response:", eventsData);
        console.log(
          "BalanceEventsConnection:",
          eventsData.balanceEventsConnection,
        );
        console.log(
          "Total Count:",
          eventsData.balanceEventsConnection?.totalCount,
        );

        if (!eventsData.balanceEventsConnection) {
          console.error("No balanceEventsConnection in response!");
          console.log(
            "Full response structure:",
            JSON.stringify(eventsData, null, 2),
          );
        }

        const eventNodes =
          eventsData.balanceEventsConnection?.edges?.map(
            (edge: { node: Record<string, unknown> }) => edge.node,
          ) || [];
        console.log("Balance Event Nodes:", eventNodes);
        console.log("Number of balance event nodes:", eventNodes.length);

        processedEvents = processEvents(eventNodes, false);
        console.log("Processed Balance Events:", processedEvents);

        // Update pagination state
        const pageInfo = eventsData.balanceEventsConnection?.pageInfo;
        if (pageInfo) {
          setHasMore(pageInfo.hasNextPage);
          setEndCursor(pageInfo.endCursor);
        }
      }

      if (!cursor) {
        setEvents(processedEvents);
      } else {
        setEvents((prev) => [...prev, ...processedEvents]);
      }

      setLoading(false);
      console.log("Account data loading completed");
    } catch (err) {
      console.error("Error loading account data:", err);
      console.error("Error details:", {
        message: err instanceof Error ? err.message : "Unknown error",
        stack: err instanceof Error ? err.stack : undefined,
        error: err,
      });
      setError(
        err instanceof Error ? err.message : "Failed to load account data",
      );
      setLoading(false);
    }
  }, [accountId, chain, filter, cursor, fetchGraphQL, processEvents]);

  useEffect(() => {
    if (!chain?.indexer || !accountId) {
      setError("Invalid configuration");
      setLoading(false);
      return;
    }

    // Only load data when cursor changes or initial load
    if (cursor === null || cursor !== undefined) {
      loadAccountData();
    }
  }, [chainId, accountId, chain, filter, cursor, loadAccountData]);

  // Reset cursor when filter changes
  useEffect(() => {
    setCursor(null);
    setEndCursor(null);
  }, [filter]);

  const handleBack = () => {
    navigate(`/chains/${chainId}`);
  };

  const filteredEvents = events.filter((event) => {
    const eventType = event.type?.toLowerCase() || "";
    // Also check if it's a transfer based on from/to fields
    const isTransfer = eventType === "transfer" || (event.from && event.to);

    switch (filter) {
      case "transfers":
        return isTransfer;
      case "minted":
        return eventType === "minted";
      case "burned":
        return eventType === "burned" || eventType === "slashed";
      case "other":
        return (
          !isTransfer &&
          eventType !== "minted" &&
          eventType !== "burned" &&
          eventType !== "slashed"
        );
      default:
        return true;
    }
  });

  const getEventBadgeVariant = (type: string) => {
    if (type.includes("Transfer")) return "primary";
    if (type.includes("Minted")) return "success";
    if (type.includes("Burned") || type.includes("Slashed")) return "danger";
    if (type.includes("Reserved")) return "warning";
    if (type.includes("Unreserved")) return "info";
    return "secondary";
  };

  const formatAmount = (amount?: string) => {
    if (!amount) return "-";
    try {
      const num = BigInt(amount);
      // Get chain properties for proper decimal formatting
      const chainProps = chain ? getCachedChainProperties(chain.genesis) : null;
      const decimals = chainProps?.tokenDecimals || 12; // Default to 12 if not found

      const divisor = BigInt(10 ** decimals);
      const whole = num / divisor;
      const fraction = num % divisor;
      return `${whole.toString()}.${fraction.toString().padStart(decimals, "0").slice(0, 4)}`;
    } catch {
      return amount;
    }
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
          <p>
            Account history is not available for this chain as no indexer is
            configured.
          </p>
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
        <h2 className="ms-3 mb-0">Account Details</h2>
      </div>

      {error && (
        <Alert
          variant="danger"
          className="mb-4"
          dismissible
          onClose={() => setError(null)}
        >
          <h5>Error</h5>
          <p className="mb-2">{error}</p>
          <Button
            variant="outline-danger"
            size="sm"
            onClick={() => {
              setCursor(null);
              setEndCursor(null);
              loadAccountData();
            }}
          >
            Retry
          </Button>
        </Alert>
      )}

      <Card className={`${themeClasses.card} mb-4`}>
        <Card.Header>
          <h5 className="mb-0">Account Information</h5>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={accountData ? 8 : 12}>
              <h6 className="text-muted mb-2">SS58 Address</h6>
              <p className="font-monospace small mb-3">{ss58Address}</p>
              <h6 className="text-muted mb-2">Hex Address</h6>
              <p className="font-monospace small text-break">{hexAddress}</p>
            </Col>
            {accountData && (accountData.free || accountData.reserved) && (
              <Col md={4}>
                <h6 className="text-muted mb-2">Balance</h6>
                <div className={`${themeClasses.bg.subtle} p-3 rounded`}>
                  {accountData.free && (
                    <div className="mb-2">
                      <small className="text-muted">Free:</small>
                      <div className="font-monospace">
                        {formatAmount(accountData.free)}
                      </div>
                    </div>
                  )}
                  {accountData.reserved && (
                    <div className="mb-2">
                      <small className="text-muted">Reserved:</small>
                      <div className="font-monospace">
                        {formatAmount(accountData.reserved)}
                      </div>
                    </div>
                  )}
                  {(accountData.free || accountData.reserved) && (
                    <>
                      <hr />
                      <div>
                        <small className="text-muted">Total:</small>
                        <div className="font-monospace fw-bold">
                          {formatAmount(
                            (
                              BigInt(accountData.free || "0") +
                              BigInt(accountData.reserved || "0")
                            ).toString(),
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </Col>
            )}
          </Row>
        </Card.Body>
      </Card>

      <Card className={`${themeClasses.card} mb-4`}>
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Transaction History</h5>
            <Nav
              variant="pills"
              activeKey={filter}
              onSelect={(k) => handleFilterChange(k as EventFilter)}
            >
              <Nav.Item>
                <Nav.Link eventKey="all">All</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="transfers">Transfers</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="minted">Minted</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="burned">Burned</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="other">Other</Nav.Link>
              </Nav.Item>
            </Nav>
          </div>
        </Card.Header>
        <Card.Body>
          {loading && events.length === 0 ? (
            <div className="text-center py-5">
              <Spinner animation="border" role="status" className="mb-3" />
              <p className="mb-0">Loading transaction history...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <p className="mb-0">
                No {filter !== "all" ? filter : "transactions"} found for this
                account
              </p>
            </div>
          ) : (
            <>
              <Table responsive hover className={themeClasses.table}>
                <thead>
                  <tr>
                    <th>Block</th>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Amount</th>
                    <th>From/To</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <Link
                          to={`/chains/${chainId}/block/${event.blockHeight}`}
                          className="text-decoration-none"
                        >
                          <Badge bg="secondary">
                            {event.blockHeight.toLocaleString()}
                          </Badge>
                        </Link>
                      </td>
                      <td>
                        <small>
                          {new Intl.DateTimeFormat("default", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(event.timestamp)}
                        </small>
                      </td>
                      <td>
                        <Badge bg={getEventBadgeVariant(event.type)}>
                          {event.type}
                        </Badge>
                      </td>
                      <td className="font-monospace small">
                        {formatAmount(event.amount)}
                      </td>
                      <td>
                        {event.from && event.to && (
                          <div className="small">
                            {event.from === ss58Address ? (
                              <>
                                <Badge bg="danger" className="me-1">
                                  ↗ Sent
                                </Badge>
                                <span className="text-muted">to </span>
                                <Link
                                  to={`/chains/${chainId}/account/${event.to}`}
                                  className="font-monospace text-decoration-none"
                                >
                                  {event.to}
                                </Link>
                              </>
                            ) : event.to === ss58Address ? (
                              <>
                                <Badge bg="success" className="me-1">
                                  ↘ Received
                                </Badge>
                                <span className="text-muted">from </span>
                                <Link
                                  to={`/chains/${chainId}/account/${event.from}`}
                                  className="font-monospace text-decoration-none"
                                >
                                  {event.from}
                                </Link>
                              </>
                            ) : (
                              <>
                                <span className="text-muted">From: </span>
                                <Link
                                  to={`/chains/${chainId}/account/${event.from}`}
                                  className="font-monospace text-decoration-none"
                                >
                                  {event.from}
                                </Link>
                                <br />
                                <span className="text-muted">To: </span>
                                <Link
                                  to={`/chains/${chainId}/account/${event.to}`}
                                  className="font-monospace text-decoration-none"
                                >
                                  {event.to}
                                </Link>
                              </>
                            )}
                          </div>
                        )}
                        {event.type.includes("Minted") && event.accountId && (
                          <span className="text-success small">
                            Block mining reward
                          </span>
                        )}
                        {(event.type.includes("Burned") ||
                          event.type.includes("Slashed")) &&
                          event.accountId && (
                            <span className="text-danger small">
                              Removed from account
                            </span>
                          )}
                        {!event.from && !event.to && !event.accountId && "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {hasMore && (
                <div className="text-center mt-3">
                  <Button
                    variant="outline-primary"
                    onClick={() => {
                      if (endCursor) {
                        setCursor(endCursor);
                      }
                    }}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Spinner
                          animation="border"
                          size="sm"
                          className="me-2"
                        />
                        Loading...
                      </>
                    ) : (
                      "Load More"
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default Account;
