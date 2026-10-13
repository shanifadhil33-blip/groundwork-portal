# Groundwork design system (v2, Oct 13 2026)

## What real products do (studied)
- ServiceTitan: dense left sidebar, top bar with global search; dispatch board and jobs as tables; status as colored text chip with dot; one brand blue, neutrals everywhere else; page title left with actions right, filters row under it.
- Jobber: left sidebar with plain text plus small icons, white content on very light gray canvas; "Work" lists are tables with status chips (Upcoming, Late, Action required) colored only by meaning; job detail = title row, key facts in a two column definition list, line items table, timeline at bottom.
- Housecall Pro: top level nav, job list rows with customer, address, time, status; status shown as filled chip; big readable 15 to 16px body for field use; mobile app is lists, never card grids.
- Linear: 1px borders, no shadows, list rows 40 to 44px with dividers, grouped by status headers, left aligned, restrained single accent.
- Stripe dashboard: page header (h1 24 to 28px, actions right), section headings 18px, tables with right aligned tabular numbers, definition lists for detail, color only for status.

## Tokens
- Type (Inter/system): display 28/34 600 (page h1 desktop), h1 phone 24/30, h2 18/26 600, h3 16/24 600, body 16/24 on all screens, secondary 14/20 (minimum anywhere), numbers tabular. Never below 14px. Never shrink text to look professional.
- Spacing: 4 8 12 16 24 32 48 64.
- Radius: 6 controls, 8 containers. No rounded-xl/2xl.
- Color: brand #1f5f5b (primary action, active nav, links). Neutrals: text #111816, text-2 #4a5451 (AA), border #dfe3e1, canvas #f7f8f7, surface #fff. Status only for meaning: success #1e7a46, warning #a15c00, danger #b42318, info #1d5fa8, neutral gray. Each status chip = tinted bg + dark text + dot.
- Elevation: none on cards; popovers/dialogs one soft shadow only.

## Layout
- Shell: left sidebar 240px desktop (brand, workspace, nav text 16px with 18px icons, account at bottom); phone: top bar 56px + bottom tab bar.
- Content max width 1200px, left aligned, padding 32 desktop / 16 phone.
- Page header: h1 left, primary action right, optional one line of meta (not a generic subtitle). No centered hero blocks in app.
- Data in tables (desktop) and divider lists (phone). No card grids for records. Containers: 1px border, 8px radius, white.
- No emoji, no decorative icons, no subtitle under every title.
