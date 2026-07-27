# Responsive Header and Practice Modal Spacing Design

## Goal

Make the application header and Configure Practice dialog feel less cramped
while preserving usable space on phones, safe-area behavior, keyboard
reachability, and accessible touch targets.

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
- Do not redesign navigation, change labels, or alter practice behavior in this
  change.

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

## Accessibility and Responsive Behavior

- Safe-area inset handling remains active at the top of the sticky app header.
- Interactive controls have a minimum 44-pixel target in both axes.
- Focus order, keyboard activation, Escape handling, accessible names, and
  modal semantics remain unchanged.
- Spacing increases at existing Tailwind breakpoints rather than with
  device-specific user-agent checks.
- No fixed modal height is introduced.

## Verification

Tests are written before production changes. Component tests assert the
responsive spacing and minimum-target contracts on the application header,
desktop navigation, Configure Practice header, and close button.

Playwright captures and inspects:

1. the application header at a phone viewport;
2. the application header at a wide desktop viewport;
3. the open Configure Practice dialog at a phone viewport; and
4. the open Configure Practice dialog at a wide desktop viewport.

The final gate includes the focused component tests, the relevant end-to-end
tests, type checking, and a production web build. Screenshot review must confirm
that the wider layout has visibly more breathing room without causing clipped
navigation, unreachable dialog controls, or excessive phone chrome.

## Acceptance Criteria

1. The header is visually less cramped on wide screens.
2. Header navigation and icon-only controls expose at least 44-by-44-pixel
   interactive targets.
3. The Configure Practice form no longer touches or visually crowds its title
   area.
4. The dialog remains usable and scrollable on phone and landscape viewports.
5. Existing navigation, modal interaction, safe-area handling, and practice
   behavior continue to pass their regression tests.
