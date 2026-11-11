/** Single browser module instance for checked-result and lexical custody guards. */
import type * as Umf from '../../src/index-browser-v4';
let rustSecurity:Pick<typeof Umf,'inspectSecurityPolicy'>|undefined;
export function configureSecurityRuntime(runtime:Pick<typeof Umf,'inspectSecurityPolicy'>){rustSecurity=runtime;}
export function inspectSecurityPolicy(...args:Parameters<typeof Umf.inspectSecurityPolicy>):ReturnType<typeof Umf.inspectSecurityPolicy>{if(!rustSecurity)throw Error('Security V4 runtime was not injected');return rustSecurity.inspectSecurityPolicy(...args);}
export * from '../../src/extensions/security/association-checks';
export * from '../../src/extensions/security/association-witness';
export * from '../../src/extensions/security/association-expression';
export * from '../../src/extensions/security/ontology-migration-candidate';
export * from '../../src/extensions/security/ontology-checks-candidate';
export * from '../../src/extensions/security/policy-migration-candidate';
export * from '../../src/extensions/security/policy-checks-candidate';
export * from '../../src/extensions/security/dependencies-candidate';
