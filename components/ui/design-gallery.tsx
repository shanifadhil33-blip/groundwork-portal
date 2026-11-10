'use client';
import { useState, type ReactNode } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { Button, IconButton } from './button';
import { BottomSheet, ConfirmDialog, Dialog } from './lazy-dialog';
import { Dropdown } from './dropdown';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from './states';
import { Tabs } from './tabs';
import { useToast } from './toast';
import { PageHeader } from './layout';

import { AR, EN, GROUPS, type Words } from '../../lib/design-words';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="stack compact"><h2 data-no-translate>{title}</h2>{children}</section>;
}

function Showcase({ t }: { t: Words }) {
  const toast = useToast();
  const [tab, setTab] = useState('all'), [overlay, setOverlay] = useState<'sheet' | 'panel' | 'dialog' | null>(null), [pick, setPick] = useState(''), [busy, setBusy] = useState(false);
  return (
    <div className="page" data-no-translate>
      <PageHeader>
        <div className="page-title"><h1>{t.title}</h1><p>{t.line}</p></div>
        <div className="page-actions"><Button icon={<Plus />}>{t.add}</Button></div>
      </PageHeader>

      <Group title={GROUPS.variant}>
        <div className="row"><Button>{t.save}</Button><Button variant="secondary">{t.cancel}</Button><Button variant="ghost">{t.more}</Button><Button variant="danger">{t.remove}</Button></div>
      </Group>
      <Group title={GROUPS.size}>
        <div className="row"><Button size="lg">{t.save}</Button><Button>{t.save}</Button><Button size="sm">{t.save}</Button><IconButton label={t.more}><ChevronRight className="directional-icon" /></IconButton></div>
      </Group>
      <Group title={GROUPS.state}>
        <div className="row">
          <Button className="is-hover">{t.save}</Button><Button className="is-pressed">{t.save}</Button><Button busy busyLabel={t.saving}>{t.save}</Button><Button disabled title={t.pick}>{t.save}</Button>
          <Button variant="secondary" className="is-hover">{t.cancel}</Button><Button variant="secondary" className="is-pressed">{t.cancel}</Button><Button variant="secondary" busy busyLabel={t.saving}>{t.cancel}</Button>
          <Button busy={busy} busyLabel={t.saving} onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 1200); }}>{t.save}</Button>
        </div>
      </Group>

      <Group title={GROUPS.chip}>
        <div className="row"><Badge>{t.open}</Badge><Badge tone="info">{t.progress}</Badge><Badge tone="warning">{t.waiting}</Badge><Badge tone="danger">{t.late}</Badge><Badge tone="success">{t.done}</Badge></div>
      </Group>

      <Group title={GROUPS.rows}>
        <Card>
          <ul className="list">
            {[t.progress, t.waiting, t.done].map((status, i) => (
              <li key={status}>
                <a className="list-row" href="#row">
                  <span className="list-row-main">
                    <span className="list-row-title"><span>{t.job}</span><Badge tone={i === 0 ? 'info' : i === 1 ? 'warning' : 'success'}>{status}</Badge></span>
                    <span className="list-row-meta">{t.place}</span>
                    <span className="list-row-meta">{t.who}</span>
                  </span>
                  <ChevronRight className="directional-icon" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </Group>

      <Group title={GROUPS.table}>
        <Card>
          <table className="data-table">
            <thead><tr><th>{t.title}</th><th>{t.place}</th><th>{t.open}</th></tr></thead>
            <tbody>{[t.progress, t.late].map(status => <tr key={status}><td>{t.job}</td><td className="muted">{t.place}</td><td><Badge tone={status === t.late ? 'danger' : 'info'}>{status}</Badge></td></tr>)}</tbody>
          </table>
        </Card>
      </Group>

      <Group title={GROUPS.tabs}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: t.all, content: <p>{t.line}</p> }, { value: 'approve', label: t.approve, content: <p>{t.emptyLine}</p> }]} />
      </Group>

      <Group title={GROUPS.form}>
        <label className="stack compact">{t.pick}<Dropdown label={t.pick} placeholder={t.pick} value={pick} onChange={setPick} width={280} options={t.people.split(',').map(name => ({ value: name, label: name }))} /></label>
        <label className="stack compact">{t.title}<input placeholder={t.job} /></label>
      </Group>

      <Group title={GROUPS.overlays}>
        <div className="row">
          <Button variant="secondary" onClick={() => setOverlay('sheet')}>{t.sheet}</Button>
          <Button variant="secondary" onClick={() => setOverlay('panel')}>{t.panel}</Button>
          <Button variant="secondary" onClick={() => setOverlay('dialog')}>{t.dialog}</Button>
          <Button variant="secondary" onClick={() => toast(t.saved)}>{t.toast}</Button>
        </div>
        <BottomSheet open={overlay === 'sheet'} onClose={() => setOverlay(null)} title={t.more} footer={<Button onClick={() => setOverlay(null)}>{t.save}</Button>}><p>{t.line}</p></BottomSheet>
        <Dialog open={overlay === 'panel'} onClose={() => setOverlay(null)} title={t.job} sheet presentation="panel" footer={<Button onClick={() => setOverlay(null)}>{t.save}</Button>}><p>{t.place}</p><p>{t.who}</p></Dialog>
        <ConfirmDialog open={overlay === 'dialog'} onClose={() => setOverlay(null)} title={t.confirm} confirmLabel={t.remove} danger onConfirm={() => setOverlay(null)}>{t.confirmLine}</ConfirmDialog>
      </Group>

      <Group title={GROUPS.states}>
        <Card><EmptyState title={t.empty} action={<Button variant="secondary">{t.add}</Button>}>{t.emptyLine}</EmptyState></Card>
        <Card><div className="stack compact"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-line" /><Skeleton className="skeleton-row" /></div></Card>
        <Card><ErrorState retry={() => {}} messageLocalized /></Card>
      </Group>

      <Group title={GROUPS.agent}>
        <div className="row"><button type="button" className="agent-button"><span className="agent-monogram" aria-hidden="true">{t.agent[0]}</span><span>{t.agent}</span></button></div>
      </Group>
    </div>
  );
}

/** Every shared component, in English and Arabic, light and dark. */
export function DesignGallery() {
  return (
    <div className="design-gallery">
      {(['light', 'dark'] as const).map(theme => (
        <div key={theme} className="design-theme" data-theme={theme}>
          <div lang="en" dir="ltr"><Showcase t={EN} /></div>
          <div lang="ar" dir="rtl"><Showcase t={AR} /></div>
        </div>
      ))}
    </div>
  );
}
