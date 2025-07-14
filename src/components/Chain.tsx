import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import NodeRow from "./NodeRow";

interface Endpoint {
  name: string;
  rpc: string;
  wss: string;
  status: string;
  index: string;
}

interface Node {
  name: string;
  ss58: string;
  rpc: string;
  wss: string;
}

interface ChainManifest {
  name: string;
  treasury: string;
  index: string;
  description: string[];
  endpoints: Endpoint[];
  nodes: Node[];
}

interface Token {
  decimals: number;
  symbol: string;
}

interface Account {
  id: string;
}

interface BalanceEvent {
  account: Account;
  type: string;
}

interface Block {
  height: number;
}

interface GraphQLResponse {
  data: {
    events: {
      balanceEvent: BalanceEvent;
      block: Block;
    }[];
  };
}
const gqlRequest = {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
};

const gqlHeightQuery = `
  query Height {
    blocks(orderBy: height_DESC, limit: 1) {
      height
    }
  }
`;

const gqlAuthorQuery = `
  query MinedBlocks($start: Int!, $end: Int!, $treasury: String!) {
    events(
      orderBy: id_ASC,
      where: {
        balanceEvent: {
          type_eq: Minted,
          account: {
            id_not_eq: $treasury
          }
        }
        block: {
          height_gte: $start,
          height_lte: $end
        }
      }
    ) {
      balanceEvent {
        account {
          id
        }
        type
      }
      block {
        height
      }
    }
  }
`;

const Chain = () => {
  const { chain } = useParams();
  const [manifest, setManifest] = useState<ChainManifest | undefined>(
    undefined,
  );
  const [token, setToken] = useState<Token | undefined>(undefined);
  const [height, setHeight] = useState<number>(0);
  const [events, setEvents] = useState<{ author: string; block: number }[]>([]);
  const [stats, setStats] = useState<
    { author: string; count: number; last: number }[]
  >([]);

  useEffect(() => {
    fetch(`/chains/${chain}.json`)
      .then((response) => response.json())
      .then((json) => setManifest(json));
  }, [chain]);

  useEffect(() => {
    if (manifest && manifest.endpoints && manifest.endpoints.length) {
      fetch(manifest.endpoints[0].rpc, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "system_properties",
          params: [],
        }),
      })
        .then((response) => response.json())
        .then((json) => {
          setToken({
            decimals: json.result.tokenDecimals,
            symbol: json.result.tokenSymbol,
          });
        });
    }
  }, [manifest]);

  useEffect(() => {
    if (!manifest || !manifest.index) {
      return;
    }
    fetch(manifest.index, {
      ...gqlRequest,
      body: JSON.stringify({
        query: gqlHeightQuery,
      }),
    })
      .then((response) => response.json())
      .then(({ data: { blocks } }) => {
        setHeight(blocks[0].height);
      });
    const interval = setInterval(() => {
      fetch(manifest.index, {
        ...gqlRequest,
        body: JSON.stringify({
          query: gqlHeightQuery,
        }),
      })
        .then((response) => response.json())
        .then(({ data: { blocks } }) => {
          setHeight(blocks[0].height);
        });
    }, 5000);
    return () => clearInterval(interval);
  });

  useEffect((): void => {
    if (!manifest || !manifest.index || !manifest.treasury || height === 0) {
      return;
    }
    fetch(manifest.index, {
      ...gqlRequest,
      body: JSON.stringify({
        query: gqlAuthorQuery,
        variables: {
          start: Math.max(height - 1800, 1),
          end: height,
          treasury: manifest.treasury,
        },
      }),
    })
      .then((response) => response.json() as Promise<GraphQLResponse>)
      .then(({ data: { events } }) => {
        setEvents(
          events.map(
            ({
              balanceEvent: {
                account: { id },
              },
              block: { height },
            }): { author: string; block: number } => ({
              author: id,
              block: height,
            }),
          ),
        );
      });
  }, [height, manifest]);

  useEffect((): void => {
    if (events.length === 0) return;
    setStats(
      events
        .reduce(
          (acc, { author }) => {
            const existing = acc.find((s) => s.author === author);
            if (existing) {
              existing.count += 1;
            } else {
              acc.push({
                author,
                count: 1,
                last:
                  Math.max(
                    ...events
                      .filter((s) => s.author === author)
                      .map((event) => event.block),
                  ) || 0,
              });
            }
            return acc;
          },
          [] as { author: string; count: number; last: number }[],
        )
        .sort((a, b) => b.count - a.count),
    );
  }, [events]);

  return (
    <>
      {manifest ? (
        <>
          <h2>{manifest.name}</h2>
          {manifest.description.map((paragraph, pI) => (
            <p key={pI}>{paragraph}</p>
          ))}
          {token ? (
            <ul>
              <li>decimals: {token.decimals}</li>
              <li>symbol: {token.symbol}</li>
            </ul>
          ) : manifest && manifest.endpoints && manifest.endpoints.length ? (
            <Spinner animation="border" size="sm" variant="secondary" />
          ) : null}
          {manifest.endpoints && manifest.endpoints.length ? (
            <>
              <h2>known public endpoints</h2>
              <p>
                endpoints listed below are known to allow public access and
                maintain a public status uri where historical downtime is
                recorded and observable.
              </p>
              <ul>
                {manifest.endpoints.map((endpoint, eI) => (
                  <li key={eI}>
                    {endpoint.name}
                    <ul>
                      <li>
                        json rpc: <code>{endpoint.rpc}</code>
                      </li>
                      <li>
                        web socket: <code>{endpoint.wss}</code>
                      </li>
                      <li>
                        explorer:{" "}
                        <a
                          href={`https://polkadot.js.org/apps/?rpc=${endpoint.wss}#/explorer`}
                        >
                          https://polkadot.js.org/apps/?rpc={endpoint.wss}
                          #/explorer
                        </a>
                      </li>
                      <li>
                        status: <a href={endpoint.status}>{endpoint.status}</a>
                      </li>
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h2>no known public endpoints</h2>
              <code>watch this space!</code>
            </>
          )}
          {manifest.nodes && manifest.nodes.length ? (
            <>
              <h2>known public nodes</h2>
              <Table striped hover>
                <thead>
                  <tr>
                    <th>node</th>
                    <th>version</th>
                    <th>build sha</th>
                    <th>genesis</th>
                    <th>peer count</th>
                    <th>block height</th>
                    <th>block hash</th>
                  </tr>
                </thead>
                <tbody>
                  {manifest.nodes
                    .filter((node) => node.rpc !== undefined)
                    .map((node, nI) => (
                      <NodeRow key={nI} node={node} />
                    ))}
                </tbody>
              </Table>
            </>
          ) : (
            <>
              <h2>no known public nodes</h2>
              <code>watch this space!</code>
              <hr />
            </>
          )}
          <a
            href={`https://github.com/qsafe-af/qsafe.af/edit/main/public/chains/${chain}.json`}
          >
            <i className="bi bi-plus-square-dotted"></i> add an endpoint/node
          </a>
        </>
      ) : null}
      {stats && stats.length > 0 ? (
        <>
          <h2>mining leaderboard (last 1800 blocks)</h2>
          <Table striped bordered hover>
            <thead>
              <tr>
                <th style={{ textAlign: "right" }}>score</th>
                <th>miner</th>
                <th>last block</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(({ author, count, last }) => {
                return (
                  <tr key={author}>
                    <td
                      style={
                        last === height
                          ? { color: "hotpink", textAlign: "right" }
                          : { textAlign: "right" }
                      }
                    >
                      {count}
                    </td>
                    <td
                      style={last === height ? { color: "hotpink" } : undefined}
                    >
                      {manifest &&
                      manifest.nodes &&
                      manifest.nodes.some((node) => node.ss58 === author) ? (
                        <span>
                          <code>{author}</code> (
                          {
                            manifest.nodes.find((node) => node.ss58 === author)
                              ?.name
                          }
                          )
                        </span>
                      ) : (
                        <code>{author}</code>
                      )}
                    </td>
                    <td
                      style={last === height ? { color: "hotpink" } : undefined}
                    >
                      {last}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </>
      ) : null}
    </>
  );
};

export default Chain;
