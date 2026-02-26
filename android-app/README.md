# Our Android app (Inbound Lookup)

This is **our Android app**. It detects **incoming calls** on your Android phone, looks up the caller’s number in your **published dialer app’s** contact spreadsheets (same data as the dashboard “Phone number lookup”), and shows you the contact’s name and address on screen.

## How it works

1. You install the APK and open the app.
2. You set **Published app URL** to your live dialer (e.g. `https://your-app.up.railway.app`) and optionally an **API key** if you set `INBOUND_LOOKUP_API_KEY` on the server.
3. When a call comes in, the app sends the number to `POST /api/webhook/inbound-lookup` on that URL and displays the result (name, address, or “Not in any spreadsheet”).

## Building the APK

- **Option A – Android Studio**  
  Open the `android-app` folder in Android Studio, then **Build → Build Bundle(s) / APK(s) → Build APK(s)**. The APK will be in `app/build/outputs/apk/debug/`.

- **Option B – Command line**  
  From the `android-app` directory (with Android SDK and JDK 17 installed):

  ```bash
  ./gradlew assembleDebug
  ```

  APK: `app/build/outputs/apk/debug/app-debug.apk`

Install the APK on your device (enable “Install from unknown sources” for your file manager or browser if needed).

## Server setup (optional)

To restrict who can call the lookup endpoint, set an API key on the server:

1. In Railway (or your host), add a variable: **`INBOUND_LOOKUP_API_KEY`** = a long random string (e.g. `openssl rand -hex 24`).
2. In the Android app, open **Settings** and enter the same value in **API key**.

The app sends it as the **`X-API-Key`** header (and in the JSON body as `apiKey`). If you don’t set `INBOUND_LOOKUP_API_KEY` on the server, the endpoint stays open (anyone with the URL could look up numbers); the key is recommended for production.

## Permissions and Android 10+

- The app needs **Phone** and **Call log** (and **Notifications** on Android 13+) so it can see the incoming number.
- On **Android 10+**, privacy limits often hide the incoming number from normal apps. You may get “Incoming call but no number” in that case. Options:
  - Grant all requested permissions and try again.
  - On some devices, making the app the **Call screening** app (Settings → Apps → Default apps → Call screening) can allow it to receive the number. The app does not screen or block calls; it only looks up the number and shows the result.

## Data and privacy

- The app only sends the **incoming phone number** to your own server.
- Lookups use the same logic and data as the dashboard “Phone number lookup” (all uploaded spreadsheets on the published app).
