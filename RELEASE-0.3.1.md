# Adfirm Micro POS 0.3.1

The sign-in screen now connects to Adfirm automatically. The API settings form is removed, and old saved API addresses cannot redirect the app. If the service cannot be reached, sign-in shows a short connection message.

Version code 4 keeps the same debug signing certificate as 0.3.0, so pilot devices can install this APK over the previous debug APK. Keep pending sales synced or exported before changing devices or app signing keys.

Checks: TypeScript/Vite build, 68 backend tests, both browser workflow suites, isolated pilot startup, APK package/version/signature, and embedded frontend inspection. Browser tests include an old saved API address and confirm sign-in still reaches the intended server. Physical Android camera and native share behavior still need a real-device check.
