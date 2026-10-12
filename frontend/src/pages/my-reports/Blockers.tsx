import Blockers from '../lead/Blockers';

/** Reporting Manager > Blockers: the Team Lead Blockers page on the RM data source — every blocker raised by
 *  someone who reports to the viewer (frozen manager), whether a lead's own blocker on the project they lead or
 *  one on a project another lead owns. Rows say which; Acknowledge / Resolve stay with the project's lead
 *  except for a lead's own blocker. */
export default function MyReportsBlockers() {
  return <Blockers variant="rm" />;
}
