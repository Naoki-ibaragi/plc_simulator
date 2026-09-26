import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

//.gltfはimportするとassets/へ出力されるが、gltf内から相対パスで参照される.bin(やテクスチャ)は出力されない。
//開発サーバーではsrc配下から直接配信されるため動くが、ビルド後は存在しないパスになり読み込みに失敗する。
//そのため出力された.gltfを解析し、参照先ファイルを同じassets/ディレクトリへ同名で出力する
function gltfExternalResources(): Plugin {
  return {
    name: 'gltf-external-resources',
    apply: 'build',
    generateBundle(_options, bundle) {
      const root = this.environment.config.root;
      for (const output of Object.values(bundle)) {
        if (output.type !== 'asset' || !output.fileName.endsWith('.gltf')) continue;
        const gltf = JSON.parse(output.source.toString());
        const uris: string[] = [...(gltf.buffers ?? []), ...(gltf.images ?? [])]
          .map((entry: { uri?: string }) => entry.uri)
          .filter((uri): uri is string => !!uri && !uri.startsWith('data:'));
        for (const sourceGltf of output.originalFileNames) {
          for (const uri of uris) {
            const fileName = path.posix.join(path.posix.dirname(output.fileName), decodeURIComponent(uri));
            if (bundle[fileName]) continue;
            const sourcePath = path.resolve(root, path.dirname(sourceGltf), decodeURIComponent(uri));
            this.emitFile({ type: 'asset', fileName, source: readFileSync(sourcePath) });
          }
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss(),gltfExternalResources()],
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  build: {
    assetsInlineLimit: 0,
  },
})
