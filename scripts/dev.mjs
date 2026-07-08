import { spawn } from 'node:child_process';

const api = spawn('node', ['server/index.js'], { stdio: 'inherit' });
const web = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173'], {
  stdio: 'inherit',
});

function shutdown(code = 0) {
  api.kill('SIGINT');
  web.kill('SIGINT');
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

[api, web].forEach((proc) => {
  proc.on('exit', (code) => {
    if (code && code !== 0) shutdown(code);
  });
});
