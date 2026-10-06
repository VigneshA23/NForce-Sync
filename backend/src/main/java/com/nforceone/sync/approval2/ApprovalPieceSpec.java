package com.nforceone.sync.approval2;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.Project;

public record ApprovalPieceSpec(
    Project project,
    AppUser approver,
    EodProjectApproval.ApproverType approverType,
    EodProjectApproval.Status status
) {}
