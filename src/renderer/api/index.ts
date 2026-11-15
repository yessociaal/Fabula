import { browserMock } from './browserMock'

declare global {
  interface Window {
    api?: Record<string, unknown>
  }
}

export const api = window.api ?? browserMock
