import type { Api } from '@shared/ipc'
import { browserMock } from './browserMock'

declare global {
  interface Window {
    api?: Api
  }
}

export const api: Api = window.api ?? browserMock
