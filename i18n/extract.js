// Pull user-visible text from app.js: plain strings and template literals (with ${…} turned into {0},{1}…)
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const out = new Map();
let i = 0;
function add(s, kind) {
  const t = s.trim();
  if (!/[A-Za-z]{2}/.test(t)) return;
  if (/^[a-z0-9_\-.#:]+$/.test(t) && !/ /.test(t)) return;            // keys, ids, classes
  if (/^(https?:|mailto:|tel:|\.|#|data:|image\/|application\/)/.test(t)) return;
  if (/^[a-z-]+(\s[a-z-]+)*$/.test(t) && !/\s/.test(t)) return;
  if (/[{};]\s*$/.test(t) && /:/.test(t) && !/ /.test(t)) return;
  if (/^(M\d|<path|<circle|<svg)/.test(t)) return;                     // svg paths
  if (/^[a-z]+(-[a-z0-9]+)*( [a-z]+(-[a-z0-9]+)*)+$/.test(t) && t.length < 40 && !/[A-Z]/.test(t) && t.split(' ').every(w => /^(btn|card|small|muted|foot|on|ghost|gold|primary|link|danger|num|lmain|lright|chev|trow|lrow|h|sec|kv|v|k|wide|pill|green|amber|red|alert|xp|map|slice|dim|seg|tick|radio|switch|check|done|past|req|te|row|head|x|step|mrow|ghead|total|table|scroll|dtable|shared|fc|due|center|t|net|off|bad|up|pin|small-btn|danger-t|red-t|green-t|alert-btns|push-home|kpi|kpis|dash|neg|pos|act|notif)$/.test(w))) return;
  out.set(t, kind);
}
const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.|\$\{(?:[^{}]|\{[^{}]*\})*\})*)`/g;
let m;
while ((m = re.exec(src))) {
  if (m[1] !== undefined) add(m[1].replace(/\\'/g, "'"), 's');
  else if (m[2] !== undefined) add(m[2], 's');
  else { let n = 0; add(m[3].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, () => `{${n++}}`), 't'); }
}
const list = [...out.keys()].sort();
fs.writeFileSync(process.argv[3], JSON.stringify(list, null, 1));
console.log(list.length, 'strings;', list.join(' ').split(/\s+/).length, 'words');
