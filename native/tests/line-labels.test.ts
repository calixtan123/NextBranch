/** Tests actual line-label and swatch element output through native host mocks. */
import { Children, isValidElement } from 'react';
import { expect, it, vi } from 'vitest';
import { LineLabels } from '../src/LineLabels';
import { Label, LineMarker, paletteFor } from '../src/theme';

const theme = vi.hoisted(() => ({ light: false }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', StyleSheet: { create: (value: unknown) => value } }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useContext: () => paletteFor(theme.light) }));
vi.mock('react-native-svg', () => ({ default: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect' }));

it.each([false, true])('keeps long shared headings wrapping with bordered swatches and foreground text in light=%s', light => {
  theme.light = light;
  const lines = [{ id: 'northern', name: 'Northern' }, { id: 'circle', name: 'Circle' },
    { id: 'hammersmith-city', name: 'Hammersmith & City' }, { id: 'future', name: 'Published future service' }];
  const tree = LineLabels({ lines, heading: true });
  expect(tree.props.accessibilityRole).toBe('header');
  expect(tree.props.accessibilityLabel).toBe('Northern · Circle · Hammersmith & City · Published future service');
  expect(tree.props.style).toContainEqual(expect.objectContaining({ flexWrap: 'wrap' }));
  const children = Children.toArray(tree.props.children).filter(isValidElement<{ children: unknown }>);
  expect(children).toHaveLength(4);
  for (const [index, child] of children.entries()) {
    const pair = Children.toArray(child.props.children as never).filter(isValidElement<Record<string, any>>);
    expect(pair[0].type).toBe(LineMarker);
    const marker = LineMarker(pair[0].props as { lineId: string });
    expect(marker.props.accessible).toBe(false);
    const rect = marker.props.children;
    expect(rect.props.stroke).toBe(paletteFor(light).fg);
    expect(rect.props.fill).toBe(['#000000', '#FFD300', '#F3A9BB', '#61686B'][index]);
    expect(pair[1].type).toBe(Label);
    const label = Label(pair[1].props);
    expect(label.props.children).toBe(lines[index].name);
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.style).toContainEqual(expect.objectContaining({ color: paletteFor(light).fg }));
  }
});

it('renders no invented labels for an empty service list', () => {
  expect(Children.count(LineLabels({ lines: [] }).props.children)).toBe(0);
});
