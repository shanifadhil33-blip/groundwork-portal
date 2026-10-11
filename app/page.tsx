import Link from 'next/link';
import { PublicHeader, PublicFooter, Mark } from '../components/public/chrome';
import { StatusBadge } from '../components/ui/states';

const orders = [
  ['WO-1060', 'Repair entry door closer', 'Harbor & Pine Coworking', 'scheduled', 'Oct 14'],
  ['WO-1059', 'Service rooftop ventilation', 'Northgate Self Storage', 'waiting_on_parts', 'Oct 15'],
  ['WO-1058', 'Replace lobby light fixture', 'Marina Exchange', 'in_progress', 'Oct 12'],
  ['WO-1057', 'Inspect fire exit signage', 'Pine Terrace', 'open', 'Oct 16'],
  ['WO-1056', 'Adjust meeting room thermostat', 'Harbor & Pine Coworking', 'scheduled', 'Oct 16'],
  ['WO-1055', 'Replace loading bay sensor', 'Northgate Self Storage', 'done', 'Oct 10'],
  ['WO-1054', 'Check reception access panel', 'Marina Exchange', 'open', 'Oct 18'],
];
const features = [
  ['Work orders', 'Track requests, assignments, schedules, and status changes in one place.'],
  ['Client portal', 'Give each client a private view of their requests and the updates meant for them.'],
  ['Spreadsheet import with review', 'Import CSV or Excel, check flagged rows, and approve entries before they become work orders.'],
  ['Supplier sync and repair', 'Compare supplier updates with your records and repair missing events.'],
  ['Audit log', 'See who changed what, with a recorded history of workspace activity.'],
  ['AI agent access (MCP)', 'Connect agents with scoped workspace tokens and the same role and client boundaries.'],
];
export default function Landing() {
  return <><PublicHeader /><main id="main" className="landing">
    <section className="hero"><div><h1>The client portal and back office for service companies.</h1><p>Manage work orders and give every client a private view. Review spreadsheet imports, sync supplier updates, and connect AI agents through MCP.</p><div className="row"><Link href="/demo" className="link-button primary">Try the demo</Link><Link href="/sign-in" className="link-button secondary">Sign in</Link></div><p className="hero-note">No sign-up. Each visitor gets a private sandbox.</p></div></section>
    <div className="product-preview" aria-label="Illustrative fictional work orders"><div className="preview-app"><aside className="preview-sidebar"><div className="preview-workspace"><Mark /><strong>Ridgeline Facility Services</strong></div><small>Admin · Demo</small><div className="preview-nav">{['Dashboard', 'Work orders', 'Clients', 'Import', 'Approval queue', 'Supplier', 'Audit'].map(label => <span key={label} className={label === 'Work orders' ? 'selected' : ''}>{label}</span>)}</div><span className="preview-settings">Settings</span></aside><div className="preview-main"><div className="preview-header"><span>Work orders</span><span className="muted">Dana</span></div><div className="preview-body"><div className="preview-title"><h2>Work orders</h2><span className="preview-create">New work order</span></div><div className="preview-stats">{[['Open', '18'], ['In progress', '12'], ['Waiting on parts', '6'], ['Done', '24']].map(([label, count]) => <div key={label}><span>{label}</span><strong className="num">{count}</strong></div>)}</div><table><thead><tr><th>Number</th><th>Title</th><th>Client / site</th><th>Status</th><th>Due</th></tr></thead><tbody>{orders.map(([number, title, client, status, due]) => <tr key={number}><td className="num muted">{number}</td><td>{title}</td><td className="muted">{client}</td><td><StatusBadge status={status} /></td><td className="num muted">{due}</td></tr>)}</tbody></table></div></div></div></div>
    <section id="workflow" className="editorial-section"><h2>What it does</h2><div className="feature-rows">{features.map(([title, description]) => <div className="feature-row" key={title}><h3>{title}</h3><p>{description}</p></div>)}</div></section><p className="stack-strip">Built with Next.js, Postgres row-level security, Auth.js, and MCP.</p><PublicFooter />
  </main></>;
}
