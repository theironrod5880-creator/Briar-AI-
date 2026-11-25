# Security posture — Bryars A.I. 0.1

Private sideload app. Not a security-reviewed production system.

## What is true

- **Storage:** chats, settings, the Sealed layer and the Family entry live in the app's WebView `localStorage` / IndexedDB, on this device only.
- **Core Mode is offline.** No request leaves the device.
- **Connected Mode is not offline.** If you add an API key, each message sends the Mastercore plus up to the last 12 messages of the current chat to the service you chose (Google Gemini or an OpenAI-compatible endpoint). The Sealed and Family text is never included.
- **No server, no open port.** Files are served to the WebView from inside the APK.
- **Backups off.** `allowBackup` is false, so Android does not copy the app's data into cloud backups.
- **Permissions:** Internet; microphone and camera only when you tap record.
- **Export** shows chats on screen to copy; sealed messages are redacted. The Sealed and Family text is not part of the export.

## What is NOT true (do not assume)

- **No encryption at rest.** Anyone who can open the phone and this app can read it.
- **The APK is not secret.** Anything bundled in it (the Mastercore and library files) can be unzipped by anyone who has the APK. Keep it private. Never put Sealed or Family text in the bundled files — type it into the app instead.
- **API key is stored in plain text** in the app's storage.
- **Signing key:** the key in `app/bryars.jks` only makes updates install over older builds. Its password is in `app/build.gradle`. Keep the GitHub repo **private**.
- **No recovery.** Uninstalling the app or clearing its data erases the chats, Sealed and Family text.

## The one rule

Never claim a security feature is implemented unless it is implemented and tested.
