import React, { useEffect, useState } from 'react';
import { Dropdown, ButtonGroup } from 'react-bootstrap';
import './CaseToggle.css';

type TextCase = 'lowercase' | 'normal';

const CaseToggle: React.FC = () => {
  const [currentCase, setCurrentCase] = useState<TextCase>('lowercase');

  useEffect(() => {
    // Get initial case preference from localStorage
    const storedCase = localStorage.getItem('textCase') as TextCase | null;
    const initialCase = storedCase || 'lowercase';
    setCurrentCase(initialCase);
    applyTextCase(initialCase);

    // Listen for storage changes (in case another tab changes it)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'textCase' && e.newValue) {
        const newCase = e.newValue as TextCase;
        setCurrentCase(newCase);
        applyTextCase(newCase);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const applyTextCase = (textCase: TextCase) => {
    if (textCase === 'lowercase') {
      document.body.style.textTransform = 'lowercase';
    } else {
      document.body.style.textTransform = 'none';
    }
  };

  const handleCaseChange = (textCase: TextCase) => {
    // Update localStorage
    localStorage.setItem('textCase', textCase);
    
    // Apply the style
    applyTextCase(textCase);
    
    // Update local state
    setCurrentCase(textCase);
  };

  const getCaseIcon = (textCase: TextCase) => {
    switch (textCase) {
      case 'lowercase':
        return 'bi-type';
      case 'normal':
        return 'bi-type-bold';
      default:
        return 'bi-type';
    }
  };

  return (
    <Dropdown as={ButtonGroup} className="case-toggle-dropdown">
      <Dropdown.Toggle 
        variant="link" 
        id="case-dropdown-toggle"
        className="case-toggle-button"
        aria-label="Toggle text case"
      >
        <i className={`bi ${getCaseIcon(currentCase)}`}></i>
      </Dropdown.Toggle>

      <Dropdown.Menu align="end">
        <Dropdown.Item 
          onClick={() => handleCaseChange('lowercase')}
          active={currentCase === 'lowercase'}
          className="case-dropdown-item"
        >
          <i className="bi bi-type me-2"></i>
          lowercase
          {currentCase === 'lowercase' && <i className="bi bi-check2 ms-auto"></i>}
        </Dropdown.Item>
        <Dropdown.Item 
          onClick={() => handleCaseChange('normal')}
          active={currentCase === 'normal'}
          className="case-dropdown-item"
        >
          <i className="bi bi-type-bold me-2"></i>
          Normal Case
          {currentCase === 'normal' && <i className="bi bi-check2 ms-auto"></i>}
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
};

export default CaseToggle;