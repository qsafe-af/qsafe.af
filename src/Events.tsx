import React from 'react';
import { Card } from 'react-bootstrap';

const Events: React.FC = () => {
  return (
    <Card className="h-100">
      <Card.Header>
        <h5 className="mb-0">Recent Events</h5>
      </Card.Header>
      <Card.Body>
        <p className="text-muted">
          Events will be displayed here.
        </p>
        {/* TODO: Implement events subscription and display */}
      </Card.Body>
    </Card>
  );
};

export default Events;