# Bryars A.I. 0.1 — start here (Android phone only)

You will: make a PRIVATE GitHub repo, upload one zip, paste one small file, tap one button, download your APK.

1. In Chrome, open github.com and sign in. Tap the + → New repository.
   Name it bryars-ai. Choose **Private**. Tap Create repository.
2. On the repo page tap **uploading an existing file** (or Add file → Upload files).
   Choose the file **bryars-ai-0.1.zip** (it is in your Downloads). Wait for it to finish.
   Tap **Commit changes**.
3. Tap Add file → **Create new file**. In the name box type exactly:
   `.github/workflows/build-apk.yml`
   (typing the slashes makes the folders). Paste the text from `docs/build-apk.yml.txt`
   (or from the chat message) into the big box. Tap **Commit changes**.
4. Tap the **Actions** tab. A run called "Build APK" starts by itself. Yellow dot = working
   (about 5–10 minutes). Green check = done. Red X = tap it, tap the failed step, and send me the last 20 lines.
5. Tap the finished run. Scroll to **Artifacts**. Tap **bryars-ai-debug-apk** to download.
6. Open your Files app → Downloads → unzip it → tap **app-debug.apk** → Install.
   (Android may ask once to allow installs from Files/Chrome — allow it.)

Updating later: upload a new zip (same repo, replace the old one), commit — it builds again.
New builds install over the old one and keep your chats and notes, as long as the repo stays the same.

Keep the repo PRIVATE. Uninstalling the app erases its chats and notes.
