// Which screen the plugin UI shows. Set by the buttons right before showPluginView(); the JS runtime
// outlives the UI, so module state is how a showType:0 handler hands data to the screen.

import { useEffect, useState } from 'react';
import type { Screenshot } from '../core/screenshots';
import type { ShotAction } from '../features/annotateScreenshot';
import type { RegionRequest } from '../features/region';

export type Route =
  | { name: 'settings' }
  | { name: 'picker'; shots: Screenshot[]; action: ShotAction }
  | { name: 'permission' }
  | { name: 'welcome' }
  | { name: 'region'; request: RegionRequest };

let current: Route = { name: 'settings' };
const listeners = new Set<(r: Route) => void>();

export function setRoute(route: Route): void {
  current = route;
  listeners.forEach(l => l(route));
}

export function useRoute(): Route {
  const [route, setState] = useState<Route>(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return route;
}
