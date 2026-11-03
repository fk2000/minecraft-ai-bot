import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMcProfiles } from '../dist/bot/profiles.js';

test('legacy env produces default profile', () => {
  const loaded = loadMcProfiles({
    MC_SERVER_HOST: 'mc.example',
    MC_SERVER_PORT: '25565',
    MC_USERNAME: 'Bot',
    MC_AUTH: 'offline'
  });
  assert.equal(loaded.defaultProfileName, 'default');
  const profile = loaded.profiles.get('default');
  assert.ok(profile);
  assert.equal(profile.host, 'mc.example');
  assert.equal(profile.port, 25565);
  assert.equal(profile.username, 'Bot');
  assert.equal(profile.auth, 'offline');
  assert.equal(profile.inventoryShared, false);
});

test('MC_PROFILES_JSON loads named profiles', () => {
  const loaded = loadMcProfiles({
    MC_PROFILES_JSON: JSON.stringify([
      { name: 'a', host: 'a.test', port: 25565, username: 'A', auth: 'offline', inventoryShared: true },
      { name: 'b', host: 'b.test', port: 25566, username: 'B', auth: 'offline' }
    ]),
    MC_DEFAULT_PROFILE: 'b'
  });
  assert.equal(loaded.defaultProfileName, 'b');
  assert.equal(loaded.profiles.size, 2);
  assert.equal(loaded.profiles.get('a')?.inventoryShared, true);
});
