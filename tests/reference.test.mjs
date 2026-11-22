import test from 'node:test';
import assert from 'node:assert/strict';
import {executePipeline, orderStages, PipelineError} from '../reference/pipeline.mjs';
import {example} from '../reference/sample.mjs';

test('join of two independent sources is deterministic', () => {
  const result = executePipeline(example);
  assert.deepEqual(result.rows, [{id:'c-1', active:true, client:'c-1', amount:120}]);
  assert.deepEqual(result.audit.map(step => step.stage), ['clients','active','payments','joined','result']);
});

test('unknown inputs fail before execution', () => {
  const modified = structuredClone(example);
  modified.stages[3].inputs[1] = 'missing';
  assert.throws(() => executePipeline(modified), PipelineError);
});

test('cyclic dependencies are rejected', () => {
  assert.throws(() => orderStages([
    {id:'a',kind:'output',inputs:['b'],config:{}},
    {id:'b',kind:'filter',inputs:['a'],config:{field:'x', equals:1}},
  ]), /cycle/);
});

test('duplicate right side keys fail closed', () => {
  const modified = structuredClone(example);
  modified.stages[1].config.rows.push({client:'c-1',amount:500});
  assert.throws(() => executePipeline(modified), /unique/);
});

test('invalid source sizes are rejected', () => {
  const modified = structuredClone(example);
  modified.stages[0].config.rows = Array.from({length:1001}, (_,id)=>({id}));
  assert.throws(() => executePipeline(modified), /oversized/);
});

test('arbitrary script operators are not supported', () => {
  const modified = structuredClone(example);
  modified.stages[0].kind = 'javascript';
  assert.throws(() => executePipeline(modified), PipelineError);
});
