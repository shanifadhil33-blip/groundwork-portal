import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
export const dynamic = 'error';
export const metadata: Metadata = { title: 'Privacy' };
const MAIL = 'shanifadhil022@gmail.com';
export default function Page() { return <div className="public-page legal"><BackLink /><div className="page-heading"><h1>Privacy</h1><p>Last updated 12 October 2026</p></div><article>
  <section><h2>Who we are</h2><p>Groundwork is a portfolio project built by Adhil Shanif. It shows how a service company could run jobs, clients and field staff in one place. It is not a paid product.</p></section>
  <section><h2>What we store</h2><p>When you sign in with Google, we store your Google name, email address and profile picture, plus a session record so you stay signed in. Field staff who sign in with a code have no email; we store only the name their admin typed.</p>
   <p>We store what your company puts in: company details, clients, sites, jobs, comments, schedules and parts. We keep a history of changes so admins can see who did what.</p>
   <p>Before and after photos are made smaller on your phone before upload, and the location and camera details inside the photo are removed. Only the picture is stored.</p>
   <p>If you turn on notifications, we store a link from your browser that lets us send them to that device. Turning the switch off deletes it.</p></section>
  <section><h2>What we never do</h2><p>We never sell your data, share it for advertising, or use tracking cookies. The only cookies keep you signed in and remember your theme.</p></section>
  <section><h2>Who helps us run it</h2><p>Google handles sign in. Neon stores the database. Vercel runs the website. Your browser maker delivers notifications you turn on. If you use the assistant or Draft summaries, the text you send goes to Google Gemini or Groq to write a reply.</p></section>
  <section><h2>Who can see what</h2><p>Each company sees only its own data. A client sees only his own company’s jobs. A technician sees only the jobs given to him.</p></section>
  <section><h2>Demo</h2><p>The demo uses made up data in a private copy for each visitor. It is deleted within a day.</p></section>
  <section><h2>Deleting your data</h2><p>An admin can remove people, clients and jobs in Settings. To delete your account or all your company’s data, email <a href={`mailto:${MAIL}`}>{MAIL}</a> and we will do it within 30 days.</p></section>
 </article></div>; }
