import React, { useState, useEffect } from 'react';
import { Card, Badge } from 'react-bootstrap';
import type { SubstrateEvent, Chain } from '../types';
import ExtrinsicEvents from './ExtrinsicEvents';
import { parseExtrinsicHeaderAndCall } from '../utils/polkadot/extrinsicDecoder';
import type { ParsedExtrinsic } from '../utils/polkadot/extrinsicDecoder';
import { getCachedChainProperties } from '../utils/ss58';
import type { MetadataInfo } from '../utils/metadata';
import './BlockExtrinsics.css';

interface BlockExtrinsicProps {
  extrinsic: string;
  index: number;
  events: SubstrateEvent[];
  chain?: Chain;
  blockHash?: string;
  metadata?: MetadataInfo;
}

const BlockExtrinsic: React.FC<BlockExtrinsicProps> = ({ extrinsic, index, events, chain, metadata }) => {
  const [parsedExtrinsic, setParsedExtrinsic] = useState<ParsedExtrinsic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const parseExtrinsic = async () => {
      if (!chain || !extrinsic) {
        setLoading(false);
        return;
      }

      try {
        // Get chain properties
        const chainProps = getCachedChainProperties(chain.genesis);
        const ss58Format = chainProps?.ss58Format || 42;
        const decimals = chainProps?.tokenDecimals || 12;
        const symbol = chainProps?.tokenSymbol || 'UNIT';

        // Use provided metadata or create empty call map
        const callMap = metadata?.callMap || new Map();
        console.log(`[BlockExtrinsic #${index}] Metadata available:`, !!metadata, 'CallMap size:', callMap.size);
        
        const parsed = parseExtrinsicHeaderAndCall(
          extrinsic,
          ss58Format,
          decimals,
          callMap,
          symbol
        );
        
        console.log(`[BlockExtrinsic #${index}] Parsed extrinsic:`, parsed.section, parsed.method);

        setParsedExtrinsic(parsed);
      } catch (error) {
        console.error('Error parsing extrinsic:', error);
        setParsedExtrinsic(null);
      } finally {
        setLoading(false);
      }
    };

    parseExtrinsic();
  }, [extrinsic, chain, metadata, index]);

  if (loading) {
    return (
      <Card className="mb-3 block-extrinsic-card">
        <Card.Body>
          <div>Loading...</div>
        </Card.Body>
      </Card>
    );
  }

  if (!parsedExtrinsic) {
    return (
      <Card className="mb-3 block-extrinsic-card">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <Badge bg="secondary" className="me-2">#{index}</Badge>
              <span className="text-muted">Failed to parse extrinsic</span>
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className="mb-3 block-extrinsic-card">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <Badge bg="primary" className="me-2">#{index}</Badge>
            <span className="fw-bold">
              {parsedExtrinsic.section || 'Unknown'}.{parsedExtrinsic.method || 'Unknown'}
            </span>
            {parsedExtrinsic.isSigned && parsedExtrinsic.sender && (
              <div className="mt-2 small text-muted">
                <strong>From:</strong> {parsedExtrinsic.sender}
                {parsedExtrinsic.nonce && <span className="ms-3"><strong>Nonce:</strong> {parsedExtrinsic.nonce}</span>}
                {parsedExtrinsic.tipHuman && <span className="ms-3"><strong>Tip:</strong> {parsedExtrinsic.tipHuman}</span>}
              </div>
            )}
          </div>
          <Badge bg={parsedExtrinsic.ok ? "success" : "warning"}>
            {parsedExtrinsic.isSigned ? "Signed" : "Unsigned"}
          </Badge>
        </div>
        {events.length > 0 && (
          <div className="mt-3">
            <ExtrinsicEvents events={events} extrinsicIndex={index} />
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default BlockExtrinsic;