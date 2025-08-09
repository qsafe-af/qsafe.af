import React from "react";
import { Card } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import "./Block.css";
import type { BlockHeader } from "./types";

interface BlockProps {
  block: BlockHeader;
  index: number;
}

const Block: React.FC<BlockProps> = ({ block, index }) => {
  const { chainId } = useParams<{ chainId: string }>();



  const getAnimationDelay = () => {
    // Stagger animations for new blocks
    return `${index * 0.05}s`;
  };

  return (
    <div className="block-node" style={{ animationDelay: getAnimationDelay() }}>
      <Card className="block-card">
        <Card.Body className="p-3">
          <div className="d-flex justify-content-between align-items-start mb-2">
            <Link 
              to={`/chains/${chainId}/block/${block.number}`}
              className="block-number text-decoration-none"
            >
              #{block.number}
            </Link>
            {block.timestamp && (
              <small className="text-muted">
                {new Date(block.timestamp).toLocaleTimeString()}
              </small>
            )}
          </div>
          <div className="block-hash">
            <small className="text-muted">hash:</small>
            <div
              className={`font-monospace text-break ${block.hash.startsWith("pending_") ? "text-warning" : "text-muted"}`}
              style={{ fontSize: "0.875rem" }}
            >
              {block.hash.startsWith("pending_") ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-1"
                    role="status"
                  ></span>
                  Fetching hash...
                </>
              ) : (
                block.hash
              )}
            </div>
          </div>
          <div className="block-connector"></div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Block;
