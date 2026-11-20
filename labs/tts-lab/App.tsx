// Namu TTS Lab: an experimental, separate app for measuring Supertonic 3 on a real phone.
// It does not touch the main app or its text-to-speech.
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { OnnxTts, type DeviceInfo, type LoadResult, type Memory, type SynthResult } from './modules/onnx-tts';
import { deletePack, downloadCatalogPack, fetchCatalog, installedPacks, packPath, packSize, verifyPack, voicesOf, type CatalogPack, type PackInfo, type Progress } from './src/packs';
import { TEST_SET } from './src/testSet';

const C = { bg: '#F6F7F4', card: '#FFFFFF', text: '#17201B', dim: '#5F6B64', border: '#DFE4DD', primary: '#2F9E6E', soft: '#DDF3E8', danger: '#D64545' };
const mb = (b: number) => `${(b / 1e6).toFixed(0)} МБ`;

interface ItemRun {
  id: string;
  text: string;
  totalMs: number[];
  audioSec: number;
  parts: { dpMs: number; encoderMs: number; flowMs: number; vocoderMs: number };
}

interface Report {
  app: string;
  date: string;
  device: DeviceInfo;
  pack: string;
  threads: number;
  foldWeights: boolean;
  voice: string;
  steps: number;
  speed: number;
  load: LoadResult;
  firstRequestMs: number;
  firstSoundMs: number | null;
  medianSynthMs: number;
  rtf: number;
  memoryAfterRound1: Memory;
  memoryAfterRounds: Memory;
  stability: { repeats: number; minMs: number; maxMs: number; medianMs: number; rssStartMb: number; rssEndMb: number };
  afterRelease: Memory;
  errors: string[];
  items: ItemRun[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

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
  const [threads, setThreads] = useState(4);
  const [fold, setFold] = useState(true);
  const [loaded, setLoaded] = useState<{ pack: string; threads: number; fold: boolean; load: LoadResult } | null>(null);
  const [voice, setVoice] = useState('F1');
  const [steps, setSteps] = useState(8);
  const [speed, setSpeed] = useState(1.0);
  const [last, setLast] = useState<Record<string, SynthResult>>({});
  const [mem, setMem] = useState<Memory | null>(null);
  const [report, setReport] = useState<Report | null>(null);
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
    OnnxTts.memory().then(setMem).catch(() => {});
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

  const verify = async () => {
    if (!pack) return;
    setBusy('verify');
    try {
      const v = await verifyPack(pack, (f) => setProgress({ file: f, done: 0, total: 0 }));
      note(v.ok ? `${pack.name}: все файлы целы` : `${pack.name}: нет ${v.missing.join(', ') || '—'}; повреждены ${v.corrupt.join(', ') || '—'}`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const remove = () => {
    if (!pack) return;
    Alert.alert('Удалить пакет?', pack.name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          if (loaded?.pack === pack.id) await release();
          deletePack(pack.id);
          setPackId(null);
          refresh();
        },
      },
    ]);
  };

  const load = async () => {
    if (!pack) return;
    setBusy('load');
    try {
      const r = await OnnxTts.load(packPath(pack.id), threads, fold);
      setLoaded({ pack: pack.id, threads, fold, load: r });
      setMem(r.after);
      const vs = voicesOf(pack);
      if (!vs.includes(voice)) setVoice(vs[0] ?? 'F1');
      note(`Загружено за ${r.loadMs.toFixed(0)} мс, память ${r.after.rssMb.toFixed(0)} МБ`);
    } catch (e) {
      setLoaded(null);
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const release = async () => {
    try {
      const m = await OnnxTts.release();
      setMem(m);
      setLoaded(null);
      note(`Модель выгружена, память ${m.rssMb.toFixed(0)} МБ`);
    } catch (e) {
      fail(e);
    }
  };

  const say = async (id: string, text: string) => {
    setBusy(id);
    try {
      const t0 = Date.now();
      const r = await OnnxTts.synth(text, voice, steps, speed, 42, true);
      const tap = Date.now() - t0;
      setLast((x) => ({ ...x, [id]: { ...r, playbackStartMs: r.playbackStartMs } }));
      setMem(r.memory);
      note(`${text}: синтез ${r.totalMs.toFixed(0)} мс, до звука ${tap} мс, речь ${r.audioSec.toFixed(2)} с`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const bench = async () => {
    if (!loaded || !device || !pack) return;
    setBusy('bench');
    const errors: string[] = [];
    const items: ItemRun[] = TEST_SET.map((t) => ({ id: t.id, text: t.text, totalMs: [], audioSec: 0, parts: { dpMs: 0, encoderMs: 0, flowMs: 0, vocoderMs: 0 } }));
    let firstRequestMs = 0;
    let memRound1: Memory | null = null;
    try {
      // Reload so that load time and peak memory belong to this run.
      const lr = await OnnxTts.load(packPath(pack.id), loaded.threads, loaded.fold);
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < TEST_SET.length; i++) {
          setProgress({ file: `круг ${round + 1}/3: ${TEST_SET[i].text}`, done: round * TEST_SET.length + i, total: 3 * TEST_SET.length + 20 });
          try {
            const r = await OnnxTts.synth(TEST_SET[i].text, voice, steps, speed, 1000 + i, false);
            if (round === 0 && i === 0) firstRequestMs = r.totalMs;
            items[i].totalMs.push(r.totalMs);
            items[i].audioSec = r.audioSec;
            if (round === 0) items[i].parts = { dpMs: r.dpMs, encoderMs: r.encoderMs, flowMs: r.flowMs, vocoderMs: r.vocoderMs };
          } catch (e) {
            errors.push(`${TEST_SET[i].id}: ${(e as Error).message}`);
          }
        }
        if (round === 0) memRound1 = await OnnxTts.memory();
      }
      const memRounds = await OnnxTts.memory();
      // Time to first sound for a short word: synthesis plus start of playback.
      const t0 = Date.now();
      const fs = await OnnxTts.synth('나무', voice, steps, speed, 7, true);
      // Tap-to-sound time: synthesis and the start of playback, as the learner would hear it.
      const firstSoundMs = Date.now() - t0;
      if (fs.playbackStartMs === null) errors.push('playback did not start');
      // Stability: the long sentence 20 times in a row.
      const rep: number[] = [];
      const rssStart = (await OnnxTts.memory()).rssMb;
      for (let k = 0; k < 20; k++) {
        setProgress({ file: `повтор ${k + 1}/20`, done: 3 * TEST_SET.length + k, total: 3 * TEST_SET.length + 20 });
        try {
          rep.push((await OnnxTts.synth(TEST_SET[27].text, voice, steps, speed, 5000 + k, false)).totalMs);
        } catch (e) {
          errors.push(`repeat ${k}: ${(e as Error).message}`);
        }
      }
      const rssEnd = (await OnnxTts.memory()).rssMb;
      const afterRelease = await OnnxTts.release();
      setLoaded(null);
      const totalSynth = items.reduce((n, it) => n + median(it.totalMs), 0);
      const totalAudio = items.reduce((n, it) => n + it.audioSec, 0);
      const r: Report = {
        app: 'Namu TTS Lab 0.1.1',
        date: new Date().toISOString(),
        device,
        pack: pack.name,
        threads: loaded.threads,
        foldWeights: loaded.fold,
        voice,
        steps,
        speed,
        load: lr,
        firstRequestMs,
        firstSoundMs,
        medianSynthMs: median(items.map((it) => median(it.totalMs))),
        rtf: totalSynth / 1000 / Math.max(totalAudio, 0.001),
        memoryAfterRound1: memRound1 as Memory,
        memoryAfterRounds: memRounds,
        stability: { repeats: rep.length, minMs: Math.min(...rep), maxMs: Math.max(...rep), medianMs: median(rep), rssStartMb: rssStart, rssEndMb: rssEnd },
        afterRelease,
        errors,
        items,
      };
      setReport(r);
      setMem(afterRelease);
      note(`Замер готов: RTF ${r.rtf.toFixed(2)}, пик ${memRounds.peakMb.toFixed(0)} МБ`);
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
      const chosenVoice = voicesOf(pack).includes(voice) ? voice : (voicesOf(pack)[0] ?? 'F1');
      const options = JSON.stringify({
        packPath: packPath(pack.id), packName: pack.name,
        threads, voice: chosenVoice, steps, speed,
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

  const shareDualReport = async () => {
    if (!dualReports) return;
    const json = JSON.stringify({
      schema: 'namu-tts-lab-dual-benchmark-v1',
      device, recipient: '@Aadzen',
      createdAt: new Date().toISOString(),
      fast: dualReports.fast, light: dualReports.light,
    }, null, 2);
    try {
      await Clipboard.setStringAsync(json);
      Alert.alert('Отчёт скопирован', 'Откроется чат @Aadzen в Telegram. Вставьте скопированный отчёт и подтвердите отправку.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Открыть @Aadzen', onPress: () => { Linking.openURL('https://t.me/Aadzen').then(suggestUninstall).catch(fail); } },
        { text: 'Поделиться…', onPress: () => { Share.share({ message: json }).then((r) => { if (r.action === Share.sharedAction) suggestUninstall(); }).catch(fail); } },
      ]);
    } catch (e) { fail(e); }
  };

  const shareReport = () => {
    if (!report) return;
    const json = JSON.stringify(report, null, 1);
    Clipboard.setStringAsync(json).catch(() => {});
    Share.share({ message: json }).catch(() => {});
  };

  const voices = pack ? voicesOf(pack) : [];
  const disabled = busy !== null;

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.h1}>Namu TTS Lab</Text>
      <Text style={s.dim}>Экспериментальная проверка Supertonic 3 на устройстве. Основное приложение не затрагивается. Голос синтезирован нейросетью.</Text>

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
        <Text style={s.dim}>{mem ? `Память приложения: ${mem.rssMb.toFixed(0)} МБ, пик ${mem.peakMb.toFixed(0)} МБ` : ''}</Text>
      </View>

      <Text style={s.h2}>Голосовые пакеты</Text>
      <View style={s.card}>
        {packs.length === 0 ? <Text style={s.dim}>Для теста понадобится голосовой пакет. Выберите подготовленную модель ниже.</Text> : null}
        <View style={s.row}>
          {packs.map((p) => (
            <Chip key={p.id} label={`${p.name} · ${mb(packSize(p))}`} on={p.id === packId} onPress={() => setPackId(p.id)} disabled={disabled} />
          ))}
        </View>
        {progress ? <Text style={s.dim}>{progress.total ? `${progress.file}: ${mb(progress.done)} из ${mb(progress.total)}` : progress.file}</Text> : null}
        {catalog === null ? <Text style={s.dim}>Загружаю каталог пакетов…</Text> : null}
        {catalog?.map((c) => (
          <Btn key={c.id} title={`Установить модель «${c.name}» (${mb(c.size)})`} onPress={() => downloadFromCatalog(c)} disabled={disabled} />
        ))}
        {busy === 'download' ? <Btn title="Остановить скачивание" onPress={() => (stop.current = true)} kind="danger" /> : null}
        <View style={s.row}>
          <Btn title="Проверить целостность" onPress={verify} disabled={disabled || !pack} kind="soft" />
          <Btn title="Удалить" onPress={remove} disabled={disabled || !pack} kind="danger" />
        </View>
      </View>

      <Text style={s.h2}>Загрузка модели</Text>
      <View style={s.card}>
        <Text style={s.dim}>Потоки</Text>
        <View style={s.row}>
          {[1, 2, 4, 8].map((n) => (
            <Chip key={n} label={String(n)} on={threads === n} onPress={() => setThreads(n)} disabled={disabled} />
          ))}
        </View>
        <Text style={s.dim}>Режим сжатых весов</Text>
        <View style={s.row}>
          <Chip label="Быстрый (больше памяти)" on={fold} onPress={() => setFold(true)} disabled={disabled} />
          <Chip label="Экономный (меньше памяти)" on={!fold} onPress={() => setFold(false)} disabled={disabled} />
        </View>
        <View style={s.row}>
          <Btn title={busy === 'load' ? 'Загрузка…' : 'Загрузить'} onPress={load} disabled={disabled || !pack} />
          <Btn title="Выгрузить" onPress={release} disabled={disabled || !loaded} kind="soft" />
        </View>
        {loaded ? <Text style={s.text}>{`Загружено: ${loaded.load.loadMs.toFixed(0)} мс · ${loaded.load.after.rssMb.toFixed(0)} МБ`}</Text> : null}
      </View>

      <Text style={s.h2}>Голос и скорость</Text>
      <View style={s.card}>
        <View style={s.row}>
          {voices.map((v) => (
            <Chip key={v} label={v} on={voice === v} onPress={() => setVoice(v)} disabled={disabled} />
          ))}
        </View>
        <View style={s.row}>
          {[0.8, 0.9, 1.0, 1.1].map((x) => (
            <Chip key={x} label={`×${x}`} on={speed === x} onPress={() => setSpeed(x)} disabled={disabled} />
          ))}
        </View>
        <View style={s.row}>
          {[5, 8].map((n) => (
            <Chip key={n} label={`${n} шагов`} on={steps === n} onPress={() => setSteps(n)} disabled={disabled} />
          ))}
        </View>
      </View>


      <Text style={s.h2}>Автоматический тест двух режимов</Text>
      <View style={s.card}>
        <Text style={s.text}>Быстрый → Экономный</Text>
        <Text style={s.dim}>Оба режима проходят одинаковые 30 фраз × 3 круга и 20 повторов. Модель автоматически загружается и выгружается между тестами.</Text>
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
        <Btn title={autoStatus === 'running' ? 'Тестирование в фоне…' : 'Запустить оба теста'} onPress={autoBench} disabled={disabled || autoStatus === 'running' || !pack || !device} />
        {autoStatus === 'running' ? <Btn title="Остановить тест" onPress={cancelAutoBench} kind="danger" /> : null}
        {!pack ? <Text style={s.dim}>Сначала установите голосовой пакет из списка выше.</Text> : null}
        {dualReports ? (
          <>
            <Text style={s.text}>{`Быстрый: загрузка ${dualReports.fast.loadMs.toFixed(0)} мс · RTF ${dualReports.fast.rtf.toFixed(2)} · пик ${dualReports.fast.memoryAfterRounds.peakMb.toFixed(0)} МБ`}</Text>
            <Text style={s.text}>{`Экономный: загрузка ${dualReports.light.loadMs.toFixed(0)} мс · RTF ${dualReports.light.rtf.toFixed(2)} · пик ${dualReports.light.memoryAfterRounds.peakMb.toFixed(0)} МБ`}</Text>
            <Btn title="Отправить отчёт в Telegram · @Aadzen" onPress={shareDualReport} disabled={disabled} kind="soft" />
            <Btn title="Удалить приложение и модели" onPress={suggestUninstall} disabled={disabled} kind="danger" />
          </>
        ) : null}
        <Text style={s.dim}>Android foreground service поддерживает работу после сворачивания. Открытие отчёта и прогресс обновятся при возвращении в приложение. Не выключайте процесс принудительно.</Text>
      </View>

      <Text style={s.h2}>Полный замер</Text>
      <View style={s.card}>
        <Text style={s.dim}>30 фраз × 3 круга, задержка до звука, 20 повторов длинной фразы, память до и после выгрузки. Около 2–10 минут.</Text>
        <Btn title={busy === 'bench' ? 'Идёт замер…' : 'Запустить замер'} onPress={bench} disabled={disabled || !loaded} />
        {report ? (
          <>
            <Text style={s.text}>{`Загрузка ${report.load.loadMs.toFixed(0)} мс · первый запрос ${report.firstRequestMs.toFixed(0)} мс · до первого звука ${report.firstSoundMs ?? '—'} мс`}</Text>
            <Text style={s.text}>{`Медиана синтеза ${report.medianSynthMs.toFixed(0)} мс · RTF ${report.rtf.toFixed(2)} (меньше 1 — быстрее речи)`}</Text>
            <Text style={s.text}>{`Память: пик ${report.memoryAfterRounds.peakMb.toFixed(0)} МБ · после выгрузки ${report.afterRelease.rssMb.toFixed(0)} МБ`}</Text>
            <Text style={s.text}>{`Стабильность: ${report.stability.repeats} повторов, ${report.stability.minMs.toFixed(0)}–${report.stability.maxMs.toFixed(0)} мс, память ${report.stability.rssStartMb.toFixed(0)} → ${report.stability.rssEndMb.toFixed(0)} МБ`}</Text>
            {report.errors.length ? <Text style={[s.text, { color: C.danger }]}>{`Ошибки: ${report.errors.length}`}</Text> : null}
            <Btn title="Отправить результат" onPress={shareReport} kind="soft" />
          </>
        ) : null}
      </View>

      <Text style={s.h2}>Тестовый набор</Text>
      <View style={s.card}>
        {TEST_SET.map((t) => {
          const r = last[t.id];
          return (
            <Pressable key={t.id} onPress={() => say(t.id, t.text)} disabled={disabled || !loaded} style={s.item}>
              <View style={{ flex: 1 }}>
                <Text style={s.korean}>{t.text}</Text>
                <Text style={s.dim}>{`${t.cat}${t.pron ? ' · ' + t.pron : ''}`}</Text>
              </View>
              <Text style={s.dim}>{busy === t.id ? '…' : r ? `${r.totalMs.toFixed(0)} мс` : '▶'}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.h2}>Журнал</Text>
      <View style={s.card}>
        {log.map((l, i) => (
          <Text key={i} style={s.small}>
            {l}
          </Text>
        ))}
      </View>
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
  korean: { fontSize: 20, fontWeight: '600', color: C.text },
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
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomColor: C.border, borderBottomWidth: StyleSheet.hairlineWidth },
});
