import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPlayerRequest,
  evaluatePlayerRequest
} from '../dist/jev/evaluator.js';

const gameState = JSON.stringify({
  position: { x: 1, y: 64, z: 1 },
  nearbyHostileMobs: [],
  allowedActions: ['explore', 'observe', 'rest']
});

test('player routing only exposes safe actions currently allowed by game state', () => {
  const request = buildPlayerRequest('Bot, explore nearby', gameState, ['explore', 'observe', 'rest']);
  const choices = Object.keys(request.questions.intent.criteria);

  assert.deepEqual(choices, [
    'server_rules',
    'command_help',
    'conversation',
    'spam_or_abuse',
    'explore',
    'observe',
    'rest'
  ]);
  assert.equal(JSON.parse(request.state).playerMessage, 'Bot, explore nearby');
  assert.throws(() => buildPlayerRequest('dig for diamonds', gameState, ['mining']), RangeError);
});

test('player routing parses Jev action, toxicity, confidence, and uncertainty results', async () => {
  const fetcher = async (_url, init) => {
    const request = JSON.parse(init.body);
    const choices = Object.keys(request.questions.intent.criteria);
    const intentProbabilities = Object.fromEntries(
      choices.map((choice) => [choice, choice === 'explore' ? 0.8 : 0.2 / (choices.length - 1)])
    );
    return new Response(JSON.stringify({
      model: 'jev-test',
      answers: {
        intent: {
          type: 'choice',
          choice: 'explore',
          probabilities: intentProbabilities,
          confidence: 0.8
        },
        toxicity: {
          type: 'score',
          score: 0.1,
          legend: { low: 'Low', high: 'High' },
          probabilities: { low: 0.9, high: 0.1 },
          confidence: 0.9
        },
        need_llm: {
          type: 'score',
          score: 0.8,
          legend: { low: 'Low', high: 'High' },
          probabilities: { low: 0.2, high: 0.8 },
          confidence: 0.8
        },
        not_conversational: { type: 'noul', noul: 0.1 }
      },
      usage: { input_tokens: 10, output_tokens: 2 }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await evaluatePlayerRequest(
    'Bot, explore nearby',
    gameState,
    ['explore', 'observe', 'rest'],
    { JEV_API_KEY: 'test-key' },
    { fetcher, maxRetries: 0 }
  );

  assert.equal(result.choice, 'explore');
  assert.equal(result.choiceConfidence, 0.8);
  assert.equal(result.toxicity, 0.1);
  assert.equal(result.needLlm, 0.8);
  assert.equal(result.uncertain, false);
});
