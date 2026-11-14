# Tally design system proposal

The admin-only preview at `/admin/design-system` is the first step in a visual refresh. It is a proposal, not yet the canonical styling for existing pages. Review it on desktop and a phone before adopting its tokens or component styles across the application.

## Direction

Tally keeps its own teal identity. The event-attendance system is a reference for coherent foundations, shared components, and documented rules, not a reason to copy its indigo palette or page layouts. The preview retains IBM Plex Sans and uses cool slate neutrals, teal actions, quiet surfaces, and labeled semantic states. Its CSS is scoped to the preview so existing screens and printed reports are unchanged.

The product primary is `#1b6c80`, with `#155768` for hover and `#eaf5f6` for subtle emphasis. The preview's other color values and examples are in `apps/web/src/pages/admin/design-system.css` and `DesignSystemPage.tsx`. Treat these as candidates until the design is approved and contrast is checked in all intended combinations.

## Branding

The configured organization name, logo, and brand color remain independent of the product palette. Do not substitute arbitrary organization colors for status colors, control text, or focus indicators; any new use of the configured color needs contrast and fallback rules. Existing branding behavior is unchanged by the preview.

## Responsive and accessibility principles

- Preserve page structure and workflows; adapt the shared components around them.
- Stack controls rather than squeezing them. Target at least 44 × 44 CSS pixels for mobile interactive controls.
- Keep horizontal overflow inside a labeled, keyboard-accessible table region; never hide essential scores or candidate context just to fit a screen.
- Use visible labels in addition to status colors, clear focus indicators, readable text contrast, and reduced-motion support.
- Test at 375px, tablet, and desktop widths, including long names, errors, disabled states, and keyboard use. Keep screen breakpoints from changing print output.

## Rollout after review

1. Agree on palette, typography, surfaces, and component states using the preview.
2. Promote approved values to shared semantic tokens and standardize existing controls and patterns incrementally.
3. Apply responsive behavior to shared components, checking admin, login, judging, reports, and print without changing page layouts.
4. Add or update browser and accessibility checks, and turn this proposal into the canonical component guide.
