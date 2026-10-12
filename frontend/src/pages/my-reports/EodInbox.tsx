import EodInbox from '../lead/EodInbox';

/** My Reporting Team > EOD Inbox: clarification threads on entries whose frozen manager is the signed-in
 *  user — the Team Inbox page on the reporting-manager list (a lead's own Team Inbox is a separate set). */
export default function MyReportsEodInbox() {
  return <EodInbox variant="rm" />;
}
