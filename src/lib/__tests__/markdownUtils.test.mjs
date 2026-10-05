import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeListIndentation, preprocessMarkdown } from '../markdownUtils.ts';

describe('markdownUtils', () => {
  it('normalizes 2-space indented numbered sub-bullets', () => {
    const input = [
      '1. d',
      '2. d',
      '  1. fd',
      '  2. df',
      '    1. d',
    ].join('\n');

    const expected = [
      '1. d',
      '2. d',
      '    1. fd',
      '    2. df',
      '        1. d',
    ].join('\n');

    assert.equal(normalizeListIndentation(input), expected);
  });

  it('normalizes 2-space indented bullet lists', () => {
    const input = [
      '- d',
      '- d',
      '  - fd',
      '  - df',
      '    - d',
    ].join('\n');

    const expected = [
      '- d',
      '- d',
      '    - fd',
      '    - df',
      '        - d',
    ].join('\n');

    assert.equal(normalizeListIndentation(input), expected);
  });

  it('normalizes mixed ordered and unordered lists', () => {
    const input = [
      '1. d',
      '  - bullet sub',
      '    1. numbered sub-sub',
    ].join('\n');

    const expected = [
      '1. d',
      '    - bullet sub',
      '        1. numbered sub-sub',
    ].join('\n');

    assert.equal(normalizeListIndentation(input), expected);
  });

  it('preserves line counts exactly in preprocessMarkdown', () => {
    const input = [
      '## Sister Andrea Muñoz Spannaus',
      '- I don\'t know. That is my bad.',
      '1. d',
      '2. d',
      '  1. fd',
      '  2. df',
      '    1. d',
      '',
      '- d',
      '- d',
      '  - fd',
      '  - df',
      '    - d',
      '',
      '## Elder Moisés Villanueva',
      '- Blessings of tithing are often simple and can be easily overlooked. Recognize them.',
      'Some ++underlined++ text and <u>html underline</u>',
    ].join('\n');

    const processed = preprocessMarkdown(input);
    assert.equal(processed.split('\n').length, input.split('\n').length);
    assert.match(processed, /\[underlined\]\(#u\)/);
    assert.match(processed, /\[html underline\]\(#u\)/);
  });

  it('does not touch code blocks', () => {
    const input = [
      '```',
      '1. item',
      '  2. item',
      '```',
    ].join('\n');

    assert.equal(normalizeListIndentation(input), input);
  });

  it('handles task lists with checkboxes', () => {
    const input = [
      '1. [ ] first',
      '  1. [x] second',
      '    1. [ ] third',
    ].join('\n');

    const expected = [
      '1. [ ] first',
      '    1. [x] second',
      '        1. [ ] third',
    ].join('\n');

    assert.equal(normalizeListIndentation(input), expected);
  });
});
