# Book Tracker v4.9.11

v4.9.11 final fix: sample notice now reliably disappears after sample deletion. The notice uses an explicit `[hidden]` CSS rule because the normal `.demo-global{display:flex}` rule otherwise overrides the browser's hidden presentation.

Sample data remains development/prototype-only via DEMO_ENABLED. User-registered sample records retain demo state and are removed together with sample metadata when samples are deleted.
