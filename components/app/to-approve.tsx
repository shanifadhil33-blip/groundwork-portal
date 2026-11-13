'use client';
import Link from 'next/link';
import { Translated } from './app-words';
import { ApprovalQueue } from './approval-queue';
import { JobsTabs } from './jobs-tabs';
import { SuggestedJobs } from './suggestions';
import { PageHeader } from '../ui/layout';

/** One place to approve new work: requests from people, and rows from a spreadsheet. */
export function ToApprove() {
  return (
    <Translated>
      <div className="page to-approve">
        <PageHeader>
          <div className="page-title"><h1>Jobs</h1><p>New jobs asked for by clients, technicians or a file. Approve to add them to Jobs.</p></div>
          <div className="page-actions"><Link className="button secondary md" href="/import">Upload a spreadsheet</Link></div>
        </PageHeader>
        <JobsTabs current="approve" />
        <SuggestedJobs />
        <ApprovalQueue embedded />
      </div>
    </Translated>
  );
}
