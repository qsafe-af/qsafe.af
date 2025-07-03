import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Table from 'react-bootstrap/Table';
import Spinner from 'react-bootstrap/Spinner';
import NodeRow from './NodeRow';

interface Endpoint {
  name: string;
  rpc: string;
  wss: string;
  status: string;
}

interface Node {
  name: string;
  rpc: string;
  wss: string;
}

interface ChainManifest {
  name: string;
  description: string[];
  endpoints: Endpoint[];
  nodes: Node[];
}

interface Token {
  decimals: number;
  symbol: string;
}

const Chain = () => {
  let { chain } = useParams();
  const [manifest, setManifest] = useState<ChainManifest | undefined>(undefined);
  const [token, setToken] = useState<Token | undefined>(undefined);

  useEffect(() => {
    fetch(`/chains/${chain}.json`)
      .then((response) => response.json())
      .then((json) => setManifest(json));
  }, [chain]);

  useEffect(() => {
    if (!!manifest && !!manifest.endpoints && !!manifest.endpoints.length) {
      fetch(manifest.endpoints[0].rpc, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'system_properties',
          params: []
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
  return (
    <>
      {
        (!!manifest)
          ? (
              <>
                <h2>{manifest.name}</h2>
                {
                  manifest.description.map((paragraph, pI) => (
                    <p key={pI}>{paragraph}</p>
                  ))
                }
                {
                  (!!token)
                    ? (
                        <ul>
                          <li>
                            decimals: {token.decimals}
                          </li>
                          <li>
                            symbol: {token.symbol}
                          </li>
                        </ul>
                      )
                    : (
                        (!!manifest && !!manifest.endpoints && !!manifest.endpoints.length)
                          ? <Spinner animation="border" size="sm" variant="secondary" />
                          : null
                      )
                }
                {
                  (!!manifest.endpoints && !!manifest.endpoints.length)
                    ? (
                        <>
                          <h2>known public endpoints</h2>
                          <p>endpoints listed below are known to allow public access and maintain a public status uri where historical downtime is recorded and observable.</p>
                          <ul>
                          {
                            manifest.endpoints.map((endpoint, eI) => (
                              <li key={eI}>
                                {endpoint.name}
                                <ul>
                                  <li>json rpc: <code>{endpoint.rpc}</code></li>
                                  <li>web socket: <code>{endpoint.wss}</code></li>
                                  <li>explorer: <a href={`https://polkadot.js.org/apps/?rpc=${endpoint.wss}#/explorer`}>https://polkadot.js.org/apps/?rpc={endpoint.wss}#/explorer</a></li>
                                  <li>status: <a href={endpoint.status}>{endpoint.status}</a></li>
                                </ul>
                              </li>
                            ))
                          }
                          </ul>
                        </>
                      )
                    : (
                        <>
                          <h2>no known public endpoints</h2>
                          <code>watch this space!</code>
                        </>
                      )
                }
                {
                  (!!manifest.nodes && !!manifest.nodes.length)
                    ? (
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
                              {
                                manifest.nodes.map((node, nI) => (
                                  <NodeRow key={nI} node={node} />
                                ))
                              }
                            </tbody>
                          </Table>
                        </>
                      )
                    : (
                        <>
                          <h2>no known public nodes</h2>
                          <code>watch this space!</code>
                          <hr />
                        </>
                      )
                }
                <a href={`https://github.com/qsafe-af/qsafe.af/edit/main/public/chains/${chain}.json`}>
                  <i className="bi bi-plus-square-dotted"></i> add an endpoint/node
                </a>
              </>
            )
          : null
      }
    </>
  )
};

export default Chain;
