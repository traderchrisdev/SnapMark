// Settings (config button in Settings → Apps → Plugins). Every change is saved immediately.

import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { PluginManager } from 'sn-plugin-lib';
import { sanitizeFolder } from '../core/paths';
import { MARGIN_CHOICES } from '../core/margin';
import type { ScreenshotFit } from '../core/fit';
import { DEFAULT_SETTINGS, FRESHNESS_CHOICES, type Settings } from '../core/settings';
import { setBubble } from '../features/bubble';
import { saveLog } from '../features/saveLog';
import { baseName } from '../core/paths';
import { logError } from '../platform/log';
import { Native } from '../platform/native';
import { loadSettings, saveSetting } from '../platform/settingsStore';
import { describeError } from '../sdk/errors';
import { Button, Choice, Header, Section, styles } from './components';

const freshnessOptions = FRESHNESS_CHOICES.map(m => ({ value: m as number, label: m === 0 ? 'Always ask' : `${m} min` }));
const marginOptions = MARGIN_CHOICES.map(p => ({ value: p as number, label: p === 0 ? 'Off' : `${p}%` }));
const fitOptions: { value: ScreenshotFit; label: string }[] = [
  { value: 'left', label: 'On the left' },
  { value: 'right', label: 'On the right' },
  { value: 'off', label: 'Full size' },
];

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [folderDraft, setFolderDraft] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadSettings().then(s => {
      setSettings(s);
      setFolderDraft(s.folder);
    });
  }, []);

  if (!settings) {
    return (
      <View style={styles.screen}>
        <Text style={styles.status}>Loading…</Text>
      </View>
    );
  }

  const update = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings({ ...settings, [key]: value });
    try {
      await saveSetting(key, value);
      setStatus('Saved.');
    } catch (e) {
      logError(`save ${key}`, e);
      setStatus(`Not saved: ${describeError(e)}`);
    }
  };

  const switchBubble = async (on: boolean) => {
    await update('bubble', on);
    try {
      await setBubble(on);
    } catch (e) {
      logError(`bubble ${on ? 'on' : 'off'}`, e);
      setStatus(`Could not ${on ? 'show' : 'hide'} the button: ${describeError(e)}`);
    }
  };

  const cleanFolder = sanitizeFolder(folderDraft);
  const saveFolder = () => {
    if (cleanFolder) {
      setFolderDraft(cleanFolder);
      update('folder', cleanFolder);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollBottom}>
      <Header title="SnapMark settings" onClose={() => PluginManager.closePluginView()} />

      <Section label="Save snaps in" hint={`Note/${cleanFolder ?? '…'}/<book title>/ — screenshots go to Note/${cleanFolder ?? '…'}/Screenshots/`}>
        <Text style={styles.inlineLabel}>Note /</Text>
        <TextInput
          style={styles.input}
          value={folderDraft}
          onChangeText={setFolderDraft}
          onSubmitEditing={saveFolder}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Button label="Save folder" onPress={saveFolder} disabled={!cleanFolder || cleanFolder === settings.folder} />
        <Button
          label="Reset"
          onPress={() => {
            setFolderDraft(DEFAULT_SETTINGS.folder);
            update('folder', DEFAULT_SETTINGS.folder);
          }}
          disabled={settings.folder === DEFAULT_SETTINGS.folder}
        />
      </Section>

      <Section
        label="Where snaps go"
        hint={
          settings.destination === 'current'
            ? 'Region snaps are pasted as a picture onto the page of the note open in Notes (your ink is flattened into it). Page snaps and screenshots still get a note each.'
            : `Inbox: every snap becomes the next page of Note/${cleanFolder ?? '…'}/Snaps inbox.note`
        }
      >
        <Choice
          options={[
            { value: 'note', label: 'A new note each' },
            { value: 'inbox', label: 'One "Snaps inbox"' },
            { value: 'current', label: "Into the note I'm working in" },
          ]}
          value={settings.destination}
          onChange={v => update('destination', v)}
        />
      </Section>

      <Section
        label="Margin mode"
        hint="Page shrunk at the top-left, starting after the Notes toolbar (see the Notes toolbar setting), leaving room to write on the right and bottom. The page becomes a picture you can move with the lasso. For snaps saved as their own note."
      >
        <Choice options={marginOptions} value={settings.marginPercent} onChange={v => update('marginPercent', v)} />
      </Section>

      <Section label="After a snap">
        <Choice
          options={[
            { value: 'open', label: 'Open the snap' },
            { value: 'stay', label: 'Stay here' },
          ]}
          value={settings.afterSnap}
          onChange={v => update('afterSnap', v)}
        />
      </Section>

      <Section label="Text-selection highlights" hint="Highlights made by selecting text in a book.">
        <Choice
          options={[
            { value: true, label: 'Keep' },
            { value: false, label: 'Leave out' },
          ]}
          value={settings.keepHighlights}
          onChange={v => update('keepHighlights', v)}
        />
      </Section>

      <Section label="My handwriting on the page" hint="Copied as ink you can erase or move.">
        <Choice
          options={[
            { value: true, label: 'Copy' },
            { value: false, label: 'Leave out' },
          ]}
          value={settings.includeHandwriting}
          onChange={v => update('includeHandwriting', v)}
        />
      </Section>

      {settings.includeHandwriting ? (
        <Section label="Marker highlights" hint="Notes draw markers solid over the page, so they become underlines.">
          <Choice
            options={[
              { value: 'underline', label: 'Underline' },
              { value: 'omit', label: 'Leave out' },
            ]}
            value={settings.highlightStyle}
            onChange={v => update('highlightStyle', v)}
          />
        </Section>
      ) : null}

      <Section label="Annotate screenshot" hint="Use the newest screenshot directly if it is newer than:">
        <Choice options={freshnessOptions} value={settings.screenshotFreshMinutes} onChange={v => update('screenshotFreshMinutes', v)} />
      </Section>

      {Native.available ? (
        <Section
          label="Floating capture button"
          hint="Floats over every app. Tap it to capture the screen and write on it: it becomes a note (or an inbox page), like Annotate screenshot. Drag it to move it."
        >
          <Choice
            options={[
              { value: true, label: 'On' },
              { value: false, label: 'Off' },
            ]}
            value={settings.bubble}
            onChange={v => switchBubble(v)}
          />
        </Section>
      ) : null}

      {Native.available ? (
        <Section
          label="When I tap the floating button"
          hint="Choose a region: the screen is shown and you drag a box over the part to keep (Whole screen is one tap away there)."
        >
          <Choice
            options={[
              { value: 'region', label: 'Choose a region' },
              { value: 'whole', label: 'Whole screen right away' },
            ]}
            value={settings.bubbleAction}
            onChange={v => update('bubbleAction', v)}
          />
        </Section>
      ) : null}

      <Section label="Notes toolbar" hint="Screenshot notes are shrunk so the toolbar and the page bar don't cover them.">
        <Choice options={fitOptions} value={settings.screenshotFit} onChange={v => update('screenshotFit', v)} />
      </Section>

      {Native.available ? (
        <Section
          label="Problem report"
          hint="Saves SnapMark's recent log, your device type and these settings to EXPORT/ as a text file, to attach to a bug report. It may contain note and document names."
        >
          <Button
            label="Save a log file"
            onPress={() =>
              saveLog(settings).then(
                path => setStatus(`Saved EXPORT/${baseName(path)}`),
                e => {
                  logError('save log', e);
                  setStatus(`Not saved: ${describeError(e)}`);
                },
              )
            }
          />
        </Section>
      ) : null}

      <Text style={styles.status}>{status}</Text>
    </ScrollView>
  );
}
