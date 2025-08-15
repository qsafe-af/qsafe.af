import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, InputGroup, Dropdown } from 'react-bootstrap';

// Pattern types
type PatternType = 'account' | 'block_hash' | 'block_number' | 'extrinsic_hash' | 'unknown';

interface SearchResult {
  type: PatternType;
  value: string;
  displayValue: string;
  confidence: number;
}

// SS58 validation regex - matches Substrate addresses
// Base58 character set excluding 0, O, I, l - typical length 46-60 chars
const SS58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{46,60}$/;

// Hex hash regex - for block and extrinsic hashes
const HEX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

// Block number regex
const BLOCK_NUMBER_REGEX = /^\d+$/;

export const BasicSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recentSearches');
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse recent searches:', e);
      }
    }
  }, []);

  // Pattern detection
  const detectPattern = (input: string): SearchResult[] => {
    const trimmed = input.trim();
    const results: SearchResult[] = [];

    if (!trimmed) return results;

    // Check for SS58 address (Substrate accounts)
    if (SS58_REGEX.test(trimmed)) {
      // Check for common Substrate address prefixes to increase confidence
      let confidence = 0.85; // Base confidence
      
      // Quantum-safe prefix has highest priority
      if (trimmed.startsWith('qz')) {
        confidence = 0.99; // Quantum-safe ML-DSA secured chain (prefix 189)
      } else {
        const firstChar = trimmed[0];
        // Common Substrate network prefixes
        if (firstChar === '1') confidence = 0.95; // Polkadot
        else if (['C', 'D', 'E', 'F', 'G', 'H', 'J'].includes(firstChar)) confidence = 0.95; // Kusama
        else if (firstChar === '5') confidence = 0.93; // Generic Substrate
        else if (['2', '3', '4', '6', '7', '8', '9'].includes(firstChar)) confidence = 0.90; // Other networks
      }
      
      results.push({
        type: 'account',
        value: trimmed,
        displayValue: trimmed.startsWith('qz') 
          ? `Quantum-Safe Account: ${trimmed.slice(0, 8)}...${trimmed.slice(-6)}` 
          : `Account: ${trimmed.slice(0, 8)}...${trimmed.slice(-6)}`,
        confidence
      });
    }

    // Check for hex hash (could be block or extrinsic)
    if (HEX_HASH_REGEX.test(trimmed)) {
      results.push({
        type: 'block_hash',
        value: trimmed,
        displayValue: `Block Hash: ${trimmed.slice(0, 10)}...`,
        confidence: 0.7
      });
      results.push({
        type: 'extrinsic_hash',
        value: trimmed,
        displayValue: `Extrinsic: ${trimmed.slice(0, 10)}...`,
        confidence: 0.7
      });
    }

    // Check for block number
    if (BLOCK_NUMBER_REGEX.test(trimmed) && trimmed.length < 10) {
      results.push({
        type: 'block_number',
        value: trimmed,
        displayValue: `Block #${trimmed}`,
        confidence: 0.9
      });
    }

    // If no specific pattern matched, mark as unknown
    if (results.length === 0) {
      results.push({
        type: 'unknown',
        value: trimmed,
        displayValue: `Unknown: ${trimmed.slice(0, 20)}${trimmed.length > 20 ? '...' : ''}`,
        confidence: 0.1
      });
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(-1);
    setError(null); // Clear error on new input
    
    if (value.trim()) {
      const detected = detectPattern(value.trim());
      setSuggestions(detected);
      setShowDropdown(true);
    } else {
      setSuggestions(recentSearches.slice(0, 5));
      setShowDropdown(recentSearches.length > 0);
    }
  };

  // Handle paste event to immediately detect patterns
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText.trim()) {
      // Let the paste complete, then detect patterns
      setTimeout(() => {
        const detected = detectPattern(pastedText.trim());
        setSuggestions(detected);
        setShowDropdown(true);
      }, 0);
    }
  };

  // Navigate to result
  const navigateToResult = (result: SearchResult) => {
    // Don't navigate for unknown types
    if (result.type === 'unknown') {
      setError(`"${result.value}" doesn't appear to be a valid account address, block number, block hash, or extrinsic hash.`);
      return;
    }

    // Get current chain from URL if available
    const pathSegments = location.pathname.split('/').filter(Boolean);
    let chainPath = '';
    if (pathSegments[0] === 'chains' && pathSegments[1]) {
      chainPath = `/chains/${pathSegments[1]}`;
    }

    // Construct the navigation path
    let navigationPath = '';
    switch (result.type) {
      case 'account':
        navigationPath = `${chainPath}/account/${result.value}`;
        break;
      case 'block_hash':
      case 'block_number':
        navigationPath = `${chainPath}/block/${result.value}`;
        break;
      case 'extrinsic_hash':
        navigationPath = `${chainPath}/extrinsic/${result.value}`;
        break;
    }

    if (navigationPath) {
      // Save to recent searches (only valid results)
      const updatedRecent = [result, ...recentSearches.filter(r => r.value !== result.value)].slice(0, 10);
      setRecentSearches(updatedRecent);
      localStorage.setItem('recentSearches', JSON.stringify(updatedRecent));

      // Clear search state before navigation
      setQuery('');
      setShowDropdown(false);
      setSuggestions([]);
      setMobileSearchOpen(false);
      setError(null);

      // Navigate
      navigate(navigationPath);
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // If we have suggestions, use them
    if (suggestions.length > 0) {
      const selectedSuggestion = selectedIndex >= 0 ? suggestions[selectedIndex] : suggestions[0];
      navigateToResult(selectedSuggestion);
    } 
    // If no suggestions but we have a query, detect pattern and navigate
    else if (query.trim()) {
      const detected = detectPattern(query.trim());
      if (detected.length > 0) {
        // Navigate to the highest confidence result
        navigateToResult(detected[0]);
      }
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > -1 ? prev - 1 : -1);
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        if (window.innerWidth < 768) {
          setMobileSearchOpen(false);
        }
        break;
    }
  };

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getTypeIcon = (type: PatternType) => {
    switch (type) {
      case 'account':
        return <i className="bi bi-person-circle text-primary"></i>;
      case 'block_hash':
      case 'block_number':
        return <i className="bi bi-box text-info"></i>;
      case 'extrinsic_hash':
        return <i className="bi bi-arrow-left-right text-success"></i>;
      default:
        return <i className="bi bi-search text-secondary"></i>;
    }
  };

  return (
    <>
      {/* Mobile search toggle button */}
      <button
        className="btn btn-link text-decoration-none d-md-none p-2"
        onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
        aria-label="Toggle search"
      >
        <i className="bi bi-search"></i>
      </button>

      {/* Mobile overlay */}
      {mobileSearchOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50 d-md-none"
          style={{ zIndex: 1040 }}
          onClick={() => setMobileSearchOpen(false)}
        />
      )}

      {/* Search form */}
      <div 
        className={`position-relative w-100 ${mobileSearchOpen ? 'd-block position-fixed top-0 start-0 p-3 bg-body' : 'd-none d-md-block'}`} 
        style={{ 
          maxWidth: mobileSearchOpen && window.innerWidth < 768 ? '100%' : '400px',
          zIndex: mobileSearchOpen ? 1050 : 'auto'
        }}
      >
        <Form onSubmit={handleSubmit} className="w-100">
          <InputGroup>
            <InputGroup.Text className="d-none d-md-flex">
              <i className="bi bi-search"></i>
            </InputGroup.Text>
            <Form.Control
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setIsFocused(true);
                if (!query && recentSearches.length > 0) {
                  setSuggestions(recentSearches.slice(0, 5));
                  setShowDropdown(true);
                }
              }}
              onBlur={() => {
                // Delay to allow clicks on dropdown items
                setTimeout(() => setIsFocused(false), 200);
              }}
              placeholder={mobileSearchOpen ? "Search account, block, or extrinsic..." : "Search..."}
              autoComplete="off"
              className={mobileSearchOpen ? '' : 'text-truncate'}
              autoFocus={mobileSearchOpen}
            />
            {/* Mobile close button */}
            {mobileSearchOpen && (
              <InputGroup.Text 
                className="d-md-none"
                role="button"
                onClick={() => setMobileSearchOpen(false)}
              >
                <i className="bi bi-x"></i>
              </InputGroup.Text>
            )}
            {/* Search button for desktop */}
            <button 
              type="submit" 
              className="btn btn-primary d-none d-md-block"
              disabled={!query.trim()}
              title="Search"
            >
              <i className="bi bi-search"></i>
            </button>
          </InputGroup>
        </Form>

        {/* Error message */}
        {error && (
          <div className="alert alert-warning alert-dismissible fade show mt-2 py-2 small" role="alert">
            <i className="bi bi-exclamation-triangle me-2"></i>
            {error}
            <button 
              type="button" 
              className="btn-close btn-sm" 
              aria-label="Close"
              onClick={() => setError(null)}
            ></button>
          </div>
        )}

        {showDropdown && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className={`position-absolute w-100 mt-1 shadow-sm ${mobileSearchOpen ? 'position-relative mt-2' : ''}`}
            style={{ 
              zIndex: 1050, 
              left: 0, 
              right: 0,
              maxHeight: mobileSearchOpen ? 'calc(100vh - 150px)' : '400px',
              overflowY: 'auto'
            }}
          >
          <Dropdown.Menu show className="w-100">
            {!query && recentSearches.length > 0 && (
              <Dropdown.Header>Recent Searches</Dropdown.Header>
            )}
            
            {suggestions.map((suggestion, index) => (
              <Dropdown.Item
                key={`${suggestion.type}-${suggestion.value}`}
                onClick={() => navigateToResult(suggestion)}
                active={selectedIndex === index}
                className="d-flex align-items-center justify-content-between py-2"
                style={{ minHeight: '44px' }}
              >
                <div className="d-flex align-items-center flex-grow-1 overflow-hidden">
                  <span className="me-2 flex-shrink-0">{getTypeIcon(suggestion.type)}</span>
                  <div className="overflow-hidden">
                    <div className="fw-medium text-truncate">{suggestion.displayValue}</div>
                    <small className="text-muted d-none d-sm-block">
                      Confidence: {Math.round(suggestion.confidence * 100)}%
                    </small>
                  </div>
                </div>
                {suggestion.type !== 'unknown' && (
                  <i className="bi bi-chevron-right text-muted"></i>
                )}
              </Dropdown.Item>
            ))}

            {query && suggestions.length === 0 && (
              <Dropdown.Item disabled>
                No results found for "{query}"
              </Dropdown.Item>
            )}
          </Dropdown.Menu>
          </div>
        )}

        {/* Keyboard shortcuts hint - hidden on mobile and only shown when focused */}
        {(isFocused || showDropdown) && (
          <small className="text-muted d-none d-md-block text-center mt-1">
            Press <kbd>↑↓</kbd> to navigate, <kbd>Enter</kbd> to select
          </small>
        )}
      </div>
    </>
  );
};