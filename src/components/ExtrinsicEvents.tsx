import React from 'react';
import type { SubstrateEvent } from '../types';
import './ExtrinsicEvents.css';

interface ExtrinsicEventsProps {
  events: SubstrateEvent[];
  extrinsicIndex: number;
}

interface DispatchInfo {
  weight: string;
  class: string;
  paysFee: string;
}

const ExtrinsicEvents: React.FC<ExtrinsicEventsProps> = ({ events, extrinsicIndex }) => {
  // Filter events for this extrinsic
  const extrinsicEvents = events.filter(
    event => event.phase.applyExtrinsic === extrinsicIndex
  );

  if (extrinsicEvents.length === 0) {
    return <span className="text-muted small">No events</span>;
  }

  const getEventTypeColor = (section: string): string => {
    const colorMap: Record<string, string> = {
      system: 'secondary',
      balances: 'success',
      staking: 'warning',
      session: 'info',
      grandpa: 'danger',
      imonline: 'dark',
      democracy: 'primary',
      council: 'light',
      treasury: 'warning',
      utility: 'secondary',
      identity: 'info',
      proxy: 'dark',
      multisig: 'primary',
      sudo: 'danger',
      vesting: 'info',
      scheduler: 'secondary',
      preimage: 'light',
      referenda: 'primary',
      convictionvoting: 'info',
      assets: 'success',
      recovery: 'warning',
    };
    return colorMap[section.toLowerCase()] || 'secondary';
  };

  const extractDispatchInfo = (eventData: unknown[]): DispatchInfo | null => {
    // Check if this is a system.ExtrinsicSuccess or system.ExtrinsicFailed event
    if (eventData && eventData.length > 0) {
      const firstItem = eventData[0];
      if (firstItem && typeof firstItem === 'object' && 'dispatchInfo' in firstItem) {
        const info = (firstItem as { dispatchInfo: Partial<DispatchInfo> }).dispatchInfo;
        return {
          weight: info.weight || '0',
          class: info.class || 'Normal',
          paysFee: info.paysFee || 'Yes'
        };
      }
    }
    return null;
  };

  const formatEventData = (data: unknown[]): React.ReactNode => {
    if (!data || data.length === 0) return null;

    // Check for dispatch info first
    const dispatchInfo = extractDispatchInfo(data);
    if (dispatchInfo) {
      return null; // We'll show this as icons instead
    }

    // Filter out items that only contain dispatchInfo
    const filteredData = data.filter(item => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const obj = item as Record<string, unknown>;
        // Skip objects that only have a dispatchInfo property
        if (Object.keys(obj).length === 1 && 'dispatchInfo' in obj) {
          return false;
        }
      }
      return true;
    });

    if (filteredData.length === 0) return null;

    // Format other data compactly
    return filteredData.map((item, index) => {
      let formatted: string;
      
      if (typeof item === 'string') {
        // Truncate long hex strings
        if (item.startsWith('0x') && item.length > 20) {
          formatted = `${item.slice(0, 10)}...${item.slice(-6)}`;
        } else {
          formatted = item;
        }
      } else if (typeof item === 'object' && item !== null) {
        // For objects, show a compact representation
        const obj = item as Record<string, unknown>;
        if ('value' in obj && 'display' in obj && typeof obj.display === 'string') {
          formatted = obj.display;
        } else {
          const keys = Object.keys(obj);
          if (keys.length === 1) {
            formatted = `${keys[0]}: ${obj[keys[0]]}`;
          } else {
            formatted = `{${keys.join(', ')}}`;
          }
        }
      } else {
        formatted = String(item);
      }

      return (
        <span key={index} className="event-data-compact">
          {formatted}
          {index < filteredData.length - 1 && ', '}
        </span>
      );
    });
  };

  const renderDispatchIcons = (event: SubstrateEvent): React.ReactNode => {
    const dispatchInfo = extractDispatchInfo(event.event.data);
    if (!dispatchInfo) return null;

    return (
      <span className="dispatch-icons ms-2">
        {/* Weight icon */}
        <span className="dispatch-icon" title={`Weight: ${dispatchInfo.weight}`}>
          <i className="bi bi-speedometer2"></i>
          <small className="ms-1">{Number(dispatchInfo.weight).toLocaleString()}</small>
        </span>
        
        {/* Class icon */}
        <span className="dispatch-icon ms-2" title={`Class: ${dispatchInfo.class}`}>
          {dispatchInfo.class === 'Operational' ? (
            <i className="bi bi-gear-fill text-warning"></i>
          ) : dispatchInfo.class === 'Mandatory' ? (
            <i className="bi bi-exclamation-circle-fill text-danger"></i>
          ) : (
            <i className="bi bi-circle text-success"></i>
          )}
        </span>
        
        {/* PaysFee icon */}
        <span className="dispatch-icon ms-2" title={`Pays Fee: ${dispatchInfo.paysFee}`}>
          {dispatchInfo.paysFee === 'Yes' ? (
            <i className="bi bi-currency-dollar text-warning"></i>
          ) : (
            <i className="bi bi-slash-circle text-success"></i>
          )}
        </span>
      </span>
    );
  };

  return (
    <ul className="extrinsic-events-list">
      {extrinsicEvents.map((event, index) => {
        const isSuccess = event.event.section === 'system' && 
                         (event.event.method === 'ExtrinsicSuccess' || event.event.method === 'extrinsicsuccess');
        const isFailed = event.event.section === 'system' && 
                        (event.event.method === 'ExtrinsicFailed' || event.event.method === 'extrinsicfailed');
        
        return (
          <li key={index} className={`event-list-item ${isSuccess ? 'event-success' : ''} ${isFailed ? 'event-failed' : ''}`}>
            <span className={`badge bg-${getEventTypeColor(event.event.section)} event-badge`}>
              {event.event.section}.{event.event.method}
            </span>
            
            {/* Show dispatch info as icons for system events */}
            {(isSuccess || isFailed) && renderDispatchIcons(event)}
            
            {/* Show other event data compactly */}
            {event.event.data.length > 0 && formatEventData(event.event.data) && (
              <span className="event-data-inline ms-2">
                {formatEventData(event.event.data)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default ExtrinsicEvents;