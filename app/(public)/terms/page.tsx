import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
export const metadata: Metadata = { title: 'Terms' };
const MAIL = 'shanifadhil022@gmail.com';
export default function Page() { return <div className="public-page legal"><BackLink /><div lang="en" dir="ltr"><div className="page-heading"><h1>Terms</h1><p>Last updated 12 October 2026</p></div><article>
  <section><h2>A portfolio project</h2><p>Groundwork is a portfolio project by Adhil Shanif. It is free and offered as it is, with no promise that it will always be online or keep your data forever. Please keep your own copy of anything important.</p></section>
  <section><h2>Use it fairly</h2><p>Only add information you are allowed to share. Do not try to see other companies’ data, get around the access rules, or overload the demo.</p></section>
  <section><h2>Your data</h2><p>Your company’s data stays yours. How we store it and how to delete it is in our <a href="/privacy">Privacy</a> page.</p></section>
  <section><h2>Agent</h2><p>The agent can be wrong. Check what it suggests. It only changes anything after you confirm.</p></section>
  <section><h2>Questions</h2><p>Email <a href={`mailto:${MAIL}`}>{MAIL}</a>.</p></section>
 </article></div></div>; }
