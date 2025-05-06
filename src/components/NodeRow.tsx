import { useEffect, useState, FC } from 'react';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Spinner from 'react-bootstrap/Spinner';
import Tooltip from 'react-bootstrap/Tooltip';

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

const randomInteger = (
  min: number,
  max: number
) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getCellClass = (
  health: Health | undefined,
  height: Height | undefined
) => (
  (!!health && (health.peers > 0) && !!height && (height.current === height.highest))
    ? ''
    : 'text-secondary'
);


const NodeRow: FC<NodeRowProps> = ({ node }) => {
  const [health, setHealth] = useState<Health | undefined>(undefined);
  const [runtime, setRuntime] = useState<Runtime | undefined>(undefined);
  const [height, setHeight] = useState<Height | undefined>(undefined);
  const [genesis, setGenesis] = useState<string | undefined>(undefined);

  useEffect(() => {

    // version and build sha
    rpc(node.rpc, 'system_version', []).then(({ result }) => {
      const [version, sha] = result.split('-');
      setRuntime({ version, sha });
    });
    const runtimeInterval = setInterval(() => {
      rpc(node.rpc, 'system_version', []).then(({ result }) => {
        const [version, sha] = result.split('-');
        setRuntime({ version, sha });
      });
    }, randomInteger(30000, 60000));

    // genesis
    rpc(node.rpc, 'chainSpec_v1_genesisHash', []).then(({ result }) => setGenesis(result));
    const genesisInterval = setInterval(() => {
      rpc(node.rpc, 'chainSpec_v1_genesisHash', []).then(({ result }) => setGenesis(result));
    }, randomInteger(10000, 30000));

    // peer count
    rpcHealth(`${node.rpc}/health`).then(setHealth);
    const healthInterval = setInterval(() => {
      rpcHealth(`${node.rpc}/health`).then(setHealth);
    }, randomInteger(4000, 6000));

    // block height
    rpc(node.rpc, 'system_syncState', []).then(({ result: { startingBlock: start, currentBlock: current, highestBlock: highest } }) => setHeight({ start, current, highest }));
    const heightInterval = setInterval(() => {
      rpc(node.rpc, 'system_syncState', []).then(({ result: { startingBlock: start, currentBlock: current, highestBlock: highest } }) => setHeight({ start, current, highest }));
    }, randomInteger(800, 1200));

    return () => {
      clearInterval(healthInterval);
      clearInterval(runtimeInterval);
      clearInterval(heightInterval);
      clearInterval(genesisInterval);
    };
  }, [node.rpc]);
  return (
    <tr>
      <td className={getCellClass(health, height)}>
        {node.name}
      </td>
      <td className={getCellClass(health, height)}>
        {
          (!!runtime)
            ? (
                <span>
                  {runtime.version}
                </span>
              )
            : <Spinner animation="border" size="sm" variant="secondary" />
        }
      </td>
      <td className={getCellClass(health, height)}>
        {
          (!!runtime)
            ? (
                <span>
                  {runtime.sha}
                </span>
              )
            : <Spinner animation="border" size="sm" variant="secondary" />
        }
      </td>
      <td className={getCellClass(health, height)}>
        {
          (!!genesis)
            ? (
                <OverlayTrigger delay={{ show: 50, hide: 150 }} overlay={
                  () => (
                    <Tooltip><code>{genesis}</code></Tooltip>
                  )
                }>
                  <code>{genesis.slice(2, 9)}...{genesis.slice(-7)}</code>
                </OverlayTrigger>
              )
            : <Spinner animation="border" size="sm" variant="secondary" />
        }
      </td>
      <td className={getCellClass(health, height)}>
        {
          (!!health)
            ? (
                <span>
                  {health.peers}
                </span>
              )
            : <Spinner animation="border" size="sm" variant="secondary" />
        }
      </td>
      <td className={getCellClass(health, height)}>
        {
          (!!height)
            ? (new Intl.NumberFormat().format(height.current))
            : <Spinner animation="border" size="sm" variant="secondary" />
        }
      </td>                                    
    </tr>
  );
};

export default NodeRow;
