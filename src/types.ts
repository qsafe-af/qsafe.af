// Shared type definitions for the explorer application

export interface BlockHeader {
  number: string;
  hash: string;
  timestamp?: number;
  events?: SubstrateEvent[];
  digest?: {
    logs: string[];
  };
}

export interface SubstrateEvent {
  phase: {
    applyExtrinsic?: number;
    finalization?: boolean;
    initialization?: boolean;
  };
  event: {
    section: string;
    method: string;
    data: unknown[];
  };
  topics: string[];
}

export interface Chain {
  name: string;
  genesis: string;
  displayName: string;
  endpoints?: string[];
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface WebSocketMessage {
  id?: number;
  jsonrpc: string;
  method: string;
  params?: unknown;
  result?: unknown;
}

export interface SubscriptionMessage extends WebSocketMessage {
  params: {
    subscription: string;
    result: unknown;
  };
}

export interface ChainNewHeadResult {
  number: string;
  parentHash: string;
  stateRoot: string;
  extrinsicsRoot: string;
  digest: {
    logs: string[];
  };
}