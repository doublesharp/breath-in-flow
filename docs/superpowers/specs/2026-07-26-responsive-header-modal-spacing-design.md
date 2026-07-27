# Mobile Layout and Interaction Compliance Design

## Goal

Make the application header and Configure Practice dialog feel less cramped,
and verify that the complete application meets the same mobile layout and
interaction standards. The app must preserve usable space on phones, safe-area
behavior, keyboard reachability, and accessible touch targets.

## Product Decisions

- Use one responsive spacing system instead of separate desktop and mobile
  layouts.
- Keep phone chrome compact enough that it does not compete with the breathing
  experience.
- Increase spacing progressively on wider screens, where the current header and
  dialog look visibly compressed.
- Follow a minimum interactive target of 44 CSS pixels. This meets Apple's
  44-point guidance and stays close to Android's 48-dp guidance without
  changing the visual size of every icon.
- Apply the compliance gate to every primary tab, full-screen experience,
  dialog, confirmation, and persistent navigation surface.
- Fix confirmed violations with shared styles when the affected controls use a
  shared component class. Use local styles when a shared change would alter an
  unrelated visual treatment.
- Do not redesign navigation, change labels, or alter practice, pulse
  variability, history, preset, analytics, or support behavior in this change.

## Header

The sticky application header continues to apply the existing top safe-area
inset. Its content receives 16 pixels of vertical padding on phones and 20
pixels at the small breakpoint and above.

The desktop navigation container receives 8 pixels of internal padding and 6
pixels between items. Navigation buttons use at least a 44-pixel height, 20
pixels of horizontal padding, and 10 pixels of vertical padding. The logo,
product name, navigation labels, selected state, responsive visibility, and
scroll-hide behavior remain unchanged.

Every icon-only header control must expose at least a 44-by-44-pixel interactive
area even when its visible icon remains smaller.

## Configure Practice Dialog

The Configure Practice header remains sticky and retains its current title,
subtitle, icon, background, and close behavior. The close control receives a
minimum 44-by-44-pixel target.

The visual separation between the dialog header and the first form sections is
24 pixels on phones and 32 pixels at the small breakpoint and above. This
spacing is owned by the header's bottom margin so the form does not accumulate
multiple overlapping padding rules.

The modal remains vertically scrollable. Existing viewport height limits,
safe-area padding, landscape behavior, keyboard reachability, and form layout
are preserved.

## App-Wide Compliance Scope

The following user-visible surfaces are included:

- first-run goal selection and before/after feeling check-ins;
- the application header and phone bottom navigation;
- Practice home, recommendation actions, Configure Practice, active practice,
  set transitions, completion, stop, save, overwrite, and notification dialogs;
- Pulse Variability home, preparation, sensor choice, collection, results,
  trends, and resonance assessment surfaces;
- History, session deletion, and clear-history confirmation;
- Presets, preset loading, editing, and deletion confirmation;
- Analytics and chart controls;
- Help, its tab navigation, feedback/support details, local backup, restore, and
  related confirmations.

Charts and non-interactive visualizations are checked for viewport clipping but
do not need a 44-pixel target unless they expose an interactive control.

## Compliance Rules

Every enabled button, link, select, checkbox/radio choice row, and other
interactive control must expose a target at least 44 CSS pixels high and 44 CSS
pixels wide at touch viewports. Controls disabled by the current state are
included because they become interactive in another state.

Controls may retain smaller visible icons or text when padding supplies the
required target. Closely grouped targets must not overlap. Desktop-only
navigation follows the same 44-pixel minimum to keep responsive behavior
consistent.

Every fixed or full-screen surface must respect the top and bottom safe-area
insets. Dialog content must either fit or scroll vertically. Its primary and
dismiss actions must remain reachable at:

- 390 by 844 CSS pixels;
- 844 by 390 CSS pixels with a 20-pixel root font size; and
- 1440 by 900 CSS pixels.

No audited surface may produce document-level horizontal overflow, clip a
required control, place an enabled control behind persistent navigation, or
leave a visible modal with no reachable dismissal path.

## Accessibility and Responsive Behavior

- Safe-area inset handling remains active at the top of the sticky app header.
- Interactive controls have a minimum 44-pixel target in both axes at touch
  viewports.
- Focus order, keyboard activation, Escape handling, accessible names, and
  modal semantics remain unchanged.
- Spacing increases at existing Tailwind breakpoints rather than with
  device-specific user-agent checks.
- No fixed modal height is introduced.

## Verification

Tests are written before production changes. Component tests assert the
responsive spacing and minimum-target contracts on the application header,
desktop navigation, Configure Practice header, close button, shared button
styles, and any component-specific control that required correction.

Playwright captures and inspects:

1. the application header at a phone viewport;
2. the application header at a wide desktop viewport;
3. the open Configure Practice dialog at a phone viewport; and
4. the open Configure Practice dialog at a wide desktop viewport;
5. every primary tab at a phone viewport;
6. every reachable dialog and full-screen flow at a phone viewport; and
7. representative action-heavy dialogs in landscape with enlarged text.

The Playwright compliance helper evaluates visible interactive elements using
their rendered bounding boxes, reports controls below 44 by 44 pixels, checks
document-level horizontal overflow, and verifies that required dialog actions
can be scrolled into the viewport. Explicit exclusions are limited to hidden
elements, elements inside an inert subtree, and non-interactive chart graphics.
There is no blanket exemption for text buttons or desktop controls.

The final gate includes the focused component tests, the relevant end-to-end
tests, the existing family-session journey, type checking, and a production web
build. Screenshot review must confirm that the wider layout has visibly more
breathing room without causing clipped navigation, unreachable dialog controls,
excessive phone chrome, or regressions elsewhere in the app.

## Acceptance Criteria

1. The header is visually less cramped on wide screens.
2. All audited interactive controls expose at least 44-by-44-pixel targets.
3. The Configure Practice form no longer touches or visually crowds its title
   area.
4. Every audited dialog and full-screen surface remains usable and scrollable
   on phone and landscape viewports.
5. Every primary tab fits the touch viewport without document-level horizontal
   overflow or controls hidden behind persistent navigation.
6. The app-wide Playwright compliance audit completes with no unexplained
   exclusions or violations.
7. Existing navigation, modal interaction, safe-area handling, practice,
   pulse-variability, history, preset, analytics, and support behavior continue
   to pass their regression tests.
