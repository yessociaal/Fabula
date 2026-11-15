import { describe, expect, it } from 'vitest'
import { assetNameFromFile } from '@shared/assetTypes'
import { formatDuration, plural } from '../src/renderer/util'

describe('asset helpers', () => {
  it('names an asset after its file without folder and extension', () => {
    expect(assetNameFromFile('happy.png')).toBe('happy')
    expect(assetNameFromFile('C:\\art\\Anna sad.v2.PNG')).toBe('Anna sad.v2')
    expect(assetNameFromFile('.png')).toBe('Untitled')
    expect(assetNameFromFile('noext')).toBe('noext')
  })
  it('formats durations', () => {
    expect(formatDuration(75.2)).toBe('1:15')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(null)).toBe('–')
    expect(formatDuration(NaN)).toBe('–')
  })
  it('pluralises', () => {
    expect(plural(1, 'place')).toBe('1 place')
    expect(plural(0, 'place')).toBe('0 places')
    expect(plural(5, 'time')).toBe('5 times')
  })
})
