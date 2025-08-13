import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container, Card, Alert, Badge, ListGroup } from 'react-bootstrap';
import { getChain } from './chains';
import { themeClasses } from './theme-utils';

const Chain: React.FC = () => {
  const { chainId } = useParams<{ chainId: string }>();
  const chain = chainId ? getChain(chainId) : undefined;

  if (!chain) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          <Alert.Heading>Chain Not Found</Alert.Heading>
          <p>The chain "{chainId}" does not exist.</p>
          <hr />
          <div className="d-flex justify-content-end">
            <Link to="/chains" className="btn btn-outline-danger">
              Back to Chains List
            </Link>
          </div>
        </Alert>
      </Container>
    );
  }

  const availableRoutes = [
    {
      path: `/chains/${chain.name}/activity`,
      name: 'Activity',
      description: 'View real-time blocks and events',
      icon: 'bi-activity'
    }
  ];

  // Only add mining stats if indexer is available
  if (chain.indexer) {
    availableRoutes.push({
      path: `/chains/${chain.name}/stats`,
      name: 'Mining Stats',
      description: 'View mining statistics and leaderboard',
      icon: 'bi-graph-up'
    });
  }

  return (
    <Container className="mt-4">
      <div className="mb-4">
        <Link to="/chains" className="btn btn-sm btn-secondary">
          <i className="bi bi-arrow-left me-2"></i>
          Back to Chains
        </Link>
      </div>

      <Card className={`${themeClasses.bg.tertiary} border mb-4`}>
        <Card.Header>
          <h3 className="mb-0">{chain.displayName}</h3>
        </Card.Header>
        <Card.Body>
          <div className="row">
            <div className="col-md-12">
              <div className="mb-3">
                <strong>Chain ID:</strong>{' '}
                <Badge bg="secondary" className="font-monospace">
                  {chain.name}
                </Badge>
              </div>
              
              <div className="mb-3">
                <strong>Genesis Hash:</strong>
                <div className="font-monospace text-break small">
                  {chain.genesis}
                </div>
              </div>
              
              {chain.endpoints && chain.endpoints.length > 0 && (
                <div className="mb-3">
                  <strong>WebSocket Endpoints:</strong>
                  <ListGroup className="mt-2">
                    {chain.endpoints.map((endpoint, idx) => (
                      <ListGroup.Item 
                        key={idx} 
                        className={`${themeClasses.bg.subtle} border font-monospace small`}
                      >
                        <i className="bi bi-broadcast me-2 text-success"></i>
                        {endpoint}
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                </div>
              )}
              
              {(!chain.endpoints || chain.endpoints.length === 0) && (
                <Alert variant="warning" className="mb-0">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  No endpoints configured for this chain
                </Alert>
              )}
            </div>
          </div>
        </Card.Body>
      </Card>

      <Card className={`${themeClasses.bg.tertiary} border`}>
        <Card.Header>
          <h4 className="mb-0">Available Tools</h4>
        </Card.Header>
        <Card.Body>
          <ListGroup>
            {availableRoutes.map((route) => (
              <ListGroup.Item 
                key={route.path}
                className={`${themeClasses.bg.subtle} border`}
                action
                as={Link}
                to={route.path}
              >
                <div className="d-flex align-items-center">
                  <div className="me-3">
                    <i className={`${route.icon} fs-4`}></i>
                  </div>
                  <div className="flex-grow-1">
                    <h6 className="mb-1">{route.name}</h6>
                    <p className={`mb-0 small ${themeClasses.text.secondary}`}>
                      {route.description}
                    </p>
                  </div>
                  <div>
                    <i className="bi bi-chevron-right"></i>
                  </div>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default Chain;