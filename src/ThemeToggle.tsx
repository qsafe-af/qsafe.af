import React, { useEffect, useState } from 'react';
import { Dropdown, ButtonGroup } from 'react-bootstrap';
import './ThemeToggle.css';

type Theme = 'light' | 'dark' | 'auto';

const ThemeToggle: React.FC = () => {
  const [currentTheme, setCurrentTheme] = useState<Theme>('auto');

  useEffect(() => {
    // Get initial theme from localStorage
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    if (storedTheme) {
      setCurrentTheme(storedTheme);
    } else {
      // Default to auto if no theme is stored
      setCurrentTheme('auto');
    }

    // Listen for theme changes
    const observer = new MutationObserver(() => {
      const stored = localStorage.getItem('theme') as Theme | null;
      if (stored) {
        setCurrentTheme(stored);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-bs-theme']
    });

    return () => observer.disconnect();
  }, []);

  const handleThemeChange = (theme: Theme) => {
    // Update localStorage
    localStorage.setItem('theme', theme);
    
    // Update the document attribute
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-bs-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-bs-theme', theme);
    }
    
    // Update local state
    setCurrentTheme(theme);
  };

  const getThemeIcon = (theme: Theme) => {
    switch (theme) {
      case 'light':
        return 'bi-sun-fill';
      case 'dark':
        return 'bi-moon-stars-fill';
      case 'auto':
        return 'bi-circle-half';
      default:
        return 'bi-circle-half';
    }
  };

  return (
    <Dropdown as={ButtonGroup} className="theme-toggle-dropdown">
      <Dropdown.Toggle 
        variant="link" 
        id="theme-dropdown-toggle"
        className="theme-toggle-button"
        aria-label="Toggle theme"
      >
        <i className={`bi ${getThemeIcon(currentTheme)}`}></i>
      </Dropdown.Toggle>

      <Dropdown.Menu align="end">
        <Dropdown.Item 
          onClick={() => handleThemeChange('light')}
          active={currentTheme === 'light'}
          className="theme-dropdown-item"
        >
          <i className="bi bi-sun-fill me-2"></i>
          Light
          {currentTheme === 'light' && <i className="bi bi-check2 ms-auto"></i>}
        </Dropdown.Item>
        <Dropdown.Item 
          onClick={() => handleThemeChange('dark')}
          active={currentTheme === 'dark'}
          className="theme-dropdown-item"
        >
          <i className="bi bi-moon-stars-fill me-2"></i>
          Dark
          {currentTheme === 'dark' && <i className="bi bi-check2 ms-auto"></i>}
        </Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item 
          onClick={() => handleThemeChange('auto')}
          active={currentTheme === 'auto'}
          className="theme-dropdown-item"
        >
          <i className="bi bi-circle-half me-2"></i>
          Auto
          {currentTheme === 'auto' && <i className="bi bi-check2 ms-auto"></i>}
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
};

export default ThemeToggle;