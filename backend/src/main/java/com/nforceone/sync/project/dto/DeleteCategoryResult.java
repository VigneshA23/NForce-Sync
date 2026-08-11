package com.nforceone.sync.project.dto;

/**
 * {@code deleted=true} — the category (and its mirrored TaskCategory) was hard-deleted; {@code
 * category} is null. {@code deleted=false} — the category is referenced by historical EOD task
 * records, so it was deactivated instead to keep that history intact; {@code category} is the
 * updated (now INACTIVE) row. See TeamLeadProjectService.deleteCategory.
 */
public record DeleteCategoryResult(boolean deleted, ProjectCategoryDto category) {}
