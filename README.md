# 🚀 AJO Entertainment Ecosystem (AJO Phone & AJO TV)

Universal streaming ecosystem built with **React 19**, **Vite**, **Capacitor 7**, and **Hardware-Accelerated Hls.js / Video.js / Shaka Player Engines**.

---

## 📂 Project Architecture

```
├── AJOPHONE/                   # Mobile / Touch-Optimized App
│   ├── src/                    # React frontend, components, filters, players
│   │   ├── api/                # Catalog APIs, IPTV streams, OTA updates
│   │   ├── components/         # Mobile UI, Worldwide Filter Bar, ShortTV Player, Cast Remote
│   │   ├── hooks/              # Gesture navigation, orientation handlers
│   │   └── utils/              # Adaptive streaming engines, fallback resolvers
│   ├── android/                # Capacitor Android native project (SDK 34)
│   ├── capacitor.config.json   # Capacitor bundle config (com.pikashow.tv)
│   └── package.json            # Dependencies and build scripts
│
├── pikashow-tv/                # Android TV & Google TV 10-Foot D-Pad App
│   ├── src/                    # React frontend with 10-foot TV UI
│   │   ├── components/         # GoogleTVHeader, TV Focus Rails, EPG Guide, TV Player
│   │   ├── hooks/              # 2D Spatial Navigation (useSpatialNavigation.js)
│   │   └── api/                # Verified master HLS catalogs, live channels
│   ├── android/                # Android TV native project (Leanback banner enabled)
│   ├── capacitor.config.json   # Capacitor bundle config (com.pikashow.tv)
│   └── package.json            # Dependencies and build scripts
│
├── version.json                # Dual-source OTA Update manifest (version, release notes, APK URLs)
└── README.md                   # Documentation & Developer Guide
```

---

## ⚡ Key Features

1. **🌐 Worldwide Multi-Dimensional Filter Engine (`WorldwideFilterBar.jsx`)**:
   - Filter by **Country & Region** (India, Hollywood, Korea, Japan, UK, China, Nollywood, Europe).
   - Filter by **Audio Language** (Hindi, English, Tamil, Telugu, Malayalam, Kannada, etc.).
   - Filter by **Genre** and **Release Year** (2026 to Classics) + Sort by Popularity/Ratings.

2. **📱 ShortTV & Drama Shorts Binge Mode (`ShortTVView.jsx`)**:
   - MovieBox/TikTok-style vertical short drama player with multi-episode selector drawer (Ep 1 to 50+).
   - Auto-advancing playback, like, bookmark, and touch gesture navigation.

3. **📺 Google TV 10-Foot D-Pad Architecture (`GoogleTVHeader.jsx` & `useSpatialNavigation.js`)**:
   - Fully compatible with Fire TV, Android TV, Google TV remotes with 2D spatial focus glow and Android backstack.

4. **⚡ Netflix-Grade Adaptive Bitrate (ABR)**:
   - Hardware-accelerated `.m3u8` direct master streams with instant startup and automatic quality selection.

5. **🔄 1-Tap In-App OTA Software Updater (`otaUpdate.js`)**:
   - Checks `version.json` on app launch and allows seamless 1-tap download & install of newer APKs.

---

## 🛠️ Development & Building

### 1. Install Dependencies
```bash
# In AJOPHONE
cd AJOPHONE
npm install

# In pikashow-tv
cd ../pikashow-tv
npm install
```

### 2. Run Local Dev Servers
```bash
# Terminal 1: AJO Phone (http://localhost:5173)
cd AJOPHONE
npm run dev

# Terminal 2: AJO TV (http://localhost:5174)
cd pikashow-tv
npm run dev
```

### 3. Build Web Bundle & Sync to Android
```bash
# Build Phone
cd AJOPHONE
npm run build
npx cap sync

# Build TV
cd ../pikashow-tv
npm run build
npx cap sync
```

### 4. Build APKs with Gradle
```bash
# Build Phone APK
cd AJOPHONE/android
./gradlew assembleDebug

# Build TV APK
cd ../../pikashow-tv/android
./gradlew assembleDebug
```
Output APKs are located at `android/app/build/outputs/apk/debug/app-debug.apk`.
