# Bryars A.I. 0.1 — merge note

Merged: the Brod chat shell (contract + chat store + attachments) and the Aladaz content (Mastercore parts 1–5, teaching, testimony, timeline, theology, physics, vault-set), plus the GitHub→APK guide from the Tutor, and THE SEAL book as library content.

## Decisions applied
- Brod renamed **Bryars A.I. 0.1**. Multi-file structure kept; Aladaz content loaded in as the core.
- Private vault layers kept (Sealed, Family). They stay on-device and are never sent to a model.
- Personal names replaced with titles: **the Father**, **the Daughter**, **the Fiancée**. "The Gauge" is reserved for the renamed title. The nickname and pronunciation rule were dropped with the name. A personal GitHub handle in `media.md` was replaced with a generic placeholder.
- "Bryar" is the voice inside the app; "Briar" spellings were normalised to "Bryar".
- File-name typos fixed: `patriarchal-mirrors.md`, `eschatology-and-court.md`, `physics-and-cosmos.md`. `rules.txt` became `rules.md`.
- The two different `brod-chat-store.js` copies were reconciled into one `bryars-chat-store.js` (attachments version + the longer error messages).

## Fixed while merging
- Brod's `buildHistory` dropped the user's newest message before sending to the model; the merged version keeps it.
- Brod exported chats with a download link, which a WebView cannot save; export now shows the text to copy.

## Not merged yet (needs the real source files)
Video Studio, the vault page, the portal index, the USB page (its button only shows an alert), and the Kotlin timeline calculator. The Tutor's AI-powered tabs were left out; only its GitHub→APK steps are in the Guide tab.

## Open
The word "cross" appears in some content (e.g. the 5,880 "cross" point). It was not changed; check the context if the "no crosses" rule matters there.
