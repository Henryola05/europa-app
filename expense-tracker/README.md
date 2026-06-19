# Europa

Europa is an offline-first expense tracking mobile app built with Expo React Native.

## Running the app with Expo Go

Install dependencies:

```bash
npm install
```

Start with Expo Go:

```bash
npm run start:go
```

If your phone cannot connect on the same network:

```bash
npm run start:tunnel
```

Then scan the QR code with Expo Go.

## EAS setup for later

Install EAS CLI:

```bash
npm install --global eas-cli
```

Log in:

```bash
eas login
```

Initialize EAS:

```bash
eas init
```

Build later:

```bash
eas build --platform android
eas build --platform ios
```
