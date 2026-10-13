import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

/** Page title on the left, actions on the right. */
export function PageHeader({ children }: { children: ReactNode }) {
  return <header className="heading-row page-header">{children}</header>;
}

type CellProps = { children?: ReactNode; 'data-label'?: string; role?: string };
function textContent(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<CellProps>(child) ? textContent(child.props.children) : typeof child === 'string' || typeof child === 'number' ? String(child) : '').join('');
}

/** Keep one semantic table on desktop and show labeled divider rows on phones. */
export function ResponsiveTable({ children, className = '' }: { children: ReactElement<CellProps>; className?: string }) {
  const labels: string[] = [];
  function collect(node: ReactNode) {
    Children.forEach(node, child => {
      if (!isValidElement<CellProps>(child)) return;
      if (child.type === 'th') labels.push(textContent(child.props.children) || 'Actions');
      else collect(child.props.children);
    });
  }
  collect(children);
  function decorate(node: ReactNode): ReactNode {
    return Children.map(node, child => {
      if (!isValidElement<CellProps>(child) || typeof child.type !== 'string') return child;
      if (child.type === 'tr') {
        let column = 0;
        return cloneElement(child, { role: 'row', children: Children.map(child.props.children, cell => {
          if (!isValidElement<CellProps>(cell) || !['td', 'th'].includes(String(cell.type))) return cell;
          const label = labels[column++] ?? 'Details';
          return cloneElement(cell, { role: cell.type === 'th' ? 'columnheader' : 'cell', ...(cell.type === 'td' ? { 'data-label': cell.props['data-label'] ?? label } : {}) });
        }) });
      }
      return cloneElement(child, { ...(child.type === 'table' ? { role: 'table' } : ['thead', 'tbody'].includes(child.type) ? { role: 'rowgroup' } : {}), children: decorate(child.props.children) });
    });
  }
  return <div className={`table-wrap responsive-table ${className}`.trim()}>{decorate(children)}</div>;
}
