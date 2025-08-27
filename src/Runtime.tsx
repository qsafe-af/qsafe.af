import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Table,
  Badge,
  Alert,
  Spinner,
  Tabs,
  Tab,
} from "react-bootstrap";
import { getChain } from "./chains";
import {
  getCachedRuntimeSpans,
  getBlockTimestamp,
  type RuntimeSpan,
} from "./runtime-discovery";
import { fetchMetadata, type MetadataInfo } from "./utils/metadata";

interface RuntimeParams extends Record<string, string | undefined> {
  chainId: string;
  runtime: string;
}

interface PalletInfo {
  index: number;
  name: string;
  calls: Array<{ index: number; name: string }>;
  constants: Array<{
    name: string;
    type: string;
    value: string;
    docs: string[];
  }>;
  storage: Array<{ name: string; type: string; docs: string[] }>;
}

const Runtime: React.FC = () => {
  const { chainId, runtime } = useParams<RuntimeParams>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runtimeSpan, setRuntimeSpan] = useState<RuntimeSpan | null>(null);
  const [metadata, setMetadata] = useState<MetadataInfo | null>(null);
  const [pallets, setPallets] = useState<PalletInfo[]>([]);
  const [blockTimestamp, setBlockTimestamp] = useState<number | null>(null);

  useEffect(() => {
    if (!chainId || !runtime) return;

    const loadRuntimeData = async () => {
      try {
        setLoading(true);
        setError(null);

        const chain = getChain(chainId);
        if (!chain) {
          throw new Error(`Chain not found: ${chainId}`);
        }

        if (!chain.endpoints || chain.endpoints.length === 0) {
          throw new Error(`No endpoints configured for chain: ${chainId}`);
        }

        const endpoint = chain.endpoints[0];

        // Fetch runtime spans
        const spans = await getCachedRuntimeSpans(endpoint);

        // Find matching runtime span
        let matchingSpan: RuntimeSpan | null = null;

        if (runtime.startsWith("0x")) {
          // Runtime hash provided
          matchingSpan =
            spans.find(
              (span) => span.code_hash.toLowerCase() === runtime.toLowerCase(),
            ) || null;
        } else if (runtime.startsWith("v")) {
          // Runtime version provided (e.g., v104)
          const version = parseInt(runtime.slice(1));
          matchingSpan =
            spans.find((span) => span.spec_version === version) || null;
        } else {
          throw new Error(
            `Invalid runtime parameter: ${runtime}. Expected runtime hash (0x...) or version (v...)`,
          );
        }

        if (!matchingSpan) {
          throw new Error(`Runtime not found: ${runtime}`);
        }

        setRuntimeSpan(matchingSpan);

        // Fetch metadata for this runtime
        const blockHash = await getBlockHashForHeight(
          endpoint,
          matchingSpan.start_block,
        );
        const metadataInfo = await fetchMetadata(endpoint, blockHash);
        setMetadata(metadataInfo);

        // Extract pallet information from metadata
        const palletInfos = extractPalletInfo(metadataInfo);
        setPallets(palletInfos);

        // Get timestamp for start block
        const timestamp = await getBlockTimestamp(
          endpoint,
          matchingSpan.start_block,
        );
        setBlockTimestamp(timestamp);
      } catch (err) {
        console.error("Failed to load runtime data:", err);
        setError(err instanceof Error ? err.message : "Unknown error occurred");
      } finally {
        setLoading(false);
      }
    };

    loadRuntimeData();
  }, [chainId, runtime]);

  const getBlockHashForHeight = async (
    endpoint: string,
    height: number,
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(endpoint);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "chain_getBlockHash",
            params: [height],
          }),
        );
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id === 1) {
          ws.close();
          if (data.error) {
            reject(new Error(data.error.message));
          } else {
            resolve(data.result);
          }
        }
      };

      ws.onerror = () => {
        reject(new Error("WebSocket connection failed"));
      };
    });
  };

  const extractPalletInfo = (metadataInfo: MetadataInfo): PalletInfo[] => {
    const pallets: PalletInfo[] = [];
    const metadataLatest = (
      metadataInfo.metadata as unknown as { asLatest: { pallets?: unknown[] } }
    ).asLatest;

    if (metadataLatest?.pallets) {
      metadataLatest.pallets.forEach((pallet: unknown) => {
        const palletIndex = (
          pallet as { index: { toNumber(): number } }
        ).index.toNumber();
        const palletName = (
          pallet as { name: { toString(): string } }
        ).name.toString();

        // Extract calls
        const calls: Array<{ index: number; name: string }> = [];
        if (
          (pallet as { calls?: { isSome: boolean } }).calls &&
          (pallet as { calls: { isSome: boolean } }).calls.isSome
        ) {
          const callInfo = metadataInfo.callMap.get(palletIndex);
          if (callInfo) {
            for (const [index, name] of callInfo.callNameByIndex.entries()) {
              calls.push({ index, name });
            }
          }
        }

        // Extract constants
        const constants: Array<{
          name: string;
          type: string;
          value: string;
          docs: string[];
        }> = [];
        if ((pallet as { constants?: unknown[] }).constants) {
          (pallet as { constants: unknown[] }).constants.forEach(
            (constant: unknown) => {
              constants.push({
                name: (
                  constant as { name: { toString(): string } }
                ).name.toString(),
                type: (
                  constant as { type: { toString(): string } }
                ).type.toString(),
                value: (
                  constant as { value: { toHex(): string } }
                ).value.toHex(),
                docs: (constant as { docs: { toString(): string }[] }).docs.map(
                  (doc: { toString(): string }) => doc.toString(),
                ),
              });
            },
          );
        }

        // Extract storage items
        const storage: Array<{ name: string; type: string; docs: string[] }> =
          [];
        if (
          (pallet as { storage?: { isSome: boolean } }).storage &&
          (pallet as { storage: { isSome: boolean } }).storage.isSome
        ) {
          const storageItems = (
            pallet as { storage: { unwrap(): { items: unknown[] } } }
          ).storage.unwrap().items;
          storageItems.forEach((item: unknown) => {
            storage.push({
              name: (item as { name: { toString(): string } }).name.toString(),
              type: (item as { type: { toString(): string } }).type.toString(),
              docs: (item as { docs: { toString(): string }[] }).docs.map(
                (doc: { toString(): string }) => doc.toString(),
              ),
            });
          });
        }

        pallets.push({
          index: palletIndex,
          name: palletName,
          calls: calls.sort((a, b) => a.index - b.index),
          constants: constants.sort((a, b) => a.name.localeCompare(b.name)),
          storage: storage.sort((a, b) => a.name.localeCompare(b.name)),
        });
      });
    }

    return pallets.sort((a, b) => a.index - b.index);
  };

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <Container className="mt-4">
        <div
          className="d-flex justify-content-center align-items-center"
          style={{ minHeight: "200px" }}
        >
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
          <span className="ms-2">Loading runtime data...</span>
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          <Alert.Heading>Error Loading Runtime</Alert.Heading>
          <p>{error}</p>
        </Alert>
      </Container>
    );
  }

  if (!runtimeSpan || !metadata) {
    return (
      <Container className="mt-4">
        <Alert variant="warning">
          <Alert.Heading>Runtime Not Found</Alert.Heading>
          <p>The specified runtime could not be found.</p>
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <Row>
        <Col>
          <h1 className="mb-4">
            Runtime {runtimeSpan.spec_name} v{runtimeSpan.spec_version}
            <Badge bg="secondary" className="ms-2">
              {runtimeSpan.code_hash.substring(0, 10)}...
            </Badge>
          </h1>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Header>
              <h5 className="mb-0">Runtime Overview</h5>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={6}>
                  <Table borderless size="sm">
                    <tbody>
                      <tr>
                        <td>
                          <strong>Spec Name:</strong>
                        </td>
                        <td>{runtimeSpan.spec_name}</td>
                      </tr>
                      <tr>
                        <td>
                          <strong>Spec Version:</strong>
                        </td>
                        <td>{runtimeSpan.spec_version}</td>
                      </tr>
                      <tr>
                        <td>
                          <strong>Code Hash:</strong>
                        </td>
                        <td>
                          <code className="text-muted">
                            {runtimeSpan.code_hash}
                          </code>
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </Col>
                <Col md={6}>
                  <Table borderless size="sm">
                    <tbody>
                      <tr>
                        <td>
                          <strong>Block Range:</strong>
                        </td>
                        <td>
                          #{runtimeSpan.start_block.toLocaleString()} - #
                          {runtimeSpan.end_block.toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <strong>Block Span:</strong>
                        </td>
                        <td>
                          {(
                            runtimeSpan.end_block -
                            runtimeSpan.start_block +
                            1
                          ).toLocaleString()}{" "}
                          blocks
                        </td>
                      </tr>
                      {blockTimestamp && (
                        <tr>
                          <td>
                            <strong>Start Time:</strong>
                          </td>
                          <td>{formatTimestamp(blockTimestamp)}</td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col>
          <Card>
            <Card.Header>
              <h5 className="mb-0">Pallets ({pallets.length})</h5>
            </Card.Header>
            <Card.Body>
              <Tabs defaultActiveKey="overview" className="mb-3">
                <Tab eventKey="overview" title="Overview">
                  <Table striped bordered hover responsive>
                    <thead>
                      <tr>
                        <th>Index</th>
                        <th>Name</th>
                        <th>Calls</th>
                        <th>Constants</th>
                        <th>Storage Items</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pallets.map((pallet) => (
                        <tr key={pallet.index}>
                          <td>
                            <Badge bg="primary">{pallet.index}</Badge>
                          </td>
                          <td>
                            <strong>{pallet.name}</strong>
                          </td>
                          <td>
                            <Badge bg="info">{pallet.calls.length}</Badge>
                          </td>
                          <td>
                            <Badge bg="warning">
                              {pallet.constants.length}
                            </Badge>
                          </td>
                          <td>
                            <Badge bg="success">{pallet.storage.length}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Tab>

                <Tab eventKey="calls" title="Calls">
                  {pallets.map(
                    (pallet) =>
                      pallet.calls.length > 0 && (
                        <div key={pallet.index} className="mb-4">
                          <h6>
                            {pallet.name}{" "}
                            <Badge bg="secondary">Index {pallet.index}</Badge>
                          </h6>
                          <Table striped size="sm" className="mb-3">
                            <thead>
                              <tr>
                                <th>Call Index</th>
                                <th>Call Name</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pallet.calls.map((call) => (
                                <tr key={call.index}>
                                  <td>
                                    <Badge bg="primary">{call.index}</Badge>
                                  </td>
                                  <td>
                                    <code>{call.name}</code>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      ),
                  )}
                </Tab>

                <Tab eventKey="constants" title="Constants">
                  {pallets.map(
                    (pallet) =>
                      pallet.constants.length > 0 && (
                        <div key={pallet.index} className="mb-4">
                          <h6>
                            {pallet.name}{" "}
                            <Badge bg="secondary">Index {pallet.index}</Badge>
                          </h6>
                          <Table striped size="sm" className="mb-3">
                            <thead>
                              <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Value</th>
                                <th>Documentation</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pallet.constants.map((constant, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <code>{constant.name}</code>
                                  </td>
                                  <td>
                                    <small className="text-muted">
                                      {constant.type}
                                    </small>
                                  </td>
                                  <td>
                                    <code className="text-break">
                                      {constant.value}
                                    </code>
                                  </td>
                                  <td>
                                    <small>{constant.docs.join(" ")}</small>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      ),
                  )}
                </Tab>

                <Tab eventKey="storage" title="Storage">
                  {pallets.map(
                    (pallet) =>
                      pallet.storage.length > 0 && (
                        <div key={pallet.index} className="mb-4">
                          <h6>
                            {pallet.name}{" "}
                            <Badge bg="secondary">Index {pallet.index}</Badge>
                          </h6>
                          <Table striped size="sm" className="mb-3">
                            <thead>
                              <tr>
                                <th>Storage Item</th>
                                <th>Type</th>
                                <th>Documentation</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pallet.storage.map((item, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <code>{item.name}</code>
                                  </td>
                                  <td>
                                    <small className="text-muted">
                                      {item.type}
                                    </small>
                                  </td>
                                  <td>
                                    <small>{item.docs.join(" ")}</small>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      ),
                  )}
                </Tab>
              </Tabs>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Runtime;
