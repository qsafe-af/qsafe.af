/**
 * Theme-aware utility classes for Bootstrap 5.3+
 * These classes automatically adapt to the current theme (light/dark)
 */

/**
 * Maps hardcoded theme classes to theme-aware alternatives
 */
export const themeClassMap = {
  // Background classes
  'bg-dark': 'bg-body-tertiary',
  'bg-light': 'bg-body',
  'bg-secondary': 'bg-body-secondary',
  
  // Text classes
  'text-light': 'text-body',
  'text-dark': 'text-body',
  'text-white': 'text-body',
  'text-muted': 'text-body-secondary',
  
  // Border classes
  'border-dark': 'border',
  'border-light': 'border',
} as const;

/**
 * Common theme-aware class combinations
 */
export const themeClasses = {
  // Card classes
  card: 'bg-body border',
  cardDark: 'bg-body-tertiary border',
  
  // Code/pre blocks
  codeBlock: 'bg-body-tertiary border rounded p-3',
  
  // Table
  table: '',
  
  // Badges with theme awareness
  badgeVariants: {
    primary: 'bg-primary',
    success: 'bg-success',
    danger: 'bg-danger',
    warning: 'bg-warning text-dark',
    info: 'bg-info text-dark',
    secondary: 'bg-body-secondary text-body',
    dark: 'bg-body-tertiary text-body',
  },
  
  // Common text styles
  text: {
    primary: 'text-body',
    secondary: 'text-body-secondary',
    emphasis: 'text-body-emphasis',
    info: 'text-info',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  },
  
  // Common backgrounds
  bg: {
    primary: 'bg-body',
    secondary: 'bg-body-secondary',
    tertiary: 'bg-body-tertiary',
    subtle: 'bg-body-tertiary',
  },
} as const;

/**
 * Helper function to get theme-aware classes
 * @param classes - Space-separated string of classes
 * @returns Theme-aware classes
 */
export function getThemeClasses(classes: string): string {
  return classes
    .split(' ')
    .map(cls => themeClassMap[cls as keyof typeof themeClassMap] || cls)
    .join(' ');
}

/**
 * Helper function to combine multiple class strings
 * @param classes - Array of class strings
 * @returns Combined class string
 */
export function cx(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Get theme-aware variant for Bootstrap components
 * @param variant - Original variant
 * @returns Theme-aware variant
 */
export function getThemeVariant(variant: string): string {
  // For Bootstrap components that accept variant prop
  const variantMap: Record<string, string> = {
    'dark': 'secondary',
    'light': 'secondary',
    'secondary': 'secondary',
  };
  
  return variantMap[variant] || variant;
}