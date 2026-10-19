// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private immutable runtime custody, separate from caller-visible generated data. */
import {coreConstraints,domainPolicy} from '../generated/core-model';
import {snapshotSchema} from './internal-schema';
import {prepareLiteralPolicy} from './literal-kernel';
export const currentConstraints=snapshotSchema(coreConstraints);
const ownedDomainPolicy=snapshotSchema(domainPolicy);
export const currentDomainPolicy=Object.freeze({...ownedDomainPolicy,literal:prepareLiteralPolicy(ownedDomainPolicy.literal)});
