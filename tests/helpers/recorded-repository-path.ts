/** Relocate repository-local paths in historical Linux evidence without changing its hashes. */
export function recordedRepositoryPath(path:string):string {
 const prefix='/home/erik/Projects/umf/';
 return path.startsWith(prefix)?path.slice(prefix.length):path;
}
