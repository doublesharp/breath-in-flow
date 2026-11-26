# App Store and Google Play submission

Publish `packages/web/public/privacy.html` at `https://breathinflow.app/privacy.html` before entering either store’s privacy policy URL. Verify that it opens over HTTPS without a login and that the bundled copy opens from **Help & Guide → Data → Read the privacy policy**.

## Apple App Store Connect

1. Under **App Privacy**, set the privacy policy URL and select **No, we do not collect data from this app**. The product page should show **Data Not Collected**. Verify the release build and all bundled SDKs before publishing the answers. [Apple’s App Privacy setup](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
2. Archive the App target in Xcode. Confirm that `PrivacyInfo.xcprivacy` is at the root of `App.app`, and generate the archive’s privacy report in Organizer. The app manifest declares no tracking or collected data and lists User Defaults (`CA92.1`), File Timestamp (`C617.1`), and Disk Space (`E174.1`). Verify the bundled SDK manifests, including Capacitor. [Apple’s manifest guidance](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk) · [Apple’s SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)
3. Under export compliance, verify that the uploaded build uses no non-exempt encryption. `Info.plist` declares `ITSAppUsesNonExemptEncryption = NO`. Review any encryption changes and destination-specific requirements before answering. [Apple’s export compliance guidance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance)
4. Under **App Information → Age Ratings → Set Up Age Ratings**, disclose **Health or Wellness Topics** for the guided routines and educational content. Answer the remaining questions based on the submitted build and use **Not Applicable** under **Age Categories and Override** for a general-audience submission. Confirm the resulting regional ratings before saving. [Apple’s age rating setup](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating) · [Age rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions)
5. Open the release version’s **App Review Information**. Provide the reviewer contact details, leave sign-in requirements off, and paste the notes below.

> Breath in Flow provides guided breathing for general wellness and relaxation. Pulse Variability is optional and estimates pulse and heartbeat timing on-device for personal trends. Breath in Flow is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. No account is required.
>
> Practice works without hardware permissions. Choose a starting goal, open Practice, tap Start Practice, and skip the optional check-in. Try Pause and Resume. To test the optional sensor flow, open Pulse Variability, select Camera, and tap Quick Check. The preparation screen and Cancel work without a sensor. To verify the unavailable-sensor path, tap Start and decline camera access, or try it on a device without a supported camera. Practice remains available. A live pulse result requires a compatible sensor and a usable signal. On a supported phone, allow access and follow the on-screen instructions.
>
> Privacy, safety, backup, and local data deletion are under Help & Guide → Data.

## Google Play Console

1. Under **Policy → App content**, enter the public privacy policy URL and complete **Data safety**. For this local-only build, select **No** when asked whether it collects or shares required user data types. Local sensor processing stays on-device. Backup sharing and feedback depend on explicit user actions and the user chooses the destination. Verify the release’s bundled SDKs and any separately shipped variants before submitting a single disclosure for the app. [Google Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469)
2. Under **App content → Health apps**, declare **Stress Management, Relaxation, Mental Acuity** for guided breathing and **Activity and Fitness** for optional pulse and practice tracking. In the feature description and the public store description, use the copy below. [Google Play’s Health apps form](https://support.google.com/googleplay/android-developer/answer/14738291) · [Google Play’s health policy](https://support.google.com/googleplay/android-developer/answer/18265346)
3. Complete **Target audience and content** and the **Content rating** questionnaire from the actual listing and app. In **App access**, state that features are available without a login and include the Practice and Pulse Variability test steps above.
4. Check the merged release manifest or Play’s device catalog. The camera, camera autofocus, flash, and accelerometer are optional features. Review the camera permission and confirm that devices without those features can install the app. [Android hardware feature filtering](https://developer.android.com/guide/topics/manifest/uses-feature-element)

> Breath in Flow offers guided breathing for general wellness and relaxation. Optional Pulse Variability checks estimate pulse and heartbeat timing on your device for personal trend tracking. Breath in Flow is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a healthcare professional for medical advice, diagnosis, or treatment.

### Build a signed Android App Bundle

Use the registered upload key for an existing Play listing. For a new listing, generate an upload key with the JDK and keep the keystore and passwords in secure storage. Set up Play App Signing when creating the first release. [Android app signing](https://developer.android.com/studio/publish/app-signing.html)

```sh
keytool -genkeypair -v -keystore /absolute/secure/path/breath-in-flow-upload.jks \
  -storetype JKS -alias breath-in-flow-upload -keyalg RSA -keysize 2048 -validity 10000
```

Populate the ignored file `packages/web/android/keystore.properties` with these four fields:

```properties
storeFile=/absolute/secure/path/breath-in-flow-upload.jks
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=breath-in-flow-upload
keyPassword=YOUR_KEY_PASSWORD
```

Alternatively, set `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` in the build environment through your secret store. Gradle prefers a complete environment set over the properties file. With neither set complete, the release bundle is unsigned and debug builds use the usual debug key.

Install the workspace dependencies and configure the Android SDK and JDK. For an update, set `ORG_GRADLE_PROJECT_appVersionCode` to a value above the last Play upload and `ORG_GRADLE_PROJECT_appVersionName` to the release version. Run from the repository root:

```sh
pnpm --filter @breath-in-flow/shared build
pnpm android:aab
jarsigner -verify -verbose -certs packages/web/android/app/build/outputs/bundle/release/app-release.aab
```

Confirm that verification reports a signed bundle and that the signer matches the upload certificate registered in Play Console. Upload the `.aab` to an internal testing release first. [Android command-line builds](https://developer.android.com/build/building-cmdline)

## Physical-device QA

- [ ] On an iPhone and an Android phone, install the actual TestFlight and Play internal builds. Launch offline, choose a goal, run Practice, and find the completed session in History.
- [ ] Start Practice with audio and voice guidance, press Home or lock the phone, and reopen. Confirm that timing and cues paused and that the session resumes only when you tap Resume. Repeat from a session already paused.
- [ ] Save a named preset. Use **Presets → Edit**, change the timing and name, and save. Confirm the original entry updates. Try **Use these settings** separately and confirm the saved preset stays as it was.
- [ ] In Pulse Variability, decline camera and motion access, confirm the explanation and recovery controls, and return to Practice. On supporting hardware, grant access and run a Quick Check. Confirm the camera and torch turn off after completion and cancellation, and revoke access through system settings before testing again.
- [ ] From **Help & Guide → Data**, open the privacy policy offline and return to the app. Check the hosted policy separately from a clean browser. Use VoiceOver and TalkBack to navigate the policy link and confirm that the erase dialog starts on Cancel.
- [ ] Create test sessions, a preset, a pulse reading, and preferences. Export a backup, cancel one erase attempt, then confirm it. Check the success message, empty History, Presets, and Lab, and reset preferences after relaunch. Restore the backup and check that the app remains usable.
- [ ] At a narrow device width and with large system text, check the preset controls, Data tab, and erase confirmation for wrapping, touch targets, and scrolling.
