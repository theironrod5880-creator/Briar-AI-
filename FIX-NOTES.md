# Bryar-A.I-0.1 — corrected layout (copies only, 2026-11-17)

Your repo and files are untouched. This folder is a corrected COPY of
everything in https://github.com/theironrod5880-creator/Bryar-A.I-0.1
(main, as of the Nov 16–17 uploads), rearranged so Gradle can find it.

## What was wrong

1. `settings.gradle` says `include ':app'`, but there was no `app/`
   folder — the Android files sat loose at the root. Gradle died in
   about 40 seconds on every push, before compiling anything.
2. The homepage was named `index (1).html` — a duplicate-download name
   from the phone. GitHub Pages only serves `index.html` at the root,
   so the site was a 404.

## What changed in this copy (nothing else)

- Android files moved into a real module, content untouched:
  `AndroidManifest.xml` → `app/src/main/AndroidManifest.xml`
  `MainActivity.java` → `app/src/main/java/app/bryars/ai/MainActivity.java`
  `ic_launcher.xml` → `app/src/main/res/drawable/ic_launcher.xml`
- Web files moved to where MainActivity looks for them
  (`assets/web/index.html`): `index (1).html` → `app/src/main/assets/web/index.html`,
  `styles.css` → `app/src/main/assets/web/styles.css`
- ` (1)` stripped from the `.md` file names (byte-identical files —
  checked against your local copies; e.g. teaching-time, vault-set,
  eschatology, theology match exactly).
- `.md` files placed under `app/src/main/assets/web/content/` the way
  `build-content.py` expects: Aladaz material in `content/aladaz/`,
  `the-seal-book.md` in `content/library/`. That placement is my
  reading of MERGE-NOTE.md, not your ruling — say so if it is wrong.
- `build-content.py` moved to `tools/build-content.py`, as its own
  instructions say (`python3 tools/build-content.py`), and run once:
  it generated `app/src/main/assets/web/core/bryars-content.js`
  (23 files, 113,113 bytes) straight from your `.md` files, verbatim.
- NEW file, the one thing the repo never had: `app/build.gradle`
  (application `app.bryars.ai`, compileSdk 34, minSdk 24,
  androidx.webkit 1.12.1 + androidx.core 1.13.1 — the two libraries
  MainActivity imports). No signing config added: there is no
  `bryars.jks` keystore in the repo, and a debug build does not need one.
- Every other file is in its same place, byte for byte. The full
  move/rename list with md5 checksums is in MANIFEST.json.

## What is STILL missing — the app will build, but not work, without these

`index.html` loads five scripts. Only one is now present:

- PRESENT: `core/bryars-content.js` (generated, see above)
- MISSING from the repo: `app.js`,
  `core/bryars-chat-store.js`, `core/bryars-conversation-contract.js`,
  `core/bryars-core-mode.js`

No `.js` file exists anywhere in the repo. They were most likely in
`bryars-ai-0.1.zip`, which was deleted from the repo on Nov 16
(commit 7ef5640). If that zip is still in your phone's Downloads,
the four files are inside it — upload those four into
`app/src/main/assets/web/` (app.js at the top, the other three in
`core/`) and the app has everything its homepage asks for. I did NOT
rebuild them from the older Brod files: those are different files
(`brod-*`, pre-merge), and substituting them would not be your work.

## Verification — plain

- `MainActivity.java` compiles clean here (javac, Android API 34,
  webkit 1.12.1, core 1.13.1). Manifest and icon XML parse.
- The layout now matches the workflow: `settings.gradle` includes
  `:app`, `app/build.gradle` exists, and the workflow's artifact path
  `app/build/outputs/apk/debug/app-debug.apk` is where the APK will land.
- I could NOT run the full Gradle build locally: the Gradle daemon
  in this workspace cannot talk to its own client — it fails the same
  way on an empty project (`gradle help`), so it is not the layout.
  The real check is GitHub Actions when this layout is pushed.

## How to use it (your step, phone)

Upload this folder's contents to the repo the way you uploaded
before, replacing the loose files at the root. Files are separate —
no zip. Then add the four missing `.js` files above, and push.
The Actions tab will run "Build APK"; green check means the APK is
in Artifacts.

## One flag, your call

README-START-HERE.md and SECURITY.md both say keep this repo
PRIVATE, but the repo is currently PUBLIC. I changed nothing — only
you can flip that switch in the repo's Settings.
