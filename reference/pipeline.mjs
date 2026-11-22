/**
 * Deterministic, bounded pipeline executor for the public reference repository.
 * This is not the private job runner: no network, filesystem, arbitrary code or SQL.
 */
export class PipelineError extends Error {}

const supported = new Set(['source', 'select', 'filter', 'join', 'count', 'output']);
const expectedInputs = {source: 0, select: 1, filter: 1, join: 2, count: 1, output: 1};
const MAX_ROWS = 1000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function orderStages(stages) {
  if (!Array.isArray(stages) || stages.length === 0 || stages.length > 50) {
    throw new PipelineError('pipeline needs 1-50 stages');
  }
  const nodes = new Map();
  for (const stage of stages) {
    if (!isPlainObject(stage) || typeof stage.id !== 'string' || !/^[a-z][\w-]*$/.test(stage.id)
      || nodes.has(stage.id) || !supported.has(stage.kind)) {
      throw new PipelineError('invalid or duplicate stage');
    }
    if (!Array.isArray(stage.inputs) || stage.inputs.length !== expectedInputs[stage.kind]
      || !isPlainObject(stage.config)) {
      throw new PipelineError(`invalid stage declaration: ${stage.id}`);
    }
    nodes.set(stage.id, stage);
  }
  for (const stage of stages) {
    if (stage.inputs.some(id => !nodes.has(id) || id === stage.id)) {
      throw new PipelineError(`unknown input or self-edge: ${stage.id}`);
    }
  }
  const ordered = [], visited = new Set(), visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new PipelineError('cycle detected');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const upstream of nodes.get(id).inputs) visit(upstream);
    visiting.delete(id);
    visited.add(id);
    ordered.push(nodes.get(id));
  }
  for (const id of [...nodes.keys()].sort()) visit(id);
  return ordered;
}

function bounded(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS || rows.some(v => !isPlainObject(v))) {
    throw new PipelineError('invalid or oversized record collection');
  }
  return rows;
}

function evaluate(stage, incoming) {
  const config = stage.config;
  switch (stage.kind) {
    case 'source':
      return bounded(config.rows).map(row => ({...row}));
    case 'select': {
      if (!Array.isArray(config.fields) || !config.fields.every(f => typeof f === 'string')) {
        throw new PipelineError('select requires a list of fields');
      }
      return incoming[0].map(row => Object.fromEntries(config.fields.map(f => [f, row[f] ?? null])));
    }
    case 'filter': {
      if (typeof config.field !== 'string') throw new PipelineError('filter field required');
      return incoming[0].filter(row => row[config.field] === config.equals);
    }
    case 'join': {
      const {leftKey, rightKey, mode = 'inner'} = config;
      if (typeof leftKey !== 'string' || typeof rightKey !== 'string'
        || !['inner','left'].includes(mode)) throw new PipelineError('invalid join configuration');
      const right = new Map();
      for (const row of incoming[1]) {
        const key = row[rightKey];
        if (key === undefined || key === null || right.has(key)) {
          throw new PipelineError('join requires unique, non-null right-side keys');
        }
        right.set(key, row);
      }
      const rows = [];
      for (const leftRow of incoming[0]) {
        const match = right.get(leftRow[leftKey]);
        if (!match && mode === 'inner') continue;
        if (match && Object.keys(match).some(key => Object.hasOwn(leftRow, key))) {
          throw new PipelineError('ambiguous overlapping columns in join');
        }
        rows.push({...leftRow, ...(match ?? {})});
        if (rows.length > MAX_ROWS) throw new PipelineError('join output limit exceeded');
      }
      return rows;
    }
    case 'count':
      return [{count: incoming[0].length}];
    case 'output':
      return incoming[0].map(row => ({...row}));
    default:
      throw new PipelineError('operator not allowed');
  }
}

export function executePipeline(definition) {
  const ordered = orderStages(definition.stages);
  const results = new Map();
  const audit = [];
  for (const stage of ordered) {
    const incoming = stage.inputs.map(id => results.get(id));
    const output = bounded(evaluate(stage, incoming));
    results.set(stage.id, output);
    audit.push({stage: stage.id, kind: stage.kind, rows: output.length});
  }
  const terminals = ordered.filter(stage => stage.kind === 'output');
  if (terminals.length !== 1) throw new PipelineError('exactly one output stage is required');
  return {rows: results.get(terminals[0].id), audit};
}
