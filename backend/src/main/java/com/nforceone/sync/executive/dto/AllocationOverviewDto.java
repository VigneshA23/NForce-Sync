package com.nforceone.sync.executive.dto;

import java.util.List;

public record AllocationOverviewDto(
        long totalAllocatedResources,
        long resourcesWithNoActiveAllocation,
        List<ProjectAllocationDto> byProject,
        List<UnallocatedResourceDto> unallocatedResources
) {}
