# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Build the Android APK

1. Install Node.js and Android Studio.
2. `npm install`
3. `npx cap add android` then `npx cap sync android`
4. `npx cap open android` → in Android Studio: Build > Build APK(s). The APK is in `android/app/build/outputs/apk/debug/`.
   The app loads the published site, so publish changes first; no rebuild is needed for updates.
