import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function EquationDisplay({ tex, block = true }) {
  if (!tex) return null;
  const html = katex.renderToString(tex, { displayMode: block, throwOnError: false, strict: 'ignore' });
  return <span className={block ? 'eq block' : 'eq'} dangerouslySetInnerHTML={{ __html: html }} />;
}
