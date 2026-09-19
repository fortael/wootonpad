const test = require('node:test');
const assert = require('node:assert/strict');

const docker = require('../docker-status');

// Real lines from `docker ps -a --format '{{json .}}'`, trimmed. The first
// label value carries commas of its own — config_files lists two files.
const PS = [
  JSON.stringify({
    ID: '518b378f1006', Names: 'dto-generator-php-1', Image: 'dto-generator-php', State: 'running',
    Status: 'Up 12 days', RunningFor: '12 days ago', Ports: '9000/tcp',
    Labels: 'ci.branch=,com.docker.compose.project.config_files=/a/docker-compose.yml,/a/docker-compose.override.yml,com.docker.compose.project.working_dir=/Users/z/Projects/c4s/dto-generator,com.docker.compose.project=dto-generator,com.docker.compose.service=php',
  }),
  JSON.stringify({ ID: 'baff32d836b4', Names: 'helper', Image: 'helper:1', State: 'created', Status: 'Created', Labels: '' }),
  JSON.stringify({ ID: 'c0ffee000000', Names: 'db', Image: 'postgres:16', State: 'running', Status: 'Up 3 hours', Labels: '' }),
  'not json',
].join('\n');

const STATS = [
  JSON.stringify({ ID: '518b378f1006', CPUPerc: '0.01%', MemUsage: '21.84MiB / 7.817GiB', MemPerc: '0.27%', NetIO: '13.3MB / 87.6kB', PIDs: '4' }),
  JSON.stringify({ ID: 'c0ffee000000', CPUPerc: '12.5%', MemUsage: '512MiB / 7.817GiB', MemPerc: '6.4%', PIDs: '20' }),
].join('\n');

test('compose labels are read by key, even when another label holds commas', () => {
  const [php] = docker.parsePs(PS);
  assert.equal(php.workingDir, '/Users/z/Projects/c4s/dto-generator');
  assert.equal(php.service, 'php');
  assert.equal(php.composeProject, 'dto-generator');
});

test('unparseable lines are skipped', () => {
  assert.equal(docker.parsePs(PS).length, 3);
});

test('memory sizes read in binary and decimal units', () => {
  assert.equal(docker.bytes('21.84MiB'), Math.round(21.84 * 1024 * 1024));
  assert.equal(docker.bytes('13.3MB'), 13300000);
  assert.equal(docker.bytes('garbage'), 0);
});

test('running containers come first, heaviest first, with totals across them', () => {
  const merged = docker.mergeContainers(docker.parsePs(PS), docker.parseStats(STATS));
  assert.deepEqual(merged.containers.map(c => c.name), ['db', 'dto-generator-php-1', 'helper']);
  assert.equal(merged.totals.running, 2);
  assert.equal(merged.totals.stopped, 1);
  assert.equal(merged.totals.cpu, 12.5);
  assert.equal(merged.totals.memBytes, docker.bytes('512MiB') + docker.bytes('21.84MiB'));
  assert.equal(merged.totals.memLimitBytes, docker.bytes('7.817GiB'));
});
