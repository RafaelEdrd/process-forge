import { orderedSteps } from './validation.js';
import { WorkflowError } from './types.js';
const isScalar = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);
function requireString(config, name) {
    const value = config[name];
    if (typeof value !== 'string' || !value.trim()) {
        throw new WorkflowError('INVALID_CONFIG', `Expected string: ${name}`);
    }
    return value;
}
function sourceRows(input, maxRows) {
    if (!Array.isArray(input) || input.length > maxRows) {
        throw new WorkflowError('LIMIT', 'Source must be an array within the row limit');
    }
    return input.map((value, index) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new WorkflowError('INVALID_ROW', `Row ${index} is not an object`);
        }
        const cells = Object.entries(value);
        if (cells.length > 50)
            throw new WorkflowError('LIMIT', `Too many columns in row ${index}`);
        for (const [key, cell] of cells) {
            if (!/^[A-Za-z][A-Za-z0-9_]{0,50}$/.test(key) ||
                !isScalar(cell) ||
                typeof cell === 'string' && cell.length > 1000 ||
                typeof cell === 'number' && !Number.isFinite(cell)) {
                throw new WorkflowError('INVALID_ROW', `Invalid cell ${key} in row ${index}`);
            }
        }
        return { ...value };
    });
}
function normalized(value, mode) {
    if (value === null || value === undefined)
        return null;
    if (mode === 'trim')
        return String(value).trim();
    if (mode === 'lowercase')
        return String(value).trim().toLowerCase();
    if (mode === 'uppercase')
        return String(value).trim().toUpperCase();
    if (mode === 'number') {
        const number = Number(typeof value === 'string' ? value.trim().replace(',', '.') : value);
        return Number.isFinite(number) ? number : null;
    }
    throw new WorkflowError('INVALID_OPERATOR', mode);
}
function mergeTwo(left, right) {
    return { rows: [...left, ...right].map(row => ({ ...row })), rejects: 0 };
}
function joinTwo(left, right, config, maxRows) {
    const leftKey = requireString(config, 'leftKey');
    const rightKey = requireString(config, 'rightKey');
    const mode = config.mode === undefined ? 'inner' : requireString(config, 'mode');
    if (!['left', 'inner'].includes(mode))
        throw new WorkflowError('INVALID_OPERATOR', `Join mode ${mode}`);
    const index = new Map();
    for (const row of right) {
        const key = row[rightKey];
        if (key === null || key === undefined)
            continue;
        const encoded = JSON.stringify([typeof key, key]);
        const existing = index.get(encoded) || [];
        existing.push(row);
        index.set(encoded, existing);
    }
    let rejects = 0;
    const joined = [];
    for (const first of left) {
        const key = first[leftKey];
        const matches = key === null || key === undefined ? [] :
            index.get(JSON.stringify([typeof key, key])) || [];
        if (!matches.length) {
            if (mode === 'left')
                joined.push({ ...first });
            else
                rejects++;
        }
        for (const second of matches) {
            const combined = { ...first };
            for (const [column, value] of Object.entries(second)) {
                const target = Object.hasOwn(first, column) ? `right_${column}` : column;
                if (Object.hasOwn(combined, target)) {
                    throw new WorkflowError('COLUMN_COLLISION', `Join output collision: ${target}`);
                }
                combined[target] = value;
            }
            joined.push(combined);
            if (joined.length > maxRows)
                throw new WorkflowError('LIMIT', 'Join output exceeds row limit');
        }
    }
    return { rows: joined, rejects };
}
function executeStep(step, inputs, maxRows) {
    const config = step.config;
    const input = inputs[0] || [];
    switch (step.kind) {
        case 'source': return { rows: sourceRows(config.rows, maxRows), rejects: 0 };
        case 'merge': return mergeTwo(inputs[0] || [], inputs[1] || []);
        case 'join': return joinTwo(inputs[0] || [], inputs[1] || [], config, maxRows);
        case 'normalize': {
            const field = requireString(config, 'field');
            const mode = requireString(config, 'mode');
            if (!['trim', 'lowercase', 'uppercase', 'number'].includes(mode)) {
                throw new WorkflowError('INVALID_OPERATOR', mode);
            }
            return { rows: input.map(row => ({ ...row, [field]: normalized(row[field], mode) })), rejects: 0 };
        }
        case 'validate': {
            const required = config.required;
            if (!Array.isArray(required) || required.some(name => typeof name !== 'string' || !name)) {
                throw new WorkflowError('INVALID_CONFIG', 'Required fields must be a list');
            }
            let rejects = 0;
            const rows = input.filter(row => {
                const valid = required.every(name => row[name] !== undefined && row[name] !== null && row[name] !== '');
                if (!valid)
                    rejects++;
                return valid;
            });
            return { rows, rejects };
        }
        case 'filter': {
            const field = requireString(config, 'field');
            const operator = requireString(config, 'operator');
            const expected = config.value;
            if (!isScalar(expected))
                throw new WorkflowError('INVALID_CONFIG', 'Filter value must be scalar');
            if (!['equals', 'not_equals', 'gte', 'lte', 'contains'].includes(operator)) {
                throw new WorkflowError('INVALID_OPERATOR', operator);
            }
            const compare = (actual) => {
                switch (operator) {
                    case 'equals': return actual === expected;
                    case 'not_equals': return actual !== expected;
                    case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
                    case 'lte': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
                    default: return typeof actual === 'string' && typeof expected === 'string' &&
                        actual.toLowerCase().includes(expected.toLowerCase());
                }
            };
            const rows = input.filter(row => compare(row[field]));
            return { rows, rejects: input.length - rows.length };
        }
        case 'dedupe': {
            const fields = config.fields;
            if (!Array.isArray(fields) || !fields.length || fields.some(name => typeof name !== 'string')) {
                throw new WorkflowError('INVALID_CONFIG', 'Dedupe fields are required');
            }
            const seen = new Set();
            let rejects = 0;
            const rows = input.filter(row => {
                const key = JSON.stringify(fields.map(name => row[name] ?? null));
                if (seen.has(key)) {
                    rejects++;
                    return false;
                }
                seen.add(key);
                return true;
            });
            return { rows, rejects };
        }
        case 'aggregate': {
            const field = requireString(config, 'field');
            const metric = requireString(config, 'metric');
            if (!['count', 'sum'].includes(metric))
                throw new WorkflowError('INVALID_OPERATOR', metric);
            const result = new Map();
            for (const row of input) {
                const label = row[field] ?? 'sem_categoria';
                const key = JSON.stringify([typeof label, label]);
                const current = result.get(key) || { label, value: 0 };
                if (metric === 'count')
                    current.value++;
                else {
                    const value = row[requireString(config, 'valueField')];
                    if (typeof value !== 'number')
                        throw new WorkflowError('TYPE_MISMATCH', 'Sum requires a numeric field');
                    current.value += value;
                }
                result.set(key, current);
            }
            const rows = [...result.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)))
                .map(({ label, value }) => ({ [field]: label, value }));
            return { rows, rejects: 0 };
        }
        case 'sink': return { rows: input, rejects: 0 };
    }
}
export function execute(workflow, maxRows = 300) {
    if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 10000) {
        throw new WorkflowError('LIMIT', 'Invalid maximum row count');
    }
    const ordered = orderedSteps(workflow);
    const outputs = new Map();
    const steps = [];
    let rejected = 0;
    for (const step of ordered) {
        const inputs = (step.dependsOn || []).map(id => outputs.get(id) || []);
        const started = performance.now();
        const result = executeStep(step, inputs, maxRows);
        if (result.rows.length > maxRows)
            throw new WorkflowError('LIMIT', `${step.id}: too many output rows`);
        outputs.set(step.id, result.rows);
        rejected += result.rejects;
        steps.push({
            node: step.id, kind: step.kind,
            inputCount: inputs.reduce((total, rows) => total + rows.length, 0),
            outputCount: result.rows.length, rejects: result.rejects,
            durationMs: Math.round((performance.now() - started) * 100) / 100,
            sample: result.rows.slice(0, 3)
        });
    }
    const last = ordered[ordered.length - 1];
    const sourceCount = ordered.filter(step => step.kind === 'source')
        .reduce((total, step) => total + (outputs.get(step.id)?.length || 0), 0);
    return {
        workflow: workflow.id, version: workflow.version, status: 'completed',
        recordsIn: sourceCount, recordsOut: outputs.get(last.id)?.length || 0,
        rejected, steps, output: outputs.get(last.id) || [],
        lineage: ordered.flatMap(step => (step.dependsOn || []).map(source => ({ source, target: step.id })))
    };
}
//# sourceMappingURL=engine.js.map