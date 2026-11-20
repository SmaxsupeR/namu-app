// "Speech" section of the settings: which voice speaks, and the neural voice pack.
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { neuralSupported, previewNeural, speakKorean } from '../services/speech';
import type { EnginePreference } from '../services/tts/types';
import { VOICES, voiceKind, type VoiceId } from '../services/tts/voices';
import type { Settings } from '../state/store';
import { cancelVoicePack, downloadVoicePack, loadOffer, refreshVoicePack, removeVoicePack, useVoicePack } from '../state/voicePack';
import { Bar, Body, Btn, Card, Chip, Row } from './components';
import { useT, type StringKey } from './i18n';
import { space, useTheme } from './theme';

const SAMPLE = '안녕하세요. 만나서 반갑습니다.';
const mb = (bytes: number) => Math.round(bytes / 1048576);

const ERRORS: Record<string, StringKey> = {
  no_space: 'voiceErrSpace',
  corrupt: 'voiceErrCorrupt',
  network: 'voiceErrNetwork',
  bad_catalog: 'voiceErrCatalog',
  bad_manifest: 'voiceErrCatalog',
  mismatch: 'voiceErrCatalog',
  no_pack: 'voiceErrCatalog',
};

export function VoiceSettings({ settings, update }: { settings: Settings; update: <K extends keyof Settings>(key: K, value: Settings[K]) => void }) {
  const t = useTheme();
  const tr = useT();
  const { state, offerBytes, progress, error, busy } = useVoicePack();
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    refreshVoicePack();
    loadOffer();
  }, []);

  const engine: EnginePreference = settings.ttsEngine === 'system' ? 'system' : 'auto';
  const size = offerBytes ?? (state && state.status !== 'none' ? state.pack.bytes : null);

  const askDownload = () => {
    Alert.alert(tr('voiceConsentTitle'), tr('voiceConsentText', { mb: size ? mb(size) : '≈110' }), [
      { text: tr('cancel'), style: 'cancel' },
      { text: tr('voiceDownload'), onPress: () => downloadVoicePack() },
    ]);
  };

  const askRemove = () => {
    Alert.alert(tr('voiceRemoveTitle'), tr('voiceRemoveText'), [
      { text: tr('cancel'), style: 'cancel' },
      { text: tr('delete'), style: 'destructive', onPress: () => removeVoicePack() },
    ]);
  };

  const preview = async (voice?: VoiceId) => {
    if (voice) update('ttsVoice', voice);
    setPreviewing(true);
    // Let the new voice reach the store before the engine reads it.
    await new Promise((r) => setTimeout(r, 0));
    const ok = await previewNeural(SAMPLE);
    setPreviewing(false);
    if (!ok) Alert.alert(tr('voiceTitle'), tr('voiceUnavailable'));
  };

  const voiceLabel = (v: VoiceId) => {
    const k = voiceKind(v);
    return tr(k.female ? 'voiceFemale' : 'voiceMale', { n: k.n });
  };

  return (
    <>
      <Card>
        <Text style={[styles.label, { color: t.text }]}>{tr('voiceEngine')}</Text>
        <View style={styles.chips}>
          <Chip label={tr('voiceEngineAuto')} active={engine === 'auto'} onPress={() => update('ttsEngine', 'auto')} />
          <Chip label={tr('voiceEngineSystem')} active={engine === 'system'} onPress={() => update('ttsEngine', 'system')} />
        </View>
        <Body dim>{tr(engine === 'auto' ? 'voiceEngineAutoHint' : 'voiceEngineSystemHint')}</Body>
        <Btn kind="ghost" small icon="volume-high" title={tr('voiceTestSystem')} onPress={() => speakKorean(SAMPLE)} />
      </Card>

      <Card>
        <Text style={[styles.label, { color: t.text }]}>{tr('voiceNeural')}</Text>
        {!neuralSupported ? <Body dim>{tr('voiceNotSupported')}</Body> : null}

        {neuralSupported && busy === 'download' ? (
          <>
            <Body>{progress ? tr('voiceProgress', { done: mb(progress.done), total: mb(progress.total) }) : tr('voicePreparing')}</Body>
            <Bar value={progress && progress.total > 0 ? progress.done / progress.total : 0} />
            {progress?.phase === 'install' ? <Body dim>{tr('voiceInstalling')}</Body> : null}
            <Btn kind="soft" small icon="close" title={tr('cancel')} onPress={cancelVoicePack} />
            <Body dim>{tr('voiceResumeHint')}</Body>
          </>
        ) : null}

        {neuralSupported && !busy && state?.status === 'none' ? (
          <>
            <Body dim>{tr('voiceNeuralHint')}</Body>
            <Btn icon="download" title={size ? tr('voiceDownloadSize', { mb: mb(size) }) : tr('voiceDownload')} onPress={askDownload} />
          </>
        ) : null}

        {neuralSupported && !busy && state?.status === 'damaged' ? (
          <>
            <Body style={{ color: t.danger }}>{tr('voiceDamaged')}</Body>
            <Btn icon="download" title={tr('voiceRedownload')} onPress={askDownload} />
            <Btn kind="danger" small icon="delete-outline" title={tr('voiceRemove')} onPress={askRemove} />
          </>
        ) : null}

        {neuralSupported && state?.status === 'ready' && busy !== 'download' ? (
          <>
            <Body dim>{tr('voiceInstalled', { mb: mb(state.pack.bytes) })}</Body>
            <Text style={[styles.label, { color: t.text }]}>{tr('voiceChoose')}</Text>
            <View style={styles.chips}>
              {VOICES.filter((v) => state.pack.voices.includes(v)).map((v) => (
                <Chip key={v} label={voiceLabel(v)} active={settings.ttsVoice === v} onPress={() => preview(v)} />
              ))}
            </View>
            <Row>
              <Btn kind="soft" small icon="play" title={previewing ? tr('voicePreviewing') : tr('voicePreview')} disabled={previewing} onPress={() => preview()} />
              <Btn kind="danger" small icon="delete-outline" title={tr('voiceRemove')} disabled={busy !== null} onPress={askRemove} />
            </Row>
          </>
        ) : null}

        {error ? <Body style={{ color: t.danger }}>{error === 'cancelled' ? tr('voiceCancelled') : tr(ERRORS[error] ?? 'voiceErrNetwork')}</Body> : null}
      </Card>
      <Body dim>{tr('voiceLicense')}</Body>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
