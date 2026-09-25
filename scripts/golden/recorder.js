// Golden recorder runtime. Copied into .test-build by instrument.mjs; never shipped.
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.GOLDEN_DIR;
if (dir) mkdirSync(dir, { recursive: true });
let depth = 0;
const seen = new Set();

function plain(value) {
  return JSON.parse(
    JSON.stringify(value ?? null, (_key, item) => {
      if (typeof item === 'function') return undefined;
      if (typeof AbortSignal !== 'undefined' && item instanceof AbortSignal) return undefined;
      if (item instanceof Error) return errorOf(item);
      if (item instanceof Map) return Object.fromEntries(item);
      if (typeof item === 'number' && !Number.isFinite(item)) return { $number: String(item) };
      return item;
    }),
  );
}

function errorOf(error) {
  if (!(error instanceof Error)) return { name: 'NonError', message: String(error) };
  const out = { name: error.name, message: error.message };
  if (error.failure) out.failure = { ...error.failure };
  if (error.usage) out.usage = { ...error.usage };
  if (error.issues) out.issues = JSON.parse(JSON.stringify(error.issues));
  return out;
}

function write(name, entry) {
  if (!dir) return;
  const key = createHash('sha256')
    .update(JSON.stringify([name, entry.args, entry.model?.exchanges ?? null]))
    .digest('hex');
  if (seen.has(key)) return;
  seen.add(key);
  appendFileSync(join(dir, `${name}.${process.pid}.jsonl`), JSON.stringify(entry) + '\n');
}

function wrapModel(model, exchanges) {
  if (!model || typeof model.generate !== 'function') return model;
  return {
    id: model.id,
    async generate(request) {
      const recorded = plain({
        system: request.system,
        prompt: request.prompt,
        schema: request.schema,
      });
      try {
        const response = await model.generate(request);
        exchanges.push({ request: recorded, response: plain(response) });
        return response;
      } catch (error) {
        exchanges.push({ request: recorded, error: errorOf(error) });
        throw error;
      }
    },
  };
}

/** Wrap an exported function. modelArg is the index of a ModelClient argument, or -1. */
export function record(name, fn, modelArg = -1) {
  if (!dir) return fn;
  return function recorded(...args) {
    const top = depth === 0;
    const input = plain(args);
    const exchanges = [];
    if (modelArg >= 0) args[modelArg] = wrapModel(args[modelArg], exchanges);
    const done = (output, error) => {
      const entry = { fn: name, top, args: input };
      if (modelArg >= 0) entry.model = { id: args[modelArg]?.id ?? null, exchanges };
      if (error !== undefined) entry.error = errorOf(error);
      else entry.output = plain(output);
      write(name, entry);
    };
    depth++;
    let result;
    try {
      result = fn.apply(this, args);
    } catch (error) {
      depth--;
      done(undefined, error);
      throw error;
    }
    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => {
          depth--;
          done(value);
          return value;
        },
        (error) => {
          depth--;
          done(undefined, error);
          throw error;
        },
      );
    }
    depth--;
    done(result);
    return result;
  };
}
