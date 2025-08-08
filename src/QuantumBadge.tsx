import React from 'react';
import { Badge, OverlayTrigger, Tooltip } from 'react-bootstrap';
import './QuantumBadge.css';

interface QuantumBadgeProps {
  variant?: 'inline' | 'standalone';
  showDetails?: boolean;
  className?: string;
}

const QuantumBadge: React.FC<QuantumBadgeProps> = ({ 
  variant = 'inline', 
  showDetails = true,
  className = '' 
}) => {
  const tooltipContent = (
    <div>
      <strong>Quantum-Resistant Cryptography</strong>
      <hr className="my-1" />
      <div className="text-start">
        <div className="mb-1">
          <i className="bi bi-shield-check me-1"></i>
          <strong>Signatures:</strong> ML-DSA (Dilithium)
        </div>
        <div className="mb-1">
          <i className="bi bi-hash me-1"></i>
          <strong>Hashing:</strong> Poseidon
        </div>
        <div>
          <i className="bi bi-lock-fill me-1"></i>
          <strong>Security:</strong> NIST Level 5
        </div>
      </div>
    </div>
  );

  const badge = (
    <Badge 
      className={`quantum-badge ${variant} ${className}`}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        <i className="bi bi-shield-lock-fill" style={{ marginRight: '0.25rem' }}></i>
        <span>{variant === 'standalone' ? 'Quantum-Resistant Chain' : 'Quantum-Resistant'}</span>
      </span>
    </Badge>
  );

  if (!showDetails) {
    return badge;
  }

  return (
    <OverlayTrigger
      placement="top"
      overlay={
        <Tooltip id="quantum-tooltip" className="quantum-tooltip">
          {tooltipContent}
        </Tooltip>
      }
    >
      {badge}
    </OverlayTrigger>
  );
};

export default QuantumBadge;