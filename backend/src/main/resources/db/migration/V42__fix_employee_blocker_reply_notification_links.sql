-- Employee-facing BLOCKER_REPLY notifications used to link to
-- "/dashboard?blockerTaskId=<id>", which injected the conversation panel into the
-- Dashboard page. That page now has no such panel — the conversation lives on the
-- dedicated "/blockers?highlight=<id>" page instead (see BlockerConversationService.
-- postReplyAsLead). Rewrite existing rows so old notifications resolve correctly too.
UPDATE notification
SET link = replace(link, '/dashboard?blockerTaskId=', '/blockers?highlight=')
WHERE type = 'BLOCKER_REPLY'
  AND link LIKE '/dashboard?blockerTaskId=%';
