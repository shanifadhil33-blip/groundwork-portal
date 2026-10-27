During the build freeze (until Nov 10 2026) skip live assistant QA (no real assistant or transcribe calls in live scripts) to save the free AI quota and Vercel usage. Cover the assistant with offline tests only.

Live assistant scripts under e2e and the agent cards Playwright spec are skipped by default. Set RUN_ASSISTANT_QA=1 explicitly to opt in after the freeze. Layout checks that do not send assistant messages or recordings can still run without this flag. The older browser speech check is also gated because it does not mock the transcription route.
