/**
 * A model's name in few characters, derived and not looked up, so a new model needs no change here: the vendor prefix and a trailing
 * date go (`claude-haiku-4-5-20251001` is `haiku-4-5`). The full name is kept for a tooltip.
 */
export const shortModel = (name: string): string => name.replace(/^claude-/, "").replace(/-\d{8}$/, "");
