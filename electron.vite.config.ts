import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          retentionMaintenanceWorker: resolve(
            'src/main/infrastructure/sqlite/retentionMaintenanceWorker.ts'
          ),
          mailSyncProjectionWorker: resolve(
            'src/main/infrastructure/sqlite/mailSyncProjectionWorker.ts'
          ),
          sqliteSanitizationWorker: resolve(
            'src/main/infrastructure/sqlite/sqliteSanitizationWorker.ts'
          )
        }
      }
    }
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        output: {
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
