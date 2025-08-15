import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Card, Table, Spinner, Alert } from 'react-bootstrap';
import { getChain } from '../../chains';
import { getCachedChainProperties } from '../../utils/ss58';

interface Transfer {
  id: string;
}

interface Account {
  id: string;
  free: string;
  reserved: string;
  frozen: string;
  lastUpdated: number;
  transfersTo: Transfer[];
  transfersFrom: Transfer[];
}

interface AccountWithStats extends Account {
  totalTransfers: number;
  sentCount: number;
  receivedCount: number;
}

const AccountStats: React.FC = () => {
  const { chainId } = useParams<{ chainId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountWithStats[]>([]);
  const chain = chainId ? getChain(chainId) : null;

  useEffect(() => {
    if (!chain || !chain.indexer) {
      setError('Chain configuration not found or indexer not available');
      setLoading(false);
      return;
    }

    fetchMostActiveAccounts();
  }, [chainId]);

  const fetchMostActiveAccounts = async () => {
    if (!chain || !chain.indexer) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch accounts with their transfers
      // We'll fetch more accounts initially to ensure we get enough active ones
      const query = `
        query GetAccountsWithTransfers {
          accounts(orderBy: lastUpdated_DESC, limit: 100) {
            id
            free
            reserved
            frozen
            lastUpdated
            transfersTo {
              id
            }
            transfersFrom {
              id
            }
          }
        }
      `;

      const response = await fetch(chain.indexer, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      // Process accounts to add transfer statistics
      const accountsWithStats: AccountWithStats[] = data.data.accounts.map((account: Account) => ({
        ...account,
        sentCount: account.transfersTo.length,
        receivedCount: account.transfersFrom.length,
        totalTransfers: account.transfersTo.length + account.transfersFrom.length,
      }));

      // Sort by total transfers and take top 15
      const topAccounts = accountsWithStats
        .sort((a, b) => b.totalTransfers - a.totalTransfers)
        .slice(0, 15);

      setAccounts(topAccounts);
    } catch (err) {
      console.error('Error fetching accounts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch accounts');
    } finally {
      setLoading(false);
    }
  };

  const formatBalance = (balance: string) => {
    // Convert balance to a readable format
    const value = BigInt(balance);
    const chainProps = chain ? getCachedChainProperties(chain.genesis) : null;
    const decimals = chainProps?.tokenDecimals || 12;
    const tokenSymbol = chainProps?.tokenSymbol || 'UNITS';
    const divisor = BigInt(10 ** decimals);
    const wholePart = value / divisor;
    const fractionalPart = value % divisor;
    
    // Format with thousand separators
    const wholeStr = wholePart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Get first 4 decimal places
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0').slice(0, 4);
    
    return `${wholeStr}.${fractionalStr} ${tokenSymbol}`;
  };

  const truncateAddress = (address: string) => {
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  if (loading) {
    return (
      <Container className="py-4">
        <div className="text-center">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
          <p className="mt-2">Loading account statistics...</p>
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-4">
        <Alert variant="danger">
          <Alert.Heading>Error</Alert.Heading>
          <p>{error}</p>
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <h2 className="mb-4">Most Active Accounts</h2>
      
      <Card>
        <Card.Header>
          <h5 className="mb-0">Top 15 Accounts by Transaction Activity</h5>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Rank</th>
                  <th>Account</th>
                  <th className="text-end">Free Balance</th>
                  <th className="text-center">Sent</th>
                  <th className="text-center">Received</th>
                  <th className="text-center">Total Transfers</th>
                  <th className="text-center">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account, index) => (
                  <tr key={account.id}>
                    <td className="text-muted">#{index + 1}</td>
                    <td>
                      <a 
                        href={`/chains/${chainId}/account/${account.id}`}
                        className="text-decoration-none"
                        title={account.id}
                      >
                        <code>{truncateAddress(account.id)}</code>
                      </a>
                    </td>
                    <td className="text-end">
                      <span className="text-nowrap">
                        {formatBalance(account.free)}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="badge bg-primary">
                        {account.sentCount}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="badge bg-success">
                        {account.receivedCount}
                      </span>
                    </td>
                    <td className="text-center">
                      <strong>{account.totalTransfers}</strong>
                    </td>
                    <td className="text-center">
                      <a 
                        href={`/chains/${chainId}/block/${account.lastUpdated}`}
                        className="text-decoration-none"
                      >
                        #{account.lastUpdated.toLocaleString()}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>

      {accounts.length === 0 && (
        <Alert variant="info" className="mt-3">
          No active accounts found for this chain.
        </Alert>
      )}

      <div className="mt-3 text-muted">
        <small>
          <i className="bi bi-info-circle me-1"></i>
          Activity is measured by the total number of transfers (sent + received).
          Only showing accounts with at least one transfer.
        </small>
      </div>
    </Container>
  );
};

export default AccountStats;