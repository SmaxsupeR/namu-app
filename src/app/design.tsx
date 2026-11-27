// Design review page (/design): the tokens and shared components in the current theme, for
// checking the design system on a device or in the browser. Not linked from the app.
import { Stack } from 'expo-router/stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bar, Body, Btn, Chip, EmptyState, ErrorState, IconBtn, LoadingState, Row, ScreenHeader, SearchField, Section, SectionHeader, SegmentedControl } from '../ui/components';
import { ListGroup, ListRow, SettingsRow, WordRow } from '../ui/rows';
import { ConfirmationDialog, FilterSheet } from '../ui/sheets';
import { StudyShell } from '../ui/StudyShell';
import { Text } from '../ui/Text';
import { radius, space, type as typeScale, useTheme, type Theme } from '../ui/theme';

const SWATCHES: (keyof Theme)[] = ['bg', 'surface', 'surfaceAlt', 'primary', 'primarySoft', 'text', 'textDim', 'border', 'success', 'danger', 'warn', 'info'];

export default function Design() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a');
  const [q, setQ] = useState('');
  const [toggle, setToggle] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [shell, setShell] = useState(false);

  if (shell) {
    return (
      <StudyShell progress={0.4} onClose={() => setShell(false)} closeLabel="Закрыть" title="Напишите перевод" badge="Повторение" footer={<Btn title="Проверить" onPress={() => setShell(false)} />}>
        <Text variant="koreanPrompt" style={styles.center}>
          학교
        </Text>
        <Text style={[typeScale.secondary, styles.center, { color: t.textDim }]}>≈ hakgyo</Text>
      </StudyShell>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Namu · дизайн" subtitle={t.dark ? 'Тёмная тема' : 'Светлая тема'} actions={<IconBtn name="settings" label="Настройки" onPress={() => {}} />} />

      <SectionHeader title="Цвета" />
      <View style={styles.swatches}>
        {SWATCHES.map((k) => (
          <View key={k} style={styles.swatch}>
            <View style={[styles.chipColor, { backgroundColor: t[k] as string, borderColor: t.border }]} />
            <Text style={[typeScale.caption, { color: t.textDim }]}>{k}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Типографика" />
      <Text variant="title">Заголовок экрана</Text>
      <Text variant="section">Заголовок раздела</Text>
      <Text variant="body">Основной текст: перевод слова «школа», пример предложения и пояснение.</Text>
      <Text style={[typeScale.secondary, { color: t.textDim }]}>Второстепенный текст и подсказки</Text>
      <Text variant="koreanPrompt">한국어 공부</Text>
      <Text variant="korean">나무 · 학교 · 선생님</Text>

      <SectionHeader title="Кнопки" action="Все" onAction={() => {}} />
      <Btn icon="play" title="Начать занятие" onPress={() => {}} />
      <Row>
        <Btn style={styles.flex} kind="soft" icon="plus" title="Добавить" onPress={() => {}} />
        <Btn style={styles.flex} kind="ghost" title="Отмена" onPress={() => {}} />
      </Row>
      <Btn kind="danger" small icon="trash-2" title="Удалить словарь" onPress={() => setDialog(true)} />

      <SectionHeader title="Поиск и выбор" />
      <SearchField value={q} onChangeText={setQ} placeholder="Слово или перевод" onFilter={() => setSheet(true)} filtersActive />
      <SegmentedControl
        value={seg}
        onChange={setSeg}
        options={[
          { value: 'a', label: 'Слова' },
          { value: 'b', label: 'Грамматика' },
          { value: 'c', label: 'Спряжение' },
        ]}
      />
      <Row style={styles.wrap}>
        <Chip label="Начальный" active onPress={() => {}} />
        <Chip label="Средний" onPress={() => {}} />
        <Chip label="Глаголы" icon="filter" onPress={() => {}} />
      </Row>

      <SectionHeader title="Списки" />
      <ListGroup>
        <ListRow icon="headphones" title="Аудирование" subtitle="Слово звучит — вы называете перевод" onPress={() => {}} />
        <ListRow icon="target" title="Трудные слова" value="12" onPress={() => {}} />
      </ListGroup>
      <ListGroup>
        <WordRow korean="학교" romanization="hakgyo" translation="школа; учебное заведение" mastery="stable" masteryLabel="запомнено" onPress={() => {}} onListen={() => {}} listenLabel="Слушать" />
        <WordRow korean="고르다" translation="выбирать; отбирать; ровный, одинаковый (о поверхности)" mastery="learning" masteryLabel="изучается" onPress={() => {}} onListen={() => {}} listenLabel="Слушать" />
        <WordRow korean="나무" translation="дерево" mastery="new" masteryLabel="новое" onPress={() => {}} onListen={() => {}} listenLabel="Слушать" />
      </ListGroup>
      <Section>Настройки</Section>
      <ListGroup>
        <SettingsRow label="Новых слов в день" value="10" onPress={() => {}} />
        <SettingsRow label="Произносить новые слова" toggle={toggle} onToggle={setToggle} />
      </ListGroup>

      <SectionHeader title="Прогресс и состояния" />
      <Bar value={0.62} label="Прогресс" />
      <EmptyState icon="book" title="Пока нет словарей" text="Создайте словарь или выберите готовую подборку." action={<Btn title="Создать словарь" onPress={() => {}} />} />
      <LoadingState label="Загружаю словарь…" />
      <ErrorState title="Словарь не открылся" text="Файл словаря повреждён. Попробуйте ещё раз." retryLabel="Повторить" onRetry={() => {}} />
      <Btn kind="soft" title="Открыть StudyShell" onPress={() => setShell(true)} />
      <Body dim>Панель фильтров и диалог подтверждения открываются кнопками выше.</Body>

      <FilterSheet visible={sheet} onClose={() => setSheet(false)} title="Фильтры" applyLabel="Применить" resetLabel="Сбросить" onApply={() => {}} onReset={() => {}}>
        <Section>Уровень</Section>
        <Row style={styles.wrap}>
          <Chip label="Начальный" active onPress={() => {}} />
          <Chip label="Средний" onPress={() => {}} />
          <Chip label="Продвинутый" onPress={() => {}} />
        </Row>
        <Section>Часть речи</Section>
        <Row style={styles.wrap}>
          <Chip label="Существительные" onPress={() => {}} />
          <Chip label="Глаголы" active onPress={() => {}} />
        </Row>
      </FilterSheet>
      <ConfirmationDialog
        visible={dialog}
        title="Удалить словарь «Урок 5»?"
        message="Слова и их прогресс будут удалены. Это нельзя отменить."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        destructive
        onConfirm={() => setDialog(false)}
        onCancel={() => setDialog(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.lg, gap: space.md },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  wrap: { flexWrap: 'wrap' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  swatch: { alignItems: 'center', gap: 4, width: 72 },
  chipColor: { width: 48, height: 48, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
});
