import React from "react";
import { Alert } from "react-bootstrap";
import BlockEvents from "./BlockEvents";
import type { BlockHeader, ConnectionStatus } from "./types";

interface EventsProps {
  blocks: BlockHeader[];
  connectionStatus: ConnectionStatus;
  hasEndpoints: boolean;
}

const Events: React.FC<EventsProps> = ({
  blocks,
  connectionStatus,
  hasEndpoints,
}) => {
  if (!hasEndpoints) {
    return (
      <Alert variant="info">No endpoints configured for this chain.</Alert>
    );
  }

  if (blocks.length === 0) {
    return (
      <p className="text-muted">
        {connectionStatus === "connected"
          ? "Waiting for new blocks..."
          : "Connecting to blockchain..."}
      </p>
    );
  }

  return (
    <div className="blocks-container">
      {blocks.map((block, index) => (
        <BlockEvents
          key={`${block.number}-${index}`}
          block={block}
          index={index}
        />
      ))}
    </div>
  );
};

export default Events;
