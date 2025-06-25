/**
 * Conditionally join classNames together
 * @param {...(string|boolean|undefined|null)} classes - Classes to join
 * @returns {string} - Combined class names
 */
export function classNames(...classes) {
  return classes
    .filter(Boolean)
    .filter(cls => typeof cls === 'string' && cls.trim() !== '')
    .join(' ');
}
