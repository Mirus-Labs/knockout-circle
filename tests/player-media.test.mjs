import assert from 'node:assert/strict';
import test from 'node:test';

import { matchesPlayerVideo } from '../scripts/player-media.mjs';

test('player video verification requires the complete normalized player name', () => {
  assert.equal(matchesPlayerVideo({ name:'Kylian Mbappé', title:'Kylian Mbappe Goal | FIFA World Cup', authorName:'FIFA' }), true);
  assert.equal(matchesPlayerVideo({ name:'Kylian Mbappé', title:'Ethan Mbappe Goal | FIFA World Cup', authorName:'FIFA' }), false);
});

test('player video verification rejects unofficial channels', () => {
  assert.equal(matchesPlayerVideo({ name:'Kylian Mbappé', title:'Kylian Mbappe highlights', authorName:'Fan Channel' }), false);
});
