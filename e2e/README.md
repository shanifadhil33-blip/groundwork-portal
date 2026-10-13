# Live e2e

Playwright checks of every connection between people, run against the live site with the demo logins.
Each run makes one private demo sandbox, switches persona inside it, and resets it at the end.

    cd e2e && npm ci && npx playwright test        # writes /workspace/qa/e2e/latest.md

E2E_BASE_URL points it at a preview. It is part of the pre ship gate (scripts/pre-ship-gate.sh).
