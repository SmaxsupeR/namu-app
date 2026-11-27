// Web only: browsers may clear a site's data, so the home screen asks to install the app
// (iPhone: Share → Add to Home Screen) and reminds to make a backup now and then.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { Body, Btn, Card, Row } from './components';
import { useT } from './i18n';
import { useTheme } from './theme';

const DISMISS_KEY = 'namu-install-hint-dismissed';
export const LAST_BACKUP_KEY = 'namu-last-backup';
const BACKUP_EVERY_MS = 14 * 86400000;

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage may be blocked: the hint shows again next time.
  }
}

/** Call after a backup was made. */
export function rememberBackup(): void {
  if (Platform.OS === 'web') write(LAST_BACKUP_KEY, String(Date.now()));
}

function isIos(): boolean {
  const ua = globalThis.navigator?.userAgent ?? '';
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && (globalThis.navigator?.maxTouchPoints ?? 0) > 1);
}
function isInstalled(): boolean {
  const nav = globalThis.navigator as Navigator & { standalone?: boolean };
  return !!nav?.standalone || !!globalThis.matchMedia?.('(display-mode: standalone)').matches;
}

export function WebHints({ hasWords }: { hasWords: boolean }) {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const [installHint, setInstallHint] = useState(false);
  const [backupHint, setBackupHint] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Ask the browser not to clear our data under storage pressure (granted silently or not at all).
    globalThis.navigator?.storage?.persist?.().catch(() => {});
    setInstallHint(!isInstalled() && read(DISMISS_KEY) !== '1');
    const last = Number(read(LAST_BACKUP_KEY) ?? 0);
    setBackupHint(hasWords && Date.now() - last > BACKUP_EVERY_MS);
  }, [hasWords]);

  if (Platform.OS !== 'web') return null;
  return (
    <>
      {installHint ? (
        <Card>
          <Text style={[styles.h, { color: t.text }]}>{tr('webInstallTitle')}</Text>
          <Body dim>{isIos() ? tr('webInstallIos') : tr('webInstallOther')}</Body>
          <Row>
            <Btn
              kind="ghost"
              small
              title={tr('webHintDismiss')}
              onPress={() => {
                write(DISMISS_KEY, '1');
                setInstallHint(false);
              }}
            />
          </Row>
        </Card>
      ) : null}
      {backupHint ? (
        <Card>
          <Text style={[styles.h, { color: t.text }]}>{tr('webBackupTitle')}</Text>
          <Body dim>{tr('webBackupText')}</Body>
          <Btn kind="soft" small icon="content-save-outline" title={tr('webBackupGo')} onPress={() => router.push('/settings')} />
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '700' },
});
