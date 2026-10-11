/**
 * A provider as the table names it: a module with a factory. A test adds a row whose `package` is this file's path, so
 * the driver reaches a scripted model through the table alone (spec 007, SC-003) and no provider package is involved.
 */
export const scripted: { model: unknown } = { model: undefined };

/** The factory a scripted row names: the provider, then the model id, as the real packages are called. */
export const createScripted = () => (_id: string) => scripted.model;
