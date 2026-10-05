/**
 * Local config plugin: Android static app shortcuts (long-press app icon).
 *
 * Expo SDK 57 has no native `android.shortcuts` app.json field, so this plugin
 * writes everything into the prebuilt android project on every EAS build:
 *   - res/xml/shortcuts.xml          (4 shortcuts: radar / search / favorites / compare —
 *                                     Android hard-caps static shortcuts at 4; the journal
 *                                     route muweather://journal still works as a deep link)
 *   - res/values/shortcuts_strings.xml + one values-XX/ per app language
 *   - <meta-data android:name="android.app.shortcuts" .../> on MainActivity
 *
 * Shortcut labels are ANDROID string resources, not the app's JS i18n. The
 * Indonesian Android resource qualifier is `in`, NOT `id`.
 *
 * Intents carry both `android:data` (muweather://…) and explicit
 * targetPackage/targetClass so the launcher can only resolve them to our own
 * MainActivity (HomeScreen routes the path to the matching overlay).
 */
const {
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE = 'com.avithegod.muweather';
const ACTIVITY_CLASS = `${PACKAGE}.MainActivity`;

/** { dir: 'values' | 'values-XX', strings: { key: translated } } */
const LOCALE_STRINGS = [
  {
    dir: 'values',
    strings: {
      shortcut_radar: 'Radar',
      shortcut_radar_long: 'Open radar',
      shortcut_search: 'Search',
      shortcut_search_long: 'Search city',
      shortcut_favorites: 'Favorites',
      shortcut_favorites_long: 'My favorites',
      shortcut_compare: 'Compare',
      shortcut_compare_long: 'Compare cities',
    },
  },
  {
    dir: 'values-hi',
    strings: {
      shortcut_radar: 'रडार',
      shortcut_radar_long: 'रडार खोलें',
      shortcut_search: 'खोजें',
      shortcut_search_long: 'शहर खोजें',
      shortcut_favorites: 'पसंदीदा',
      shortcut_favorites_long: 'मेरे पसंदीदा',
      shortcut_compare: 'तुलना',
      shortcut_compare_long: 'शहरों की तुलना',
    },
  },
  {
    dir: 'values-bn',
    strings: {
      shortcut_radar: 'রাডার',
      shortcut_radar_long: 'রাডার খুলুন',
      shortcut_search: 'অনুসন্ধান',
      shortcut_search_long: 'শহর অনুসন্ধান',
      shortcut_favorites: 'প্রিয়',
      shortcut_favorites_long: 'আমার প্রিয়',
      shortcut_compare: 'তুলনা',
      shortcut_compare_long: 'শহর তুলনা',
    },
  },
  {
    dir: 'values-es',
    strings: {
      shortcut_radar: 'Radar',
      shortcut_radar_long: 'Abrir radar',
      shortcut_search: 'Buscar',
      shortcut_search_long: 'Buscar ciudad',
      shortcut_favorites: 'Favoritos',
      shortcut_favorites_long: 'Mis favoritos',
      shortcut_compare: 'Comparar',
      shortcut_compare_long: 'Comparar ciudades',
    },
  },
  {
    dir: 'values-fr',
    strings: {
      shortcut_radar: 'Radar',
      shortcut_radar_long: 'Ouvrir le radar',
      shortcut_search: 'Rechercher',
      shortcut_search_long: 'Rechercher une ville',
      shortcut_favorites: 'Favoris',
      shortcut_favorites_long: 'Mes favoris',
      shortcut_compare: 'Comparer',
      shortcut_compare_long: 'Comparer les villes',
    },
  },
  {
    dir: 'values-de',
    strings: {
      shortcut_radar: 'Radar',
      shortcut_radar_long: 'Radar öffnen',
      shortcut_search: 'Suchen',
      shortcut_search_long: 'Stadt suchen',
      shortcut_favorites: 'Favoriten',
      shortcut_favorites_long: 'Meine Favoriten',
      shortcut_compare: 'Vergleichen',
      shortcut_compare_long: 'Städte vergleichen',
    },
  },
  {
    dir: 'values-nl',
    strings: {
      shortcut_radar: 'Radar',
      shortcut_radar_long: 'Radar openen',
      shortcut_search: 'Zoeken',
      shortcut_search_long: 'Stad zoeken',
      shortcut_favorites: 'Favorieten',
      shortcut_favorites_long: 'Mijn favorieten',
      shortcut_compare: 'Vergelijken',
      shortcut_compare_long: 'Steden vergelijken',
    },
  },
  {
    dir: 'values-el',
    strings: {
      shortcut_radar: 'Ραντάρ',
      shortcut_radar_long: 'Άνοιγμα ραντάρ',
      shortcut_search: 'Αναζήτηση',
      shortcut_search_long: 'Αναζήτηση πόλης',
      shortcut_favorites: 'Αγαπημένα',
      shortcut_favorites_long: 'Τα αγαπημένα μου',
      shortcut_compare: 'Σύγκριση',
      shortcut_compare_long: 'Σύγκριση πόλεων',
    },
  },
  {
    dir: 'values-hu',
    strings: {
      shortcut_radar: 'Radar',
      shortcut_radar_long: 'Radar megnyitása',
      shortcut_search: 'Keresés',
      shortcut_search_long: 'Város keresése',
      shortcut_favorites: 'Kedvencek',
      shortcut_favorites_long: 'Kedvenceim',
      shortcut_compare: 'Összehasonlítás',
      shortcut_compare_long: 'Városok összehasonlítása',
    },
  },
  {
    dir: 'values-in',
    strings: {
      shortcut_radar: 'Radar',
      shortcut_radar_long: 'Buka radar',
      shortcut_search: 'Cari',
      shortcut_search_long: 'Cari kota',
      shortcut_favorites: 'Favorit',
      shortcut_favorites_long: 'Favorit saya',
      shortcut_compare: 'Bandingkan',
      shortcut_compare_long: 'Bandingkan kota',
    },
  },
  {
    dir: 'values-it',
    strings: {
      shortcut_radar: 'Radar',
      shortcut_radar_long: 'Apri radar',
      shortcut_search: 'Cerca',
      shortcut_search_long: 'Cerca città',
      shortcut_favorites: 'Preferiti',
      shortcut_favorites_long: 'I miei preferiti',
      shortcut_compare: 'Confronta',
      shortcut_compare_long: 'Confronta città',
    },
  },
  {
    dir: 'values-pt',
    strings: {
      shortcut_radar: 'Radar',
      shortcut_radar_long: 'Abrir radar',
      shortcut_search: 'Buscar',
      shortcut_search_long: 'Buscar cidade',
      shortcut_favorites: 'Favoritos',
      shortcut_favorites_long: 'Meus favoritos',
      shortcut_compare: 'Comparar',
      shortcut_compare_long: 'Comparar cidades',
    },
  },
  {
    dir: 'values-pl',
    strings: {
      shortcut_radar: 'Radar',
      shortcut_radar_long: 'Otwórz radar',
      shortcut_search: 'Szukaj',
      shortcut_search_long: 'Szukaj miasta',
      shortcut_favorites: 'Ulubione',
      shortcut_favorites_long: 'Moje ulubione',
      shortcut_compare: 'Porównaj',
      shortcut_compare_long: 'Porównaj miasta',
    },
  },
  {
    dir: 'values-tr',
    strings: {
      shortcut_radar: 'Radar',
      shortcut_radar_long: 'Radarı aç',
      shortcut_search: 'Ara',
      shortcut_search_long: 'Şehir ara',
      shortcut_favorites: 'Favoriler',
      shortcut_favorites_long: 'Favorilerim',
      shortcut_compare: 'Karşılaştır',
      shortcut_compare_long: 'Şehirleri karşılaştır',
    },
  },
];

const SHORTCUTS = [
  { id: 'radar', data: 'muweather://radar', short: 'shortcut_radar', long: 'shortcut_radar_long' },
  { id: 'search', data: 'muweather://search', short: 'shortcut_search', long: 'shortcut_search_long' },
  {
    id: 'favorites',
    data: 'muweather://favorites',
    short: 'shortcut_favorites',
    long: 'shortcut_favorites_long',
  },
  {
    id: 'compare',
    data: 'muweather://compare',
    short: 'shortcut_compare',
    long: 'shortcut_compare_long',
  },
];

function shortcutsXml() {
  const entries = SHORTCUTS.map(
    (s) => `  <shortcut
    android:shortcutId="${s.id}"
    android:enabled="true"
    android:icon="@mipmap/ic_launcher"
    android:shortcutShortLabel="@string/${s.short}"
    android:shortcutLongLabel="@string/${s.long}">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="${s.data}"
      android:targetPackage="${PACKAGE}"
      android:targetClass="${ACTIVITY_CLASS}" />
  </shortcut>`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${entries.join('\n')}
</shortcuts>
`;
}

function stringsXml(strings) {
  const entries = Object.entries(strings).map(
    ([key, value]) => `  <string name="${key}">${value}</string>`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
${entries.join('\n')}
</resources>
`;
}

function writeShortcutResources(projectRoot) {
  const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
  for (const locale of LOCALE_STRINGS) {
    const dir = path.join(resDir, locale.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'shortcuts_strings.xml'), stringsXml(locale.strings), 'utf8');
  }
  const xmlDir = path.join(resDir, 'xml');
  fs.mkdirSync(xmlDir, { recursive: true });
  fs.writeFileSync(path.join(xmlDir, 'shortcuts.xml'), shortcutsXml(), 'utf8');
}

const withShortcutsFiles = (config) => {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      writeShortcutResources(mod.modRequest.projectRoot);
      return mod;
    },
  ]);
};

const withShortcutsManifest = (config) => {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const application = manifest.manifest.application?.[0];
    const activity = application?.activity?.find((a) =>
      typeof a?.$?.['android:name'] === 'string' &&
      (a.$['android:name'] === '.MainActivity' || a.$['android:name'].endsWith('.MainActivity')),
    );
    if (activity) {
      const metaData = {
        $: {
          'android:name': 'android.app.shortcuts',
          'android:resource': '@xml/shortcuts',
        },
      };
      if (!Array.isArray(activity['meta-data'])) {
        activity['meta-data'] = [];
      }
      // Append (idempotent): skip when a shortcuts meta-data already exists.
      const exists = activity['meta-data'].some(
        (m) => m?.$?.['android:name'] === 'android.app.shortcuts',
      );
      if (!exists) {
        activity['meta-data'].push(metaData);
      }
    } else if (typeof console !== 'undefined') {
      console.warn('withAndroidShortcuts: MainActivity not found in manifest - shortcuts not wired.');
    }
    return mod;
  });
};

const withAndroidShortcuts = (config) => {
  config = withShortcutsFiles(config);
  config = withShortcutsManifest(config);
  return config;
};

module.exports = withAndroidShortcuts;
