import React from "react";
import { Card, Badge } from "react-bootstrap";
import "./Block.css";
import type { BlockHeader } from "./types";
import type { DecodedEventData } from "./decoders/eventDecoder";
import { analyzeUnknownEvent } from "./decoders/debugUtils";

interface BlockProps {
  block: BlockHeader;
  index: number;
}

const Block: React.FC<BlockProps> = ({ block, index }) => {
  const getAnimationDelay = () => {
    // Stagger animations for new blocks
    return `${index * 0.05}s`;
  };

  const formatEventData = (data: any, event?: any): React.ReactNode => {
    if (!data) return null;
    
    // If it's already a string, return it
    if (typeof data === "string") return data;
    
    // If it's an array (old format or raw data)
    if (Array.isArray(data)) {
      // Check if it's raw hex data
      if (data.length === 1 && typeof data[0] === 'string' && data[0].startsWith('0x')) {
        return formatRawEventData(data[0], event);
      }
      // Handle array of objects
      return (
        <>
          {data.map((item, idx) => (
            <div key={idx} className={idx > 0 ? "mt-2" : ""}>
              {typeof item === 'object' ? formatDecodedData(item) : formatEventData(item, event)}
            </div>
          ))}
        </>
      );
    }
    
    // If it's an object (decoded format), render it nicely
    if (typeof data === "object") {
      return formatDecodedData(data);
    }
    
    return String(data);
  };

  const formatDecodedData = (data: DecodedEventData): React.ReactNode => {
    return (
      <div className="decoded-event-data">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="event-data-row">
            <span className="event-data-key">{formatKey(key)}:</span>
            <span className="event-data-value">{formatValue(value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const formatKey = (key: string): string => {
    // Convert camelCase to Title Case
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  const formatValue = (value: any): React.ReactNode => {
    if (!value) return "null";
    
    // Handle AccountId type
    if (value && typeof value === "object" && "display" in value && "value" in value) {
      return (
        <span className="account-id" title={value.value}>
          {value.display}
        </span>
      );
    }
    
    // Handle nested objects
    if (typeof value === "object" && !Array.isArray(value)) {
      return (
        <div className="nested-value">
          {Object.entries(value).map(([k, v]) => (
            <div key={k} className="nested-row">
              <span className="nested-key">{formatKey(k)}:</span>
              <span className="nested-value">{formatValue(v)}</span>
            </div>
          ))}
        </div>
      );
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      return value.map((item, idx) => (
        <div key={idx}>{formatValue(item)}</div>
      ));
    }
    
    return String(value);
  };

  const formatRawEventData = (hexData: string, event?: any): React.ReactNode => {
    // Try to analyze the structure
    const bytes = new Uint8Array(
      hexData.slice(2).match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    
    const palletIndex = event?.event?.section ? -1 : 0; // Simplified for now
    const eventIndex = event?.event?.method ? -1 : 0;
    const analysis = analyzeUnknownEvent(palletIndex, eventIndex, bytes);
    
    return (
      <div className="raw-event-data">
        <div className="event-data-row">
          <span className="event-data-key">Raw Data:</span>
          <span className="event-data-value monospace">
            {hexData.length > 66 ? `${hexData.slice(0, 66)}...` : hexData}
          </span>
        </div>
        {analysis.hints.length > 0 && (
          <div className="event-data-hints">
            <span className="event-data-key">Hints:</span>
            <ul className="hints-list">
              {analysis.hints.map((hint, idx) => (
                <li key={idx}>{hint}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const getEventTypeColor = (section: string): string => {
    const colorMap: Record<string, string> = {
      system: "primary",
      balances: "success",
      staking: "warning",
      session: "info",
      grandpa: "danger",
      imonline: "secondary",
      utility: "dark",
    };
    return colorMap[section.toLowerCase()] || "secondary";
  };

  return (
    <div className="block-node" style={{ animationDelay: getAnimationDelay() }}>
      <Card>
        <Card.Body>
          {block.events && block.events.length > 0 && (
            <div className="block-events mt-2">
              <div className="events-header">
                <small className="text-muted">
                  {block.events.length} Event
                  {block.events.length !== 1 ? "s" : ""}
                </small>
              </div>
              <div className="events-details mt-2">
                {block.events.map((event, idx) => (
                  <div key={idx} className="event-detail-item p-2 mb-1">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <Badge
                          bg={getEventTypeColor(event.event.section)}
                          className="mb-1"
                        >
                          {event.event.section}.{event.event.method}
                        </Badge>
                        {event.phase.applyExtrinsic !== undefined && 
                         !(event.event.section === 'system' && event.event.method === 'extrinsicsuccess' && event.phase.applyExtrinsic === 0) && (
                          <small className="text-muted ms-2">
                            Extrinsic #{event.phase.applyExtrinsic}
                          </small>
                        )}
                        {event.phase.finalization && (
                          <small className="text-muted ms-2">
                            Finalization
                          </small>
                        )}
                        {event.phase.initialization && (
                          <small className="text-muted ms-2">
                            Initialization
                          </small>
                        )}
                      </div>
                    </div>
                    {event.event.data && (
                      <div className="event-data mt-2">
                        {formatEventData(event.event.data, event)}
                      </div>
                    )}
                  </div>
                ))}
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
