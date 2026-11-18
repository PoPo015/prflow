import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { prflowApi } from './server/api'

export default defineConfig({ plugins: [react(), prflowApi()] })
