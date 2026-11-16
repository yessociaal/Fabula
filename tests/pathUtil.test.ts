import { describe, expect, it } from 'vitest'
import { defaultGameDir, joinPath, parentDir, safeFolderName } from '../src/renderer/pathUtil'

describe('path helpers', () => {
  it('finds the parent of a Windows path', () => {
    expect(parentDir('C:\\Stories\\My Novel')).toBe('C:\\Stories')
    expect(parentDir('C:\\Stories\\My Novel\\')).toBe('C:\\Stories')
    expect(parentDir('C:\\Novel')).toBe('C:\\')
  })
  it('finds the parent of a posix path', () => {
    expect(parentDir('/home/me/novel')).toBe('/home/me')
  })
  it('joins with the separator the path already uses', () => {
    expect(joinPath('C:\\Stories', 'x')).toBe('C:\\Stories\\x')
    expect(joinPath('C:\\', 'x')).toBe('C:\\x')
    expect(joinPath('/a', 'x')).toBe('/a/x')
  })
  it('makes folder names safe', () => {
    expect(safeFolderName('What? "Now": a/b')).toBe('What Now ab')
    expect(safeFolderName('  ')).toBe('Untitled story')
    expect(safeFolderName('Ends with dot.')).toBe('Ends with dot')
  })
  it('builds the default game folder next to the story folder', () => {
    expect(defaultGameDir('C:\\Stories\\My Novel', 'My Novel')).toBe("C:\\Stories\\My Novel (Ren'Py game)")
  })
})
