import { createNavigationContainerRef, type LinkingOptions } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Selection } from './catalogue';

export type Routes = {
  Home: undefined;
  Search: undefined;
  Picker: { stationId: string };
  Departures: { selection: Selection };
  PlatformDetails: { stationId: string; platformId: string };
  Manage: { replacement?: Selection; undo?: boolean } | undefined;
  Settings: undefined;
  Plans: { pendingSave?: Selection } | undefined;
  About: undefined;
  Appearance: undefined;
  CardDisplay: { cardKey: string };
};
export type Screen<Route extends keyof Routes> = NativeStackScreenProps<Routes, Route>;
export const navigationRef = createNavigationContainerRef<Routes>();

export const plansLinking: LinkingOptions<Routes> = {
  prefixes: ['nextbranch://'],
  filter: url => url === 'nextbranch://plans',
  config: { initialRouteName: 'Home', screens: { Plans: 'plans' } },
};
