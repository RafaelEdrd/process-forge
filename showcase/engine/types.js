export class WorkflowError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'WorkflowError';
    }
}
//# sourceMappingURL=types.js.map