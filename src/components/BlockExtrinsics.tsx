import React from "react";
import { Card } from "react-bootstrap";
import BlockExtrinsic from "./BlockExtrinsic";
import type { BlockHeader, Chain } from "../types";
import "./BlockExtrinsics.css";

interface BlockExtrinsicsProps {
  block: BlockHeader;
  chain?: Chain;
}

const BlockExtrinsics: React.FC<BlockExtrinsicsProps> = ({ block, chain }) => {
  const extrinsics = block.extrinsics;
  const events = block.events || [];
  const isLoading = extrinsics === undefined;

  return (
    <Card className="h-100">
      <Card.Body>
        <strong>Extrinsics</strong>
        {!isLoading && (
          <span className="text-muted ms-2">({extrinsics.length})</span>
        )}
        {isLoading ? (
          <div className="text-center py-3">
            <div
              className="spinner-border spinner-border-sm text-primary"
              role="status"
            >
              <span className="visually-hidden">Loading extrinsics...</span>
            </div>
            <div className="text-muted mt-2">
              <small>Loading extrinsics...</small>
            </div>
          </div>
        ) : extrinsics.length > 0 ? (
          <div className="extrinsics-list">
            {extrinsics.map((extrinsic, extrinsicIndex) => (
              <BlockExtrinsic
                key={extrinsicIndex}
                extrinsic={extrinsic}
                index={extrinsicIndex}
                events={events}
                chain={chain}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-muted py-3">
            <em>No extrinsics in this block</em>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default BlockExtrinsics;
