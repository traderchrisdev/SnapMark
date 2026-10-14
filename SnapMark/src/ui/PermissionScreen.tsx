// First run (or after access was removed): one line of why, then the system dialog.

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { PluginManager } from 'sn-plugin-lib';
import { logError } from '../platform/log';
import { requestFilePermissions, type PermissionAnswer } from '../platform/permissions';
import { Button, Header, styles } from './components';

const MESSAGES: Record<PermissionAnswer | 'ask', string> = {
  ask: 'SnapMark saves snaps to your Note folder and reads your screenshots. On the next screen, choose "Always allow" so it works in one tap.',
  always: 'All set. Tap the SnapMark button again.',
  once: 'Allowed for now. Tap the button again. You will be asked again next time unless you choose "Always allow".',
  denied: 'SnapMark cannot save snaps without file access. You can turn it on in Settings → Apps → Plugins → SnapMark.',
  cancelled: 'Nothing was changed. Tap Continue when you are ready.',
};

export function PermissionScreen() {
  const [state, setState] = useState<PermissionAnswer | 'ask'>('ask');
  const [busy, setBusy] = useState(false);
  const done = state === 'always' || state === 'once' || state === 'denied';

  const ask = async () => {
    setBusy(true);
    try {
      setState(await requestFilePermissions());
    } catch (e) {
      logError('request permissions', e);
      setState('denied');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header title="SnapMark needs file access" onClose={() => PluginManager.closePluginView()} />
      <Text style={styles.message}>{MESSAGES[state]}</Text>
      <View style={styles.row}>
        {done ? (
          <Button label="Done" onPress={() => PluginManager.closePluginView()} />
        ) : (
          <Button label={busy ? 'Waiting…' : 'Continue'} onPress={ask} disabled={busy} />
        )}
      </View>
    </View>
  );
}
