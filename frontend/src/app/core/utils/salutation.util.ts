import { User } from '../models';

/**
 * Returns the courtesy title (without a full stop) for a signed-in user:
 *
 *  - Male                                   → Mr
 *  - Female, single                         → Miss
 *  - Female, married                        → Mrs
 *  - Female, married, keeps her maiden name → Ms
 *  - Female, marital status not recorded    → Ms  (neutral, never presumes)
 *  - Gender not recorded                    → ''  (no title shown)
 *
 * An explicit `salutation` stored on the account always wins, so the school can
 * override the rule for anyone (e.g. "Dr", "Prof", "Rev").
 */
export function salutationFor(
  user: Pick<User, 'gender' | 'maritalStatus' | 'usesMaidenName' | 'salutation'> | null | undefined,
): string {
  if (!user) return '';

  const explicit = (user.salutation ?? '').trim().replace(/\.$/, '');
  if (explicit) return explicit;

  const gender = (user.gender ?? '').trim().toLowerCase();
  if (gender.startsWith('m')) return 'Mr';
  if (!gender.startsWith('f')) return '';

  const marital = (user.maritalStatus ?? '').trim().toLowerCase();
  if (marital === 'single' || marital === 'unmarried') return 'Miss';
  if (marital === 'married') return user.usesMaidenName ? 'Ms' : 'Mrs';
  return 'Ms';
}

/** "Mr Trynos Zhou" – title followed by the full name (title omitted when unknown). */
export function titledName(
  user: (Pick<User, 'firstName' | 'lastName' | 'gender' | 'maritalStatus' | 'usesMaidenName' | 'salutation'>) | null | undefined,
): string {
  if (!user) return '';
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  if (!name) return '';
  const title = salutationFor(user);
  return title ? `${title} ${name}` : name;
}
