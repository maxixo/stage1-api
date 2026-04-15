export function classifyAgeGroup(age) {
  if (!Number.isFinite(age) || age < 0) {
    throw new Error('Invalid age value');
  }

  if (age >= 0 && age <= 12) {
    return 'child';
  }

  if (age >= 13 && age <= 19) {
    return 'teenager';
  }

  if (age >= 20 && age <= 59) {
    return 'adult';
  }

  if (age >= 60) {
    return 'senior';
  }

  throw new Error('Invalid age value');
}
