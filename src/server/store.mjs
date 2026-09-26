// Small persistent JSON store. Writes are atomic (temp file + rename) so a crash never leaves half a file.
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const toJson = (data) => JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2);

export class JsonStore {
  constructor(dir) {
    this.dir = resolve(dir);
    mkdirSync(this.dir, {recursive: true});
  }

  read(name, fallback) {
    const path = resolve(this.dir, `${name}.json`);
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
  }

  write(name, data) {
    const path = resolve(this.dir, `${name}.json`);
    writeFileSync(`${path}.tmp`, toJson(data));
    renameSync(`${path}.tmp`, path);
  }
}
