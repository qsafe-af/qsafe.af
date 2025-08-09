# Theme System Migration Guide

## Overview

This document describes the theme system migration to support Bootstrap's built-in light/dark theme switching functionality. The app now properly responds to theme changes without hardcoded color classes.

## Problem

The application had hardcoded theme classes like `bg-dark`, `text-light`, `bg-secondary`, etc. that don't adapt when users switch between light and dark themes using the theme toggle. This resulted in poor contrast and readability issues when switching themes.

## Solution

We've implemented a theme-aware class system that uses Bootstrap 5.3's CSS variables and utility classes that automatically adapt to the current theme.

### Key Changes

1. **Created `theme-utils.ts`** - A utility module that provides:
   - Theme-aware class mappings
   - Helper functions for class management
   - Predefined theme-aware class combinations

2. **Replaced hardcoded classes** with theme-aware alternatives:

| Old Class | New Theme-Aware Class | Description |
|-----------|----------------------|-------------|
| `bg-dark` | `bg-body-tertiary` | Adapts to light/dark theme |
| `text-light` | `text-body` | Primary text color that adapts |
| `text-white` | `text-body` | Primary text color that adapts |
| `bg-dark-subtle` | `bg-body-tertiary` | Subtle background that adapts |
| Badge variant `dark` | Badge variant `secondary` | Theme-aware badge styling |

### Updated Components

1. **Activity.tsx**
   - Replaced `text-light` with `themeClasses.text.primary`
   - Replaced `bg-dark` with `themeClasses.bg.tertiary`
   - Changed Badge variant from `dark` to `secondary`

2. **BlockDetail.tsx**
   - Replaced `text-light` with `themeClasses.text.primary`
   - Replaced `bg-dark text-light` Card with theme-aware classes
   - Replaced `bg-dark-subtle` with `themeClasses.bg.subtle`

## Usage Guide

### Import the utilities

```typescript
import { themeClasses, getThemeClasses, cx } from './theme-utils';
```

### Use predefined theme classes

```tsx
// Text colors
<span className={themeClasses.text.primary}>Primary text</span>
<span className={themeClasses.text.secondary}>Secondary text</span>

// Backgrounds
<div className={themeClasses.bg.tertiary}>Tertiary background</div>
<div className={themeClasses.bg.subtle}>Subtle background</div>

// Cards
<Card className={`${themeClasses.bg.tertiary} ${themeClasses.text.primary}`}>
```

### Convert hardcoded classes

```tsx
// Before
<div className="bg-dark text-light">Content</div>

// After
<div className={`${themeClasses.bg.tertiary} ${themeClasses.text.primary}`}>Content</div>
```

## Best Practices

1. **Avoid hardcoded color classes** - Don't use `bg-dark`, `text-light`, `text-white`, etc.
2. **Use Bootstrap's theme-aware utilities** - Prefer `bg-body`, `text-body`, `bg-body-tertiary`, etc.
3. **Test both themes** - Always verify your UI looks good in both light and dark modes
4. **Use CSS variables** - For custom colors, use Bootstrap's CSS variables that adapt to themes

## Bootstrap Theme-Aware Classes Reference

### Text Colors
- `text-body` - Primary text color
- `text-body-emphasis` - Emphasized text
- `text-body-secondary` - Secondary/muted text
- `text-body-tertiary` - Tertiary text

### Background Colors
- `bg-body` - Primary background
- `bg-body-secondary` - Secondary background
- `bg-body-tertiary` - Tertiary/subtle background

### Borders
- `border` - Default border that adapts to theme
- `border-subtle` - Subtle border

### Bootstrap Component Variants
- Use `primary`, `secondary`, `success`, `danger`, `warning`, `info` - these adapt automatically
- Avoid `dark` and `light` variants for theme-aware components

## Testing

To test theme switching:
1. Click the theme toggle button in the header
2. Switch between Light, Dark, and Auto modes
3. Verify all text is readable and backgrounds provide proper contrast
4. Check that no elements have fixed dark/light styling

## Future Considerations

1. Consider creating more semantic class names in `theme-utils.ts` for common patterns
2. Add ESLint rules to catch hardcoded theme classes
3. Create a visual regression test suite for both themes