import {Registry} from './registry';
import {registerActions} from '../extensions/actions';

/** Normal SDK registry. Action declarations are built in; execution and authority are not. */
export function createUmfRegistry(): Registry {
  return registerActions(new Registry());
}
