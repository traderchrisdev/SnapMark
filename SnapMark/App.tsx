/**
 * Plugin UI: settings (config button), the screenshot picker and the first-run permission screen.
 * The snap buttons themselves have no UI (showType 0).
 */

import React from 'react';
import { PermissionScreen } from './src/ui/PermissionScreen';
import { PickerScreen } from './src/ui/PickerScreen';
import { useRoute } from './src/ui/route';
import { SettingsScreen } from './src/ui/SettingsScreen';

function App(): React.JSX.Element {
  const route = useRoute();
  switch (route.name) {
    case 'picker':
      return <PickerScreen shots={route.shots} action={route.action} />;
    case 'permission':
      return <PermissionScreen />;
    default:
      return <SettingsScreen />;
  }
}

export default App;
