import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(cleanup)

// jsdom has no viewport media-query engine. Keep Bootstrap's drawer API available.
Object.defineProperty(window, 'matchMedia', { writable: true, value: (query) => ({
  matches: false, media: query, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
}) })
