package com.nforceone.sync.eod.dto;

/** entryId -> a task category name logged on that EOD entry — batch lookup backing
 *  EodInboxItemDto's categoryNames column (see EodClarificationService#enrich), same shape and
 *  purpose as EodTaskProjectNameRow but for category instead of project. */
public record EodTaskCategoryNameRow(Long entryId, String categoryName) {
}
