// E-ink friendly building blocks: black on white, no animation or ripple, large tap targets,
// selection shown by inverting colors.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const INK = '#000000';
export const PAPER = '#ffffff';

export function Header({ title, onClose, closeLabel = 'Close' }: { title: string; onClose: () => void; closeLabel?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Button label={closeLabel} onPress={onClose} />
    </View>
  );
}

export function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.row}>{children}</View>
    </View>
  );
}

export function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.button, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function Choice<T extends string | number | boolean>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <>
      {options.map(o => {
        const selected = o.value === value;
        return (
          <Pressable key={String(o.value)} style={[styles.button, selected && styles.selected]} onPress={() => onChange(o.value)}>
            <Text style={[styles.buttonText, selected && styles.selectedText]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAPER, paddingHorizontal: 48, paddingTop: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 36, fontWeight: '700', color: INK },
  section: { marginBottom: 32 },
  label: { fontSize: 26, fontWeight: '600', color: INK, marginBottom: 6 },
  hint: { fontSize: 20, color: INK, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  button: {
    minHeight: 64,
    minWidth: 96,
    paddingHorizontal: 24,
    marginRight: 12,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 8,
    backgroundColor: PAPER,
  },
  buttonText: { fontSize: 24, color: INK },
  selected: { backgroundColor: INK },
  selectedText: { color: PAPER },
  disabled: { opacity: 0.4 },
  status: { fontSize: 22, color: INK, marginTop: 8 },
  message: { fontSize: 28, lineHeight: 40, color: INK, marginBottom: 32 },
  scrollBottom: { paddingBottom: 48 },
  inlineLabel: { fontSize: 24, color: INK, marginRight: 8 },
  input: {
    fontSize: 24,
    color: INK,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 8,
    minWidth: 360,
    minHeight: 64,
    paddingHorizontal: 16,
    marginRight: 12,
    marginBottom: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 48 },
  thumbCell: { width: '25%', padding: 8 },
  thumbFrame: { aspectRatio: 3 / 4, borderWidth: 2, borderColor: INK, backgroundColor: PAPER, justifyContent: 'center' },
  thumbImage: { width: '100%', height: '100%' },
  thumbMissing: { fontSize: 20, color: INK, textAlign: 'center' },
  thumbCaption: { fontSize: 20, color: INK, textAlign: 'center', marginTop: 6 },
});
