# Contributing to Breath in Flow

Start from `main` and keep each pull request focused on one change. Include what changed, why, and how you checked it. For UI changes, include a screenshot; for a bug fix, add a regression test to the relevant existing suite.

## Local setup

Use a Node.js version allowed by `engines` in [`package.json`](package.json). Corepack selects the pinned pnpm version.

```bash
git clone https://github.com/doublesharp/breath-in-flow.git
cd breath-in-flow
corepack enable
pnpm install
pnpm dev
```

Open **http://localhost:7080**. Installation generates the Prisma client automatically. The dev command builds `packages/shared` before starting Vite. After editing shared code, rebuild it with `pnpm --filter @breath-in-flow/shared build`.

If Corepack is not available, install it using the [pnpm installation guide](https://pnpm.io/installation). Run the remaining commands from the repository root.

## Run on your phone

### Android

Install Android Studio, its Android SDK and Platform Tools, and Java 21. Set `ANDROID_HOME` to the SDK directory and `JAVA_HOME` to your JDK. The build script also detects the usual macOS and Linux SDK locations.

1. Enable **Developer options → USB debugging** on your phone.
2. Connect it by USB and accept the debugging prompt. Run `adb devices` from the Android SDK's `platform-tools` directory to confirm the connection.
3. Build and sync the app, then install it on the connected phone:

```bash
pnpm build:android
pnpm --filter @breath-in-flow/web exec cap run android --no-sync
```

Select your phone when Capacitor lists available targets. Run these commands again after making changes. The build also produces an installable APK in `dist/android/`.

To work in Android Studio:

```bash
pnpm --filter @breath-in-flow/web exec cap open android
```

See Android's [hardware-device setup](https://developer.android.com/studio/run/device) for USB drivers and connection help.

### iPhone

Use a Mac with Xcode and the iOS tooling required by the project's Capacitor version. Follow [Capacitor's environment setup](https://capacitorjs.com/docs/getting-started/environment-setup), including CocoaPods for this project's native dependencies.

```bash
pnpm build:ios
pnpm --filter @breath-in-flow/web exec cap open ios
```

1. Add your Apple account in **Xcode → Settings → Accounts**.
2. Connect and unlock your iPhone, then trust the Mac when prompted.
3. In Xcode, select the **App** target and open **Signing & Capabilities**. Enable **Automatically manage signing** and select your team. For a personal build, use a unique bundle identifier if Xcode asks for one.
4. Enable **Settings → Privacy & Security → Developer Mode** on the iPhone and follow the restart prompt.
5. Choose the phone as Xcode's run destination and click **Run**. If prompted to trust the developer, do so under **Settings → General → VPN & Device Management**.

After changing web code, run `pnpm build:ios` again, then click **Run** in Xcode. Personal Team installations expire; reconnect and run from Xcode to renew them. Keep personal signing changes out of your pull request.

Apple's [device setup guide](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices) covers pairing and signing.

### Preview web changes over Wi-Fi

Connect the computer and phone to the same network:

```bash
pnpm --filter @breath-in-flow/shared build
pnpm --filter @breath-in-flow/web dev --host 0.0.0.0
```

Open the **Network** URL printed by Vite on your phone. Use an installed native build for camera and motion testing; browser sensor APIs require a secure context.

## Check your changes

```bash
pnpm test             # Shared, database, web, and build-script tests
pnpm typecheck
pnpm lint
pnpm build
pnpm test:coverage
```

For browser flows and responsive layouts:

```bash
pnpm --filter @breath-in-flow/web exec playwright install chromium
pnpm test:e2e
```

Review screenshot differences before updating baselines. Keep existing coverage thresholds and test real behavior, including retries, cancellation, and storage failures. Native sensor changes also need a physical-device check; use the [device validation guide](docs/PULSE-VARIABILITY-DEVICE-VALIDATION.md).

Use TypeScript, Vue's Composition API, and the existing styles. Format changed files with `pnpm exec prettier --write <files>` and use commit messages such as `fix: preserve a paused session` or `feat: add a breathing preset`.

## Project layout

| Path                                       | What lives here                                                 |
| ------------------------------------------ | --------------------------------------------------------------- |
| `packages/web/src/components`              | Practice, presets, history, analytics, and Lab UI               |
| `packages/web/src/composables`             | Timer integration, preferences, and local persistence           |
| `packages/web/src/services`                | Sensors, audio, backup, and platform services                   |
| `packages/shared/src`                      | Schemas, breathing state machine, DSP, and variability analysis |
| `packages/database`                        | Prisma schema and database operations                           |
| `packages/web/android`, `packages/web/ios` | Native Capacitor projects                                       |
| `packages/web/electron`                    | Desktop shell                                                   |
| `scripts`, `.github/workflows`             | Build tooling and CI                                            |

The app stores routines and sessions in localStorage, and measurements in IndexedDB. A backend or database server is not needed to run it.

## Build and release

| Command              | Output                                         |
| -------------------- | ---------------------------------------------- |
| `pnpm build:web`     | Static site in `dist/web/`                     |
| `pnpm build:android` | Debug-signed APK in `dist/android/`            |
| `pnpm build:ios`     | Built web assets synced into the Xcode project |
| `pnpm build:mac`     | DMG and ZIP in `dist/mac/`                     |
| `pnpm build:win`     | Installer and portable EXE in `dist/win/`      |
| `pnpm build:linux`   | AppImage and DEB in `dist/linux/`              |

Desktop packaging uses the native tooling for the target platform. GitHub's [Build & Release workflow](.github/workflows/release.yml) builds desktop packages and Android APKs. Run it manually for development artifacts; pushing a `v*` tag also creates a draft release for review.

For a release, align the app version in the root and web `package.json`, `packages/shared/src/config.ts`, Android's `app/build.gradle`, and both configurations in the iOS Xcode project. Native build numbers use `major * 10000 + minor * 100 + patch`, with minor and patch at most 99. Shared and database package versions are independent. Check metadata with `bash scripts/tests/build-script.test.sh version` before tagging.

## Brand and voice assets

The logo source is [`packages/web/assets/logo.svg`](packages/web/assets/logo.svg). With [librsvg](https://gnome.pages.gitlab.gnome.org/librsvg/) installed, regenerate the favicon, launcher icons, and splash screens:

```bash
pnpm generate:icons
```

Bundled voice cues work offline. To regenerate them, install FFmpeg and run `pnpm generate:voices`. This downloads the pinned speech model for local generation and is separate from normal app builds.
