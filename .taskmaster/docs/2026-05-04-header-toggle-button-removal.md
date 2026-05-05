# Header-toggle button — research notes & post-mortem

**Date:** 2026-05-04
**Outcome:** Removed the injected nav button. `toggleHeader()` remains accessible via menu (View → Toggle Header) and keyboard shortcut.

## Why we removed it

UniFi Protect's redesigned sidebar (e.g. on the "Beehive" console — class names `nav__bnl29xSM nav-vertical__bnl29xSM` inside a `navWrapper__bnl29xSM` shell) introduced two new realities that combine badly with our injected button:

1. The nav is structured as a Radix `ScrollArea` with a stable outer wrapper (`navWrapper__`), an inner `viewport__` scroll container, a top section UL (a sibling of the scroll-content div, NOT inside `<nav>`), a `<nav>` containing only the divider + bottom UL, and a `toggleDividerWrapper` whose `flex-grow: 1` pushes the bottom UL to the bottom of the viewport.
2. React rerenders the inner sections on navigation and background data refreshes, repeatedly stripping any element we inject into the inner tree.

After several attempted strategies (see below) we landed on a "works, but…" placement that pushed the bottom-section icons off the viewport edge and clobbered Protect's own divider-toggle button (the small `|->` divider that lets users move bottom items to the top). The cost of getting this button right kept growing while the value of the feature is debatable — `View → Toggle Header` and the keyboard shortcut already provide the same toggle.

User direction: remove the injected button entirely; keep the underlying `uiController.toggleHeader()`, the IPC plumbing, and the menu/keyboard entry points. If we ever want to bring it back, the notes below should let us skip the discovery cycle.

## DOM differences between Protect variants

### Old Protect ("Rednex NVR" reference console)

```
<viewport-or-page-container>
  <nav class="nav__ZljDoyET nav-auto__ZljDoyET nav-classic__ZljDoyET">
    <ul class="group__mrq0H5WB">…top items…</ul>
    <ul class="bottom-group group__mrq0H5WB" style="flex: 1 1 auto;">…bottom items…</ul>
  </nav>
</viewport-or-page-container>
```

- `<nav>` IS the visible sidebar; no separate wrapper.
- Bottom UL pushes itself to the bottom via its own `flex: 1 1 auto`.
- No built-in collapse/expand toggle.
- localStorage `portal:navigation:expanded` exists but is unused inside Protect on a single-product console.

### New Protect ("Beehive" reference console)

```
<div class="Nav__StyledNavigation-… navWrapper__bnl29xSM navWrapper-vertical__bnl29xSM navWrapper-vertical-dark__bnl29xSM">
  <div class="viewport__Dq31j3Bg viewport-dark" data-radix-scroll-area-viewport style="overflow: scroll;">
    <ul class="section__bnl29xSM section-vertical__bnl29xSM">…TOP items…</ul>
    <div data-radix-scroll-area-content style="min-width: fit-content;">
      <nav class="nav__bnl29xSM nav-vertical__bnl29xSM" data-uic-component="NavigationRoot">
        <hr class="divider__… toggleDivider__bnl29xSM">
        <ul class="section__bnl29xSM section-vertical__bnl29xSM">…BOTTOM items…</ul>
      </nav>
    </div>
  </div>
</div>
```

- The visible sidebar is `navWrapper__`, NOT `<nav>`. Hiding `<nav>` alone leaves the wrapper showing.
- The TOP UL is a sibling of the scroll-content div, OUTSIDE `<nav>`.
- `<nav>` contains only the divider + the BOTTOM UL.
- The `toggleDividerButton__` (the `|->` arrow) is the user-clickable bit of the divider — it lets users flip bottom items to the top via `localStorage['portal:navigation:expanded']`.
- The `toggleDividerWrapper__` has `flex-grow: 1` which is what keeps the bottom UL at the bottom.

### Class-name cheat sheet

| Concern                  | Old                                                                                | New                                                     |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Nav element classes      | `nav-auto__`, `nav-classic__`                                                      | `nav-vertical__` (no `nav-auto__`)                      |
| Outer wrapper            | n/a (nav is the wrapper)                                                           | `navWrapper__`                                          |
| Top section UL           | `group__`                                                                          | `section__` (lives outside `<nav>`)                     |
| Bottom section UL        | `bottom-group group__`                                                             | `section__` (no distinguishing class)                   |
| Built-in collapse toggle | none                                                                               | `toggleDividerButton__` inside `toggleDividerWrapper__` |
| User collapse state      | `portal:navigation:expanded` (localStorage, but cosmetic on Protect-only consoles) | same key, but now driven by the in-Protect button       |

## Strategies tried

### Strategy 1: `nav.prepend(button)` — original behaviour

- Pre-redesign behaviour. Worked in old Protect because the visible sidebar IS `<nav>`.
- In new Protect: button became the FIRST child of `<nav>`, ABOVE the divider but BELOW the top UL (since the top UL is a sibling outside `<nav>`). Button looked like an awkward stripe between the top icons and the bottom icons. Still inside `<nav>`, so still subject to inner rerenders that wiped it.

### Strategy 2: Inject as `<li class="custom-nav-li">` inside the top UL

- Worked visually for a single render — the button blended in as the first nav item.
- But: the `section__` UL uses `display: flex; justify-content: space-between` (or similar), so when our LI was added the existing icons spread out instead of bunching at the top.
- Also: top UL is wiped on every page navigation in new Protect, taking our LI with it. We had to add a periodic re-injection checker.

### Strategy 3: `topUl.before(button)` (sibling of top UL inside the viewport)

- Looked correct visually — short bar above the icons.
- Catastrophic during React rerenders: when the top UL was briefly removed, our `findTopUl` fell back to the BOTTOM UL inside `<nav>` (which still matched `[class*="section__"]`), and re-injected the button INSIDE `<nav>` before the bottom UL — mangling the bottom layout.
- Even after gating the fallback (only target outside-`<nav>` ULs in new Protect), the placement was still wrong because the top UL re-renders very frequently and the button kept disappearing.

### Strategy 4: `nav.before(button)` (previous sibling of `<nav>`)

- Stable target — `<nav>` exists in both variants.
- In new Protect, this places the button inside `<div data-radix-scroll-area-content>`, between the top UL and `<nav>`. Visually that's _between_ the two sections, not at the top. Looked fine on initial render but disappeared on rerender; on re-injection (10s later) the placement appeared "wrong" because the scroll-content div had been re-mounted and the button ended up in a different relative position.

### Strategy 5: `navWrapper.prepend(button)` — winner-ish

- Most stable target. Protect doesn't re-mount the navWrapper.
- BUT the navWrapper is `display: flex; flex-direction: row` by default, so the prepended button shared the width 50/50 with the viewport. Required a CSS override:
  ```css
  [class*='navWrapper__'] {
    flex-direction: column !important;
  }
  ```
  With that override, the button rendered correctly as a short bar at the top of the column.
- Two remaining problems killed this approach:
  1. **Bottom icons clipped.** With our button taking ~40px at the top of the column and the viewport taking the rest, the bottom UL (which `flex-grow: 1` pushes to the bottom of the viewport) ended up partially below the visible viewport edge. The very last icon was invisible.
  2. **Broke Protect's own divider toggle.** We had been hiding `[class*="toggleDividerButton"]` because we believed our own toggle replaced it, but that toggle is actually how users move bottom-section items between the bottom and the top — useful, separate functionality. Hiding it removed user control.

### Re-injection mechanisms tried

- **Periodic timer (single phase, 3s).** Worked but slow.
- **Two-phase timer (250ms aggressive for 10s, then 10s relaxed).** Aggressive phase only fired during initial settling; later disappearances waited up to 10s. User reported the visible 10-second gap.
- **MutationObserver on `document.body` (childList + subtree)** watching for removal of any of `header-toggle-button`, `sidebar-button`, `fullscreen-button`. React fires removal mutations when subtrees are re-mounted, so the observer reacts within the same microtask. Combined with a 10s safety-net timer this was robust.

The observer code (preload.ts) for reference if revisiting:

```ts
const TRACKED_BUTTON_IDS = ['header-toggle-button', 'sidebar-button', 'fullscreen-button']

function shouldReinject(mutations: MutationRecord[]): boolean {
  for (const m of mutations) {
    if (m.type !== 'childList') continue
    for (const node of Array.from(m.removedNodes)) {
      if (!(node instanceof HTMLElement)) continue
      if (TRACKED_BUTTON_IDS.includes(node.id)) return true
      for (const id of TRACKED_BUTTON_IDS) {
        if (node.querySelector(`#${id}`)) return true
      }
    }
  }
  return false
}
```

## What we kept

- `uiController.toggleHeader()` — the actual show/hide logic. Still wired to the `View → Toggle Header` menu item and the keyboard shortcut.
- `getNavRoot()` in `uiController.ts` — finds the navWrapper (new) or `<nav>` (old) for show/hide. Independent of the injected button and worth keeping for the nav hide/show fix.
- The `sidebar-button` in the header (which toggles the nav, not the header). Different concern, unaffected.

## What we removed

- `injectHeaderToggleButton()` / `createNavButton()` in `src/ts/modules/buttons.ts`.
- `headerToggleIcons` constant.
- `.custom-nav-button` CSS, `.custom-nav-li` CSS, the navWrapper `flex-direction: column` override, the `toggleDividerButton` hide rule, and the `nav-vertical__` / `section__` padding/gap rules (those last two were only relevant because we were injecting things into the new nav).
- The MutationObserver re-injection infrastructure in `preload.ts` (`tickReinject`, `setupButtonChecker`, `BUTTON_CHECKER_RELAXED_INTERVAL_MS`).
- Tests covering all of the above.

## If we ever revisit

Best path is probably **Strategy 5 + clipping fix** — the navWrapper is the one stable target, and forcing `flex-direction: column` does work. Two pieces to solve before re-enabling:

1. **Don't clip the bottom UL.** Either (a) shrink our button height significantly so the viewport keeps enough vertical space for the bottom items even when the column has a fixed top, or (b) inject INTO the viewport before the top UL but use a lightweight non-flex-item element (e.g. `position: sticky; top: 0`) that doesn't consume scroll height, or (c) accept the clipping and rely on the existing scroll behaviour to surface the bottom items.
2. **Don't hide Protect's `toggleDividerButton`.** Drop the `nav [class*="toggleDividerButton"] { display: none !important; }` rule. The two toggles solve different problems and can coexist.

A more invasive option: replace our injected nav-side toggle with a header-bar button (next to "Hide Nav" and "Fullscreen"). That's a "suicide toggle" (hides itself when you toggle the header) so it needs a recovery affordance — a transient popover, restore-via-menu hint, or auto-restore-on-hover gesture. Not better UX overall, just a different tradeoff.

## Reference: research artefacts

- Live web inspection (via Claude in Chrome): both Beehive (`D021F969E529…`) and Rednex (`602232666FF1…`) consoles, dashboard route. Their `unifi.ui.com` URLs render the same Protect layouts the local Electron viewer connects to.
- localStorage observation: `portal:navigation:expanded` exists in both consoles regardless of variant; only the new variant exposes a UI button to flip it.
- Screenshots were attached to the original conversation (2026-05-04) showing both stock Chrome rendering and the broken Protect Viewer rendering.
