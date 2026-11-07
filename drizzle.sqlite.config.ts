import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './lib/storage/sqlite/schema.ts',
  out: './lib/storage/sqlite/migrations',
})
