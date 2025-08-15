import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, Badge, Alert, Button, Table, Spinner } from "react-bootstrap";
import { BN } from '@polkadot/util';
import { blake2AsHex } from '@polkadot/util-crypto';
import { getChain } from "../chains";
import { themeClasses } from "../theme-utils";
import { decodeDigest } from "../decoders/digestDecoder";
import { formatAuthorAddress } from "../utils/ss58";
import { fetchMetadata } from "../utils/metadata";
import { parseExtrinsicHeaderAndCall, toHuman } from "../utils/polkadot/extrinsicDecoder";
import { systemEventsStorageKey, decodeEventsAtBlock } from "../utils/polkadot/eventDecoder";
import type { ExtrinsicEvents } from "../utils/polkadot/eventDecoder";
import type { ParsedExtrinsic } from "../utils/polkadot/extrinsicDecoder";
import type { CallInfo } from "../utils/metadata";

import "./BlockExtrinsics.css";
import "./ExtrinsicEvents.css";
import "./BlockDetail.css";

// Types
interface BlockDetailData {
  blockNumber: string;
  blockHash: string;
  block?: {
    header: {
      number: string;
      parentHash?: string;
      stateRoot?: string;
      extrinsicsRoot?: string;
      digest?: { logs: string[] };
    };
    extrinsics: string[];
  };
  metadata?: {
    registry: unknown;
    metadata: unknown;
    callMap: Map<number, CallInfo>;
  };
  callMap?: Map<number, CallInfo>;
  extrinsicsData?: ExtrinsicData[];
  eventsMap?: Map<number, ExtrinsicEvents>;
  loading: boolean;
  error?: string;
}

interface ExtrinsicData {
  index: number;
  hex: string;
  parsed: ParsedExtrinsic;
  events?: ExtrinsicEvents;
  partialFeeHuman?: string;
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
    loading: true,
  });
  const [formattedAuthor, setFormattedAuthor] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const chain = chainId ? getChain(chainId) : null;

  useEffect(() => {
    if (!chainId || !blockNumberOrHash || !chain || !chain.endpoints) {
      setBlockData((prev) => ({
        ...prev,
        loading: false,
        error: "Invalid chain configuration",
      }));
      return;
    }

    const endpoint = chain.endpoints[0];
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;

    let messageId = 1;
    const pendingRequests = new Map<number, (data: unknown) => void>();

    const sendRequest = (method: string, params: unknown[]) => {
      const id = messageId++;
      return new Promise((resolve) => {
        pendingRequests.set(id, resolve);
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      });
    };

    ws.onopen = async () => {
      console.log('[BlockDetail] WebSocket connected');
      
      try {
        // Resolve block hash
        let blockHash: string;
        if (/^0x[0-9a-fA-F]{64}$/.test(blockNumberOrHash)) {
          blockHash = blockNumberOrHash;
        } else if (/^\d+$/.test(blockNumberOrHash)) {
          blockHash = await sendRequest('chain_getBlockHash', [
            '0x' + BigInt(blockNumberOrHash).toString(16)
          ]) as string;
        } else {
          throw new Error('Block must be a decimal number or 0x-hash');
        }

        // Get chain properties
        const props = await sendRequest('system_properties', []) as {
          tokenSymbol?: string | string[];
          tokenDecimals?: number | number[];
          ss58Format?: number;
        };
        const tokenSymbols: string[] = Array.isArray(props?.tokenSymbol)
          ? props.tokenSymbol
          : props?.tokenSymbol ? [String(props.tokenSymbol)] : ['UNIT'];
        const tokenDecimalsArr: number[] = Array.isArray(props?.tokenDecimals)
          ? props.tokenDecimals.map((d) => Number(d))
          : props?.tokenDecimals !== undefined ? [Number(props.tokenDecimals)] : [12];
        const ss58Format: number = Number(props?.ss58Format ?? 42);
        const symbol = tokenSymbols[0] ?? 'UNIT';
        const decimals = tokenDecimalsArr[0] ?? 12;

        // Get block data
        const block = await sendRequest('chain_getBlock', [blockHash]) as {
          block: {
            header: { 
              number: string;
              digest?: { logs: string[] };
            };
            extrinsics: string[];
          };
        };
        const numberHex: string = block.block.header?.number ?? '0x0';
        const number = BigInt(numberHex).toString(10);
        const extrinsics: string[] = block.block.extrinsics;
        
        // Fetch metadata with caching based on spec version
        const metadataInfo = await fetchMetadata(endpoint, blockHash);
        const { callMap, ss58Format: ss58FromMeta, registry, metadata } = metadataInfo;
        const ss58 = Number.isFinite(ss58FromMeta) ? (ss58FromMeta as number) : ss58Format;

        // Get events
        const eventsKey = systemEventsStorageKey();
        const eventsHex: string | null = await sendRequest('state_getStorageAt', [
          eventsKey,
          blockHash
        ]) as string;
        const eventsByExtrinsic = eventsHex
          ? decodeEventsAtBlock(registry, metadata, eventsHex, ss58, decimals)
          : new Map();

        // Parse extrinsics
        const extrinsicsData: ExtrinsicData[] = [];
        for (let idx = 0; idx < extrinsics.length; idx++) {
          const hex = extrinsics[idx];
          const parsed = parseExtrinsicHeaderAndCall(hex, ss58, decimals, callMap, symbol);
          const events = eventsByExtrinsic.get(idx);
          
          // Try to get fee info
          let partialFeeHuman: string | undefined;
          try {
            const info = await sendRequest('payment_queryInfo', [hex, blockHash]) as {
              partialFee?: string | { toString(): string };
            };
            if (info?.partialFee != null) {
              const pf = new BN(info.partialFee.toString());
              partialFeeHuman = `${toHuman(pf, decimals)} ${symbol}`;
            }
          } catch {
            // Fee estimation failed, continue without it
          }

          extrinsicsData.push({ index: idx, hex, parsed, events, partialFeeHuman });
        }

        // Extract author from digest
        const digestInfo = block.block.header.digest ? decodeDigest(block.block.header.digest) : null;
        const author = digestInfo?.author;
        if (author && chain) {
          formatAuthorAddress(author, chain.endpoints?.[0], chain.genesis)
            .then((formatted) => setFormattedAuthor(formatted))
            .catch((err) => {
              console.error('[BlockDetail] Error formatting author:', err);
              setFormattedAuthor(author);
            });
        }

        setBlockData({
          blockNumber: number,
          blockHash,
          block: block.block,
          metadata: { registry, metadata, callMap },
          extrinsicsData,
          eventsMap: eventsByExtrinsic,
          loading: false,
        });

      } catch (error) {
        console.error('[BlockDetail] Error:', error);
        setBlockData((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load block data',
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id && pendingRequests.has(data.id)) {
          const handler = pendingRequests.get(data.id)!;
          pendingRequests.delete(data.id);
          if (data.error) {
            console.error('[BlockDetail] RPC error:', data.error);
            handler(null);
          } else {
            handler(data.result);
          }
        }
      } catch (error) {
        console.error('[BlockDetail] Message parsing error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[BlockDetail] WebSocket error:', error);
      setBlockData((prev) => ({
        ...prev,
        loading: false,
        error: 'Connection error',
      }));
    };

    ws.onclose = () => {
      console.log('[BlockDetail] WebSocket closed');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [chainId, blockNumberOrHash, chain]);

  const handleBack = () => {
    navigate(`/chains/${chainId}`);
  };



  if (!chain) {
    return (
      <div className="container mt-5">
        <Alert variant="danger">
          <h4>Chain Not Found</h4>
          <p>The chain "{chainId}" does not exist.</p>
          <Button variant="outline-danger" onClick={() => navigate("/chains")}>
            Back to Chains
          </Button>
        </Alert>
      </div>
    );
  }

  if (blockData.loading) {
    return (
      <div className="container mt-5">
        <div className="loading-container">
          <div className="text-center">
            <Spinner animation="border" role="status" className="mb-3" />
            <p>Loading block data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (blockData.error) {
    return (
      <div className="container mt-5">
        <Alert variant="danger">
          <h4>Error Loading Block</h4>
          <p>{blockData.error}</p>
          <Button variant="outline-danger" onClick={handleBack}>
            Back to {chain.name}
          </Button>
        </Alert>
      </div>
    );
  }

  // Extract transactions from extrinsics data
  const transactions = blockData.extrinsicsData?.filter(ext => 
    ext.parsed.isSigned && ext.events?.transfers && ext.events.transfers.length > 0
  ) || [];

  return (
    <div className="container mt-4 block-detail-container">
      <div className="d-flex align-items-center mb-4">
        <Button variant="outline-secondary" size="sm" onClick={handleBack}>
          ← Back to {chain.name}
        </Button>
        <h2 className="ms-3 mb-0">Block #{blockData.blockNumber}</h2>
      </div>

      <Card className={`${themeClasses.card} block-info-card block-detail-section`}>
        <Card.Header>
          <h5 className="mb-0">Block Information</h5>
        </Card.Header>
        <Card.Body>
          <div className="row info-grid">
            <div className="col-md-6 info-grid-item">
              <h6 className="block-section-header">Block Hash</h6>
              <p className="font-monospace small text-break">{blockData.blockHash}</p>
            </div>
            <div className="col-md-6 info-grid-item">
              <h6 className="block-section-header">Parent Hash</h6>
              <p className="font-monospace small text-break">
                {blockData.block?.header?.parentHash ? (
                  <Link 
                    to={`/chains/${chainId}/block/${blockData.block.header.parentHash}`}
                    className="hash-link"
                  >
                    {blockData.block.header.parentHash}
                  </Link>
                ) : 'N/A'}
              </p>
            </div>
          </div>
          {formattedAuthor && (
            <div className="row mt-3">
              <div className="col-12">
                <h6 className="block-section-header">Miner</h6>
                <p className="font-monospace small text-break">
                  <Link 
                    to={`/chains/${chainId}/account/${formattedAuthor}`}
                    className="address-link"
                  >
                    {formattedAuthor}
                  </Link>
                </p>
              </div>
            </div>
          )}
          <div className="row mt-3 info-grid">
            <div className="col-md-4 info-grid-item">
              <h6 className="block-section-header">State Root</h6>
              <p className="font-monospace small text-truncate">
                {blockData.block?.header?.stateRoot || 'N/A'}
              </p>
            </div>
            <div className="col-md-4 info-grid-item">
              <h6 className="block-section-header">Extrinsics Root</h6>
              <p className="font-monospace small text-truncate">
                {blockData.block?.header?.extrinsicsRoot || 'N/A'}
              </p>
            </div>
            <div className="col-md-4 info-grid-item">
              <h6 className="block-section-header">Extrinsics Count</h6>
              <p>{blockData.extrinsicsData?.length || 0}</p>
            </div>
          </div>
        </Card.Body>
      </Card>

      {transactions.length > 0 && (
        <Card className={`${themeClasses.card} block-detail-section`}>
          <Card.Header>
            <h5 className="mb-0">Transactions</h5>
          </Card.Header>
          <Card.Body>
            <Table responsive hover className={`${themeClasses.table} transactions-table`}>
              <thead>
                <tr>
                  <th>Extrinsic</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Amount</th>
                  <th>Fee</th>
                  <th>Nonce</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  tx.events!.transfers.map((transfer, tIdx) => (
                    <React.Fragment key={`${tx.index}-${tIdx}`}>
                      <tr className="tx-hash-row">
                        <td colSpan={6} className="font-monospace small text-muted">
                          Hash: {blake2AsHex(tx.hex, 256)}
                        </td>
                      </tr>
                      <tr className="tx-data-row">
                        <td>
                          <Badge bg="secondary" className="extrinsic-index-badge">#{tx.index}</Badge>
                        </td>
                        <td>
                          <Link 
                            to={`/chains/${chainId}/account/${transfer.from}`}
                            className="font-monospace small address-link"
                          >
                            {transfer.from}
                          </Link>
                        </td>
                        <td>
                          <Link 
                            to={`/chains/${chainId}/account/${transfer.to}`}
                            className="font-monospace small address-link"
                          >
                            {transfer.to}
                          </Link>
                        </td>
                        <td className="font-monospace small amount-display">
                          {transfer.amountHuman}
                        </td>
                        <td className="font-monospace small amount-display">
                          {tx.events?.feePaid?.amountHuman || tx.partialFeeHuman || '-'}
                        </td>
                        <td>
                          <Badge bg="info">{tx.parsed.nonce || '-'}</Badge>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      {blockData.extrinsicsData && blockData.extrinsicsData.length > 0 && (
        <Card className={`${themeClasses.card} block-detail-section`}>
          <Card.Header>
            <h5 className="mb-0">Extrinsics ({blockData.extrinsicsData.length})</h5>
          </Card.Header>
          <Card.Body>
            <div className="extrinsics-container">
              {blockData.extrinsicsData.map((ext) => (
                <Card key={ext.index} className="mb-3 extrinsic-card">
                  <Card.Header className="d-flex justify-content-between align-items-center">
                    <div>
                      <strong>Extrinsic #{ext.index}</strong>
                      {ext.parsed.section && ext.parsed.method && (
                        <Badge bg="primary" className="ms-2 method-badge">
                          {ext.parsed.section}.{ext.parsed.method}
                        </Badge>
                      )}
                      {!ext.parsed.isSigned && (
                        <Badge bg="secondary" className="ms-1">Inherent</Badge>
                      )}
                    </div>
                    <div>
                      {ext.parsed.ok ? (
                        <Badge className="status-badge-success">Success</Badge>
                      ) : (
                        <Badge className="status-badge-failed">Failed</Badge>
                      )}
                    </div>
                  </Card.Header>
                  <Card.Body>
                    {ext.parsed.isSigned && (
                      <div className="extrinsic-details mb-3">
                        <div className="extrinsic-detail-row">
                          <span className="extrinsic-detail-label">Signer:</span>
                          {ext.parsed.sender ? (
                            <Link 
                              to={`/chains/${chainId}/account/${ext.parsed.sender}`}
                              className="font-monospace small address-link"
                            >
                              {ext.parsed.sender}
                            </Link>
                          ) : 'Unknown'}
                        </div>
                        <div className="row mt-2">
                          <div className="col-md-6">
                            {ext.parsed.nonce !== undefined && (
                              <div className="extrinsic-detail-row">
                                <span className="extrinsic-detail-label">Nonce:</span>
                                <Badge bg="info">{ext.parsed.nonce}</Badge>
                              </div>
                            )}
                          </div>
                          <div className="col-md-6">
                            {ext.parsed.tipHuman && (
                              <div className="extrinsic-detail-row">
                                <span className="extrinsic-detail-label">Tip:</span>
                                <span className="font-monospace small amount-display">{ext.parsed.tipHuman}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {ext.partialFeeHuman && (
                      <div className="extrinsic-detail-row mb-2">
                        <span className="extrinsic-detail-label">Estimated Fee:</span>
                        <span className="font-monospace small amount-display">{ext.partialFeeHuman}</span>
                      </div>
                    )}
                    {ext.events && ext.events.transfers.length > 0 && (
                      <div className="mb-3">
                        <h6 className="text-muted">Transfers:</h6>
                        <div className="table-responsive">
                          <table className="table table-sm transfer-table">
                            <tbody>
                              {ext.events.transfers.map((transfer, i) => (
                                <tr key={i}>
                                  <td className="border-0 ps-0">
                                    <Link 
                                      to={`/chains/${chainId}/account/${transfer.from}`}
                                      className="font-monospace small address-link"
                                    >
                                      {transfer.from}
                                    </Link>
                                  </td>
                                  <td className="border-0 text-center arrow-cell">→</td>
                                  <td className="border-0">
                                    <Link 
                                      to={`/chains/${chainId}/account/${transfer.to}`}
                                      className="font-monospace small address-link"
                                    >
                                      {transfer.to}
                                    </Link>
                                  </td>
                                  <td className="border-0 text-end pe-0">
                                    <span className="font-monospace small amount-display">{transfer.amountHuman}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {ext.events?.feePaid && (
                      <div className="extrinsic-detail-row mt-2">
                        <span className="extrinsic-detail-label">Fee Paid:</span>
                        <div>
                          <span className="font-monospace small amount-display">{ext.events.feePaid.amountHuman}</span>{' '}
                          by{' '}
                          <Link 
                            to={`/chains/${chainId}/account/${ext.events.feePaid.payer}`}
                            className="font-monospace small address-link"
                          >
                            {ext.events.feePaid.payer}
                          </Link>
                        </div>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  );
};

export default BlockDetail;
