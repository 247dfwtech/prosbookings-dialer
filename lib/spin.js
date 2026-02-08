/** Only spin when there is a pipe inside braces (e.g. {Hi|Hello}). Leaves {firstName} and {{firstName}} untouched. */
function spin(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\{([^}]*\|[^}]*)\}/g, (_, group) => {
    const options = group.split('|').map((s) => s.trim()).filter(Boolean);
    return options.length ? options[Math.floor(Math.random() * options.length)] : '';
  });
}

/** Replace {{var}} and {var} in text with values from vars. VAPI does not substitute in voicemailMessage, so we do it here. */
function substituteVariables(text, vars) {
  if (!text || typeof text !== 'string') return text;
  if (!vars || typeof vars !== 'object') return text;
  const map = { ...vars };
  if (vars.firstName !== undefined) map.first_name = vars.firstName;
  if (vars.lastName !== undefined) map.last_name = vars.lastName;
  const getVal = (key) => map[key] ?? map[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] ?? '';
  let out = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(getVal(key)));
  out = out.replace(/\{(\w+)\}/g, (_, key) => (key in map ? String(getVal(key)) : `{${key}}`));
  return out;
}

module.exports = { spin, substituteVariables };
