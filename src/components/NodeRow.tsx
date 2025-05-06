import { useEffect, useState } from 'react';
import Spinner from 'react-bootstrap/Spinner';

interface Runtime {
  version: string;
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

interface Height {
  start: number;
  current: number;
  highest: number;
}

const rpc = async (
  url: string,
  method: string,
  params: string[],
) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    }),
  })
  return await response.json();
};

const rpcHealth = async (url: string) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  })
  return await response.json();
};

const NodeRow = (props: NodeRowProps) => {
  const { node } = props;
  const [health, setHealth] = useState<Health | undefined>(undefined);
  const [runtime, setRuntime] = useState<Runtime | undefined>(undefined);
  const [height, setHeight] = useState<Height | undefined>(undefined);
  useEffect(() => {
    const healthInterval = setInterval(() => {
      rpcHealth(`${node.rpc}/health`).then(setHealth);
    }, 5111);
    rpc(node.rpc, 'system_version', [])
      .then(({ result }) => {
        const [version, sha] = result.split('-');
        setRuntime({ version, sha });
      });
    const heightInterval = setInterval(() => {
      rpc(node.rpc, 'system_syncState', [])
        .then(({ result: { startingBlock: start, currentBlock: current, highestBlock: highest } }) => {
          setHeight({ start, current, highest });
        });
    }, 1000);
    return () => {
      clearInterval(healthInterval);
      clearInterval(heightInterval);
    };
  }, [node.rpc]);
  return (
    <tr>
      <td>{node.name}</td>
      <td>
        {
          (!!runtime)
            ? (
                <span>
                  {runtime.version} {runtime.sha}
                </span>
              )
            : <Spinner animation="border" size="sm" variant="secondary" />
        }
      </td>
      <td>
        {
          (!!health)
            ? (
                <span className={`text-${(health.peers > 0) ? 'primary' : 'secondary'}`}>
                  {health.peers}
                </span>
              )
            : <Spinner animation="border" size="sm" variant="secondary" />
        }
      </td>
      <td>
        {
          (!!height)
            ? (
                <span className={`text-${(height.current === height.highest) ? 'primary' : 'secondary'}`}>
                  {new Intl.NumberFormat().format(height.current)}
                </span>
              )
            : <Spinner animation="border" size="sm" variant="secondary" />
        }
      </td>                                    
    </tr>
  );
};

export default NodeRow;
