import React from 'react';
import { Card, Badge } from 'react-bootstrap';
import type { SubstrateEvent, Chain } from '../types';
import ExtrinsicEvents from './ExtrinsicEvents';
import './BlockExtrinsics.css';

interface BlockExtrinsicProps {
  extrinsic: string;
  index: number;
  events: SubstrateEvent[];
  chain?: Chain;
}

// Simple SCALE decoder for extrinsics
class ExtrinsicDecoder {
  private data: Uint8Array;
  private offset: number;

  constructor(hex: string) {
    if (!hex || typeof hex !== 'string') {
      throw new Error('Invalid hex string provided to ExtrinsicDecoder');
    }
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    this.data = new Uint8Array(
      cleanHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    );
    this.offset = 0;
  }

  readU8(): number {
    if (this.offset >= this.data.length) {
      throw new Error("Buffer underflow");
    }
    return this.data[this.offset++];
  }

  readCompact(): bigint {
    const first = this.readU8();
    const mode = first & 0x03;

    if (mode === 0x00) {
      return BigInt(first >> 2);
    } else if (mode === 0x01) {
      const second = this.readU8();
      return BigInt((first >> 2) | (second << 6));
    } else if (mode === 0x02) {
      const b2 = this.readU8();
      const b3 = this.readU8();
      const b4 = this.readU8();
      return BigInt((first >> 2) | (b2 << 6) | (b3 << 14) | (b4 << 22));
    } else {
      const length = (first >> 2) + 4;
      let result = 0n;
      for (let i = 0; i < length; i++) {
        result |= BigInt(this.readU8()) << (BigInt(i) * 8n);
      }
      return result;
    }
  }

  // Skip bytes
  skip(count: number) {
    this.offset += count;
    if (this.offset > this.data.length) {
      throw new Error("Buffer underflow");
    }
  }

  // Decode the extrinsic to get pallet and call indices
  decodeExtrinsic(): { palletIndex: number; callIndex: number } | null {
    try {
      // Skip length prefix
      this.readCompact();

      // Read version byte and signed flag
      const versionByte = this.readU8();
      const isSigned = (versionByte & 0x80) !== 0;
      const version = versionByte & 0x7f;

      if (version !== 4) {
        console.warn(`Unsupported extrinsic version: ${version}`);
      }

      if (isSigned) {
        // Skip signer (32 bytes for AccountId)
        this.skip(32);

        // Skip signature type (1 byte) and signature (64 bytes for Sr25519/Ed25519)
        const sigType = this.readU8();
        // Sr25519 = 1, Ed25519 = 0, ECDSA = 2
        const sigSize = sigType === 2 ? 65 : 64; // ECDSA has 65 bytes
        this.skip(sigSize);

        // Skip extra data (era, nonce, tip)
        // Era (1 or 2 bytes)
        const era = this.readU8();
        if (era !== 0) {
          this.readU8(); // Second byte of era
        }

        // Nonce (compact)
        this.readCompact();

        // Tip (compact)
        this.readCompact();
      }

      // Now we're at the call data
      const palletIndex = this.readU8();
      const callIndex = this.readU8();

      return { palletIndex, callIndex };
    } catch (error) {
      console.error("Error decoding extrinsic:", error);
      return null;
    }
  }
}

const BlockExtrinsic: React.FC<BlockExtrinsicProps> = ({
  extrinsic,
  index,
  events,
  chain,
}) => {
  // Handle undefined or invalid extrinsic
  if (!extrinsic || typeof extrinsic !== 'string') {
    console.warn(`Invalid extrinsic at index ${index}:`, extrinsic);
    return (
      <Card className="mb-2">
        <Card.Body>
          <div className="text-muted">
            <small>Extrinsic #{index} - Invalid data</small>
          </div>
        </Card.Body>
      </Card>
    );
  }

  // Decode the extrinsic to get pallet and call info
  const decoder = new ExtrinsicDecoder(extrinsic);
  const decoded = decoder.decodeExtrinsic();

  // Get the pallet and call names from chain metadata
  let palletName = "Unknown";
  let callName = "Unknown";
  let isInherent = false;

  if (decoded && chain?.pallets) {
    const pallet = chain.pallets.find((p) => p.index === decoded.palletIndex);
    if (pallet) {
      palletName = pallet.name;
      if (pallet.calls && pallet.calls.length > 0) {
        const call = pallet.calls.find((c) => c.index === decoded.callIndex);
        if (call) {
          callName = call.name;
        } else {
          callName = `call[${decoded.callIndex}]`;
        }
      } else {
        // Pallet has no calls defined (like TransactionPayment)
        callName = "";
      }
    } else {
      palletName = `pallet[${decoded.palletIndex}]`;
      callName = `call[${decoded.callIndex}]`;
    }
  }

  // Check if this is an inherent extrinsic (typically index 0 or 1)
  isInherent =
    index <= 1 && (palletName === "Timestamp" || palletName === "ParaInherent");

  // Determine the status based on events
  const extrinsicEvents = events.filter(
    event => event.phase.applyExtrinsic === index
  );
  const hasError = extrinsicEvents.some(
    event => event.event.section === 'system' && 
             (event.event.method === 'ExtrinsicFailed' || 
              event.event.method === 'extrinsicfailed')
  );
  const hasSuccess = extrinsicEvents.some(
    event => event.event.section === 'system' && 
             (event.event.method === 'ExtrinsicSuccess' || 
              event.event.method === 'extrinsicsuccess')
  );

  return (
    <Card className="mb-3 extrinsic-card">
      <Card.Header className="d-flex justify-content-between align-items-center extrinsic-header">
        <div>
          <strong>Extrinsic #{index}</strong>
          {decoded && (
            <>
              <Badge bg="primary" className="ms-2 extrinsic-type-badge">
                {palletName}
                {callName && `.${callName}`}
              </Badge>
              {isInherent && (
                <Badge bg="secondary" className="ms-1">
                  Inherent
                </Badge>
              )}
            </>
          )}
        </div>
        <div className="extrinsic-status">
          {hasError && <Badge bg="danger">Failed</Badge>}
          {hasSuccess && <Badge bg="success">Success</Badge>}
        </div>
      </Card.Header>
      <Card.Body>
        <div className="mt-2">
          <h6 className="mb-1">Events:</h6>
          <ExtrinsicEvents events={events} extrinsicIndex={index} />
        </div>
        <div className="extrinsic-raw">
          <details className="text-muted small">
            <summary>Raw extrinsic data</summary>
            <code
              className="d-block mt-1"
              style={{ wordBreak: "break-all", fontSize: "0.75rem" }}
            >
              {extrinsic}
            </code>
          </details>
        </div>
      </Card.Body>
    </Card>
  );
};

export default BlockExtrinsic;
