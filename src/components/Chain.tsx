import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Table from 'react-bootstrap/Table';
import NodeRow from './NodeRow';

interface Endpoint {
  name: string;
  rpc: string;
  wss: string;
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

const Chain = () => {
  let { chain } = useParams();
  const [manifest, setManifest] = useState<ChainManifest | undefined>(undefined);

  useEffect(() => {
    fetch(`/chains/${chain}.json`)
      .then((response) => response.json())
      .then((json) => setManifest(json));
  }, [chain]);
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
                                <th>name</th>
                                <th>version</th>
                                <th>peers</th>
                                <th>height</th>
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
