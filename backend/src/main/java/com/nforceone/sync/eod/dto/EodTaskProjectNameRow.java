package com.nforceone.sync.eod.dto;

/** entryId -> a project name logged on that EOD entry — batch lookup backing EodInboxItemDto's
 *  projectName column (see EodClarificationService#enrich). An entry can span multiple projects
 *  across its tasks; the query just returns one row per (entry, project) pair and the service
 *  picks the first per entry, same "good enough for a list subtitle" tradeoff as picking one
 *  task category for a Blocker row. */
public record EodTaskProjectNameRow(Long entryId, String projectName) {
}
