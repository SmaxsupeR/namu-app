// Web only: browsers may clear a site's data, so the home screen asks to install the app
// (iPhone: Share → Add to Home Screen) and reminds to make a backup now and then.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { IconBtn } from './components';
import { useT } from './i18n';
import { ListGroup, ListRow } from './rows';
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

  if (Platform.OS !== 'web' || (!installHint && !backupHint)) return null;
  return (
    <ListGroup>
      {installHint ? (
        <ListRow
          icon="download"
          title={tr('webInstallTitle')}
          subtitle={isIos() ? tr('webInstallIosShort') : tr('webInstallOtherShort')}
          chevron={false}
          trailing={
            <IconBtn
              name="x"
              label={tr('webHintDismiss')}
              color={t.textDim}
              size={18}
              onPress={() => {
                write(DISMISS_KEY, '1');
                setInstallHint(false);
              }}
            />
          }
        />
      ) : null}
      {backupHint ? <ListRow icon="save" iconColor={t.warn} title={tr('webBackupTitle')} subtitle={tr('webBackupShort')} onPress={() => router.push('/settings')} /> : null}
    </ListGroup>
  );
}


