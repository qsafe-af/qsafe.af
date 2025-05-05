import { useEffect, useState } from 'react';
import Spinner from 'react-bootstrap/Spinner';

interface Version {
  semver: string;
  sha: string;
}

interface Health {
  peers: number;
}

interface Node {
  name: string;
  rpc: string;
  wss: string;
}

interface NodeRowProps {
  node: Node;
}

const NodeRow = (props: NodeRowProps) => {
  const { node } = props;
  const [health, setHealth] = useState<Health | undefined>(undefined);
  const [version, setVersion] = useState<Version | undefined>(undefined);
  useEffect(() => {
    fetch(`${node.rpc}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })
      .then((response) => response.json())
      .then(setHealth);
  }, [node.rpc]);
  useEffect(() => {
    fetch(node.rpc, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'system_version',
        params: []
      }),
    })
      .then((response) => response.json())
      .then((json) => {
        const v = json.result.split('-');
        setVersion({
          semver: v[0],
          sha: v[1],
        });
      });
  }, [node.rpc]);
  return (
    <tr>
      <td>{node.name}</td>
      <td>
        {
          (!!version)
            ? (
                <>
                  <span>{version.semver}</span>
                  &nbsp;
                  <span>{version.sha}</span>
                </>
              )
            : <Spinner animation="border" size="sm" variant="secondary" />
        }
      </td>
      <td>
        {
          (!!health)
            ? (
                <>
                  <span>{health.peers}</span>
                </>
              )
            : <Spinner animation="border" size="sm" variant="secondary" />
        }
      </td>
      <td>height</td>                                    
    </tr>
  );
};

export default NodeRow;
