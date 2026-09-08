# PDFluent — store metadata

This file used to hold a second copy of the App Store and Microsoft Store
listing fields. Two copies is one too many: by 2026-09 this one still priced the
editor as free only until a business used it, and pointed at a licence purchase
inside the app. There is no licence UI in any build and the editor is free for
everyone, commercial use included. The same copy promised "no telemetry" while
the app has opt-in crash and feedback reporting.

Neither store was ever filled in from this file. Both were filled in from the
dossiers, which carry the fields, the privacy answers and the reviewer notes
together, and which have tests holding them against the app:

- **Mac App Store** → [`store/mas/`](../store/mas/README.md)
- **Microsoft Store** → [`store/`](../store/README.md)

Put listing copy there, not here.
