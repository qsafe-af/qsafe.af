export interface Endpoint {
  name: string;
  rpc: string;
  wss: string;
  status: string;
  index: string;
}

export interface Node {
  name: string;
  ss58: string;
  rpc: string;
  wss: string;
}

export interface ChainManifest {
  name: string;
  treasury: string;
  index: string;
  description: string[];
  endpoints: Endpoint[];
  nodes: Node[];
}

export interface Token {
  decimals: number;
  symbol: string;
}

export interface Account {
  id: string;
}

export interface BalanceEvent {
  account: Account;
  type: string;
}

export interface Block {
  height: number;
}

export interface GraphQLResponse {
  data: {
    events: {
      balanceEvent: BalanceEvent;
      block: Block;
    }[];
  };
}
