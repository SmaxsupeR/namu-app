// "Speech problems" card: why recent words were spoken with the phone voice.
// Shown only when something went wrong; the log lives in memory and holds no words.
import { StyleSheet, Text } from 'react-native';
import { clearSpeechLog, useSpeechLog } from '../state/speechLog';
import { Body, Btn, Card } from './components';
import { useT, type StringKey } from './i18n';
import { useTheme } from './theme';

const EVENTS: Record<string, StringKey> = {
  'tts.play_failed': 'speechLogPlayFailed',
  'tts.check_failed': 'speechLogCheckFailed',
  'tts.not_in_pack': 'speechLogNotInPack',
  'tts.phone_voice': 'speechLogPhoneVoice',
};

const time = (ms: number) => new Date(ms).toTimeString().slice(0, 8);

export function SpeechLogCard() {
  const t = useTheme();
  const tr = useT();
  const entries = useSpeechLog((s) => s.entries);
  if (entries.length === 0) return null;
  return (
    <Card>
      <Text style={[styles.title, { color: t.text }]}>{tr('speechLogTitle')}</Text>
      <Body dim>{tr('speechLogHint')}</Body>
      {entries.slice(0, 15).map((e, i) => (
        <Text key={i} style={[styles.row, { color: t.textDim }]}>
          {time(e.at)} · {EVENTS[e.event] ? tr(EVENTS[e.event]) : e.event}
          {e.engine && e.event !== 'tts.phone_voice' ? ` (${e.engine})` : ''}
          {e.length !== undefined ? ` · ${tr('speechLogChars', { n: e.length })}` : ''}
          {e.error ? ` · ${e.error}` : ''}
        </Text>
      ))}
      <Btn kind="soft" small icon="broom" title={tr('speechLogClear')} onPress={clearSpeechLog} />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '600' },
  row: { fontSize: 12, fontFamily: 'monospace' },
});
