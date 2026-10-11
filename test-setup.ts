import {setDefaultTimeout} from 'bun:test';
// Corpus checks process many schemas and formats; execution limits have their
// own explicit deadlines and assertions in the reference consumer tests.
setDefaultTimeout(30_000);
