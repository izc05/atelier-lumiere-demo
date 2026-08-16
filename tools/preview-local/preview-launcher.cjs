const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HOST = '127.0.0.1';
const FIRST_PORT = 4177;
const LAST_PORT = 4199;

function portAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', () => resolve(false));
    probe.listen(port, HOST, () => {
      probe.close(() => resolve(true));
    });
  });
}

async function choosePort() {
  for (let port = FIRST_PORT; port <= LAST_PORT; port += 1) {
    if (await portAvailable(port)) return port;
  }
  throw new Error(`No hay puertos libres entre ${FIRST_PORT} y ${LAST_PORT}`);
}

function previewCommit() {
  try {
    return fs.readFileSync(path.join(__dirname, 'PREVIEW_COMMIT.txt'), 'utf8').trim() || 'sin-identificar';
  } catch {
    return 'sin-identificar';
  }
}

(async () => {
  try {
    const port = await choosePort();
    const commit = previewCommit();
    console.log('');
    console.log('------------------------------------------------------------');
    console.log(' ATELIER LUMIÈRE · LANZADOR DE PREVIEW');
    console.log('------------------------------------------------------------');
    console.log(` Commit del ZIP: ${commit}`);
    console.log(` Puerto elegido: ${port}`);
    if (port !== FIRST_PORT) {
      console.log(` Aviso: ${FIRST_PORT} ya estaba ocupado; probablemente hay otra preview abierta.`);
    }
    console.log('------------------------------------------------------------');
    console.log('');

    const child = spawn(process.execPath, ['preview-server.cjs'], {
      cwd: __dirname,
      env: { ...process.env, ATELIER_PREVIEW_PORT: String(port), ATELIER_PREVIEW_COMMIT: commit },
      stdio: 'inherit'
    });

    child.on('exit', (code, signal) => {
      if (signal) process.exitCode = 1;
      else process.exitCode = Number.isInteger(code) ? code : 0;
    });
  } catch (error) {
    console.error(`No se pudo lanzar la preview: ${error.message}`);
    process.exitCode = 1;
  }
})();
