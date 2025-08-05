import { useEffect, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Col from "react-bootstrap/Col";
import Dropdown from "react-bootstrap/Dropdown";
import DropdownButton from "react-bootstrap/DropdownButton";
import Row from "react-bootstrap/Row";
import Table from "react-bootstrap/Table";
import { Block, ChainManifest, GraphQLResponse } from "../common/types";

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
        height,
        timestamp
      }
    }
  }
`;
interface MiningStatsProps {
  manifest: ChainManifest;
}

const MiningStats: React.FC<MiningStatsProps> = ({ manifest }) => {
  const [height, setHeight] = useState<number>(0);
  const [first, setFirst] = useState<Block | undefined>(undefined);
  const [last, setLast] = useState<Block | undefined>(undefined);
  const [blockWindowSizeOptions, setBlockWindowSizeOptions] = useState<
    number[]
  >([10, 100, 1000, 10000, 100000]);
  const [blockWindowSize, setBlockWindowSize] = useState<number>(1000);
  const [events, setEvents] = useState<{ author: string; block: number }[]>([]);
  const [stats, setStats] = useState<
    { author: string; count: number; last: number }[]
  >([]);

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
        setBlockWindowSizeOptions((bwso) =>
          bwso.filter((o) => o <= blocks[0].height),
        );
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
          setBlockWindowSizeOptions((bwso) =>
            bwso.filter((o) => o <= blocks[0].height),
          );
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
          start: Math.max(height - blockWindowSize, 1),
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
              block: { height, timestamp },
            }): { author: string; block: number; timestamp: Date } => ({
              author: id,
              block: height,
              timestamp: new Date(timestamp),
            }),
          ),
        );

        setFirst({
          height: events[0].block.height,
          timestamp: new Date(events[0].block.timestamp),
        });
        setLast({
          height: events.slice(-1)[0].block.height,
          timestamp: new Date(events.slice(-1)[0].block.timestamp),
        });
      });
  }, [blockWindowSize, height, manifest]);

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

  return stats && stats.length > 0 ? (
    <>
      <Row>
        <Col>
          <h2>mining leaderboard</h2>
        </Col>
        <Col align="right">
          {first ? (
            <span>
              from:{" "}
              <Badge pill bg="dark">
                {Intl.NumberFormat().format(first.height)}
              </Badge>{" "}
              {Intl.DateTimeFormat("default", {
                timeStyle: "medium",
                dateStyle: "medium",
              })
                .format(first.timestamp)
                .toLowerCase()}
            </span>
          ) : null}{" "}
          {last ? (
            <span>
              <br />
              to:{" "}
              <Badge pill bg="dark">
                {Intl.NumberFormat().format(last.height)}
              </Badge>{" "}
              {Intl.DateTimeFormat("default", {
                timeStyle: "medium",
                dateStyle: "medium",
              })
                .format(last.timestamp)
                .toLowerCase()}
            </span>
          ) : null}
        </Col>
        <Col align="right">
          <h3>
            last{" "}
            <DropdownButton
              style={{ display: "inline-block" }}
              title={blockWindowSize}
              variant="secondary"
            >
              {blockWindowSizeOptions.map((n) => (
                <Dropdown.Item key={n} onClick={() => setBlockWindowSize(n)}>
                  {n}
                </Dropdown.Item>
              ))}
            </DropdownButton>{" "}
            blocks
          </h3>
        </Col>
      </Row>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th style={{ textAlign: "right" }}>score</th>
            <th>miner</th>
            <th style={{ textAlign: "right" }}>last block</th>
          </tr>
        </thead>
        <tbody>
          {stats.map(({ author, count, last }) => {
            return (
              <tr key={author}>
                <td style={{ textAlign: "right" }}>{count}</td>
                <td>
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
                <td style={{ textAlign: "right" }}>
                  <Badge
                    pill
                    bg={
                      last === height
                        ? "primary"
                        : last > height - blockWindowSize / 10
                          ? "dark"
                          : "secondary"
                    }
                  >
                    {Intl.NumberFormat().format(last)}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </>
  ) : null;
};

export default MiningStats;
