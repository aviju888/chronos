import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';

// Read-only migration audit: source styles define the custom classes; the
// component AST determines which are consumed. There is no class allowlist.
if (!process.argv[2]) { console.error('Usage: node scripts/audit-modern-styles.mjs SOURCE_ROOT [RESULT_JSON]'); process.exit(2); }
const source = path.resolve(process.argv[2]);
const output = process.argv[3];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const consumed = new Set();
const inlineAnimations = new Set();
const componentFiles = [...walk('modern/components'), 'modern/App.tsx'].filter(file => /\.tsx?$/.test(file) && !file.includes('/__tests__/'));
for (const file of componentFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findAnimations = node => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      const value = ts.isTemplateExpression(node) ? node.head.text : node.text;
      const name = value.trim().split(/\s+/)[0];
      if (/^[a-z][\w-]*$/i.test(name) && name !== 'none') inlineAnimations.add(name);
    } else ts.forEachChild(node, findAnimations);
  };
  const visit = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast).replace(/["']/g, '') === 'animation') findAnimations(node.initializer);
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      for (const token of node.text.split(/\s+/)) {
        const bare = token.split(':').at(-1);
        if (/^[a-z][\w-]*$/i.test(bare)) consumed.add(bare);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
const classesIn = selector => [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(match => match[1]);
const definitions = new Map();
const animationDependencies = new Set(inlineAnimations);
const visited = new Set();
function readSource(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
  root.walkAtRules('import', rule => {
    const relative = rule.params.match(/^["'](\.[^"']+)["']/)?.[1];
    if (relative) readSource(path.resolve(path.dirname(file), relative));
  });
  root.walkRules(rule => {
    const used = classesIn(rule.selector).filter(name => consumed.has(name));
    for (const name of used) {
      const files = definitions.get(name) || new Set();
      files.add(path.relative(source, file)); definitions.set(name, files);
    }
    if (used.length) rule.walkDecls(/^animation(?:-name)?$/, declaration => {
      for (const animation of postcss.list.comma(declaration.value)) {
        const name = animation.trim().split(/\s+/)[0];
        if (name !== 'none' && !name.startsWith('var(')) animationDependencies.add(name);
      }
    });
  });
}
readSource(path.join(source, 'app/globals.css'));
readSource(path.join(source, 'components/chronos/chronos.css'));
const built = new Set();
const keyframes = new Set();
for (const file of walk('dist/assets').filter(file => /modern-.*\.css$/.test(file))) {
  const root = postcss.parse(fs.readFileSync(file, 'utf8'));
  root.walkRules(rule => classesIn(rule.selector).forEach(name => built.add(name)));
  root.walkAtRules(/keyframes$/, rule => keyframes.add(rule.params));
}
const result = {
  componentFiles: componentFiles.length,
  sourceStylesRead: visited.size,
  classes: Object.fromEntries([...definitions].sort(([a], [b]) => a.localeCompare(b)).map(([name, files]) => [name, { present: built.has(name), definedBy: [...files].sort() }])),
  keyframes: Object.fromEntries([...animationDependencies].sort().map(name => [name, keyframes.has(name)])),
};
result.missingClasses = Object.entries(result.classes).filter(([, value]) => !value.present).map(([name]) => name);
result.missingKeyframes = Object.entries(result.keyframes).filter(([, present]) => !present).map(([name]) => name);
if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (result.missingClasses.length || result.missingKeyframes.length) process.exitCode = 1;
