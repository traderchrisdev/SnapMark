// Shown once after a fresh install (and from Settings → Getting started): what SnapMark does, the
// floating button switch (it starts off), and the welcome note with the full how-to and a page to try it on.

import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PluginManager } from 'sn-plugin-lib';
import { setBubble } from '../features/bubble';
import { openWelcomeNote } from '../features/welcome';
import { logError } from '../platform/log';
import { hasFilePermissions, requestFilePermissions } from '../platform/permissions';
import { loadSettings, saveSetting } from '../platform/settingsStore';
import { toast } from '../platform/toast';
import { describeError } from '../sdk/errors';
import { Button, Choice, Header, Section, styles } from './components';

const POINTS = [
  'In a PDF or EPUB: toolbar → plugins → Snap page, Snap region or Notes for this page.',
  'Anywhere: the floating button. Tap it and box what you want.',
  'Your handwriting comes along as real ink, with a link back to the page.',
];

export function WelcomeScreen() {
  const [bubble, setBubbleOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSettings().then(s => setBubbleOn(s.bubble));
    saveSetting('welcomed', true).catch(e => logError('welcome: remember', e));
  }, []);

  const switchBubble = async (on: boolean) => {
    setBubbleOn(on);
    try {
      await saveSetting('bubble', on);
      await setBubble(on);
    } catch (e) {
      logError(`bubble ${on ? 'on' : 'off'}`, e);
    }
  };

  const openNote = async () => {
    setBusy(true);
    try {
      if (!(await hasFilePermissions()) && (await requestFilePermissions()) === 'denied') {
        toast('SnapMark needs file access to make the welcome note.', true);
        return;
      }
      await PluginManager.closePluginView();
      await openWelcomeNote(await loadSettings());
    } catch (e) {
      logError('welcome note', e);
      toast(`Could not open the welcome note: ${describeError(e)}`, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen}>
      <Header title="Welcome to SnapMark" onClose={() => PluginManager.closePluginView()} closeLabel="Not now" />
      <Text style={styles.message}>Turn anything on your screen into a note you can write on.</Text>
      {POINTS.map(p => (
        <Text key={p} style={styles.message}>
          • {p}
        </Text>
      ))}
      {bubble !== null ? (
        <Section label="Floating capture button" hint="A small button over every app. You can turn it on or off any time in SnapMark's settings.">
          <Choice
            options={[
              { value: true, label: 'On' },
              { value: false, label: 'Off' },
            ]}
            value={bubble}
            onChange={v => switchBubble(v)}
          />
        </Section>
      ) : null}
      <View style={styles.row}>
        <Button label={busy ? 'Opening…' : 'Open the welcome note'} onPress={openNote} disabled={busy} />
      </View>
      <Text style={styles.message}>A short guide in Notes, with a page to try it on. It's in your Snaps folder, and in SnapMark's settings under Getting started.</Text>
    </ScrollView>
  );
}
