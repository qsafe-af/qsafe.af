import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, Badge, Alert, Button, Spinner, Table } from 'react-bootstrap';
import { blake2AsHex } from '@polkadot/util-crypto';
import { BN } from '@polkadot/util';
import { getChain } from '../chains';
import { themeClasses } from '../theme-utils';
import { fetchMetadata } from '../utils/metadata';
import { parseExtrinsicHeaderAndCall, toHuman } from '../utils/polkadot/extrinsicDecoder';
import { systemEventsStorageKey, decodeEventsAtBlock } from '../utils/polkadot/eventDecoder';

import type { ExtrinsicEvents } from '../utils/polkadot/eventDecoder';
import type { ParsedExtrinsic } from '../utils/polkadot/extrinsicDecoder';
import type { CallInfo } from '../utils/metadata';

interface ExtrinsicData {
  index: number;
  hex: string;
  parsed: ParsedExtrinsic;
  events?: ExtrinsicEvents;
  partialFeeHuman?: string;
  hash?: string;
}

interface BlockData {
  number: number;
  hash: string;
  extrinsics: string[];
}

const Extrinsic: React.FC = () => {
  const { chainId, extrinsicId } = useParams<{ chainId: string; extrinsicId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extrinsic, setExtrinsic] = useState<ExtrinsicData | null>(null);
  const [blockData, setBlockData] = useState<BlockData | null>(null);
  const [callInfo, setCallInfo] = useState<CallInfo | null>(null);

  const chain = chainId ? getChain(chainId) : undefined;

  useEffect(() => {
    if (!chain || !extrinsicId) {
      setError('Invalid chain or extrinsic ID');
      setLoading(false);
      return;
    }

    const fetchExtrinsicData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Parse extrinsic ID (format: blockNumber-extrinsicIndex)
        const [blockNumberStr, extrinsicIndexStr] = extrinsicId.split('-');
        const blockNumber = parseInt(blockNumberStr, 10);
        const extrinsicIndex = parseInt(extrinsicIndexStr, 10);

        if (isNaN(blockNumber) || isNaN(extrinsicIndex)) {
          throw new Error('Invalid extrinsic ID format');
        }

        // Connect to endpoint
        const endpoint = chain.endpoints?.[0];
        if (!endpoint) {
          throw new Error('No endpoint available for this chain');
        }

        const ws = new WebSocket(endpoint);
        
        await new Promise((resolve, reject) => {
          ws.onopen = resolve;
          ws.onerror = reject;
          setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
        });

        // Helper function to send RPC request
        const sendRequest = (method: string, params: any[] = []): Promise<any> => {
          return new Promise((resolve, reject) => {
            const id = Math.floor(Math.random() * 1000000);
            
            const handler = (event: MessageEvent) => {
              const data = JSON.parse(event.data);
              if (data.id === id) {
                ws.removeEventListener('message', handler);
                if (data.error) {
                  reject(new Error(data.error.message));
                } else {
                  resolve(data.result);
                }
              }
            };
            
            ws.addEventListener('message', handler);
            ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
          });
        };

        // Fetch block hash
        const blockHash = await sendRequest('chain_getBlockHash', [blockNumber]);
        if (!blockHash) {
          throw new Error(`Block ${blockNumber} not found`);
        }

        // Fetch block
        const block = await sendRequest('chain_getBlock', [blockHash]);
        if (!block || !block.block) {
          throw new Error(`Failed to fetch block ${blockNumber}`);
        }

        // Check if extrinsic index is valid
        const extrinsicsHex = block.block.extrinsics;
        if (extrinsicIndex >= extrinsicsHex.length) {
          throw new Error(`Extrinsic index ${extrinsicIndex} not found in block ${blockNumber}`);
        }

        // Fetch metadata
        const metadataResult = await fetchMetadata(endpoint, blockHash);
        const { metadata, callMap, tokenDecimals, ss58Format, tokenSymbol } = metadataResult;
        const decimals = tokenDecimals || 0;
        const ss58 = ss58Format || 42;
        const symbol = tokenSymbol || 'UNIT';

        // Parse the specific extrinsic
        const extrinsicHex = extrinsicsHex[extrinsicIndex];
        const parsed = parseExtrinsicHeaderAndCall(extrinsicHex, ss58, decimals, callMap, symbol);

        // Get call info
        let callInfo: CallInfo | null = null;
        if (parsed.ok && parsed.callIndex) {
          const callKey = (parsed.callIndex.pallet << 8) + parsed.callIndex.call;
          callInfo = callMap.get(callKey) || null;
        }

        // Fetch events for this extrinsic
        const eventsKey = systemEventsStorageKey();
        const eventsHex = await sendRequest('state_getStorage', [eventsKey, blockHash]);
        
        let extrinsicEvents: ExtrinsicEvents | undefined;
        if (eventsHex) {
          const allEventsMap = decodeEventsAtBlock(metadataResult.registry, metadata, eventsHex, ss58, decimals);
          extrinsicEvents = allEventsMap.get(extrinsicIndex);
        }

        // Calculate partial fee if not in events
        let partialFeeHuman: string | undefined;
        if (!extrinsicEvents?.feePaid && parsed.ok) {
          try {
            const partialFee = await sendRequest('payment_queryInfo', [extrinsicHex, blockHash]);
            if (partialFee && partialFee.partialFee) {
              partialFeeHuman = toHuman(new BN(partialFee.partialFee), decimals);
            }
          } catch (err) {
            console.warn('Failed to query payment info:', err);
          }
        }

        // Calculate extrinsic hash
        const hash = blake2AsHex(extrinsicHex, 256);

        setExtrinsic({
          index: extrinsicIndex,
          hex: extrinsicHex,
          parsed,
          events: extrinsicEvents,
          partialFeeHuman,
          hash
        });

        setBlockData({
          number: blockNumber,
          hash: blockHash,
          extrinsics: extrinsicsHex
        });

        setCallInfo(callInfo);

        ws.close();
      } catch (err) {
        console.error('Error fetching extrinsic:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch extrinsic data');
      } finally {
        setLoading(false);
      }
    };

    fetchExtrinsicData();
  }, [chain, chainId, extrinsicId]);

  if (!chain) {
    return (
      <Alert variant="danger">
        <Alert.Heading>Chain Not Found</Alert.Heading>
        <p>The chain "{chainId}" does not exist.</p>
        <Button variant="outline-danger" onClick={() => navigate('/chains')}>
          Back to Chains
        </Button>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="text-center mt-5">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p className="mt-2">Loading extrinsic data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="danger">
        <Alert.Heading>Error Loading Extrinsic</Alert.Heading>
        <p>{error}</p>
        <Button 
          variant="outline-danger" 
          onClick={() => navigate(`/chains/${chainId}/activity`)}
        >
          Back to Activity
        </Button>
      </Alert>
    );
  }

  if (!extrinsic || !blockData) {
    return (
      <Alert variant="warning">
        <Alert.Heading>Extrinsic Not Found</Alert.Heading>
        <p>The requested extrinsic could not be found.</p>
      </Alert>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-3">
        <Link to={`/chains/${chainId}/block/${blockData.number}`} className="btn btn-sm btn-secondary">
          <i className="bi bi-arrow-left me-2"></i>
          Back to Block {blockData.number}
        </Link>
      </div>

      <Card className={`${themeClasses.card} mb-4`}>
        <Card.Header>
          <h4 className="mb-0">Extrinsic {blockData.number}-{extrinsic.index}</h4>
        </Card.Header>
        <Card.Body>
          <div className="row mb-3">
            <div className="col-md-6">
              <h6 className="text-muted">Hash</h6>
              <p className="font-monospace small text-break">{extrinsic.hash}</p>
            </div>
            <div className="col-md-6">
              <h6 className="text-muted">Status</h6>
              <div>
                {extrinsic.parsed.ok ? (
                  <Badge bg="success">Success</Badge>
                ) : (
                  <Badge bg="danger">Failed</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="row mb-3">
            <div className="col-md-6">
              <h6 className="text-muted">Block</h6>
              <Link to={`/chains/${chainId}/block/${blockData.number}`}>
                {blockData.number}
              </Link>
            </div>
            <div className="col-md-6">
              <h6 className="text-muted">Extrinsic Index</h6>
              <p>{extrinsic.index}</p>
            </div>
          </div>

          {extrinsic.parsed.section && extrinsic.parsed.method && (
            <div className="row mb-3">
              <div className="col-md-6">
                <h6 className="text-muted">Pallet</h6>
                <Badge bg="info">{extrinsic.parsed.section}</Badge>
              </div>
              <div className="col-md-6">
                <h6 className="text-muted">Method</h6>
                <Badge bg="primary">{extrinsic.parsed.method}</Badge>
              </div>
            </div>
          )}

          {extrinsic.parsed.isSigned && extrinsic.parsed.sender && (
            <div className="row mb-3">
              <div className="col-md-6">
                <h6 className="text-muted">Sender</h6>
                <Link 
                  to={`/chains/${chainId}/account/${extrinsic.parsed.sender}`}
                  className="font-monospace small"
                >
                  {extrinsic.parsed.sender}
                </Link>
              </div>
              <div className="col-md-6">
                <h6 className="text-muted">Nonce</h6>
                <p>{extrinsic.parsed.nonce || '-'}</p>
              </div>
            </div>
          )}

          {(extrinsic.events?.feePaid || extrinsic.parsed.tipHuman) && (
            <div className="row mb-3">
              <div className="col-md-6">
                <h6 className="text-muted">Fee</h6>
                <p className="font-monospace">
                  {extrinsic.events?.feePaid?.amountHuman || '-'}
                </p>
              </div>
              {extrinsic.parsed.tipHuman && (
                <div className="col-md-6">
                  <h6 className="text-muted">Tip</h6>
                  <p className="font-monospace">{extrinsic.parsed.tipHuman}</p>
                </div>
              )}
            </div>
          )}

          <div className="mb-3">
            <h6 className="text-muted">Raw Length</h6>
            <p>{extrinsic.parsed.rawLength} bytes</p>
          </div>
        </Card.Body>
      </Card>

      {callInfo && (
        <Card className={`${themeClasses.card} mb-4`}>
          <Card.Header>
            <h5 className="mb-0">Call Details</h5>
          </Card.Header>
          <Card.Body>
            <h6 className="text-muted">Call Index</h6>
            <p className="font-monospace">
              Pallet: {extrinsic.parsed.callIndex?.pallet}, Call: {extrinsic.parsed.callIndex?.call}
            </p>
          </Card.Body>
        </Card>
      )}

      {extrinsic.events && extrinsic.events.transfers.length > 0 && (
        <Card className={`${themeClasses.card} mb-4`}>
          <Card.Header>
            <h5 className="mb-0">Transfers</h5>
          </Card.Header>
          <Card.Body>
            <Table className={`${themeClasses.table} table-sm`}>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {extrinsic.events.transfers.map((transfer, idx) => (
                  <tr key={idx}>
                    <td>
                      <Link 
                        to={`/chains/${chainId}/account/${transfer.from}`}
                        className="font-monospace small"
                      >
                        {transfer.from}
                      </Link>
                    </td>
                    <td>
                      <Link 
                        to={`/chains/${chainId}/account/${transfer.to}`}
                        className="font-monospace small"
                      >
                        {transfer.to}
                      </Link>
                    </td>
                    <td className="font-monospace small">{transfer.amountHuman}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      <Card className={`${themeClasses.card}`}>
        <Card.Header>
          <h5 className="mb-0">Raw Extrinsic Data</h5>
        </Card.Header>
        <Card.Body>
          <pre className="mb-0 small text-break" style={{ maxHeight: '200px', overflow: 'auto' }}>
            {extrinsic.hex}
          </pre>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Extrinsic;