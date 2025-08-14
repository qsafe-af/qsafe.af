import React, { useState, useEffect } from "react";
import { Card } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import "./Block.css";
import type { BlockHeader } from "./types";
import { decodeDigest, formatAuthor } from "./decoders/digestDecoder";
import { formatAuthorAddress } from "./utils/ss58";
import { getChain } from "./chains";

interface BlockProps {
  block: BlockHeader;
  index: number;
}

const Block: React.FC<BlockProps> = ({ block, index }) => {
  const { chainId } = useParams<{ chainId: string }>();
  const [formattedAuthor, setFormattedAuthor] = useState<string | null>(null);

  // Decode author from digest if available
  const digestInfo = block.digest ? decodeDigest(block.digest) : null;
  const author = digestInfo?.author;

  // Debug logging
  if (block.digest && digestInfo) {
    console.log(`[Block ${block.number}] Digest logs:`, block.digest.logs);
    console.log(`[Block ${block.number}] Decoded author:`, author);
    if (author) {
      console.log(`[Block ${block.number}] Author hex:`, author);
      console.log(
        `[Block ${block.number}] First 4 bytes:`,
        author.slice(0, 10),
      );
    }
  }

  // Format author address with SS58
  useEffect(() => {
    if (author && chainId) {
      const chain = getChain(chainId);
      if (chain) {
        formatAuthorAddress(author, chain.endpoints?.[0], chain.genesis)
          .then((formatted: string) => setFormattedAuthor(formatted))
          .catch((err: any) => {
            console.error("[Block] Error formatting author:", err);
            setFormattedAuthor(formatAuthor(author));
          });
      } else {
        setFormattedAuthor(formatAuthor(author));
      }
    } else {
      setFormattedAuthor(null);
    }
  }, [author, chainId]);

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
            <small className="text-muted">Hash:</small>
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
          {formattedAuthor && (
            <div className="block-author mt-2">
              <small className="text-muted">Miner:</small>
              <div
                className="font-monospace"
                style={{ fontSize: "0.875rem" }}
              >
                <Link
                  to={`/chains/${chainId}/account/${formattedAuthor}`}
                  className="text-decoration-none text-muted"
                >
                  {formattedAuthor}
                </Link>
              </div>
            </div>
          )}
          <div className="block-connector"></div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Block;
