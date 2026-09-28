import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { localComicPreviewPlugin } from './tools/local-comic-preview-plugin.js'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = process.env.GITHUB_ACTIONS === 'true' && repositoryName
  ? `/${repositoryName}/`
  : '/'

export default defineConfig({
  base,
  plugins: [react(), localComicPreviewPlugin()],
  server: {
    watch: {
      ignored: ['**/HQ Torneio Infernal - Aurora vs Drekalia 1/**'],
    },
  },
})
