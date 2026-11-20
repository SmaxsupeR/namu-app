// Namu TTS Lab: an experimental, separate app for measuring Supertonic 3 on a real phone.
// It does not touch the main app or its text-to-speech.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { OnnxTts, type DeviceInfo, type Memory } from './modules/onnx-tts';
import { downloadCatalogPack, fetchCatalog, installedPacks, packPath, packSize, verifyPack, voicesOf, type CatalogPack, type PackInfo, type Progress } from './src/packs';
import { TEST_SET } from './src/testSet';

const C = { bg: '#F6F7F4', card: '#FFFFFF', text: '#17201B', dim: '#5F6B64', border: '#DFE4DD', primary: '#2F9E6E', soft: '#DDF3E8', danger: '#D64545' };
const mb = (b: number) => `${(b / 1e6).toFixed(0)} МБ`;
const BENCHMARK = { threads: 4, voice: 'F1', steps: 8, speed: 1.0 } as const;

function Chip({ label, on, onPress, disabled }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, on && s.chipOn, disabled && { opacity: 0.4 }]}>
      <Text style={[s.chipText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

function Btn({ title, onPress, disabled, kind = 'primary' }: { title: string; onPress: () => void; disabled?: boolean; kind?: 'primary' | 'soft' | 'danger' }) {
  const bg = { primary: C.primary, soft: C.soft, danger: '#FBE4E4' }[kind];
  const fg = { primary: '#fff', soft: C.primary, danger: C.danger }[kind];
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }]}>
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

function Lab() {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const stop = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [packId, setPackId] = useState<string | null>(null);
  type NativeModeResult = {
    loadMs: number;
    rtf: number;
    memoryAfterRounds: Memory;
    medianSynthMs: number;
    errors: string[];
    [key: string]: unknown;
  };
  const [dualReports, setDualReports] = useState<{ fast: NativeModeResult; light: NativeModeResult } | null>(null);
  const [dualStage, setDualStage] = useState<'fast' | 'light' | null>(null);
  const [dualCompleted, setDualCompleted] = useState(0);
  const [autoStatus, setAutoStatus] = useState<'idle' | 'running' | 'completed' | 'cancelled' | 'failed'>('idle');
  const [autoError, setAutoError] = useState<string | null>(null);
  const pendingTelegramReturn = useRef(false);
  const wasBackgrounded = useRef(false);
  const [log, setLog] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CatalogPack[] | null>(null);

  const note = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 40));
  const fail = (e: unknown) => {
    const err = e as { code?: string; message?: string };
    const msg = `${err.code ?? 'ERROR'}: ${err.message ?? String(e)}`;
    note(msg);
    Alert.alert('Ошибка', msg);
  };

  const refresh = useCallback(() => {
    const list = installedPacks();
    setPacks(list);
    setPackId((cur) => cur ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    OnnxTts.deviceInfo().then(setDevice).catch(fail);
    refresh();
    fetchCatalog()
      .then(setCatalog)
      .catch((e: Error) => {
        setCatalog([]);
        note(`Каталог пакетов недоступен (${e.message}). Без интернета работают уже скачанные пакеты.`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pack = packs.find((p) => p.id === packId) ?? null;

  const downloadFromCatalog = async (c: CatalogPack) => {
    stop.current = false;
    setBusy('download');
    try {
      const r = await downloadCatalogPack(c, setProgress, () => stop.current);
      note(r.ok ? `${c.name}: скачан и проверен` : `${c.name}: нет ${r.missing.length}, повреждено ${r.corrupt.length}`);
      refresh();
      setPackId(c.id);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const updateNativeBenchmark = useCallback(async () => {
    const raw = await OnnxTts.benchmarkStatus();
    const status = JSON.parse(raw) as {
      state: 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';
      done: number; total: number; label?: string;
      report?: { fast: NativeModeResult; light: NativeModeResult };
    };
    setAutoStatus(status.state);
    setDualStage(status.state === 'running' ? (status.done < 110 ? 'fast' : 'light') : null);
    setDualCompleted(status.state === 'completed' ? 2 : status.done >= 110 ? 1 : 0);
    setAutoError(status.state === 'failed' ? status.label ?? 'Ошибка бенчмарка' : null);
    setProgress(status.state === 'running' ? {
      file: status.label ?? 'Выполняется…', done: status.done, total: status.total,
    } : null);
    if (status.state === 'completed' && status.report) {
      setDualReports(status.report);
    }
    if (status.state !== 'running') {
      setBusy((old) => old === 'auto-bench' ? null : old);
    }
  }, []);

  useEffect(() => {
    updateNativeBenchmark().catch(() => {});
    const interval = setInterval(() => updateNativeBenchmark().catch(() => {}), 1500);
    return () => clearInterval(interval);
  }, [updateNativeBenchmark]);

  const autoBench = async () => {
    if (!pack || !device || busy || autoStatus === 'running') return;
    setBusy('auto-bench');
    setDualReports(null);
    setAutoError(null);
    setDualCompleted(0);
    setDualStage('fast');
    try {
      const chosenVoice = voicesOf(pack).includes(BENCHMARK.voice) ? BENCHMARK.voice : (voicesOf(pack)[0] ?? BENCHMARK.voice);
      const options = JSON.stringify({
        packPath: packPath(pack.id), packName: pack.name,
        threads: BENCHMARK.threads, voice: chosenVoice, steps: BENCHMARK.steps, speed: BENCHMARK.speed,
        items: TEST_SET.map(({ id, text }) => ({ id, text })),
      });
      await OnnxTts.startBenchmark(options);
      setAutoStatus('running');
      note('Запущен фоновый тест: быстрый → экономный');
    } catch (e) {
      setBusy(null);
      setDualStage(null);
      fail(e);
    }
  };

  const cancelAutoBench = () => {
    OnnxTts.cancelBenchmark();
    note('Запрошена остановка после текущего синтеза');
  };

  const suggestUninstall = () => {
    Alert.alert('Тестирование завершено',
      'Удалить Namu TTS Lab вместе со скачанными моделями и внутренними данными? Убедитесь, что отчёт уже отправлен.',
      [
        { text: 'Оставить', style: 'cancel' },
        { text: 'Перейти к удалению', style: 'destructive',
          onPress: () => { OnnxTts.requestUninstall().catch(fail); } },
      ]);
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && pendingTelegramReturn.current) wasBackgrounded.current = true;
      if (state === 'active' && pendingTelegramReturn.current && wasBackgrounded.current) {
        pendingTelegramReturn.current = false;
        wasBackgrounded.current = false;
        Alert.alert('Отчёт отправлен?', 'Удаляйте приложение только после того, как убедились, что файл namu-tts-report.json действительно отправлен в @Aadzen.', [
          { text: 'Пока нет', style: 'cancel' },
          { text: 'Да, отправлен', onPress: suggestUninstall },
        ]);
      }
    });
    return () => subscription.remove();
  });

  const shareDualReport = async () => {
    if (!dualReports) return;
    const json = JSON.stringify({
      schema: 'namu-tts-lab-dual-benchmark-v1',
      device,
      createdAt: new Date().toISOString(),
      fast: dualReports.fast,
      light: dualReports.light,
    }, null, 2);
    try {
      const file = new File(Paths.cache, 'namu-tts-report.json');
      if (file.exists) file.delete();
      file.create();
      file.write(json);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Системное меню отправки недоступно');

      // Android's ACTION_SEND has no reliable way to address an arbitrary
      // Telegram @username. Do not imply the attachment is pre-addressed.
      Alert.alert(
        'Отправить отчёт в @Aadzen',
        'В Telegram нужно выбрать чат @Aadzen. Android не позволяет автоматически прикрепить JSON к заранее выбранному чату.',
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Открыть чат @Aadzen', onPress: () => {
            Linking.openURL('https://t.me/Aadzen').catch(fail);
          } },
          { text: 'Отправить JSON-файл', onPress: () => {
            pendingTelegramReturn.current = true;
            Sharing.shareAsync(file.uri, {
              mimeType: 'application/json',
              dialogTitle: 'Выберите Telegram, затем чат @Aadzen',
              UTI: 'public.json',
            }).catch((e) => {
              pendingTelegramReturn.current = false;
              fail(e);
            });
          } },
        ],
      );
    } catch (e) {
      pendingTelegramReturn.current = false;
      fail(e);
    }
  };

  const disabled = busy !== null || autoStatus === 'running';

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.h1}>Namu TTS Lab</Text>
      <Text style={s.dim}>Установите тестовую модель, запустите проверку и отправьте готовый отчёт. Дополнительные настройки не нужны.</Text>

      <Text style={s.h2}>Устройство</Text>
      <View style={s.card}>
        {device ? (
          <>
            <Text style={s.text}>{`${device.manufacturer} ${device.model} · Android ${device.android} (SDK ${device.sdk})`}</Text>
            <Text style={s.dim}>{`${device.soc} · ${device.cores} ядер · ОЗУ ${(device.totalRamMb / 1024).toFixed(1)} ГБ (свободно ${(device.availRamMb / 1024).toFixed(1)}) · ${device.abis}`}</Text>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>

      <Text style={s.h2}>1. Подготовка модели</Text>
      <View style={s.card}>
        {packs.length === 0 ? <Text style={s.dim}>Для теста понадобится голосовой пакет. Выберите подготовленную модель ниже.</Text> : null}
        <View style={s.row}>
          {packs.map((p) => (
            <Chip key={p.id} label={`${p.name} · ${mb(packSize(p))}`} on={p.id === packId} onPress={() => setPackId(p.id)} disabled={disabled} />
          ))}
        </View>
        {progress && busy === 'download' ? <Text style={s.dim}>{progress.total ? `${progress.file}: ${mb(progress.done)} из ${mb(progress.total)}` : progress.file}</Text> : null}
        {catalog === null ? <Text style={s.dim}>Загружаю каталог пакетов…</Text> : null}
        {catalog?.filter((c) => !packs.some((p) => p.id === c.id)).map((c) => (
          <Btn key={c.id} title={`Установить модель «${c.name}» (${mb(c.size)})`} onPress={() => downloadFromCatalog(c)} disabled={disabled} />
        ))}
        {busy === 'download' ? <Btn title="Остановить скачивание" onPress={() => (stop.current = true)} kind="danger" /> : null}

      </View>

      <Text style={s.h2}>2. Тестирование</Text>
      <View style={s.card}>
        <Text style={s.text}>Быстрый → Экономный</Text>
        <Text style={s.dim}>Все параметры выставлены автоматически. Два режима пройдут одинаковые тесты, затем можно отправить результаты.</Text>
        <View style={s.row}>
          <View style={[s.modeCard, dualStage === 'fast' && s.modeActive]}>
            <Text style={s.text}>⚡ Быстрый</Text>
            <Text style={s.dim}>{dualReports ? `RTF ${dualReports.fast.rtf.toFixed(2)}` : dualCompleted >= 1 ? 'Готов' : dualStage === 'fast' ? 'Выполняется…' : 'Ожидает'}</Text>
          </View>
          <View style={[s.modeCard, dualStage === 'light' && s.modeActive]}>
            <Text style={s.text}>◉ Экономный</Text>
            <Text style={s.dim}>{dualReports ? `RTF ${dualReports.light.rtf.toFixed(2)}` : dualStage === 'light' ? 'Выполняется…' : 'Ожидает'}</Text>
          </View>
        </View>
        {autoError ? <Text style={[s.text, { color: C.danger }]}>{autoError}</Text> : null}
        {autoStatus === 'running' && progress ? (
          <View>
            <Text style={s.text}>{progress.file}</Text>
            <Text style={s.dim}>{`${Math.min(100, Math.round(100 * progress.done / Math.max(1, progress.total)))}% · ${dualCompleted}/2 режимов`}</Text>
            <View style={s.track}><View style={[s.fill, { width: `${Math.min(100, 100 * progress.done / Math.max(1, progress.total))}%` }]} /></View>
          </View>
        ) : null}
        <Btn title={autoStatus === 'running' ? 'Тестирование в фоне…' : 'Начать тестирование'} onPress={autoBench} disabled={disabled || !pack || !device} />
        {autoStatus === 'running' ? <Btn title="Остановить тест" onPress={cancelAutoBench} kind="danger" /> : null}
        {!pack ? <Text style={s.dim}>Сначала установите голосовой пакет из списка выше.</Text> : null}
        {dualReports ? (
          <>
            <Text style={s.text}>{`Быстрый: загрузка ${dualReports.fast.loadMs.toFixed(0)} мс · RTF ${dualReports.fast.rtf.toFixed(2)} · пик ${dualReports.fast.memoryAfterRounds.peakMb.toFixed(0)} МБ`}</Text>
            <Text style={s.text}>{`Экономный: загрузка ${dualReports.light.loadMs.toFixed(0)} мс · RTF ${dualReports.light.rtf.toFixed(2)} · пик ${dualReports.light.memoryAfterRounds.peakMb.toFixed(0)} МБ`}</Text>
            <Btn title="Отправить JSON-отчёт в @Aadzen" onPress={shareDualReport} disabled={disabled} kind="soft" />
            <Btn title="Удалить приложение и модели" onPress={suggestUninstall} disabled={disabled} kind="danger" />
          </>
        ) : null}
        <Text style={s.dim}>Android foreground service поддерживает работу после сворачивания. Открытие отчёта и прогресс обновятся при возвращении в приложение. Не выключайте процесс принудительно.</Text>
      </View>

      {autoError ? <View style={s.card}><Text style={s.dim}>{log.slice(0, 5).join('\n')}</Text></View> : null}
      <Text style={s.dim}>
        Модель: Supertonic 3 (Supertone Inc.), лицензия BigScience OpenRAIL-M. Запрещено использовать модель для выдачи себя за других, для вводящего в заблуждение контента без пометки, что он создан машиной, и для других целей из приложения A лицензии (файл LICENSE в пакете).
      </Text>
    </ScrollView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <Lab />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  h1: { fontSize: 26, fontWeight: '700', color: C.text },
  h2: { fontSize: 13, fontWeight: '700', color: C.dim, textTransform: 'uppercase', marginTop: 8 },
  text: { fontSize: 15, color: C.text },
  dim: { fontSize: 13, color: C.dim },
  small: { fontSize: 11, color: C.dim },
  card: { backgroundColor: C.card, borderColor: C.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 14, color: C.text },
  btn: { minHeight: 48, borderRadius: 14, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', flexGrow: 1 },
  btnText: { fontSize: 15, fontWeight: '600' },
  modeCard: { flex: 1, minWidth: 120, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, gap: 5 },
  modeActive: { borderColor: C.primary, backgroundColor: C.soft },
  track: { height: 8, borderRadius: 6, overflow: 'hidden', backgroundColor: C.border, marginTop: 8 },
  fill: { height: 8, backgroundColor: C.primary, borderRadius: 6 },
});
