import Blockers from '../lead/Blockers';

/** Reporting Manager > Blockers: the Team Lead Blockers page on the RM data source — blockers raised
 *  by direct reports on projects they lead themselves (the ones no other lead sees). */
export default function MyReportsBlockers() {
  return <Blockers variant="rm" />;
}
