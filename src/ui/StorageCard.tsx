// "Storage" card of the Speech settings: what Namu keeps on the phone and how to free it.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { audioCache, packChanged, synthQueue, voicePacks } from '../services/speech';
import { removeFullDict, useDictPack } from '../state/dictPack';
import { CACHE_LIMITS_MB, type Settings } from '../state/store';
import { refreshVoicePack, useVoicePack } from '../state/voicePack';
import { useDictAudio } from '../state/dictAudio';
import { Body, Btn, Card, Chip, Row } from './components';
import { useT } from './i18n';
import { space, useTheme } from './theme';

const mb = (b: number) => (b < 10 * 1048576 ? (b / 1048576).toFixed(1) : String(Math.round(b / 1048576)));

export function StorageCard({ settings, update }: { settings: Settings; update: <K extends keyof Settings>(key: K, value: Settings[K]) => void }) {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const { state } = useVoicePack();
  const { edition, offer } = useDictPack();
  const dictAudio = useDictAudio((s) => s.installed);
  const [cache, setCache] = useState<{ count: number; bytes: number } | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(() => {
    audioCache?.stats().then(setCache).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  const clearCache = () =>
    Alert.alert(tr('storageClearTitle'), tr('storageClearText'), [
      { text: tr('cancel'), style: 'cancel' },
      {
        text: tr('storageClear'),
        style: 'destructive',
        onPress: async () => {
          await audioCache?.clear();
          await synthQueue?.drop(3);
          refresh();
        },
      },
    ]);

  const verify = async () => {
    if (!voicePacks) return;
    setChecking(true);
    try {
      const bad = await voicePacks.verify();
      if (bad.length === 0) Alert.alert(tr('verifyTitle'), tr('verifyOk'));
      else
        Alert.alert(tr('verifyTitle'), tr('verifyBad', { files: bad.slice(0, 5).join(', ') }), [
          { text: tr('cancel'), style: 'cancel' },
          {
            text: tr('voiceRemove'),
            style: 'destructive',
            onPress: async () => {
              await voicePacks?.remove();
              await packChanged();
              await refreshVoicePack();
            },
          },
        ]);
    } finally {
      setChecking(false);
    }
  };

  const removeDict = () =>
    Alert.alert(tr('fullDictTitle'), tr('storageRemoveDictText'), [
      { text: tr('cancel'), style: 'cancel' },
      { text: tr('delete'), style: 'destructive', onPress: () => removeFullDict() },
    ]);

  const line = (label: string, value: string) => (
    <Row style={styles.line}>
      <Text style={[styles.flex, { color: t.text }]}>{label}</Text>
      <Text style={{ color: t.textDim }}>{value}</Text>
    </Row>
  );

  return (
    <Card>
      <Text style={[styles.title, { color: t.text }]}>{tr('storageTitle')}</Text>
      {state?.status === 'ready' ? line(tr('storageVoice'), `${mb(state.pack.bytes)} МБ`) : null}
      {audioCache ? line(tr('storageRecordings', { n: cache?.count ?? 0 }), `${mb(cache?.bytes ?? 0)} / ${settings.ttsCacheLimitMb} МБ`) : null}
      {dictAudio ? line(tr('dictAudioTitle'), `${mb(dictAudio.bytes)} МБ`) : null}
      {line(tr('storageDict'), edition === 'full' ? `${mb(offer?.unpackedSize ?? 70 * 1048576)} МБ` : '29 МБ')}
      {audioCache ? (
        <>
          <Text style={[styles.sub, { color: t.textDim }]}>{tr('storageLimit')}</Text>
          <View style={styles.chips}>
            {CACHE_LIMITS_MB.map((v) => (
              <Chip key={v} label={v >= 1000 ? `${v / 1000} ГБ` : `${v} МБ`} active={settings.ttsCacheLimitMb === v} onPress={() => update('ttsCacheLimitMb', v)} />
            ))}
          </View>
          <Body dim>{tr('storageLimitHint')}</Body>
          <Btn kind="ghost" small icon="broom" title={tr('storageClear')} disabled={!cache?.count} onPress={clearCache} />
        </>
      ) : null}
      {state?.status === 'ready' ? <Btn kind="ghost" small icon="shield-check-outline" title={checking ? tr('verifyRunning') : tr('verifyFiles')} disabled={checking} onPress={verify} /> : null}
      {edition === 'full' ? <Btn kind="ghost" small icon="delete-outline" title={tr('storageRemoveDict')} onPress={removeDict} /> : null}
      <Btn kind="ghost" small icon="file-certificate-outline" title={tr('licensesTitle')} onPress={() => router.push('/licenses')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: space.sm },
  line: { minHeight: 28 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
