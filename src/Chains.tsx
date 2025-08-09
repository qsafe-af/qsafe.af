import React from 'react';
import { Link } from 'react-router-dom';
import { Container, Card, Row, Col, Badge } from 'react-bootstrap';
import { getAllChains } from './chains';
import { themeClasses } from './theme-utils';
import type { Chain } from './types';

const Chains: React.FC = () => {
  const chains = getAllChains();

  return (
    <Container className="mt-4">
      <h2 className="mb-4">Available Chains</h2>
      
      <Row>
        {chains.map((chain: Chain) => (
          <Col key={chain.name} md={6} lg={4} className="mb-4">
            <Card className={`h-100 ${themeClasses.bg.tertiary} border`}>
              <Card.Body>
                <Card.Title>
                  <Link 
                    to={`/chains/${chain.name}`} 
                    className="text-decoration-none"
                  >
                    {chain.displayName}
                  </Link>
                </Card.Title>
                
                <div className="mb-3">
                  <Badge bg="secondary" className="font-monospace">
                    {chain.name}
                  </Badge>
                </div>
                
                <div className="small">
                  <div className="mb-2">
                    <strong>Genesis Hash:</strong>
                    <div className="font-monospace text-break" style={{ fontSize: '0.75rem' }}>
                      {chain.genesis}
                    </div>
                  </div>
                  
                  {chain.endpoints && chain.endpoints.length > 0 && (
                    <div>
                      <strong>Endpoints:</strong>
                      <ul className="mb-0 ps-3">
                        {chain.endpoints.map((endpoint, idx) => (
                          <li key={idx} className="font-monospace" style={{ fontSize: '0.75rem' }}>
                            {endpoint}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                
                <div className="mt-3">
                  <Link 
                    to={`/chains/${chain.name}`} 
                    className="btn btn-sm btn-primary"
                  >
                    View Chain Details
                    <i className="bi bi-arrow-right ms-2"></i>
                  </Link>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
      
      {chains.length === 0 && (
        <Card className={themeClasses.bg.tertiary}>
          <Card.Body className="text-center py-5">
            <p className={`mb-0 ${themeClasses.text.secondary}`}>
              No chains configured
            </p>
          </Card.Body>
        </Card>
      )}
    </Container>
  );
};

export default Chains;