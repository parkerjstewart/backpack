# UI Components Module

Radix UI-based accessible component library with CVA styling, composed building blocks, and theming support.

## Design System Tokens

Design tokens are defined in `globals.css` and `tailwind.config.ts`. Based on Figma design system.

### Color Palette
- **Background**: Warm cream `#fefcf6` (not pure white)
- **Primary**: Teal `#14302e` (text, dark buttons)
- **Secondary**: Light neutral `#f0f1eb` (hover states, light buttons)
- **Accent**: Sage green `#d4e297` (active states, accent buttons)
- **Muted**: `#e7e8e4` (disabled, placeholder)
- **Border**: `rgba(20, 48, 46, 0.2)` (opacity-based for consistency)

### Typography
- **Heading font**: EB Garamond (serif) — use `font-heading` class
- **Body font**: Figtree (sans-serif) — default, use `font-sans` class
- **Key classes**: `.text-hero` (48px), `.text-section` (32px), `.text-title` (24px), `.text-card-title` (28px)

### Spacing & Radius
- **Border radius**: `--radius-sm` (8px), `--radius-md` (16px), `--radius-lg` (24px), `--radius-xl` (32px)
- **Layout spacing**: `--page-padding` (32px), `--section-gap` (32px), `--card-gap` (24px)

### Theme State
- **Currently light-mode only** — dark mode temporarily disabled
- Theme toggle hidden; `ThemeProvider` forces light mode
- `dark:` Tailwind classes exist but don't apply (can be cleaned up later)

## Key Components

- **Primitives** (`button.tsx`, `dialog.tsx`, `select.tsx`, `dropdown-menu.tsx`): Radix UI wrappers with Tailwind styling
- **Composite components** (`checkbox-list.tsx`, `wizard-container.tsx`, `command.tsx`): Multi-part patterns combining primitives
- **Form components** (`input.tsx`, `textarea.tsx`, `label.tsx`, `form-section.tsx`): Input handling with accessibility
- **Feedback** (`alert.tsx`, `alert-dialog.tsx`, `sonner.tsx`, `progress.tsx`): User notifications and status
- **Layout** (`card.tsx`, `accordion.tsx`, `tabs.tsx`, `scroll-area.tsx`): Structural wrappers
- **Utilities** (`badge.tsx`, `separator.tsx`, `tooltip.tsx`, `popover.tsx`, `collapsible.tsx`): Small focused components

## Important Patterns

- **Radix UI wrappers**: Components delegate to Radix primitives; apply Tailwind classes via `cn()` utility
- **CVA (Class Variance Authority)**: `button.tsx` and similar use CVA for variant/size combinations
- **Composition via Slot**: `Button` uses `asChild` prop + `Slot` from radix to render as any element type
- **Data slots**: All components have `data-slot` attributes for testing/styling isolation
- **Controlled styling**: Classes hardcoded in components; use `className` prop to override/extend
- **Animations**: Radix `data-[state]` selectors for open/close animations (fade-in, zoom-in)
- **Accessibility first**: ARIA attributes from Radix (aria-invalid, sr-only labels, focus rings)

## Component Styling Conventions

### Hover vs Active States (IMPORTANT)

**This is a common source of bugs. Follow these rules strictly:**

| State | Background Color | Token | When to Use |
|-------|-----------------|-------|-------------|
| **Hover** | `#f0f1eb` | `bg-secondary` | Mouse over any interactive element |
| **Active/Selected** | `#ecf1d5` | `bg-sidebar-accent` or `bg-accent` | Current page, selected item, toggled on |

- **Use `secondary` for hover, NOT `accent`** — hover states should use neutral colors (`hover:bg-secondary`)
- **Use `accent` ONLY for active/selected states** — sage green indicates "this is the current selection"
- **Never use `hover:bg-accent`** — this violates the design system (accent = active, not hover)
- **Never use `hover:bg-muted`** — muted is for disabled/placeholder states, not hover

**Correct Examples:**
```tsx
// Sidebar nav item
className="hover:bg-secondary bg-sidebar-accent" // hover=neutral, active=sage

// Card hover
className="hover:bg-secondary" // neutral hover, no accent

// Button (ghost variant)
className="hover:bg-secondary hover:text-foreground"
```

**Incorrect Examples:**
```tsx
// DON'T use accent for hover
className="hover:bg-accent" // WRONG - accent is for active state only

// DON'T use muted for hover  
className="hover:bg-muted" // WRONG - muted is for disabled/placeholder
```

For sidebar navigation specifically, use the `SidebarNavLink` component from `components/layout/SidebarNavLink.tsx` which encapsulates these patterns.

### Button Variants
- **`default`/`dark`**: Teal background, cream text (primary actions)
- **`accent`**: Sage green background (highlighted actions)
- **`light`/`secondary`**: Neutral background (secondary actions)
- **`outline`**: 2px dashed border, transparent bg (empty states, add buttons)
- **`ghost`**: No background, hover shows secondary bg
- **Default size**: 48px height (`h-12`), 32px horizontal padding (`px-8`), 16px radius

### Input Focus States
- Focus ring uses sage color (`focus-visible:border-sage-500`)
- 2px border on focus, 3px ring spread

### Cards
- Use `CardInteractive` for clickable cards (has hover state)
- Hover: `bg-secondary` (neutral), no accent color

## Key Dependencies

- `@radix-ui/*`: Unstyled accessible primitives (dialog, select, dropdown-menu, etc.)
- `class-variance-authority`: CVA for variant patterns
- `lucide-react`: Icon library (XIcon in dialog close button)
- `@/lib/utils`: `cn()` utility for class merging

## How to Add New Components

1. Create `.tsx` file wrapping Radix primitive or composing existing components
2. Add `data-slot="component-name"` to root element
3. Use `cn()` to merge default classes with `className` prop
4. Export both component and variants (if using CVA)
5. Document prop shape and usage in JSDoc

## Important Quirks & Gotchas

- **Slot forwarding**: `asChild={true}` on Button passes all props to child; ensure child accepts them
- **FormData in dialogs**: Dialog not reset automatically; parent must manually clear form state
- **Focus management**: Dialog auto-focuses first input; can cause layout shifts if inputs conditionally rendered
- **Z-index stacking**: Fixed elements (Dialog overlay, dropdown menus) use z-50; be careful with other fixed elements
- **Click outside closes dropdown**: Radix dropdowns auto-close on outside click; may conflict with hover-triggered actions
- **SVG size inference**: Button uses `[&_svg:not([class*='size-'])]:size-4` to default unlabeled icons to 4x4; be explicit if different size needed
- **CSS-in-JS conflicts**: Hardcoded Tailwind classes may conflict with global CSS; specificity matters
- **Dark mode disabled**: Currently light-mode only; `dark:` classes exist but don't apply. Don't add new dark mode styles until re-enabled.
- **Hover vs Active colors**: Hover uses `secondary` (neutral), active uses `accent` (sage). Don't mix them up.

## Testing Patterns

```typescript
// Test component rendering with props
render(<Button variant="destructive" size="sm">Delete</Button>)
expect(screen.getByRole('button')).toHaveClass('bg-destructive')

// Test Dialog interaction
render(<Dialog open={true}><DialogContent>Content</DialogContent></Dialog>)
expect(screen.getByText('Content')).toBeInTheDocument()

// Test accessibility
expect(screen.getByRole('dialog')).toHaveAttribute('role', 'dialog')
```
