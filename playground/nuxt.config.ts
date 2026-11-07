// Dev and CI host for the layer: typecheck, build and a local look at the screens.
export default defineNuxtConfig({
  extends: ['..'],
  modules: ['@nuxt/ui'],
  css: ['~/assets/main.css'],
  nitro: { preset: 'bun' },
  compatibilityDate: '2026-11-01',
})
