#!/usr/bin/env node
/** Disposable local Emby lab. Never operates on the default Compose project. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { loadScenario, simulatorConfig, sameInventory } from './scenario.mjs';
import { cleanupScenarioFiles } from './scenario-cleanup.mjs';
import { udpServices } from './udp-services.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [action = 'help', ...args] = process.argv.slice(2);
const id = process.env.OLFX_LAB_ID ?? 'agent';
if (!/^[a-z][a-z0-9-]{0,31}$/.test(id)) throw new Error('Invalid OLFX_LAB_ID');
const work = path.join(root, '.emby-stack', 'labs', id);
const composeFile = path.join(work, 'compose.json');
const project = `olfx-lab-${id}`;
const port = Number(process.env.OLFX_LAB_PORT ?? 18096);
const controlPort = Number(process.env.OLFX_LAB_CONTROL_PORT ?? 19202);
const plugin = path.resolve(process.env.OLFX_EMBY_REPO ?? path.join(root, '../openlightfx-emby'));
const simulator = path.join(root, 'docker/simulator-src');
const env = {
  ...process.env,
  OLFX_COMPOSE_FILE: composeFile,
  OLFX_COMPOSE_PROJECT: project,
  OLFX_STACK_DIR: work,
  OLFX_MEDIA_DIR: path.join(work, 'media'),
  OLFX_EMBY_REPO: plugin,
  OLFX_EMBY_URL: `http://127.0.0.1:${port}`,
  OLFX_SIMULATOR_CONTROL_URL: `http://127.0.0.1:${controlPort}`,
  OLFX_UID: String(process.getuid()),
  OLFX_GID: String(process.getgid()),
  OLFX_FULLSTACK_REQUIRE: '1',
  OLFX_LAB_START_ONLY: '1',
};
function command(bin, argv, options = {}) {
  const result = spawnSync(bin, argv, {
    cwd: root,
    env,
    stdio: 'inherit',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${bin} failed (${result.status})`);
  return result.stdout?.toString() ?? '';
}
const compose = (...argv) =>
  command('docker', ['compose', '-f', composeFile, '-p', project, ...argv]);
function identity(repo) {
  const git = (...argv) => command('git', ['-C', repo, ...argv], { stdio: 'pipe' }).trim();
  return {
    path: repo,
    revision: git('rev-parse', 'HEAD'),
    branch: git('branch', '--show-current'),
    status: git('status', '--short'),
    diff: git('diff', 'HEAD'),
    fileHashes: Object.fromEntries(
      git('ls-files', '-c', '-o', '--exclude-standard', '-z')
        .split('\0')
        .filter(Boolean)
        .filter((name) => fs.statSync(path.join(repo, name), { throwIfNoEntry: false })?.isFile())
        .map((name) => [
          name,
          createHash('sha256')
            .update(fs.readFileSync(path.join(repo, name)))
            .digest('hex'),
        ])
    ),
  };
}
function initialize() {
  if (
    ![port, controlPort].every((p) => Number.isInteger(p) && p > 1024 && p < 65536) ||
    port === controlPort
  )
    throw new Error('Lab ports must be distinct unprivileged TCP ports');
  for (const bin of ['docker', 'dotnet', 'ffmpeg', 'ffprobe', 'python3', 'zip'])
    command('bash', ['-c', 'command -v "$1" >/dev/null', '--', bin]);
  command('docker', ['info'], { stdio: 'pipe' });
  if (!fs.existsSync(path.join(simulator, 'src/openlightfx_simulator/control.py')))
    throw new Error('Simulator checkout with the observation API is required');
  fs.mkdirSync(work, { recursive: true, mode: 0o700 });
  const scenario = env.OLFX_LAB_SCENARIO ? loadScenario(path.resolve(env.OLFX_LAB_SCENARIO)) : null;
  if (scenario) {
    // Stage input only until results are collected; never include it in durable evidence.
    fs.copyFileSync(path.resolve(env.OLFX_LAB_SCENARIO), path.join(work, 'scenario.json'));
    env.OLFX_LAB_SCENARIO_FILE = path.join(work, 'scenario.json');
  } else {
    fs.rmSync(path.join(work, 'scenario.json'), { force: true });
    delete env.OLFX_LAB_SCENARIO_FILE;
  }
  const udp = scenario ? udpServices(scenario, root) : {};
  const hasUdp = Object.keys(udp).length > 0;
  const sources = {
    studio: identity(root),
    plugin: identity(plugin),
    simulator: identity(simulator),
  };
  fs.writeFileSync(
    path.join(work, 'manifest.json'),
    JSON.stringify(
      {
        id,
        project,
        createdAt: new Date().toISOString(),
        embyImage: 'emby/embyserver:4.9.3.0',
        embyUrl: env.OLFX_EMBY_URL,
        controlUrl: env.OLFX_SIMULATOR_CONTROL_URL,
        bulbIds: scenario ? scenario.room.bulbs.map((bulb) => bulb.id) : ['left', 'right'],
        scenario: scenario ? 'scenario.json' : null,
        inventory: scenario
          ? scenario.room.bulbs.map(({ id, name, port, protocol }) => ({
              id,
              name,
              port,
              protocol,
            }))
          : null,
        sources,
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  const config = fs
    .readFileSync(path.join(root, 'docker/simulator.toml'), 'utf8')
    .replace('[simulator]', '[simulator]\ncontrol_host = "0.0.0.0"\ncontrol_port = 9202');
  fs.writeFileSync(
    path.join(work, 'simulator.toml'),
    scenario ? simulatorConfig(scenario) : config
  );
  fs.writeFileSync(
    composeFile,
    JSON.stringify(
      {
        ...(hasUdp ? { networks: { default: {}, bulbs: { internal: true } } } : {}),
        services: {
          ...udp,
          ...(hasUdp
            ? {
                'discovery-network': {
                  build: { context: root, dockerfile: 'docker/discovery-network.Dockerfile' },
                  network_mode: 'service:emby',
                  cap_add: ['NET_ADMIN'],
                  profiles: ['tools'],
                  command: [Object.keys(udp)[0]],
                },
              }
            : {}),
          emby: {
            ...(hasUdp ? { networks: ['default', 'bulbs'] } : {}),
            image: 'emby/embyserver:4.9.3.0',
            ports: [`127.0.0.1:${port}:8096`],
            environment: {
              TZ: 'UTC',
              UID: String(process.getuid()),
              GID: String(process.getgid()),
              OLFX_STUDIO_PROXY_READRATE: '1',
            },
            volumes: [
              'emby-config:/config',
              'emby-plugins:/config/plugins',
              `${env.OLFX_MEDIA_DIR}:/media`,
            ],
          },
          simulator: {
            ...(hasUdp ? { networks: ['default', 'bulbs'] } : {}),
            build: { context: root, dockerfile: 'docker/simulator.Dockerfile' },
            ports: [`127.0.0.1:${controlPort}:9202`],
            volumes: [`${work}/simulator.toml:/config/simulator.toml:ro`],
          },
        },
        volumes: { 'emby-config': {}, 'emby-plugins': {} },
      },
      null,
      2
    )
  );
}
function requireLab() {
  if (!fs.existsSync(composeFile)) throw new Error('Lab not initialized; run start first');
  const manifest = JSON.parse(fs.readFileSync(path.join(work, 'manifest.json')));
  env.OLFX_EMBY_URL = manifest.embyUrl;
  env.OLFX_SIMULATOR_CONTROL_URL = manifest.controlUrl;
  if (manifest.scenario) {
    env.OLFX_LAB_SCENARIO_FILE = path.join(work, manifest.scenario);
    if (action === 'run') {
      const configured = manifest.inventory
        ? { room: { bulbs: manifest.inventory } }
        : fs.existsSync(env.OLFX_LAB_SCENARIO_FILE)
          ? loadScenario(env.OLFX_LAB_SCENARIO_FILE)
          : null;
      if (env.OLFX_LAB_SCENARIO) {
        const requestedFile = path.resolve(env.OLFX_LAB_SCENARIO);
        const requested = loadScenario(requestedFile);
        if (!configured || !sameInventory(requested, configured))
          throw new Error(
            'Bulb inventory differs from the provisioned lab; use a new lab or explicit reset'
          );
        const runtimeFile = path.join(work, 'run-scenario.json');
        if (requestedFile !== runtimeFile) fs.copyFileSync(requestedFile, runtimeFile);
        env.OLFX_LAB_SCENARIO_FILE = runtimeFile;
      } else {
        if (!fs.existsSync(env.OLFX_LAB_SCENARIO_FILE))
          throw new Error(
            'Previous scenario input was cleaned up; supply OLFX_LAB_SCENARIO for this run'
          );
        fs.rmSync(path.join(work, 'run-scenario.json'), { force: true });
      }
    }
  } else {
    delete env.OLFX_LAB_SCENARIO_FILE;
    if (action === 'run' && env.OLFX_LAB_SCENARIO)
      throw new Error('Lab was not provisioned for this scenario; use start/reset');
  }
}
async function ready() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${env.OLFX_SIMULATOR_CONTROL_URL}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      const expected = JSON.parse(fs.readFileSync(path.join(work, 'manifest.json'))).bulbIds ?? [
        'left',
        'right',
      ];
      const actual = r.ok ? Object.keys((await r.json()).bulbs).sort() : [];
      if (JSON.stringify(actual) === JSON.stringify([...expected].sort())) {
        const services = Object.keys(JSON.parse(fs.readFileSync(composeFile)).services).filter(
          (name) => name.startsWith('udp-')
        );
        for (const service of services) {
          const container = composeCapture('ps', '-q', service).trim();
          const status = command(
            'docker',
            ['inspect', '--format', '{{.State.Health.Status}}', container],
            { stdio: 'pipe' }
          ).trim();
          if (status !== 'healthy') throw new Error(`UDP endpoint ${service} not ready`);
        }
        const session = JSON.parse(fs.readFileSync(path.join(work, 'session.json')));
        const setup = await fetch(`${env.OLFX_EMBY_URL}/OpenLightFX/Studio/Setup`, {
          headers: { 'X-Emby-Token': session.apiKey },
          signal: AbortSignal.timeout(1000),
        });
        if (setup.ok) return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Emby plugin and simulator observation API did not become ready');
}
function collect() {
  const out = path.join(work, 'artifacts', new Date().toISOString().replaceAll(':', '-'));
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  for (const name of ['manifest.json', 'rooms.json', 'simulator.ndjson', 'build.log']) {
    const source = path.join(work, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(out, name));
  }
  const udp = Object.keys(JSON.parse(fs.readFileSync(composeFile)).services).filter((name) =>
    name.startsWith('udp-')
  );
  for (const service of ['emby', 'simulator', ...udp]) {
    try {
      const logs = composeCapture('logs', '--no-color', '--tail', '10000', service);
      fs.writeFileSync(path.join(out, `${service}.log`), logs, { mode: 0o600 });
    } catch (error) {
      fs.writeFileSync(path.join(out, `${service}-collection-error.txt`), String(error));
    }
  }
  try {
    const container = composeCapture('ps', '-aq', 'emby').trim();
    if (container)
      command('docker', ['cp', `${container}:/config/logs`, path.join(out, 'emby-runtime-logs')], {
        stdio: 'pipe',
      });
  } catch (error) {
    fs.writeFileSync(path.join(out, 'runtime-log-collection-error.txt'), String(error));
  }
  for (const name of ['playwright', 'playwright.json', 'lab-result.json']) {
    const src = path.join(root, 'test-results', name);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(out, name), { recursive: true });
  }
  if (fs.existsSync(env.OLFX_MEDIA_DIR))
    fs.cpSync(env.OLFX_MEDIA_DIR, path.join(out, 'media'), {
      recursive: true,
      filter: (src) => fs.statSync(src).isDirectory() || /\.(lightfx|json)$/.test(src),
    });
  console.log(`Evidence: ${out} (restricted; traces/logs may contain disposable lab credentials)`);
}
function composeCapture(...argv) {
  return command('docker', ['compose', '-f', composeFile, '-p', project, ...argv], {
    stdio: 'pipe',
  });
}
if (action === 'help') {
  console.log(
    'node scripts/fullstack/lab.mjs start|status|reset|run [Playwright args]|collect|stop\n' +
      'OLFX_LAB_ID, OLFX_LAB_PORT, OLFX_LAB_CONTROL_PORT, OLFX_EMBY_REPO select the isolated lab.\n' +
      'run defaults to the state-observed controlled-session golden path; add --grep for other tests.'
  );
} else {
  fs.mkdirSync(work, { recursive: true, mode: 0o700 });
  const lock = path.join(work, '.lock');
  const fd = fs.openSync(lock, 'wx', 0o600);
  try {
    if (action === 'start' || action === 'reset') {
      if (action === 'reset') {
        requireLab();
        compose('down', '-v');
        fs.rmSync(env.OLFX_MEDIA_DIR, { recursive: true, force: true });
      } else if (fs.existsSync(composeFile)) {
        requireLab();
        if (composeCapture('ps', '-aq').trim())
          throw new Error('Lab already exists; use reset or stop');
      }
      initialize();
      const buildLog = fs.openSync(path.join(work, 'build.log'), 'w', 0o600);
      try {
        console.log(`Building local lab; log: ${work}/build.log`);
        command('bash', ['scripts/fullstack/run.sh'], { stdio: ['ignore', buildLog, buildLog] });
      } finally {
        fs.closeSync(buildLog);
      }
      if (JSON.parse(fs.readFileSync(composeFile)).services['discovery-network']) {
        compose('build', 'discovery-network');
        compose('run', '--rm', '--no-deps', 'discovery-network');
      }
      await ready();
      console.log(`Studio: ${env.OLFX_EMBY_URL}/emby/OpenLightFX/studio/`);
    } else {
      requireLab();
      if (action === 'status') {
        compose('ps');
        await ready();
      } else if (action === 'stop') compose('down');
      else if (action === 'collect') collect();
      else if (action === 'run') {
        await ready();
        const session = JSON.parse(fs.readFileSync(path.join(work, 'session.json')));
        env.OLFX_API_KEY = session.apiKey;
        env.OLFX_VIEWER_TOKEN = session.viewerToken;
        if (env.OLFX_LAB_TEST_FILE) {
          fs.copyFileSync(path.resolve(env.OLFX_LAB_TEST_FILE), path.join(work, 'custom.spec.ts'));
          env.OLFX_LAB_TEST_DIR = work;
        } else {
          fs.rmSync(path.join(work, 'custom.spec.ts'), { force: true });
        }
        env.OLFX_NDJSON = path.join(work, 'simulator.ndjson');
        env.OLFX_OUTCOMES = path.join(root, 'test-results', `outcomes-fullstack-lab-${id}.jsonl`);
        env.OLFX_LAB = '1';
        const started = new Date().toISOString();
        let failed;
        const logFd = fs.openSync(env.OLFX_NDJSON, 'w', 0o600);
        const container = composeCapture('ps', '-q', 'simulator').trim();
        const follower = spawn('docker', ['logs', '--since', started, '-f', container], {
          stdio: ['ignore', logFd, 'ignore'],
        });
        try {
          command('npx', [
            'playwright',
            'test',
            env.OLFX_LAB_TEST_FILE
              ? '--project=fullstack-lab-custom'
              : env.OLFX_LAB_SCENARIO_FILE
                ? '--project=fullstack-lab-scenario'
                : '--project=fullstack-lab',
            '--workers=1',
            ...(args.length ? args : env.OLFX_LAB_TEST_FILE ? [] : ['--grep', 'LAB-']),
          ]);
        } catch (error) {
          failed = error;
        } finally {
          follower.kill();
          fs.closeSync(logFd);
        }
        fs.rmSync(path.join(work, 'rooms.json'), { force: true });
        try {
          const roomResponse = await fetch(`${env.OLFX_EMBY_URL}/OpenLightFX/Studio/Rooms`, {
            headers: { 'X-Emby-Token': env.OLFX_API_KEY },
            signal: AbortSignal.timeout(5000),
          });
          if (roomResponse.ok)
            fs.writeFileSync(path.join(work, 'rooms.json'), await roomResponse.text());
        } catch (error) {
          console.error('Room evidence unavailable:', String(error));
        }
        fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
        fs.writeFileSync(
          path.join(root, 'test-results/lab-result.json'),
          JSON.stringify(
            {
              started,
              ended: new Date().toISOString(),
              status: failed ? 'failed' : 'passed',
              arguments: args,
              playbackMode:
                env.OLFX_LAB_PLAYBACK ?? (env.OLFX_LAB_SCENARIO_FILE ? 'web' : 'controlled'),
              runnerSources: identity(root),
              error: failed?.message,
            },
            null,
            2
          )
        );
        collect();
        if (failed) throw failed;
      } else throw new Error(`Unknown action: ${action}`);
    }
  } finally {
    try {
      if (action === 'run' || action === 'stop') cleanupScenarioFiles(work);
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }
}
