// Licences of the bundled and downloadable content.
import { Stack } from 'expo-router/stack';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { DICT_ATTRIBUTION } from '../dict/lookup';
import { voiceLicenseTexts } from '../services/speech';
import { Body, Btn, Card, Screen } from '../ui/components';
import { useT } from '../ui/i18n';
import { useTheme } from '../ui/theme';

export default function Licenses() {
  const t = useTheme();
  const tr = useT();
  const [voice, setVoice] = useState<{ license: string | null; notice: string | null } | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    voiceLicenseTexts().then(setVoice).catch(() => setVoice({ license: null, notice: null }));
  }, []);
  const mono = [styles.mono, { color: t.text }];
  return (
    <Screen>
      <Stack.Screen options={{ title: tr('licensesTitle') }} />
      <Card>
        <Text style={[styles.h, { color: t.text }]}>{tr('licVoiceTitle')}</Text>
        <Body>{tr('licVoiceText')}</Body>
        {voice?.notice ? <Text style={mono}>{voice.notice}</Text> : null}
        {voice?.license ? (
          <>
            <Btn kind="ghost" small icon={full ? 'chevron-up' : 'chevron-down'} title={full ? tr('less') : tr('licShowFull')} onPress={() => setFull((v) => !v)} />
            {full ? <Text style={mono}>{voice.license}</Text> : null}
          </>
        ) : (
          <Body dim>{tr('licVoiceNotInstalled')}</Body>
        )}
      </Card>
      <Card>
        <Text style={[styles.h, { color: t.text }]}>{tr('licDictTitle')}</Text>
        <Body>{tr('licDictText', { source: DICT_ATTRIBUTION })}</Body>
      </Card>
      <Card>
        <Text style={[styles.h, { color: t.text }]}>{tr('licSoftwareTitle')}</Text>
        <Body>{tr('licSoftwareText')}</Body>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '700' },
  mono: { fontSize: 12, fontFamily: 'monospace', lineHeight: 17 },
});
