/**
 * Plugin UI: settings (config button), the screenshot picker, the first-run permission screen and
 * the "choose a region" screen of the floating button. The snap buttons themselves have no UI (showType 0).
 */

import React from 'react';
import { PermissionScreen } from './src/ui/PermissionScreen';
import { PickerScreen } from './src/ui/PickerScreen';
import { RegionScreen } from './src/ui/RegionScreen';
import { useRoute } from './src/ui/route';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { WelcomeScreen } from './src/ui/WelcomeScreen';

function App(): React.JSX.Element {
  const route = useRoute();
  switch (route.name) {
    case 'picker':
      return <PickerScreen shots={route.shots} action={route.action} />;
    case 'permission':
      return <PermissionScreen />;
    case 'welcome':
      return <WelcomeScreen />;
    case 'region':
      // Keyed by capture: each capture starts with a fresh, empty box.
      return <RegionScreen key={route.request.capture.path} request={route.request} />;
    default:
      return <SettingsScreen />;
  }
}

export default App;
