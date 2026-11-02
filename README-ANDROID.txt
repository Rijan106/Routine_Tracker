ROUTINE TRACKER, ANDROID APP PROJECT
====================================

This folder builds a real Android app file (APK) of Routine Tracker.
The app has no internet permission, so it cannot send anything anywhere.
Your data stays on the phone. Backups are saved to the Downloads folder.
Needs Android 10 or newer.

Status: written but NOT test-built by me. If the build fails, copy the red error text
from GitHub and send it to me. Most failures are one-line fixes.

GET THE APK WITHOUT ANDROID STUDIO (needs a computer once)
----------------------------------------------------------
1. Make a free account at github.com and sign in.
2. Click the + at the top right, then "New repository". Name it routine-tracker.
   Choose PRIVATE (the folder contains the signing key). Click "Create repository".
3. Click "uploading an existing file". On your computer, open this folder and drag
   EVERYTHING inside it into the page, including the ".github" folder.
   If you cannot see ".github" (Mac: press Command+Shift+. in Finder), do step 3b instead.
   Click "Commit changes".
3b. Only if .github was missing: in the repository click "Add file", "Create new file".
   In the name box type:  .github/workflows/build.yml
   Paste the contents of build.yml from this folder, then "Commit changes".
4. Click the "Actions" tab. If asked, allow workflows. Open "Build APK" and click
   "Run workflow" (it also starts by itself after step 3). Wait about 5 minutes for a green tick.
5. Click the finished run, scroll to "Artifacts", and download "routine-tracker-apk".
   It is a zip. Unzip it to get app-release.apk.
6. Send app-release.apk to your phone (USB, email to yourself, or Drive).
7. On the phone open the file. Android asks to allow installing from this source. Allow it for
   that one app (Files, Chrome or Drive), then tap Install.

UPDATING LATER
--------------
Keep the same repository and the same release.keystore, so a new APK installs over the old one
and keeps your data. Raise versionCode in app/build.gradle by 1 for each new APK.
Do not uninstall the old app before updating, or its data is deleted. Make a backup first.

BUILD WITH ANDROID STUDIO INSTEAD
---------------------------------
Open this folder in Android Studio, then Build > Generate Signed App Bundle or APK > APK >
choose release.keystore (password routine-tracker, alias routine, key password routine-tracker).

WHAT IS DIFFERENT FROM THE WEB VERSION
--------------------------------------
- In-app alarms and the notification center work while the app is open. Phone notifications are not
  available in this app file. For alerts with the app closed, use Settings, Alarms and alerts,
  Create calendar file. It is saved to Downloads; open it to add the events to your calendar.
- No online updates. A new version means installing a new APK.
