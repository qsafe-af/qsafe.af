import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Table from 'react-bootstrap/Table';
import NodeRow from './NodeRow';

const Chain = () => {
  let { chain } = useParams();
  const [manifest, setManifest] = useState(undefined);

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
                <h2>{manifest['name']}</h2>
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
                          <p>endpoints listed below are known allow public access and maintain a public status document where historical downtime is recorded and observable.</p>
                          <ul>
                          {
                            manifest.endpoints.map((endpoint, eI) => (
                              <li key={eI}>
                                {endpoint['name']}
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
              </>
            )
          : null
      }
    </>
  )
};

export default Chain;
