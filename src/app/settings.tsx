import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../ui/Text';
import { getDb } from '../db';
import { exportBackup, parseBackup, restoreBackup, savePreference } from '../db/repo';
import { pickTextFile, shareTextFile, stamp } from '../services/files';
import { useApp, type Settings } from '../state/store';
import { Body, Btn, Card, Chip, IconBtn, Row, Screen, Section, SegmentedControl } from '../ui/components';
import { useT } from '../ui/i18n';
import { space, useTheme } from '../ui/theme';
import { VoiceSettings } from '../ui/VoiceSettings';
import { rememberBackup } from '../ui/WebHints';
import { InkCanvas } from '../../modules/namu-tts/InkCanvas';

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const tr = useT();
  const settings = useApp((s) => s.settings);
  const patchSettings = useApp((s) => s.patchSettings);
  const touch = useApp((s) => s.touch);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    patchSettings({ [key]: value } as Partial<Settings>);
    getDb()
      .then((db) => savePreference(db, key, JSON.stringify(value)))
      .catch((e: unknown) => Alert.alert(tr('error'), e instanceof Error ? e.message : String(e)));
  };

  const backup = async () => {
    try {
      const data = await exportBackup(await getDb());
      await shareTextFile(`namu-backup-${stamp()}.json`, JSON.stringify(data), 'application/json');
      rememberBackup();
    } catch (e) {
      Alert.alert(tr('error'), e instanceof Error ? e.message : String(e));
    }
  };

  const restore = async () => {
    let text: string;
    try {
      const file = await pickTextFile();
      if (!file) return;
      text = file.text;
    } catch {
      Alert.alert(tr('error'), tr('fileError'));
      return;
    }
    try {
      const n = await restoreBackup(await getDb(), parseBackup(text));
      touch();
      Alert.alert(tr('restore'), tr('restored', { n }));
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      Alert.alert(tr('error'), code === 'not_json' || code === 'not_backup' ? tr('restoreErrorFormat') : code === 'unsupported_version' ? tr('restoreErrorVersion') : tr('restoreError'));
    }
  };

  const stepper = (label: string, key: 'newPerDay' | 'maxReviews', step: number, min: number, max: number) => (
    <Row style={styles.between}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      <Row>
        <IconBtn name="minus-circle" label={`${label} −`} color={t.primary} onPress={() => update(key, Math.max(min, settings[key] - step))} />
        <Text style={[styles.value, { color: t.text }]}>{settings[key]}</Text>
        <IconBtn name="plus-circle" label={`${label} +`} color={t.primary} onPress={() => update(key, Math.min(max, settings[key] + step))} />
      </Row>
    </Row>
  );

  const toggle = (label: string, key: 'showRomanization' | 'strictSpacing' | 'autoSpeak' | 'detailedGrading', hint?: string) => (
    <View>
      <Row style={styles.between}>
        <Text style={[styles.label, { color: t.text }]}>{label}</Text>
        <Switch value={settings[key]} onValueChange={(v) => update(key, v)} trackColor={{ true: t.primary }} accessibilityLabel={label} />
      </Row>
      {hint ? <Body dim>{hint}</Body> : null}
    </View>
  );

  return (
    <Screen>
      <Section>{tr('language')}</Section>
      <View style={styles.chips}>
        <Chip label="Русский" active={settings.language === 'ru'} onPress={() => update('language', 'ru')} />
        <Chip label="English" active={settings.language === 'en'} onPress={() => update('language', 'en')} />
      </View>

      <Section>{tr('learning')}</Section>
      <Card>
        {stepper(tr('newPerDay'), 'newPerDay', 5, 0, 100)}
        {stepper(tr('maxReviews'), 'maxReviews', 10, 10, 500)}
        <Text style={[styles.label, { color: t.text }]}>{tr('retention')}</Text>
        <View style={styles.chips}>
          {[0.8, 0.85, 0.9, 0.95].map((r) => (
            <Chip key={r} label={`${Math.round(r * 100)}%`} active={settings.retention === r} onPress={() => update('retention', r)} />
          ))}
        </View>
        <Body dim>{tr('retentionHint')}</Body>
      </Card>
      <Card>
        <Text style={[styles.label, { color: t.text }]}>{tr('practiceHow')}</Text>
        <SegmentedControl
          value={settings.directions}
          onChange={(v) => update('directions', v)}
          options={[
            { value: 'both', label: tr('dirBothShort') },
            { value: 'ko_ru', label: tr('dirKoRu') },
            { value: 'ru_ko', label: tr('dirRuKo') },
          ]}
        />
        <Body dim>{tr(settings.directions === 'both' ? 'dirBothHint' : settings.directions === 'ko_ru' ? 'dirKoRuHint' : 'dirRuKoHint')}</Body>
        <Text style={[styles.label, { color: t.text }]}>{tr('answerMethod')}</Text>
        <SegmentedControl
          value={settings.answerMethod}
          onChange={(v) => update('answerMethod', v)}
          options={[
            { value: 'keyboard', label: tr('methodKeyboard') },
            { value: 'self_grade', label: tr('methodSelf') },
          ]}
        />
        <Body dim>{tr(settings.answerMethod === 'keyboard' ? 'methodKeyboardHint' : 'methodSelfHint')}</Body>
      </Card>
      <Card>
        {toggle(tr('showRomanization'), 'showRomanization', tr('showRomanizationHint'))}
        {toggle(tr('strictSpacing'), 'strictSpacing')}
        {toggle(tr('autoSpeak'), 'autoSpeak')}
        {toggle(tr('detailedGrading'), 'detailedGrading', tr('detailedGradingHint'))}
      </Card>

      {InkCanvas ? (
        <>
          <Section>{tr('inkLabEntry')}</Section>
          <Card>
            <Body dim>{tr('inkLabEntryHint')}</Body>
            <Btn icon="pen-tool" title={tr('inkLabOpen')} onPress={() => router.push('/ink-lab')} />
          </Card>
        </>
      ) : null}

      <Section>{tr('voiceTitle')}</Section>
      <VoiceSettings settings={settings} update={update} />

      <Section>{tr('data')}</Section>
      <Card>
        <Btn kind="soft" icon="save" title={tr('backup')} onPress={backup} />
        <Body dim>{tr('backupHint')}</Body>
        <Btn kind="soft" icon="rotate-ccw" title={tr('restore')} onPress={restore} />
        <Body dim>{tr('restoreHint')}</Body>
      </Card>
      <Body dim>{tr('dataNote')}</Body>

      <Section>{tr('about')}</Section>
      <Body dim>{tr('aboutText')}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between', minHeight: 44 },
  label: { fontSize: 16, flex: 1 },
  value: { fontSize: 17, fontWeight: '700', minWidth: 36, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
