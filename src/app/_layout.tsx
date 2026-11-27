import { useFonts } from 'expo-font';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { Text } from '../ui/Text';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDb } from '../db';
import { ensureFsrsConfig, loadPreferences } from '../db/repo';
import { initSpeech } from '../services/speech';
import { settingsFromPrefs, useApp } from '../state/store';
import { useT } from '../ui/i18n';
import { refreshDueAutoDictionaries } from '../db/autoDict';
import { getDictionary } from '../dict';
import { fonts, useTheme } from '../ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/* eslint-disable @typescript-eslint/no-require-imports */
const FONT_FILES = {
  [fonts.regular]: require('../../assets/fonts/Inter-Regular.ttf'),
  [fonts.medium]: require('../../assets/fonts/Inter-Medium.ttf'),
  [fonts.semibold]: require('../../assets/fonts/Inter-SemiBold.ttf'),
  [fonts.bold]: require('../../assets/fonts/Inter-Bold.ttf'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

export default function RootLayout() {
  const t = useTheme();
  // Bundled fonts: they load from the app itself, offline. If loading fails the system font is used.
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const tr = useT();
  const dark = useColorScheme() === 'dark';
  const setSettings = useApp((s) => s.setSettings);
  const [state, setState] = useState<'loading' | 'ready' | string>('loading');

  useEffect(() => {
    getDb()
      .then(async (db) => {
        await ensureFsrsConfig(db);
        return loadPreferences(db);
      })
      .then((prefs) => {
        setSettings(settingsFromPrefs(prefs));
        setState('ready');
        initSpeech();
        // Weekly word sets get new words once a week (only words never studied are replaced).
        Promise.all([getDb(), getDictionary()])
          .then(([db, dict]) => refreshDueAutoDictionaries(db, dict))
          .then((n) => n > 0 && useApp.getState().touch())
          .catch(() => {});
      })
      .catch((e: unknown) => setState(e instanceof Error ? e.message : String(e)))
      .finally(() => SplashScreen.hideAsync().catch(() => {}));
  }, [setSettings]);

  if (state === 'loading' || (!fontsLoaded && !fontError)) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (state !== 'ready') {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 32, justifyContent: 'center' }}>
        <Text style={{ color: t.danger, fontSize: 18, fontWeight: '700' }}>{tr('error')}</Text>
        <Text style={{ color: t.text, marginTop: 8 }}>{state}</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: t.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: tr('settings') }} />
        <Stack.Screen name="free" options={{ title: tr('freeTitle') }} />
        <Stack.Screen name="listen" options={{ title: tr('hardListenAll') }} />
        <Stack.Screen name="ink-lab" options={{ title: tr('inkLabTitle') }} />
        <Stack.Screen name="dict-sample" options={{ title: tr('sampleTitle') }} />
        <Stack.Screen name="reference" options={{ title: tr('tabTranslate') }} />
        {/* Former tabs, now ordinary screens at their old addresses. */}
        <Stack.Screen name="translate" options={{ title: tr('tabTranslate') }} />
        <Stack.Screen name="practice" options={{ title: tr('tabPractice') }} />
        <Stack.Screen name="study" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
