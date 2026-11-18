import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error JS 모듈 (bin/prflow.mjs 와 같이 쓰려고 .mjs)
import { handleApi, handleFlows } from './server/api.mjs'

// dev 서버에 로컬 API 와 분석 결과(~/.prflow/flows)를 붙인다
const prflowApi = (): Plugin => ({
  name: 'prflow-api',
  configureServer(server) {
    server.middlewares.use('/api', handleApi)
    server.middlewares.use('/flows', handleFlows)
  },
})

export default defineConfig({ plugins: [react(), prflowApi()] })
