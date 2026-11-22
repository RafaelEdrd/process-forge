import { WorkflowError } from './types.js';
const allowed = new Set([
    'source', 'normalize', 'validate', 'filter', 'dedupe',
    'aggregate', 'merge', 'join', 'sink'
]);
const identifier = /^[a-z][a-z0-9_-]{1,50}$/;
export function orderedSteps(flow) {
    if (!flow || !identifier.test(flow.id) ||
        !Number.isInteger(flow.version) || flow.version < 1) {
        throw new WorkflowError('INVALID_WORKFLOW', 'Invalid workflow header');
    }
    if (!Array.isArray(flow.steps) || flow.steps.length < 2 || flow.steps.length > 24) {
        throw new WorkflowError('INVALID_WORKFLOW', 'Expected 2 to 24 steps');
    }
    const steps = new Map();
    for (const step of flow.steps) {
        if (!step || !identifier.test(step.id) || !allowed.has(step.kind) || steps.has(step.id)) {
            throw new WorkflowError('INVALID_NODE', 'Invalid or duplicate step identifier');
        }
        if (!step.config || typeof step.config !== 'object' || Array.isArray(step.config)) {
            throw new WorkflowError('INVALID_CONFIG', step.id);
        }
        if (!Array.isArray(step.dependsOn || []) ||
            (step.dependsOn || []).some(name => typeof name !== 'string') ||
            new Set(step.dependsOn || []).size !== (step.dependsOn || []).length) {
            throw new WorkflowError('INVALID_DEPENDENCY', step.id);
        }
        steps.set(step.id, step);
    }
    const visiting = new Set();
    const visited = new Set();
    const result = [];
    function walk(id) {
        if (visiting.has(id))
            throw new WorkflowError('CYCLE', `Cycle detected at ${id}`);
        if (visited.has(id))
            return;
        const step = steps.get(id);
        if (!step)
            throw new WorkflowError('UNKNOWN_DEPENDENCY', `Unknown node: ${id}`);
        visiting.add(id);
        for (const parent of step.dependsOn || [])
            walk(parent);
        visiting.delete(id);
        visited.add(id);
        result.push(step);
    }
    for (const step of flow.steps)
        walk(step.id);
    for (const step of result) {
        const count = (step.dependsOn || []).length;
        if (step.kind === 'source' && count !== 0 ||
            ['merge', 'join'].includes(step.kind) && count !== 2 ||
            step.kind !== 'source' && !['merge', 'join'].includes(step.kind) && count !== 1) {
            throw new WorkflowError('TOPOLOGY', `${step.id}: unexpected number of upstream nodes`);
        }
    }
    const sinks = result.filter(step => step.kind === 'sink');
    const sources = result.filter(step => step.kind === 'source');
    if (sinks.length !== 1 || sources.length < 1 || sources.length > 3) {
        throw new WorkflowError('TOPOLOGY', 'Expected 1 sink and 1-3 sources');
    }
    if (sinks[0]?.id !== result[result.length - 1]?.id) {
        throw new WorkflowError('TOPOLOGY', 'The sink must be last');
    }
    const connected = new Set();
    function trace(id) {
        if (connected.has(id))
            return;
        connected.add(id);
        for (const parent of steps.get(id)?.dependsOn || [])
            trace(parent);
    }
    trace(sinks[0].id);
    if (connected.size !== result.length) {
        throw new WorkflowError('TOPOLOGY', 'All steps must reach the sink');
    }
    return result;
}
//# sourceMappingURL=validation.js.map