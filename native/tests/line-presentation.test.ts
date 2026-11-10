/** Protects the pinned TfL identities and physical-platform presentation rules. */
import { expect, it } from 'vitest';
import { lineColour } from '../src/line-presentation';

const pinned = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300', district: '#00782A',
  'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056', northern: '#000000',
  piccadilly: '#003688', victoria: '#0098D4', 'waterloo-city': '#95CDBA', elizabeth: '#6950A1',
  dlr: '#00A4A7', tram: '#84B817', liberty: '#61686B', lioness: '#FAA61A', mildmay: '#0077AD',
  suffragette: '#18A95D', weaver: '#9B0058', windrush: '#EF7B10', 'london-cable-car': '#E21836',
};
it.each(Object.entries(pinned))('uses the pinned %s colour', (id, colour) => expect(lineColour(id)).toBe(colour));
it('uses neutral fallback for unknown and National Rail services', () => {
  expect(lineColour('future-service')).toBe('#61686B');
  expect(lineColour('national-rail')).toBe('#61686B');
});

import { catalogue } from '../../src/lib/catalogue';
import type { CataloguePlatform } from '../../src/lib/catalogue/schema';
import { lineLabels, platformLineGroups } from '../src/line-presentation';

const station = (name: string) => catalogue.stations.find(item => item.station_name === name)!;
const ids = (platforms: readonly CataloguePlatform[]) => platformLineGroups(platforms).map(group => group.lines.map(line => line.id));

it('orders real Tottenham Court Road groups Northern, Central, Elizabeth without mutating its platforms', () => {
  const platforms = station('Tottenham Court Road').platforms;
  const before = JSON.stringify(platforms);
  expect(ids(platforms)).toEqual([['northern'], ['central'], ['elizabeth']]);
  expect(ids([...platforms].reverse())).toEqual(ids(platforms));
  expect(JSON.stringify(platforms)).toBe(before);
  const grouped = platformLineGroups(platforms).flatMap(group => group.platforms);
  expect(new Set(grouped).size).toBe(platforms.length);
  expect(grouped).toHaveLength(platforms.length);
  for (const group of platformLineGroups(platforms)) {
    expect(group.platforms).toEqual(platforms.filter(platform => group.platforms.includes(platform)));
  }
});

it.each(['Baker Street', 'Kew Gardens'])('keeps each real shared %s platform in exactly one group', name => {
  const platforms = station(name).platforms;
  const groups = platformLineGroups(platforms);
  expect(groups.some(group => group.lines.length > 1)).toBe(true);
  expect(groups.flatMap(group => group.platforms)).toHaveLength(platforms.length);
  if (name === 'Kew Gardens') expect(groups.map(group => group.lines.map(line => line.id))).toEqual([['district', 'mildmay']]);
});

it('uses exact sets, not transitive overlap, deduplicates services and retains source blanks and mixed Rail details', () => {
  const base = station('Kew Gardens').platforms[0];
  const make = (id: string, names: string[]): CataloguePlatform => ({ ...base, platform_id: id,
    platform_number: '', cardinal_direction: '', services: names.map(line_id => ({ ...base.services[0], line_id, line_name: line_id, direction_towards: '' })) });
  const platforms = [make('a', ['central']), make('b', ['central', 'district', 'central']),
    make('c', ['district', 'mildmay']), make('d', ['district', 'central', 'national-rail']),
    make('e', ['national-rail']), make('f', []), { ...make('g', ['northern']), is_customer_facing: false }];
  const groups = platformLineGroups(platforms);
  expect(groups.map(group => group.lines.map(line => line.id))).toEqual([['central'], ['central', 'district'], ['district', 'mildmay']]);
  expect(groups[1].platforms).toEqual([platforms[1], platforms[3]]);
  expect(groups[1].platforms[1].services.at(-1)?.line_id).toBe('national-rail');
  expect(groups[0].platforms[0]).toMatchObject({ platform_number: '', cardinal_direction: '' });
  expect(ids([...platforms].reverse())).toEqual(ids(platforms));
  expect(platformLineGroups([])).toEqual([]);
});

it('deduplicates and orders labels while preserving an unknown published name', () => {
  expect(lineLabels([{ line_id: 'future', line_name: 'Published future service' },
    { line_id: 'northern', line_name: 'Northern' }, { line_id: 'northern', line_name: 'Northern' }]))
    .toEqual([{ id: 'northern', name: 'Northern' }, { id: 'future', name: 'Published future service' }]);
  expect(lineLabels([])).toEqual([]);
});
