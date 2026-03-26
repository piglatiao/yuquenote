import { spawn } from 'node:child_process';
import net from 'node:net';

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const processes = [];

function startProcess(command, args, name) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
    }
    shutdown(code ?? 0);
  });

  processes.push(child);
  return child;
}

let shuttingDown = false;

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }

  setTimeout(() => process.exit(exitCode), 200);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (!(await isPortOpen(3001))) {
  startProcess('node', ['server/app.mjs'], 'API server');
} else {
  console.log('API server already running on http://127.0.0.1:3001');
}

if (!(await isPortOpen(5173))) {
  startProcess(pnpmCommand, ['exec', 'vite'], 'Vite dev server');
} else {
  console.log('Vite dev server already running on http://127.0.0.1:5173');
}
