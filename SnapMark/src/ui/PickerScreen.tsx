// Screenshot picker: shown when the newest screenshot is older than the freshness window.

import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { PluginManager } from 'sn-plugin-lib';
import { describeAge, type Screenshot } from '../core/screenshots';
import { applyScreenshot, type ShotAction } from '../features/annotateScreenshot';
import { logError } from '../platform/log';
import { loadSettings } from '../platform/settingsStore';
import { toast } from '../platform/toast';
import { describeError } from '../sdk/errors';
import { Header, styles } from './components';

function Thumb({ shot, now, onPick }: { shot: Screenshot; now: Date; onPick: (s: Screenshot) => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <Pressable onPress={() => onPick(shot)} style={styles.thumbCell}>
      <View style={styles.thumbFrame}>
        {failed ? (
          <Text style={styles.thumbMissing}>(preview unavailable)</Text>
        ) : (
          <Image
            source={{ uri: `file://${shot.path}` }}
            style={styles.thumbImage}
            resizeMode="contain"
            resizeMethod="resize"
            fadeDuration={0}
            onError={() => setFailed(true)}
          />
        )}
      </View>
      <Text style={styles.thumbCaption}>{describeAge(shot, now)}</Text>
    </Pressable>
  );
}

export function PickerScreen({ shots, action }: { shots: Screenshot[]; action: ShotAction }) {
  const [busy, setBusy] = useState(false);
  const now = new Date();

  const pick = async (shot: Screenshot) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const settings = await loadSettings();
      await PluginManager.closePluginView();
      await applyScreenshot(shot, settings, action);
    } catch (e) {
      logError('pick screenshot', e);
      toast(`${action === 'insert' ? 'Insert' : 'Snap'} failed: ${describeError(e)}`, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title={busy ? 'Working…' : action === 'insert' ? 'Insert which screenshot?' : 'Pick a screenshot'}
        closeLabel="Cancel"
        onClose={() => PluginManager.closePluginView()}
      />
      <ScrollView contentContainerStyle={styles.grid}>
        {shots.map(s => (
          <Thumb key={s.path} shot={s} now={now} onPick={pick} />
        ))}
      </ScrollView>
    </View>
  );
}
