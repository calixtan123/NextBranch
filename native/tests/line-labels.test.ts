/** Tests actual line-label and swatch element output through native host mocks. */
import { Children, isValidElement } from 'react';
import { expect, it, vi } from 'vitest';
import { LineLabels } from '../src/LineLabels';
import { Label, LineMarker, Result, paletteFor } from '../src/theme';

const theme = vi.hoisted(() => ({ light: false }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: (value: unknown) => value } }));
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

it.each([false, true])('omits empty picker subtext and accessibility punctuation in light=%s', light => {
  theme.light = light;
  const tree = Result({ title: 'Eastbound Platform 3', detail: '', titleEmphasis: true, onPress: vi.fn() });
  expect(tree.props.accessibilityLabel).toBe('Eastbound Platform 3');
  const content = Children.toArray(tree.props.children).filter(isValidElement<Record<string, any>>)[0];
  const labels = Children.toArray(content.props.children).filter(isValidElement<Record<string, any>>);
  expect(labels).toHaveLength(1);
  expect(Label(labels[0].props).props.children).toBe('Eastbound Platform 3');
});

it('renders no invented labels for an empty service list', () => {
  expect(Children.count(LineLabels({ lines: [] }).props.children)).toBe(0);
});


it.each([false, true])('emphasises picker titles with complete scalable accessible copy in light=%s', light => {
  theme.light = light;
  const tree = Result({ title: 'Northbound Platform 3', detail: 'Towards Edgware', titleEmphasis: true, onPress: vi.fn() });
  expect(tree.props.accessibilityRole).toBe('button');
  expect(tree.props.accessibilityLabel).toBe('Northbound Platform 3. Towards Edgware');
  const content = Children.toArray(tree.props.children).filter(isValidElement<Record<string, any>>)[0];
  const labels = Children.toArray(content.props.children).filter(isValidElement<Record<string, any>>);
  const title = Label(labels[0].props);
  const destination = Label(labels[1].props);
  expect(title.props.children).toBe('Northbound Platform 3');
  expect(title.props.style).toContainEqual(expect.objectContaining({ fontSize: 17, fontWeight: '600' }));
  expect(destination.props.children).toBe('Towards Edgware');
  expect(destination.props.style).toContainEqual(expect.objectContaining({ fontSize: 15, color: paletteFor(light).dim }));
  for (const label of [title, destination]) {
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.allowFontScaling).not.toBe(false);
  }
  expect(tree.props.style({ pressed: false })).toContainEqual(expect.objectContaining({ minHeight: 64 }));
  const regular = Result({ title: 'Other result', detail: '', onPress: vi.fn() });
  const regularContent = Children.toArray(regular.props.children).filter(isValidElement<Record<string, any>>)[0];
  const regularTitle = Children.toArray(regularContent.props.children).filter(isValidElement<Record<string, any>>)[0];
  expect(Label(regularTitle.props).props.style).toContainEqual(expect.objectContaining({ fontWeight: '400' }));
});
