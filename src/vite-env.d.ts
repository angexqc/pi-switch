/// <reference types="vite/client" />
import type { PiswitchApi } from '../shared/types';

declare global {
  interface Window {
    piswitch: PiswitchApi;
  }
}

export {};
