// "Dictionary audio" card: download the pre-made recordings of all dictionary words.
import { useEffect } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Text } from './Text';
import { dictAudioPack } from '../services/speech';
import { voiceKind, type VoiceId } from '../services/tts/voices';
import { cancelDictAudio, downloadDictAudio, refreshDictAudio, removeDictAudio, useDictAudio } from '../state/dictAudio';
import type { Settings } from '../state/store';
import { Bar, Body, Btn, Card } from './components';
import { useT } from './i18n';
import { useTheme } from './theme';

const mb = (b: number) => Math.round(b / 1048576);

export function DictAudioCard({ settings }: { settings: Settings }) {
  const t = useTheme();
  const tr = useT();
  const { installed, offer, progress, busy, error } = useDictAudio();
  useEffect(() => {
    refreshDictAudio();
  }, []);
  if (!dictAudioPack || settings.ttsEngine === 'system' || (!offer && !installed)) return null;
  const voice = (installed ?? offer)!.voice;
  const voiceName = (() => {
    const k = voiceKind(voice as VoiceId);
    return tr(k.female ? 'voiceFemale' : 'voiceMale', { n: k.n });
  })();
  const otherVoice = settings.ttsVoice !== voice;
  const hasUpdate = !!installed && !!offer && offer.version > installed.version;

  const ask = () =>
    Alert.alert(tr('dictAudioTitle'), tr('dictAudioConsent', { mb: offer ? mb(offer.size) : '≈200', n: offer?.count ?? 40000, voice: voiceName }), [
      { text: tr('cancel'), style: 'cancel' },
      { text: tr('voiceDownload'), onPress: () => downloadDictAudio() },
    ]);
  const askRemove = () =>
    Alert.alert(tr('dictAudioTitle'), tr('dictAudioRemoveText'), [
      { text: tr('cancel'), style: 'cancel' },
      { text: tr('delete'), style: 'destructive', onPress: () => removeDictAudio() },
    ]);

  return (
    <Card>
      <Text style={[styles.title, { color: t.text }]}>{tr('dictAudioTitle')}</Text>
      {busy ? (
        <>
          <Body>{tr('voiceProgress', { done: mb(progress?.done ?? 0), total: mb(progress?.total ?? offer?.size ?? 0) })}</Body>
          <Bar value={progress && progress.total ? progress.done / progress.total : 0} />
          <Btn kind="soft" small icon="close" title={tr('cancel')} onPress={cancelDictAudio} />
        </>
      ) : installed ? (
        <>
          <Body dim>{tr('dictAudioInstalled', { n: installed.count, mb: mb(installed.bytes), voice: voiceName })}</Body>
          {otherVoice ? <Body style={{ color: t.warn }}>{tr('dictAudioOtherVoice', { voice: voiceName })}</Body> : null}
          {hasUpdate ? <Btn small icon="download" title={tr('voiceUpdate')} onPress={ask} /> : null}
          <Btn kind="danger" small icon="delete-outline" title={tr('delete')} onPress={askRemove} />
        </>
      ) : (
        <>
          <Body dim>{tr('dictAudioHint', { voice: voiceName })}</Body>
          <Btn icon="download" title={offer ? tr('voiceDownloadSize', { mb: mb(offer.size) }) : tr('voiceDownload')} onPress={ask} />
        </>
      )}
      {error ? <Body style={{ color: t.danger }}>{error === 'cancelled' ? tr('voiceCancelled') : error === 'no_space' ? tr('voiceErrSpace') : error === 'corrupt' ? tr('voiceErrCorrupt') : tr('voiceErrNetwork')}</Body> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '600' },
});
