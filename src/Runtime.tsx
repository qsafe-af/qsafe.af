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
            {runtimeSpan.spec_name} v{runtimeSpan.spec_version}
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
                                <th style={{ width: "40%" }}>Documentation</th>
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
                                <th style={{ width: "60%" }}>Documentation</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pallet.storage.map((item, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <code>{item.name}</code>
                                  </td>
                                  <td>
                                    {(() => {
                                      const reg: any = metadata?.registry;
                                      // Early JSON-to-YAML-ish renderer (avoids map/plain badges)
                                      const __renderYaml = (obj: any) => {
                                        const __lines: React.ReactNode[] = [];
                                        const __keyStyle = {
                                          color: "var(--yaml-key-color)",
                                        };
                                        const __valStyle = {
                                          color: "var(--yaml-value-color)",
                                        };
                                        const __pad = (n: number) =>
                                          "  ".repeat(n);
                                        const __render = (
                                          node: any,
                                          indent: number,
                                          path: string,
                                        ) => {
                                          if (Array.isArray(node)) {
                                            node.forEach((v, i) => {
                                              if (v && typeof v === "object") {
                                                __lines.push(
                                                  <div key={`${path}-${i}`}>
                                                    <span
                                                      style={{
                                                        whiteSpace: "pre",
                                                      }}
                                                    >
                                                      {__pad(indent)}-{" "}
                                                    </span>
                                                  </div>,
                                                );
                                                __render(
                                                  v,
                                                  indent + 1,
                                                  `${path}-${i}`,
                                                );
                                              } else {
                                                __lines.push(
                                                  <div key={`${path}-${i}`}>
                                                    <span
                                                      style={{
                                                        whiteSpace: "pre",
                                                      }}
                                                    >
                                                      {__pad(indent)}-{" "}
                                                    </span>
                                                    <span style={__valStyle}>
                                                      {String(v)}
                                                    </span>
                                                  </div>,
                                                );
                                              }
                                            });
                                          } else if (
                                            node &&
                                            typeof node === "object"
                                          ) {
                                            Object.entries(node).forEach(
                                              ([k, v]) => {
                                                if (
                                                  v &&
                                                  typeof v === "object"
                                                ) {
                                                  __lines.push(
                                                    <div key={`${path}-${k}`}>
                                                      <span
                                                        style={{
                                                          whiteSpace: "pre",
                                                        }}
                                                      >
                                                        {__pad(indent)}
                                                      </span>
                                                      <span style={__keyStyle}>
                                                        {k}:
                                                      </span>
                                                    </div>,
                                                  );
                                                  __render(
                                                    v,
                                                    indent + 1,
                                                    `${path}-${k}`,
                                                  );
                                                } else {
                                                  __lines.push(
                                                    <div key={`${path}-${k}`}>
                                                      <span
                                                        style={{
                                                          whiteSpace: "pre",
                                                        }}
                                                      >
                                                        {__pad(indent)}
                                                      </span>
                                                      <span style={__keyStyle}>
                                                        {k}:
                                                      </span>{" "}
                                                      <span style={__valStyle}>
                                                        {String(v)}
                                                      </span>
                                                    </div>,
                                                  );
                                                }
                                              },
                                            );
                                          } else {
                                            __lines.push(
                                              <div key={`${path}-v`}>
                                                <span style={__valStyle}>
                                                  {String(node)}
                                                </span>
                                              </div>,
                                            );
                                          }
                                        };
                                        __render(obj, 0, "root");
                                        return (
                                          <div className="small font-monospace">
                                            {__lines}
                                          </div>
                                        );
                                      };
                                      try {
                                        const __parsed = JSON.parse(item.type);
                                        if (
                                          __parsed &&
                                          typeof __parsed === "object"
                                        ) {
                                          return __renderYaml(__parsed);
                                        }
                                      } catch {}
                                      // Tolerant parse for JSON-like strings (unquoted keys, single quotes, trailing commas)
                                      let __parsed2: any = null;
                                      let __s = (item.type ?? "").trim();
                                      if (
                                        __s.startsWith("{") ||
                                        __s.startsWith("[")
                                      ) {
                                        __s = __s.replace(
                                          /([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g,
                                          '$1"$2"$3',
                                        );
                                        __s = __s.replace(
                                          /'([^']*)'/g,
                                          (_m, p1) =>
                                            `"${String(p1).replace(/"/g, '\\"')}"`,
                                        );
                                        __s = __s.replace(/,\s*([}\]])/g, "$1");
                                        try {
                                          __parsed2 = JSON.parse(__s);
                                        } catch {}
                                      }
                                      if (
                                        __parsed2 &&
                                        typeof __parsed2 === "object"
                                      ) {
                                        return __renderYaml(__parsed2);
                                      }
                                      const parseTypeJson = (
                                        input: string,
                                      ): any => {
                                        try {
                                          return JSON.parse(input);
                                        } catch {}
                                        let s = input.trim();
                                        // Only attempt to fix when it looks like JSON-ish
                                        if (
                                          !s.startsWith("{") &&
                                          !s.startsWith("[")
                                        ) {
                                          return null;
                                        }
                                        // Quote unquoted object keys: {key: ...} -> {"key": ...}
                                        s = s.replace(
                                          /([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g,
                                          '$1"$2"$3',
                                        );
                                        // Convert single-quoted strings to double-quoted
                                        s = s.replace(
                                          /'([^']*)'/g,
                                          (_m, p1) =>
                                            `"${String(p1).replace(/"/g, '\\"')}"`,
                                        );
                                        // Remove trailing commas before } or ]
                                        s = s.replace(/,\s*([}\]])/g, "$1");
                                        try {
                                          return JSON.parse(s);
                                        } catch {
                                          return null;
                                        }
                                      };
                                      const splitTopLevel = (
                                        s: string,
                                        sep: string,
                                      ): string[] => {
                                        const out: string[] = [];
                                        let depthAngle = 0,
                                          depthParen = 0,
                                          cur = "";
                                        for (let i = 0; i < s.length; i++) {
                                          const c = s[i];
                                          if (c === "<") depthAngle++;
                                          else if (c === ">")
                                            depthAngle = Math.max(
                                              0,
                                              depthAngle - 1,
                                            );
                                          else if (c === "(") depthParen++;
                                          else if (c === ")")
                                            depthParen = Math.max(
                                              0,
                                              depthParen - 1,
                                            );

                                          if (
                                            depthAngle === 0 &&
                                            depthParen === 0 &&
                                            c === sep
                                          ) {
                                            out.push(cur.trim());
                                            cur = "";
                                          } else {
                                            cur += c;
                                          }
                                        }
                                        if (cur) out.push(cur.trim());
                                        return out;
                                      };
                                      const normalizeTypeName = (
                                        name: string,
                                      ): string => {
                                        const n = name.trim();
                                        const map: Record<string, string> = {
                                          vec: "Vec",
                                          option: "Option",
                                          result: "Result",
                                          btreemap: "BTreeMap",
                                          boundedvec: "BoundedVec",
                                          vecdeque: "VecDeque",
                                        };
                                        const lower = n.toLowerCase();
                                        return (
                                          map[lower] ||
                                          n.replace(/^\w/, (m) =>
                                            m.toUpperCase(),
                                          )
                                        );
                                      };
                                      const stringifyType = (
                                        val: any,
                                      ): string => {
                                        if (Array.isArray(val))
                                          return val
                                            .map(stringifyType)
                                            .join(", ");
                                        if (
                                          typeof val === "number" ||
                                          (typeof val === "string" &&
                                            /^\d+$/.test(val))
                                        ) {
                                          const id = Number(val);
                                          if (reg?.lookup?.getTypeDef) {
                                            try {
                                              const def = reg.lookup.getTypeDef(
                                                id as any,
                                              );
                                              return (
                                                def?.type || `TypeId(${id})`
                                              );
                                            } catch {
                                              return `TypeId(${id})`;
                                            }
                                          }
                                          return `TypeId(${id})`;
                                        }
                                        return String(val);
                                      };
                                      const renderTypeString = (
                                        s: string,
                                      ): React.ReactNode => {
                                        const str = s.trim();
                                        // tuple e.g. (u32, u32)
                                        if (
                                          str.startsWith("(") &&
                                          str.endsWith(")")
                                        ) {
                                          const inner = str.slice(1, -1).trim();
                                          const parts = splitTopLevel(
                                            inner,
                                            ",",
                                          );
                                          return (
                                            <code>
                                              (
                                              {parts.map((p, idx) => (
                                                <span key={idx}>
                                                  {renderTypeString(p)}
                                                  {idx < parts.length - 1
                                                    ? ", "
                                                    : ""}
                                                </span>
                                              ))}
                                              )
                                            </code>
                                          );
                                        }
                                        // generic e.g. vec<u32> or BTreeMap<AccountId, u128>
                                        const lt = str.indexOf("<");
                                        const gt = str.lastIndexOf(">");
                                        if (lt > 0 && gt > lt) {
                                          const name = normalizeTypeName(
                                            str.slice(0, lt),
                                          );
                                          const inner = str.slice(lt + 1, gt);
                                          const params = splitTopLevel(
                                            inner,
                                            ",",
                                          );
                                          return (
                                            <code>
                                              {name}
                                              {"<"}
                                              {params.map((p, idx) => (
                                                <span key={idx}>
                                                  {renderTypeString(p)}
                                                  {idx < params.length - 1
                                                    ? ", "
                                                    : ""}
                                                </span>
                                              ))}
                                              {">"}
                                            </code>
                                          );
                                        }
                                        return (
                                          <code>{normalizeTypeName(str)}</code>
                                        );
                                      };
                                      const toTypeName = (val: any): string => {
                                        if (Array.isArray(val)) {
                                          return val.map(toTypeName).join(", ");
                                        }
                                        if (
                                          typeof val === "number" ||
                                          (typeof val === "string" &&
                                            /^\d+$/.test(val))
                                        ) {
                                          const id = Number(val);
                                          if (reg?.lookup?.getTypeDef) {
                                            try {
                                              const def = reg.lookup.getTypeDef(
                                                id as any,
                                              );
                                              return (
                                                def?.type || `TypeId(${id})`
                                              );
                                            } catch {
                                              return `TypeId(${id})`;
                                            }
                                          }
                                          return `TypeId(${id})`;
                                        }
                                        return String(val);
                                      };
                                      const pick = (
                                        o: any,
                                        names: string[],
                                      ) => {
                                        for (const n of names) {
                                          if (
                                            o &&
                                            Object.prototype.hasOwnProperty.call(
                                              o,
                                              n,
                                            )
                                          ) {
                                            return o[n];
                                          }
                                        }
                                        return undefined;
                                      };
                                      try {
                                        const t = parseTypeJson(item.type);
                                        if (t && typeof t === "object") {
                                          const plain = pick(t, [
                                            "Plain",
                                            "plain",
                                          ]);
                                          if (plain !== undefined) {
                                            return (
                                              <div className="small">
                                                <span className="badge bg-secondary me-1">
                                                  Plain
                                                </span>
                                                {typeof plain === "object" ? (
                                                  (plain as any)._enum ? (
                                                    <div className="small">
                                                      <span className="badge bg-secondary me-1">
                                                        Enum
                                                      </span>
                                                      {Object.entries(
                                                        (plain as any)._enum,
                                                      ).map(([k, v]) => (
                                                        <div key={k}>
                                                          <strong>{k}</strong>
                                                          {v &&
                                                          String(v) !==
                                                            "Null" ? (
                                                            <>
                                                              :{" "}
                                                              {renderTypeString(
                                                                stringifyType(
                                                                  v,
                                                                ),
                                                              )}
                                                            </>
                                                          ) : (
                                                            <>
                                                              :{" "}
                                                              <code>Unit</code>
                                                            </>
                                                          )}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  ) : (
                                                    <div className="small">
                                                      {Object.entries(
                                                        plain as any,
                                                      ).map(([k, v]) => (
                                                        <div key={k}>
                                                          <strong>{k}</strong>:{" "}
                                                          {renderTypeString(
                                                            stringifyType(v),
                                                          )}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )
                                                ) : (
                                                  renderTypeString(
                                                    stringifyType(plain),
                                                  )
                                                )}
                                              </div>
                                            );
                                          }
                                          const map = pick(t, ["Map", "map"]);
                                          if (map) {
                                            const key = stringifyType(
                                              Array.isArray(map.key)
                                                ? map.key
                                                : [map.key],
                                            );
                                            const value = stringifyType(
                                              map.value,
                                            );
                                            const hashers =
                                              map.hasher ?? map.hashers;
                                            return (
                                              <div className="small">
                                                <div>
                                                  <span className="badge bg-secondary me-1">
                                                    Map
                                                  </span>
                                                  <strong>Key:</strong>{" "}
                                                  {renderTypeString(key)}
                                                </div>
                                                <div>
                                                  <strong>Value:</strong>{" "}
                                                  {typeof (map as any).value ===
                                                  "object" ? (
                                                    <div className="small d-inline-block">
                                                      {Object.entries(
                                                        (map as any).value,
                                                      ).map(([k, v]) => (
                                                        <div key={k}>
                                                          <strong>{k}</strong>:{" "}
                                                          {renderTypeString(
                                                            stringifyType(v),
                                                          )}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  ) : (
                                                    renderTypeString(value)
                                                  )}
                                                </div>
                                                {hashers !== undefined && (
                                                  <div>
                                                    <strong>Hasher:</strong>{" "}
                                                    <code>
                                                      {Array.isArray(hashers)
                                                        ? hashers.join(", ")
                                                        : String(hashers)}
                                                    </code>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }
                                          const nmap = pick(t, [
                                            "NMap",
                                            "nMap",
                                            "nmap",
                                          ]);
                                          if (nmap) {
                                            const keysList = Array.isArray(
                                              nmap.key,
                                            )
                                              ? nmap.key
                                              : [nmap.key];
                                            const keysStr =
                                              stringifyType(keysList);
                                            const value = stringifyType(
                                              nmap.value,
                                            );
                                            const hashers =
                                              nmap.hashers ??
                                              (nmap.hasher
                                                ? [nmap.hasher]
                                                : []);
                                            return (
                                              <div className="small">
                                                <div>
                                                  <span className="badge bg-secondary me-1">
                                                    NMap
                                                  </span>
                                                  <strong>Keys:</strong>{" "}
                                                  {renderTypeString(keysStr)}
                                                </div>
                                                <div>
                                                  <strong>Value:</strong>{" "}
                                                  {typeof (nmap as any)
                                                    .value === "object" ? (
                                                    <div className="small d-inline-block">
                                                      {Object.entries(
                                                        (nmap as any).value,
                                                      ).map(([k, v]) => (
                                                        <div key={k}>
                                                          <strong>{k}</strong>:{" "}
                                                          {renderTypeString(
                                                            stringifyType(v),
                                                          )}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  ) : (
                                                    renderTypeString(value)
                                                  )}
                                                </div>
                                                {hashers.length > 0 && (
                                                  <div>
                                                    <strong>Hashers:</strong>{" "}
                                                    <code>
                                                      {hashers.join(", ")}
                                                    </code>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }
                                          const dmap = pick(t, [
                                            "DoubleMap",
                                            "doubleMap",
                                            "doublemap",
                                          ]);
                                          if (dmap) {
                                            const key1 = stringifyType(
                                              dmap.key1,
                                            );
                                            const key2 = stringifyType(
                                              dmap.key2,
                                            );
                                            const value = stringifyType(
                                              dmap.value,
                                            );
                                            return (
                                              <div className="small">
                                                <div>
                                                  <span className="badge bg-secondary me-1">
                                                    DoubleMap
                                                  </span>
                                                  <strong>Key1:</strong>{" "}
                                                  {renderTypeString(key1)}{" "}
                                                  <strong>Key2:</strong>{" "}
                                                  {renderTypeString(key2)}
                                                </div>
                                                <div>
                                                  <strong>Value:</strong>{" "}
                                                  {typeof (dmap as any)
                                                    .value === "object" ? (
                                                    <div className="small d-inline-block">
                                                      {Object.entries(
                                                        (dmap as any).value,
                                                      ).map(([k, v]) => (
                                                        <div key={k}>
                                                          <strong>{k}</strong>:{" "}
                                                          {renderTypeString(
                                                            stringifyType(v),
                                                          )}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  ) : (
                                                    renderTypeString(value)
                                                  )}
                                                </div>
                                                {(dmap.hasher ||
                                                  dmap.key2Hasher) && (
                                                  <div>
                                                    {dmap.hasher && (
                                                      <>
                                                        <strong>Hasher:</strong>{" "}
                                                        <code>
                                                          {String(dmap.hasher)}
                                                        </code>{" "}
                                                      </>
                                                    )}
                                                    {dmap.key2Hasher && (
                                                      <>
                                                        <strong>
                                                          Key2 Hasher:
                                                        </strong>{" "}
                                                        <code>
                                                          {String(
                                                            dmap.key2Hasher,
                                                          )}
                                                        </code>
                                                      </>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }
                                        }
                                      } catch {}
                                      return (() => {
                                        let parsed: any = null;
                                        try {
                                          parsed = JSON.parse(item.type);
                                        } catch {}
                                        if (
                                          parsed &&
                                          typeof parsed === "object"
                                        ) {
                                          const lines: React.ReactNode[] = [];
                                          const keyStyle = {
                                            color: "var(--yaml-key-color)",
                                          };
                                          const valStyle = {
                                            color: "var(--yaml-value-color)",
                                          };
                                          const pad = (n: number) =>
                                            "  ".repeat(n);
                                          const render = (
                                            node: any,
                                            indent: number,
                                            path: string,
                                          ) => {
                                            if (Array.isArray(node)) {
                                              node.forEach((v, i) => {
                                                if (
                                                  v &&
                                                  typeof v === "object"
                                                ) {
                                                  lines.push(
                                                    <div key={`${path}-${i}`}>
                                                      <span
                                                        style={{
                                                          whiteSpace: "pre",
                                                        }}
                                                      >
                                                        {pad(indent)}-{" "}
                                                      </span>
                                                    </div>,
                                                  );
                                                  render(
                                                    v,
                                                    indent + 1,
                                                    `${path}-${i}`,
                                                  );
                                                } else {
                                                  lines.push(
                                                    <div key={`${path}-${i}`}>
                                                      <span
                                                        style={{
                                                          whiteSpace: "pre",
                                                        }}
                                                      >
                                                        {pad(indent)}-{" "}
                                                      </span>
                                                      <span style={valStyle}>
                                                        {String(v)}
                                                      </span>
                                                    </div>,
                                                  );
                                                }
                                              });
                                            } else if (
                                              node &&
                                              typeof node === "object"
                                            ) {
                                              Object.entries(node).forEach(
                                                ([k, v]) => {
                                                  if (
                                                    v &&
                                                    typeof v === "object"
                                                  ) {
                                                    lines.push(
                                                      <div key={`${path}-${k}`}>
                                                        <span
                                                          style={{
                                                            whiteSpace: "pre",
                                                          }}
                                                        >
                                                          {pad(indent)}
                                                        </span>
                                                        <span style={keyStyle}>
                                                          {k}:
                                                        </span>
                                                      </div>,
                                                    );
                                                    render(
                                                      v,
                                                      indent + 1,
                                                      `${path}-${k}`,
                                                    );
                                                  } else {
                                                    lines.push(
                                                      <div key={`${path}-${k}`}>
                                                        <span
                                                          style={{
                                                            whiteSpace: "pre",
                                                          }}
                                                        >
                                                          {pad(indent)}
                                                        </span>
                                                        <span style={keyStyle}>
                                                          {k}:
                                                        </span>{" "}
                                                        <span style={valStyle}>
                                                          {String(v)}
                                                        </span>
                                                      </div>,
                                                    );
                                                  }
                                                },
                                              );
                                            } else {
                                              lines.push(
                                                <div key={`${path}-v`}>
                                                  <span style={valStyle}>
                                                    {String(node)}
                                                  </span>
                                                </div>,
                                              );
                                            }
                                          };
                                          render(parsed, 0, "root");
                                          return (
                                            <div className="small font-monospace">
                                              {lines}
                                            </div>
                                          );
                                        }
                                        return (
                                          <small className="text-muted">
                                            {item.type}
                                          </small>
                                        );
                                      })();
                                    })()}
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
      <style>{`
      :root {
        --yaml-key-color: #9cdcfe;
        --yaml-value-color: #ce9178;
      }
      [data-bs-theme="light"] {
        /* Darker blue for keys in light theme for better contrast */
        --yaml-key-color: #0d6efd;
      }
      [data-bs-theme="dark"] {
        --yaml-key-color: #9cdcfe;
      }
    `}</style>
    </Container>
  );
};

export default Runtime;
